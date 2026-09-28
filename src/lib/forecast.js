/**
 * What happens to your money from here - the forecast, day by day.
 *
 * ── Where it comes from ──
 *
 * Latr (the sibling planner) answers this with one function, buildProjection:
 * expand everything planned into dated events, walk a balance forward one day
 * at a time, and read everything - the chart, the tightest day, safe to spend
 * - off that one walk so no two figures can disagree. This is that idea,
 * trimmed to what Spendr already knows, with no second copy of anything:
 *
 *   recurring bills and income   Spendr's own Recurring list
 *   loan payments                each loan's monthly payment, until it ends
 *   debts you owe                the ones with a due date
 *   everyday spending            what a typical week of yours costs
 *
 * ── It starts from net liquid ──
 *
 * Cash, wallets and banks, LESS what the cards owe today - Latr's rule, and
 * the one that fits how cards are recorded here: a charge is spending when
 * you make it, so the card's debt is already out of the money you have. Card
 * payments are therefore never projected (that would take the same money out
 * twice); their due dates are listed as reminders, marked as already counted.
 * Investments are left out entirely: they are yours, but not spendable.
 *
 * ── Three rules worth stating ──
 *
 *   - The tightest day is found by DAY, not by month end. Rent on the 1st and
 *     pay on the 15th can close a month healthy with the middle of it below
 *     zero, and that middle is what a forecast is for.
 *   - A bill whose date has passed without being posted still has to be paid,
 *     so it lands today, flagged. Income whose date has passed is NOT counted
 *     until you mark it received - counting pay you have not logged would make
 *     the forecast rosier than your ledger.
 *   - Everyday spending is the median week of the last twelve, not the
 *     average: one laptop in August should not make every day ahead look
 *     expensive. Bills, installments, loan interest and debt settlements are
 *     left out of it, because they are already events of their own.
 */

import { advanceNextDate, parseDateLocal } from '../utils/recurring'
import { isInstallmentRow } from '../utils/installments'
import { creditCardBills } from './creditBills'
import { netWorthBreakdown } from './netWorth'
import { isSpend } from './flows'
import { bucketOf, isLoan } from './accountMeta'
import { LOAN_INTEREST, upcomingLoanPayments } from './loans'
import { txBase } from './fxContext'
import { convert } from './fx'

const DAY_MS = 864e5
const LOOKBACK_WEEKS = 12
/** Weeks of history needed before everyday spending is estimated at all. */
const MIN_WEEKS = 3
/** How far "safe to spend" looks when there is no payday to look to. */
export const SAFE_WINDOW_DAYS = 14
/**
 * How far ahead "safe to spend" looks for the next payday - fixed, whatever
 * range the chart shows. Found in review: it looked as far as the chart did,
 * so a payday 40 days out made Home (30 days) and the Forecast page on 3M
 * give two different figures for the same today. 45 covers a monthly pay
 * that lands a day after a 31-day month, with room to spare.
 */
export const PAYDAY_LOOKAHEAD_DAYS = 45

const round2 = (/** @type {number} */ n) => Math.round(n * 100) / 100
/** @param {Date} d */
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
/** @param {Date} d */
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * @typedef {object} ForecastEvent
 * @property {string} key
 * @property {Date} date
 * @property {string} name
 * @property {number} amount     always positive
 * @property {1|-1} sign         +1 comes in, -1 goes out
 * @property {'bill'|'income'|'loan'|'debt'|'card'} kind
 * @property {boolean} counted   false for a card due date: already in the start
 * @property {boolean} overdue
 * @property {string|null} category
 * @property {string|null} account
 * @property {string|null} to    where tapping it goes
 * @property {boolean} [repeats]
 */

/**
 * @param {object} input
 * @param {Array<Record<string, any>>} input.accounts
 * @param {Array<Record<string, any>>} input.transactions
 * @param {Array<Record<string, any>>} [input.recurring]
 * @param {Array<Record<string, any>>} [input.debts]
 * @param {string} input.base   the ledger's currency
 * @param {import('./fx').RateTable|null|undefined} [input.rates]
 * @param {number} [input.horizonDays]
 * @param {number} [input.floor]   the balance you do not want to go below
 * @param {Date} [input.now]
 * @param {(tx: any) => number} [input.priceOf]
 * @param {number} [input.historyDays]  days of what actually happened to put
 *   before today, for the chart (liquidHistory); none unless asked for
 */
export function buildForecast({
  accounts, transactions, recurring = [], debts = [], base, rates = null,
  horizonDays = 30, floor = 0, now = new Date(), priceOf = txBase, historyDays = 0,
}) {
  const today = startOfDay(now)
  /* The walk runs at least as far as the payday lookahead, so safe to spend
     is worked out over the same days whatever the chart shows; what is
     returned is trimmed to the chart's horizon. */
  const walkDays = Math.max(horizonDays, PAYDAY_LOOKAHEAD_DAYS)
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + walkDays)
  const shownEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + horizonDays)
  const toBase = (/** @type {number} */ v, /** @type {string|undefined|null} */ cur) =>
    convert(v, cur || base, base, rates) ?? v
  const curOf = (/** @type {string|null|undefined} */ name) =>
    (accounts ?? []).find(a => a.name === name)?.currency || base

  const start = round2(netWorthBreakdown({ accounts, transactions, view: base, rates }).liquid)

  /** @type {ForecastEvent[]} */
  const events = []

  // ── Recurring bills and income ──
  for (const r of recurring ?? []) {
    if (!r || r.active === false || !r.nextDate || !(r.amount > 0)) continue
    const income = r.type === 'inflow'
    const amount = round2(toBase(r.amount, curOf(r.account)))
    let date = String(r.nextDate).slice(0, 10)
    let d = parseDateLocal(date)
    if (!d) continue
    const base_ = {
      name: r.name || r.category || (income ? 'Income' : 'Bill'),
      amount, sign: /** @type {1|-1} */ (income ? 1 : -1),
      kind: /** @type {'income'|'bill'} */ (income ? 'income' : 'bill'),
      category: r.category ?? null, account: r.account ?? null,
      to: r.id != null ? `/recurring/${r.id}` : '/recurring', repeats: true,
    }
    if (d < today) {
      events.push({
        ...base_, key: `rec:${r.id}:${date}:late`, date: today,
        counted: !income, overdue: true,
      })
      // Walk past the missed dates to the first one ahead, without counting them.
      for (let i = 0; i < 400 && d && d < today; i++) {
        const next = advanceNextDate(date, r.frequency)
        if (!next || next <= date) { d = null; break }
        date = next
        d = parseDateLocal(date)
      }
    }
    for (let i = 0; i < 400 && d && d <= end; i++) {
      events.push({ ...base_, key: `rec:${r.id}:${date}`, date: d, counted: true, overdue: false })
      const next = advanceNextDate(date, r.frequency)
      if (!next || next <= date) break
      date = next
      d = parseDateLocal(date)
    }
  }

  // ── Loans: the monthly payment, until it is paid off ──
  for (const a of (accounts ?? []).filter(isLoan)) {
    for (const p of upcomingLoanPayments(a, transactions ?? [], now, end)) {
      events.push({
        key: `loan:${a.id ?? a.name}:${isoDay(p.date)}`, date: p.date < today ? today : p.date,
        name: a.name, amount: round2(toBase(p.amount, a.currency)), sign: -1, kind: 'loan',
        counted: true, overdue: p.overdue, category: null, account: a.name,
        to: a.id != null ? `/accounts/${a.id}` : null,
      })
    }
  }

  // ── Debts you owe, with a date ──
  for (const dbt of debts ?? []) {
    const left = Math.max(0, (dbt?.amount ?? 0) - (dbt?.amountPaid ?? 0))
    if (dbt?.type !== 'i_owe' || left <= 0.005 || !dbt.dueDate) continue
    const d = parseDateLocal(String(dbt.dueDate).slice(0, 10))
    if (!d || d > end) continue
    events.push({
      key: `debt:${dbt.syncId ?? dbt.id}`, date: d < today ? today : d,
      name: dbt.name || dbt.contact || 'Debt', amount: round2(left), sign: -1, kind: 'debt',
      counted: true, overdue: d < today, category: null, account: null, to: '/debts?tab=i_owe',
    })
  }

  // ── Card due dates: listed, already counted ──
  for (const b of creditCardBills({ accounts, transactions, today: now })) {
    if (!b.dueDate) continue
    const d = startOfDay(new Date(b.dueDate))
    if (d > end) continue
    events.push({
      key: `card:${b.account.id ?? b.name}`, date: d < today ? today : d,
      name: b.name, amount: round2(toBase(b.amount, b.account.currency)), sign: -1, kind: 'card',
      counted: false, overdue: !!b.overdue, category: null, account: b.name,
      to: b.account.id != null ? `/accounts/${b.account.id}` : null,
    })
  }

  events.sort((x, y) => x.date.getTime() - y.date.getTime()
    || (y.counted ? 1 : 0) - (x.counted ? 1 : 0) || x.name.localeCompare(y.name))

  const dailySpend = everydaySpend(transactions ?? [], now, priceOf)
  const range = spendRange(transactions ?? [], now, priceOf)

  // ── The walk ──
  const byDay = new Map()
  for (const e of events) {
    if (!e.counted) continue
    const k = isoDay(e.date)
    byDay.set(k, (byDay.get(k) ?? 0) + e.sign * e.amount)
  }
  /* Each day also carries a likely range - what the same walk gives with a
     quieter week's spending and with a busier one (spendRange). The bills,
     pay and payments are the same in all three; only the everyday spending
     is uncertain, so the range starts at nothing today and widens by the
     difference every day after. */
  /** @type {Array<{date: Date, iso: string, balance: number, low: number, high: number}>} */
  const days = []
  let running = start
  for (let i = 0; i <= walkDays; i++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
    const iso = isoDay(date)
    running += byDay.get(iso) ?? 0
    // Today's spending so far is already in the balance; the burn starts tomorrow.
    if (i > 0 && dailySpend) running -= dailySpend
    const busier = range && dailySpend ? (range.high - dailySpend) * i : 0
    const quieter = range && dailySpend ? (dailySpend - range.low) * i : 0
    days.push({ date, iso, balance: round2(running), low: round2(running - busier), high: round2(running + quieter) })
  }

  const shown = days.slice(0, horizonDays + 1)
  const lowest = shown.reduce((lo, d) => (d.balance < lo.balance ? d : lo), shown[0])
  const firstNegative = shown.find(d => d.balance < 0) ?? null
  const firstBelowFloor = floor > 0 ? (shown.find(d => d.balance < floor) ?? null) : null

  /* Safe to spend: the most you could spend today and still not dip below
     your floor before the next pay arrives - so the lowest point BEFORE
     payday, less the floor. Without a payday, the next two weeks. */
  const payLimit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + PAYDAY_LOOKAHEAD_DAYS)
  const nextPay = events.find(e => e.kind === 'income' && e.counted && e.date > today && e.date <= payLimit) ?? null
  const windowEnd = nextPay
    ? Math.round((startOfDay(nextPay.date).getTime() - today.getTime()) / DAY_MS) - 1
    : SAFE_WINDOW_DAYS
  const windowDays = days.slice(0, Math.max(1, Math.min(days.length, windowEnd + 1)))
  const windowLow = windowDays.reduce((lo, d) => Math.min(lo, d.balance), Infinity)
  const safeToSpend = round2(Math.max(0, windowLow - floor))

  return {
    start,
    days: shown,
    /** What actually happened, before today, oldest first - empty unless asked for. */
    past: historyDays > 0 ? liquidHistory({ accounts, transactions, current: start, days: historyDays, now, priceOf }) : [],
    events: events.filter(e => e.date <= shownEnd),
    lowest,
    firstNegative,
    firstBelowFloor,
    safeToSpend,
    /** The payday "safe to spend" runs up to, or null for the two-week window. */
    safeUntil: nextPay?.date ?? null,
    dailySpend,
    hasIncome: (recurring ?? []).some(r => r?.active !== false && r?.type === 'inflow'),
    floor,
    horizonDays,
  }
}

/**
 * What a typical day costs, from the median of the last twelve weeks - or
 * null when there is not enough history to say.
 *
 * Only weeks since you started keeping the ledger count: a brand-new user's
 * first week is not a median of eleven empty ones and one real one.
 *
 * @param {Array<Record<string, any>>} transactions
 * @param {Date} now
 * @param {(tx: any) => number} priceOf
 * @returns {number|null}
 */
export function everydaySpend(transactions, now, priceOf = txBase) {
  const sorted = weeklySpend(transactions, now, priceOf)
  if (!sorted) return null
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return median > 0 ? round2(median / 7) : null
}

/**
 * A quieter and a busier day, from the same weeks everydaySpend reads: the
 * 10th and 90th percentile week, over seven. What the forecast's likely
 * range is drawn from - eight weeks in ten of yours cost between the two.
 * Null without enough history, or when every week cost the same.
 *
 * @param {Array<Record<string, any>>} transactions
 * @param {Date} now
 * @param {(tx: any) => number} [priceOf]
 * @returns {{low: number, high: number}|null}
 */
export function spendRange(transactions, now, priceOf = txBase) {
  const sorted = weeklySpend(transactions, now, priceOf)
  if (!sorted) return null
  const q = (/** @type {number} */ p) => {
    const at = (sorted.length - 1) * p
    const i = Math.floor(at)
    return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (at - i)
  }
  const low = q(0.1) / 7
  const high = q(0.9) / 7
  return high - low > 0.005 ? { low: round2(low), high: round2(high) } : null
}

/**
 * Net liquid money - cash and banks, less what the cards owe - at the end of
 * each of the last `days` days, and today's `current` as the last point:
 * the same figure the forecast walks forward from, walked back.
 *
 * Built backwards from today by undoing each row's effect on that figure,
 * as the net-worth line is. A row counts by what it does to money you can
 * spend: spending and income on a cash, bank or card account; a transfer
 * only when one side is one of those and the other is not - into an
 * investment or a loan is money leaving, out of one is money arriving, and
 * between two of your own spendable accounts nothing changes.
 *
 * @param {object} input
 * @param {Array<Record<string, any>>} input.accounts
 * @param {Array<Record<string, any>>} input.transactions
 * @param {number} input.current
 * @param {number} input.days
 * @param {Date} [input.now]
 * @param {(tx: any) => number} [input.priceOf]
 * @returns {Array<{date: Date, iso: string, balance: number}>}
 */
export function liquidHistory({ accounts, transactions, current, days, now = new Date(), priceOf = txBase }) {
  const spendable = new Set((accounts ?? [])
    .filter(a => ['spending', 'savings', 'credit'].includes(bucketOf(a)))
    .map(a => a.name))
  const nowMs = now.getTime()
  /** @type {Array<{t: number, delta: number}>} */
  const moves = []
  for (const tx of transactions ?? []) {
    const t = tx?.date ? Date.parse(tx.date) : NaN
    if (!Number.isFinite(t) || t > nowMs) continue
    let delta = 0
    if (tx.type === 'expense' && spendable.has(tx.account)) delta = -priceOf(tx)
    else if (tx.type === 'inflow' && spendable.has(tx.account)) delta = priceOf(tx)
    else if (tx.type === 'transfer') {
      const out = spendable.has(tx.fromAccount), into = spendable.has(tx.toAccount)
      if (out && !into) delta = -priceOf(tx)
      else if (into && !out) delta = priceOf(tx)
    }
    if (Math.abs(delta) > 0.005) moves.push({ t, delta })
  }
  moves.sort((a, b) => b.t - a.t)

  const today = startOfDay(now)
  const out = [{ date: today, iso: isoDay(today), balance: round2(current) }]
  let running = current
  let m = 0
  for (let i = 1; i <= days; i++) {
    // The end of day (today - i): undo everything after it.
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i + 1).getTime()
    while (m < moves.length && moves[m].t >= endOfDay) { running -= moves[m].delta; m++ }
    out.push({ date, iso: isoDay(date), balance: round2(running) })
  }
  return out.reverse()
}

/**
 * The last twelve weeks of everyday spending, one total per week, smallest
 * first - or null when there is not enough history to read.
 *
 * @param {Array<Record<string, any>>} transactions
 * @param {Date} now
 * @param {(tx: any) => number} priceOf
 * @returns {number[]|null}
 */
function weeklySpend(transactions, now, priceOf) {
  const today = startOfDay(now).getTime()
  let first = Infinity
  for (const t of transactions) {
    const at = t?.date ? Date.parse(t.date) : NaN
    if (Number.isFinite(at) && at < first) first = at
  }
  if (!Number.isFinite(first)) return null
  const weeksKept = Math.floor((today - first) / (7 * DAY_MS))
  const weeks = Math.min(LOOKBACK_WEEKS, weeksKept)
  if (weeks < MIN_WEEKS) return null

  const totals = new Array(weeks).fill(0)
  const from = today - weeks * 7 * DAY_MS
  for (const t of transactions) {
    if (!isEverydaySpend(t)) continue
    const at = Date.parse(t.date)
    if (!Number.isFinite(at) || at < from || at >= today) continue
    const w = Math.floor((at - from) / (7 * DAY_MS))
    if (w >= 0 && w < weeks) totals[w] += priceOf(t)
  }
  return totals.sort((a, b) => a - b)
}

/** A row that is day-to-day spending, not something the forecast lays out on its own.
 *  @param {Record<string, any>} t */
function isEverydaySpend(t) {
  if (!isSpend(t)) return false
  if (t.recurringId != null || t.recurringSyncId) return false   // a bill, projected as one
  if (isInstallmentRow(t)) return false                         // on the card already
  if (Array.isArray(t.settles) || t.category === 'Debt Payment') return false
  if (t.category === LOAN_INTEREST) return false              // part of a loan payment
  return true
}
