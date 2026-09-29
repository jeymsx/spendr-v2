import { isSpend } from './flows'
import { txBase } from './fxContext'
import { LOAN_INTEREST } from './loans'
import { isInstallmentRow } from '../utils/installments'
import { payName, rhythmLabel, rhythmOf, streamDates } from './incomeStreams'

/**
 * Bills the ledger already shows, that Recurring does not have yet.
 *
 * The same reading the forecast does for pay (lib/incomeStreams.js), turned
 * on what goes out: a Netflix that has cost ₱549 around the 20th for four
 * months is a subscription, whether or not anyone set it up as one. Offered
 * on the Recurring page as a one-tap "Add", never added on its own - the app
 * guessing wrong about a bill is worse than asking.
 *
 * ── What counts ──
 *
 * Spending that is filed under the same name (payName: "Netflix", however
 * the date is written after it), lands on about the same day each month,
 * and costs about the same each time - within a third either way, so a
 * Meralco that swings with the aircon still counts and a supermarket run
 * does not. Monthly only: that is what bills do, and a weekly rhythm in
 * spending is a habit, not a bill.
 *
 * Left out: anything already posted by a Recurring item, installments,
 * settlements and loan interest (they are events of their own elsewhere),
 * names a Recurring item already has, and the ones you said are not bills.
 */

/**
 * @typedef {object} BillSpot
 * @property {string} key       the payName it was grouped under
 * @property {string} name      as the latest row wrote it
 * @property {string|null} category
 * @property {string|null} account
 * @property {number} amount    a typical payment
 * @property {number} day       the day of the month it lands on (31 is the last)
 * @property {string} label     "Monthly, around the 20th"
 * @property {Date|null} next   the next date it is expected
 * @property {number} count     payments it was read from
 */

const DAY_MS = 864e5
/** Payments that must keep to about the same amount. */
const STEADY = 0.7
/** How far from the typical amount "about the same" reaches. */
const SPREAD = 0.35

/** @param {Array<string|null>} xs */
function mostCommon(xs) {
  /** @type {Map<string|null, number>} */
  const n = new Map()
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1)
  let best = null, count = 0
  for (const [x, c] of n) if (c > count) { best = x; count = c }
  return best
}

/**
 * @param {object} input
 * @param {Array<Record<string, any>>} input.transactions
 * @param {Array<Record<string, any>>} [input.recurring]
 * @param {string[]} [input.dismissed]  keys you said are not bills
 * @param {Date} [input.now]
 * @param {number} [input.lookbackDays]
 * @param {(tx: any) => number} [input.priceOf]
 * @returns {BillSpot[]}  biggest first
 */
export function spotBills({ transactions, recurring = [], dismissed = [], now = new Date(), lookbackDays = 183, priceOf = txBase }) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const from = today.getTime() - lookbackDays * DAY_MS
  const nowMs = now.getTime()
  const skip = new Set(dismissed)
  // The names Recurring already has, in the same shape.
  const known = (recurring ?? []).map(r => payName(r?.name)).filter(Boolean)
  const isKnown = (/** @type {string} */ key) => known.some(k => k === key || k.includes(key) || key.includes(k))

  /** @type {Map<string, Array<{t: Record<string, any>, at: number, amount: number}>>} */
  const groups = new Map()
  for (const t of transactions ?? []) {
    if (!isSpend(t)) continue
    if (t.recurringId != null || t.recurringSyncId) continue
    if (isInstallmentRow(t) || Array.isArray(t.settles) || t.category === 'Debt Payment' || t.category === LOAN_INTEREST) continue
    const at = t.date ? Date.parse(t.date) : NaN
    if (!Number.isFinite(at) || at < from || at > nowMs) continue
    const amount = priceOf(t)
    if (!(amount > 0)) continue
    const key = payName(t.description)
    if (key.length < 3) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)?.push({ t, at, amount })
  }

  /** @type {BillSpot[]} */
  const out = []
  for (const [key, rows] of groups) {
    if (rows.length < 3 || skip.has(key) || isKnown(key)) continue
    // One payment per day, oldest first.
    /** @type {Map<string, {date: Date, amount: number, account: string|null, name: string}>} */
    const perDay = new Map()
    for (const r of [...rows].sort((a, b) => a.at - b.at)) {
      const d = new Date(r.at)
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const k = day.toDateString()
      const p = perDay.get(k)
      if (p) p.amount += r.amount
      else perDay.set(k, { date: day, amount: r.amount, account: r.t.account ?? null, name: r.t.description ?? '' })
    }
    const payments = [...perDay.values()]
    const rhythm = rhythmOf(payments, today)
    if (!rhythm || rhythm.frequency !== 'monthly' || rhythm.count < 3) continue
    const kept = payments.filter((_, i) => rhythm.fit[i])
    const steady = kept.filter(p => Math.abs(p.amount - rhythm.amount) <= rhythm.amount * SPREAD).length
    if (steady < Math.ceil(kept.length * STEADY)) continue

    const latest = rows.reduce((a, b) => (b.at > a.at ? b : a))
    /** @type {import('./incomeStreams').IncomeStream} */
    const stream = { key, name: key, category: null, account: null, ...rhythm }
    const next = streamDates(stream, new Date(today.getFullYear(), today.getMonth() + 2, today.getDate()))
      .find(x => x.date >= today)?.date ?? null
    out.push({
      key,
      name: String(latest.t.description ?? key).trim(),
      category: mostCommon(rows.map(r => r.t.category ?? null)),
      account: mostCommon(rows.map(r => r.t.account ?? null)),
      amount: rhythm.amount,
      day: rhythm.anchors[0],
      label: rhythmLabel(stream),
      next,
      count: rhythm.count,
    })
  }
  return out.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
}

/** The Recurring form, filled in from a spot. @param {BillSpot} s @param {(d: Date) => string} iso */
export function billFormQuery(s, iso) {
  const q = new URLSearchParams({ type: 'expense', name: s.name, amount: String(s.amount), frequency: 'monthly' })
  if (s.category) q.set('category', s.category)
  if (s.account) q.set('account', s.account)
  if (s.next) q.set('next', iso(s.next))
  return q.toString()
}
