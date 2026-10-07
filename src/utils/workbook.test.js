import { describe, it, expect, vi } from 'vitest'
import writeXlsxFile from 'write-excel-file/node'
import { unzipSync, strFromU8 } from 'fflate'

vi.mock('../db/db', () => ({ default: {} }))
vi.mock('../lib/share', () => ({ saveFile: vi.fn() }))

const { workbookSheets } = await import('./workbook')

/**
 * The spreadsheet of everything (utils/workbook.js): what each sheet holds,
 * that money is a number and a day is a day, that what the sheet can work out
 * is a formula, and that the whole thing is a file a spreadsheet will open.
 */

const NOW = new Date(2026, 9, 7, 12)
const at = (/** @type {number} */ m, /** @type {number} */ d) => new Date(2026, m - 1, d, 12).toISOString()

const accounts = [
  { id: 1, name: 'Cash', type: 'cash', balance: 1000, currency: 'PHP', sort_order: 0 },
  { id: 2, name: 'BPI', type: 'bank', role: 'savings', balance: 20000, currency: 'PHP', sort_order: 1 },
  { id: 3, name: 'BPI Credit', type: 'credit', balance: 0, currency: 'PHP', creditLimit: 20000, statementDate: 25, dueDate: 15, cutoffDate: 25, sort_order: 2 },
  { id: 4, name: 'Car loan', type: 'loan', role: 'loan', balance: -5000, currency: 'PHP', sort_order: 3 },
]
const transactions = [
  { id: 1, type: 'inflow', category: 'Income', description: 'Salary', account: 'BPI', amount: 30000, date: at(9, 15) },
  { id: 2, type: 'expense', category: 'Bills', description: 'Rent', account: 'BPI', amount: 12000, date: at(9, 5) },
  { id: 3, type: 'expense', category: 'Food', description: 'Lunch', account: 'Cash', amount: 200, date: at(10, 6) },
  { id: 4, type: 'expense', category: 'Food', description: 'Lunch refund', account: 'Cash', amount: -50, refundOf: 3, date: at(10, 7) },
  { id: 5, type: 'transfer', category: 'Transfer', description: 'To savings', fromAccount: 'Cash', toAccount: 'BPI', amount: 500, date: at(9, 20) },
  { id: 6, type: 'expense', category: 'Shopping', description: 'Shoes', account: 'BPI Credit', amount: 3000, date: at(9, 10) },
  // After today: not spent yet.
  { id: 7, type: 'expense', category: 'Bills', description: 'Next rent', account: 'BPI', amount: 12000, date: at(11, 5) },
]
const categories = [
  { name: 'Food', type: 'expense', budget: 5000 },
  { name: 'Bills', type: 'expense', budget: 0 },
]
const input = { accounts, transactions, categories, base: 'PHP', now: NOW }

/** @param {ReturnType<typeof workbookSheets>} sheets @param {string} name */
const sheet = (sheets, name) => /** @type {any} */ (sheets.find(s => s.sheet === name))
/** A cell's own value, whether it is a bare value or an object. @param {any} c */
const val = (c) => (c && typeof c === 'object' && 'value' in c ? c.value : c)

describe('workbookSheets', () => {
  const sheets = workbookSheets(input)

  it('has the sheets there is something for, Overview first', () => {
    expect(sheets.map(s => s.sheet)).toEqual(['Overview', 'Accounts', 'Transactions', 'Monthly', 'By category', 'Budgets'])
    // No bills, no debts, no goals: no empty tabs for them.
    expect(workbookSheets({ ...input, recurring: [{ name: 'Rent', amount: 12000, frequency: 'monthly', nextDate: '2026-11-05' }] }).map(s => s.sheet)).toContain('Recurring')
  })

  it('freezes the header row of every table', () => {
    for (const s of sheets.filter(x => x.sheet !== 'Overview')) expect(s.stickyRowsCount, s.sheet).toBe(1)
  })

  it('lists accounts by pile, a card and a loan as what is owed, and totals them with a formula', () => {
    const a = sheet(sheets, 'Accounts').data
    expect(a[0].map(val).slice(0, 6)).toEqual(['Account', 'Group', 'Type', 'Currency', 'Balance', 'In PHP'])
    const names = a.slice(1, -1).map((/** @type {any[]} */ r) => val(r[0]))
    expect(names).toEqual(['Cash', 'BPI', 'BPI Credit', 'Car loan'])
    const card = a.find((/** @type {any[]} */ r) => val(r[0]) === 'BPI Credit')
    expect(val(card[1])).toBe('Credit cards')
    expect(val(card[4])).toBeLessThan(0)
    expect(val(card[6])).toBe(20000)
    const loan = a.find((/** @type {any[]} */ r) => val(r[0]) === 'Car loan')
    expect(val(loan[4])).toBe(-5000)
    expect(val(a.at(-1)[5])).toBe('SUM(F2:F5)')
  })

  it('lists every transaction newest first, signed so a column of them adds up', () => {
    const t = sheet(sheets, 'Transactions').data
    expect(t.length).toBe(1 + transactions.length)
    expect(val(t[1][2])).toBe('Next rent')
    const row = (/** @type {string} */ d) => t.find((/** @type {any[]} */ r) => val(r[2]) === d)
    expect(val(row('Rent')[8])).toBe(-12000)
    expect(val(row('Salary')[8])).toBe(30000)
    // A refund is money back: positive.
    expect(val(row('Lunch refund')[8])).toBe(50)
    expect(val(row('Lunch refund')[9])).toBe('Refund')
    // A transfer between your own accounts moves nothing, and says where from and to.
    expect(row('To savings')[8]).toBeNull()
    expect(val(row('To savings')[4])).toBe('Cash')
    expect(val(row('To savings')[5])).toBe('BPI')
  })

  it('writes a day as a date on the right day, and money as a number with a format', () => {
    const t = sheet(sheets, 'Transactions').data
    const rent = t.find((/** @type {any[]} */ r) => val(r[2]) === 'Rent')
    expect(rent[0].value).toEqual(new Date(Date.UTC(2026, 8, 5)))
    expect(rent[0].format).toBe('yyyy-mm-dd')
    expect(rent[6]).toEqual({ value: 12000, format: '#,##0.00' })
  })

  it('lays the months out with income, spending and what the sheet can work out', () => {
    const m = sheet(sheets, 'Monthly').data
    expect(m[0].map(val)).toEqual(['Month', 'Income (PHP)', 'Spent (PHP)', 'Net', 'Kept of income'])
    // October first (newest), then September; November is ahead and is not here.
    expect(m[1][0].value).toEqual(new Date(Date.UTC(2026, 9, 1)))
    expect(val(m[1][1])).toBe(0)
    expect(val(m[1][2])).toBe(150)
    expect(m[1][3]).toEqual({ type: 'Formula', value: 'B2-C2', format: '#,##0.00' })
    expect(val(m[2][1])).toBe(30000)
    expect(val(m[2][2])).toBe(15000)
    expect(m[2][4].value).toBe('IF(B3=0,"",D3/B3)')
    expect(m.length).toBe(3)
  })

  it('puts the last twelve months across, a category to a row, with totals as formulas', () => {
    const c = sheet(sheets, 'By category').data
    expect(c[0].length).toBe(14)
    expect(val(c[0][0])).toBe('Category')
    const names = c.slice(1, -1).map((/** @type {any[]} */ r) => val(r[0]))
    expect(names).toEqual(['Bills', 'Shopping', 'Food'])
    const food = c.find((/** @type {any[]} */ r) => val(r[0]) === 'Food')
    // Lunch less its refund, in October: the last month across.
    expect(val(food[12])).toBe(150)
    expect(food[13].value).toBe('SUM(B4:M4)')
    expect(c.at(-1)[13].value).toBe('SUM(N2:N4)')
  })

  it('has this month against each limit, and leaves a category with no limit blank', () => {
    const b = sheet(sheets, 'Budgets').data
    const food = b.find((/** @type {any[]} */ r) => val(r[0]) === 'Food')
    expect(val(food[1])).toBe(5000)
    expect(val(food[2])).toBe(150)
    expect(food[3].value).toBe('IF(B2="","",B2-C2)')
    const bills = b.find((/** @type {any[]} */ r) => val(r[0]) === 'Bills')
    expect(bills[1]).toBeNull()
  })

  it('opens with the net worth as a sum of the piles, in the ledger\'s currency', () => {
    const o = sheet(sheets, 'Overview').data
    const labels = o.map((/** @type {any[]} */ r) => val(r[0]))
    expect(labels).toContain('Net worth')
    const at = labels.indexOf('Spending accounts')
    expect(val(o[at][1])).toBe(1000)
    expect(val(o[at + 1][1])).toBe(20000)
    const total = o[labels.lastIndexOf('Net worth')]
    expect(total[1].value).toBe('SUM(B6:B10)')
    // This month: came in, spent, and the difference.
    const came = labels.indexOf('Came in')
    expect(val(o[came][1])).toBe(0)
    expect(val(o[came + 1][1])).toBe(150)
    expect(o[came + 2][1].value).toBe(`B${came + 1}-B${came + 2}`)
  })

  it('adds the people row to the net worth when debts count, and the sum covers it', () => {
    const debts = [{ name: 'Ana', contact: 'Ana', type: 'owed_to_me', amount: 1500, amountPaid: 500, createdAt: at(9, 1) }]
    const withPeople = workbookSheets({ ...input, debts, includeDebts: true })
    const o = sheet(withPeople, 'Overview').data
    const labels = o.map((/** @type {any[]} */ r) => val(r[0]))
    expect(labels).toContain('People owe you, less what you owe')
    expect(o[labels.lastIndexOf('Net worth')][1].value).toBe('SUM(B6:B11)')
    const d = sheet(withPeople, 'Debts').data
    expect(val(d[1][1])).toBe('They owe you')
    expect(d[1][4].value).toBe('C2-D2')
    // Counting them off leaves the row out.
    const without = sheet(workbookSheets({ ...input, debts, includeDebts: false }), 'Overview').data
    expect(without.map((/** @type {any[]} */ r) => val(r[0]))).not.toContain('People owe you, less what you owe')
  })

  it('works out a goal\'s progress from the balances, with progress and what is left as formulas', () => {
    const g = sheet(workbookSheets({ ...input, goals: [{ id: 1, name: 'Japan trip', target: 40000, accounts: ['BPI'], targetDate: '2027-04-01', priority: 1 }] }), 'Goals').data
    expect(val(g[1][0])).toBe('Japan trip')
    expect(val(g[1][2])).toBe(20000)
    expect(g[1][4].value).toBe('IF(B2=0,"",MIN(C2/B2,1))')
    expect(val(g[1][7])).toBe('Saving')
  })

  it('is a file a spreadsheet opens: every sheet written, every cell valid', async () => {
    const full = workbookSheets({
      ...input,
      recurring: [{ name: 'Rent', type: 'expense', amount: 12000, frequency: 'monthly', nextDate: '2026-11-05', account: 'BPI', category: 'Bills' }],
      debts: [{ name: 'Ben', type: 'i_owe', amount: 2000, amountPaid: 0, dueDate: '2026-10-28', createdAt: at(9, 1) }],
      goals: [{ id: 1, name: 'Japan trip', target: 40000, accounts: ['BPI'] }],
    })
    const buffer = await writeXlsxFile(/** @type {any} */ (full)).toBuffer()
    const files = unzipSync(new Uint8Array(buffer))
    const book = strFromU8(files['xl/workbook.xml'])
    for (const s of full) expect(book, s.sheet).toContain(`name="${s.sheet}"`)
    expect(Object.keys(files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).length).toBe(full.length)
  })

  it('copes with a ledger that has nothing in it', () => {
    const empty = workbookSheets({ accounts: [], transactions: [], base: 'PHP', now: NOW })
    expect(empty.map(s => s.sheet)).toEqual(['Overview', 'Accounts', 'Transactions', 'Monthly'])
    expect(sheet(empty, 'Monthly').data.length).toBe(1)
  })
})
