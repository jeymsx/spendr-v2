import db from '../db/db'
import { getCreditStatus } from './creditCycle'
import { isInstallmentRow, spendingRows } from './installments'
import { isoToDateInput, toDateInput, txMonthKey } from './txDate'
import { getFxContext, txBase, currencyOfTx } from '../lib/fxContext'
import { saveFile } from '../lib/share'
import { bucketOf, TYPE_LABEL, INVESTMENT_KIND_LABEL } from '../lib/accountMeta'
import { CORRECTION_DESC, VALUE_DESC, isAdjustment, isIncome, isSpend } from '../lib/flows'
import { allocateGoals } from '../lib/goals'
import { convert } from '../lib/fx'
import { netWorthBreakdown, debtsCountFrom } from '../lib/netWorth'
import { isRefund } from '../lib/txMoney'
import { isBudgeted } from '../lib/budgetLevels'

/**
 * Everything in the ledger as one spreadsheet - Accounts with their balances,
 * every transaction, the months and the categories laid out as tables, the
 * budgets, bills, debts and goals - for somebody who wants it in Excel, or
 * uploaded to their own Google Drive and opened with Google Sheets, rather
 * than inside Spendr.
 *
 * ── A file, not a connection ──
 *
 * This replaced a Google Sheets bridge that needed its owner's own Apps
 * Script to point at. A file needs nothing from anybody: it is made on the
 * device from what the device holds, handed over as a download (or the share
 * sheet on an iPhone), and nothing leaves the phone unless the person
 * carries it away themselves.
 *
 * ── What is in each sheet ──
 *
 * Every sheet is a table with one header row, frozen, so it can be filtered,
 * sorted or pivoted. Money is a number (with a currency format), a date is a
 * date, and what can be worked out in the sheet is a formula - Net, Left,
 * Progress, totals - so a figure that is edited there follows. Amounts that
 * are converted are in the ledger's currency at the rates the app holds,
 * and say so in their header.
 *
 * Built as plain sheet data (`workbookSheets`, pure) and written to a file
 * only on download, with the library loaded on demand: a spreadsheet writer
 * is not something every launch should carry.
 *
 * @typedef {import('write-excel-file/browser').SheetData} SheetData
 * @typedef {{sheet: string, data: SheetData, columns?: Array<{width?: number}>, stickyRowsCount?: number}} WorkbookSheet
 */

const MONEY = '#,##0.00'
const HEAD = { fontWeight: /** @type {const} */ ('bold'), backgroundColor: '#E8F1FE', textColor: '#0F172A' }
/** Months the By category sheet lays out across. */
const MONTHS_ACROSS = 12

/** @param {string[]} labels */
const head = (labels) => labels.map(value => ({ value, ...HEAD }))
/** @param {Array<string|number|null|undefined>} widths @returns {Array<{width?: number}>} */
const widths = (widths) => widths.map(w => (w ? { width: Number(w) } : {}))
/** @param {unknown} v @returns {string|null} */
const text = (v) => (v == null || String(v).trim() === '' ? null : String(v))
/** @param {number|null|undefined} v @param {string} [format] */
const num = (v, format = MONEY) => (v == null || !Number.isFinite(v) ? null : { value: Math.round(v * 100) / 100, format })
/** @param {string} f @param {string} [format] */
const formula = (f, format = MONEY) => ({ type: /** @type {const} */ ('Formula'), value: f, format })
const bold = (/** @type {string} */ value) => ({ value, fontWeight: /** @type {const} */ ('bold') })

/**
 * A day as a date cell. Written as UTC midnight of the LOCAL day, because a
 * spreadsheet's date has no zone and any other instant lands a day off for
 * somebody.
 *
 * @param {string|null|undefined} s  an ISO instant, or a plain YYYY-MM-DD
 */
function day(s) {
  const d = typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : isoToDateInput(s)
  if (!d) return null
  const [y, m, dd] = d.split('-').map(Number)
  return { value: new Date(Date.UTC(y, m - 1, dd)), format: 'yyyy-mm-dd' }
}

/** The first of a month, 'YYYY-MM', as a date cell shown as "Oct 2026". @param {string} key */
function month(key) {
  const [y, m] = key.split('-').map(Number)
  return { value: new Date(Date.UTC(y, m - 1, 1)), format: 'mmm yyyy' }
}

/** @param {string} key 'YYYY-MM' @param {number} by */
function addMonths(key, by) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + by, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** A spreadsheet's column letter, from 0: A, B ... Z, AA. @param {number} i */
function col(i) {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

const GROUP = /** @type {Record<string, string>} */ ({
  spending: 'Spending', savings: 'Savings', invested: 'Investments', credit: 'Credit cards', loan: 'Loans',
})
const GROUP_ORDER = ['spending', 'savings', 'invested', 'credit', 'loan']

/** What a row is, where it is more than an ordinary one. @param {Record<string, any>} t */
function noteOf(t) {
  if (isAdjustment(t)) return t.adjust === 'value' || t.description === VALUE_DESC ? 'Value update' : t.description === CORRECTION_DESC ? 'Balance adjustment' : 'Adjustment'
  if (isRefund(t)) return 'Refund'
  if (isInstallmentRow(t)) return 'Installment'
  if (t.splitId) return 'Split'
  return ''
}

/**
 * The sheets of a workbook, from the ledger's tables.
 *
 * @param {object} input
 * @param {Array<Record<string, any>>} input.accounts
 * @param {Array<Record<string, any>>} input.transactions
 * @param {Array<Record<string, any>>} [input.categories]
 * @param {Array<Record<string, any>>} [input.recurring]
 * @param {Array<Record<string, any>>} [input.debts]
 * @param {Array<Record<string, any>>} [input.goals]
 * @param {string} input.base  the ledger's currency
 * @param {any} [input.rates]  a RateTable (lib/fx.js)
 * @param {boolean} [input.includeDebts]  whether "Count debts" is on
 * @param {Date} [input.now]
 * @returns {WorkbookSheet[]}
 */
export function workbookSheets({
  accounts, transactions, categories = [], recurring = [], debts = [], goals = [], base, rates = null, includeDebts = true, now = new Date(),
}) {
  const inBase = `In ${base}`
  const nowKey = txMonthKey(now.toISOString())

  /* ── Money by month and category: what the app counts as income and as
     spending (lib/flows), a plan on installments as its whole price the day
     it was bought, nothing dated after today. ── */
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString()
  const posted = spendingRows(transactions).filter(t => (t.date ?? '') <= cutoff)
  /** @type {Map<string, {income: number, spent: number}>} */
  const byMonth = new Map()
  /** @type {Map<string, Map<string, number>>} */
  const byCategory = new Map()
  for (const t of posted) {
    const key = txMonthKey(t.date)
    if (!key) continue
    if (isIncome(t)) {
      const m = byMonth.get(key) ?? { income: 0, spent: 0 }
      m.income += txBase(t)
      byMonth.set(key, m)
    } else if (isSpend(t)) {
      const m = byMonth.get(key) ?? { income: 0, spent: 0 }
      m.spent += txBase(t)
      byMonth.set(key, m)
      const cat = t.category || 'Others'
      const row = byCategory.get(cat) ?? new Map()
      row.set(key, (row.get(key) ?? 0) + txBase(t))
      byCategory.set(cat, row)
    }
  }
  const thisMonth = byMonth.get(nowKey) ?? { income: 0, spent: 0 }

  /* ── Accounts ── */
  /** @type {Record<string, any>} */
  const credit = {}
  for (const a of accounts) if (a.type === 'credit') credit[a.name] = getCreditStatus(/** @type {any} */ (a), transactions)
  /** The balance as an asset: a card or a loan is what is owed, negative. @param {Record<string, any>} a */
  const signedBalance = (a) => (a.type === 'credit'
    ? -(credit[a.name]?.signedBalance ?? credit[a.name]?.currentBalance ?? 0)
    : a.type === 'loan' ? (a.balance ?? 0) : (a.balance ?? 0))
  const ordered = [...accounts].sort((a, b) =>
    GROUP_ORDER.indexOf(bucketOf(/** @type {any} */ (a))) - GROUP_ORDER.indexOf(bucketOf(/** @type {any} */ (b)))
    || (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || String(a.name).localeCompare(String(b.name)))
  const accountRows = ordered.map(a => {
    const own = signedBalance(a)
    const cur = String(a.currency || base).toUpperCase()
    const converted = convert(own, cur, base, rates)
    const isCard = a.type === 'credit'
    return [
      text(a.name),
      text(GROUP[bucketOf(/** @type {any} */ (a))]),
      text(a.type === 'investment' ? INVESTMENT_KIND_LABEL[a.kind] ?? TYPE_LABEL.investment : TYPE_LABEL[a.type] ?? a.type),
      text(cur),
      num(own),
      num(converted),
      isCard ? num(a.creditLimit ?? 0) : null,
      isCard ? num(credit[a.name]?.availableCredit) : null,
      isCard && a.statementDate ? { value: Number(a.statementDate), format: '0' } : null,
      isCard && a.dueDate ? { value: Number(a.dueDate), format: '0' } : null,
      a.interestRate ? { value: Number(a.interestRate), format: '0.00' } : null,
      text(a.parentName),
      a.archived ? 'Yes' : null,
    ]
  })
  const accountsData = [
    head(['Account', 'Group', 'Type', 'Currency', 'Balance', inBase, 'Credit limit', 'Available credit', 'Statement day', 'Due day', 'Interest a month %', 'Inside', 'Archived']),
    ...accountRows,
    ...(accountRows.length ? [[bold('Total'), null, null, null, null, formula(`SUM(F2:F${accountRows.length + 1})`)]] : []),
  ]

  /* ── Transactions, newest first ── */
  const sorted = [...transactions].sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
  const txRows = sorted.map(t => {
    const transfer = t.type === 'transfer'
    return [
      day(t.date),
      text(t.type === 'expense' ? 'Expense' : t.type === 'inflow' ? 'Inflow' : transfer ? 'Transfer' : t.type),
      text(t.description),
      transfer ? null : text(t.category),
      text(transfer ? (t.fromAccount || t.account) : t.account),
      transfer ? text(t.toAccount) : null,
      num(t.amount),
      text(currencyOfTx(t)),
      // Signed, so a column of them adds up: money out is negative, a refund positive, a transfer neither.
      transfer ? null : num(t.type === 'expense' ? -txBase(t) : t.type === 'inflow' ? txBase(t) : null),
      text(noteOf(t)),
    ]
  })
  const transactionsData = [head(['Date', 'Type', 'Description', 'Category', 'Account', 'To account', 'Amount', 'Currency', inBase, 'Note']), ...txRows]

  /* ── Monthly, newest first ── */
  const monthKeys = [...byMonth.keys()].sort()
  /** @type {string[]} */
  const span = []
  if (monthKeys.length) for (let k = monthKeys[0]; k <= nowKey; k = addMonths(k, 1)) span.push(k)
  const monthlyRows = [...span].reverse().map((k, i) => {
    const r = i + 2
    const m = byMonth.get(k) ?? { income: 0, spent: 0 }
    return [month(k), num(m.income), num(m.spent), formula(`B${r}-C${r}`), formula(`IF(B${r}=0,"",D${r}/B${r})`, '0%')]
  })
  const monthlyData = [head(['Month', `Income (${base})`, `Spent (${base})`, 'Net', 'Kept of income']), ...monthlyRows]

  /* ── By category: the last twelve months across ── */
  const across = Array.from({ length: MONTHS_ACROSS }, (_, i) => addMonths(nowKey, i - (MONTHS_ACROSS - 1)))
  const cats = [...byCategory.entries()]
    .map(([name, m]) => ({ name, total: across.reduce((s, k) => s + (m.get(k) ?? 0), 0), m }))
    .filter(c => c.total > 0.005)
    .sort((a, b) => b.total - a.total)
  // The twelve months are B to M, and the total beside them is N.
  const totalCol = col(MONTHS_ACROSS + 1)
  const catRows = cats.map((c, i) => [
    text(c.name),
    ...across.map(k => num(c.m.get(k) ?? 0)),
    formula(`SUM(B${i + 2}:${col(MONTHS_ACROSS)}${i + 2})`),
  ])
  const categoryData = [
    head(['Category', ...across.map(k => `${new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}`), `Total (${base})`]),
    ...catRows,
    ...(catRows.length ? [[bold('Total'), ...across.map((_, j) => formula(`SUM(${col(j + 1)}2:${col(j + 1)}${catRows.length + 1})`)), formula(`SUM(${totalCol}2:${totalCol}${catRows.length + 1})`)]] : []),
  ]

  /* ── Budgets: this month against each limit ── */
  const limited = categories.filter(c => (c.type ?? 'expense') === 'expense')
  const budgetRows = limited
    .map(c => ({ c, spent: byCategory.get(c.name)?.get(nowKey) ?? 0 }))
    .sort((a, b) => (b.c.budget ?? 0) - (a.c.budget ?? 0) || String(a.c.name).localeCompare(String(b.c.name)))
    .map(({ c, spent }, i) => {
      const r = i + 2
      return [text(c.name), isBudgeted(c) ? num(c.budget) : null, num(spent), formula(`IF(B${r}="","",B${r}-C${r})`), formula(`IF(B${r}="","",C${r}/B${r})`, '0%')]
    })
  const budgetsData = [head(['Category', 'Monthly limit', `Spent this month (${base})`, 'Left', 'Used']), ...budgetRows]

  /* ── Bills that repeat ── */
  const recurringRows = recurring.map(r => [
    text(r.name), text(r.type === 'inflow' ? 'Inflow' : 'Expense'), num(r.amount), text(r.frequency),
    day(r.nextDate), text(r.account), text(r.category), text(r.active === false ? 'No' : 'Yes'),
  ])
  const recurringData = [head(['Name', 'Type', 'Amount', 'How often', 'Next', 'Account', 'Category', 'Active']), ...recurringRows]

  /* ── Money between people ── */
  const debtRows = debts.map((d, i) => {
    const r = i + 2
    return [
      text(d.contact || d.name), text(d.type === 'i_owe' ? 'You owe them' : 'They owe you'), num(d.amount), num(d.amountPaid ?? 0),
      formula(`C${r}-D${r}`), day(d.dueDate), day(d.createdAt), day(d.settledAt), text(d.notes),
    ]
  })
  const debtsData = [head(['Person', 'Direction', 'Amount', 'Paid', 'Left', 'Due', 'Started', 'Settled', 'Notes']), ...debtRows]

  /* ── Goals, as the app reads them: saved is worked out from the balances ── */
  const alloc = allocateGoals({ goals: /** @type {any} */ (goals), accounts: /** @type {any} */ (accounts), base, rates })
  const goalRows = alloc.goals.map((g, i) => {
    const r = i + 2
    return [
      text(g.name), num(g.target), num(g.saved), formula(`MAX(B${r}-C${r},0)`), formula(`IF(B${r}=0,"",MIN(C${r}/B${r},1))`, '0%'),
      day(g.targetDate), text((g.accounts ?? []).join(', ')), text(g.archived ? 'Archived' : g.complete ? 'Done' : 'Saving'),
    ]
  })
  const goalsData = [head(['Goal', 'Target', `Saved (${base})`, 'To go', 'Progress', 'Target date', 'Funded by', 'Status']), ...goalRows]

  /* ── Overview, first: where things stand, and what the rest of the file is ── */
  const nw = netWorthBreakdown({
    accounts, transactions, view: base, ledger: base, rates, creditStatus: credit,
    debts: includeDebts ? debts : [], includeDebts,
  })
  const first = transactions.reduce((m, t) => ((t.date ?? '') && (!m || t.date < m) ? t.date : m), '')
  /** @type {SheetData} */
  const overview = [
    [{ value: 'Spendr', fontWeight: 'bold', fontSize: 18 }],
    [text('Exported'), day(now.toISOString())],
    [text('Money is in'), text(base)],
    [],
    [bold('Net worth')],
    [text('Spending accounts'), num(nw.spending)],
    [text('Savings'), num(nw.savings)],
    [text('Investments'), num(nw.invested)],
    [text('Credit cards owed'), num(-nw.credit)],
    [text('Loans owed'), num(-nw.loans)],
    ...(includeDebts && nw.has.people ? [[text('People owe you, less what you owe'), num(nw.people)]] : []),
    [bold('Net worth'), formula(`SUM(B6:B${includeDebts && nw.has.people ? 11 : 10})`)],
    [],
    [bold(`This month (${base})`)],
    [text('Came in'), num(thisMonth.income)],
    [text('Spent'), num(thisMonth.spent)],
    [bold('Net'), formula(`B${includeDebts && nw.has.people ? 15 : 14}-B${includeDebts && nw.has.people ? 16 : 15}`)],
    [],
    [text('Accounts'), { value: accounts.length, format: '0' }],
    [text('Transactions'), { value: transactions.length, format: '0' }],
    [text('Since'), day(first)],
    [],
    [text('Each sheet is a table: filter it, sort it or make a pivot table from it. Open this file in Excel, or upload it to Google Drive and open it with Google Sheets.')],
  ]

  /** @type {WorkbookSheet[]} */
  const sheets = [
    { sheet: 'Overview', data: overview, columns: widths([34, 18]) },
    { sheet: 'Accounts', data: accountsData, columns: widths([26, 14, 16, 10, 16, 16, 14, 16, 14, 10, 18, 18, 10]), stickyRowsCount: 1 },
    { sheet: 'Transactions', data: transactionsData, columns: widths([12, 10, 34, 18, 20, 20, 14, 10, 16, 18]), stickyRowsCount: 1 },
    { sheet: 'Monthly', data: monthlyData, columns: widths([12, 18, 18, 16, 16]), stickyRowsCount: 1 },
  ]
  if (catRows.length) sheets.push({ sheet: 'By category', data: categoryData, columns: widths([22, ...across.map(() => 11), 16]), stickyRowsCount: 1 })
  if (budgetRows.some(r => r[1])) sheets.push({ sheet: 'Budgets', data: budgetsData, columns: widths([22, 16, 24, 14, 10]), stickyRowsCount: 1 })
  if (recurringRows.length) sheets.push({ sheet: 'Recurring', data: recurringData, columns: widths([26, 10, 14, 14, 12, 20, 18, 8]), stickyRowsCount: 1 })
  if (debtRows.length) sheets.push({ sheet: 'Debts', data: debtsData, columns: widths([20, 16, 14, 14, 14, 12, 12, 12, 30]), stickyRowsCount: 1 })
  if (goalRows.length) sheets.push({ sheet: 'Goals', data: goalsData, columns: widths([24, 14, 16, 14, 10, 12, 26, 10]), stickyRowsCount: 1 })
  return sheets
}

/**
 * Make the workbook from what this device holds, and hand it over: a
 * download on a computer or an Android phone, the share sheet on an iPhone
 * (lib/share.js saveFile).
 *
 * @returns {Promise<{how: 'shared'|'downloaded'|'cancelled'|'blocked', name: string, again: () => Promise<string>}>}
 */
export async function downloadWorkbook() {
  const [accounts, transactions, categories, recurring, debts, goals, debtsPref] = await Promise.all([
    db.accounts.toArray(), db.transactions.toArray(), db.categories.toArray(), db.recurring.toArray(),
    db.debts.toArray(), db.goals.toArray(), db.meta.get('netWorthDebts'),
  ])
  const { base, rates } = getFxContext()
  const sheets = workbookSheets({
    accounts, transactions, categories, recurring, debts, goals, base, rates, includeDebts: debtsCountFrom(debtsPref),
  })
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const blob = await /** @type {any} */ (writeXlsxFile)(sheets).toBlob()
  const name = `spendr-${toDateInput()}.xlsx`
  const again = () => saveFile(blob, name)
  return { how: await again(), name, again }
}
