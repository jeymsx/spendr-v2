/**
 * Investments: what they are worth, what went into them, and how old that
 * figure is.
 *
 * ── Valued by hand, on purpose ──
 *
 * There is no price feed. A UITF's NAVPU, an MP2 balance, a VUL's fund value
 * or a broker's portfolio total is a number the provider shows you, and you
 * type it in. So the rules are the ones a hand-typed market value needs:
 *
 *   - It has a DATE. A value from March must never pass for today's, so the
 *     screen says how old it is, and calls it old past STALE_AFTER_DAYS.
 *   - It is never invented. An investment you have never valued reads "Not
 *     updated yet", not ₱0 - zero is a claim.
 *   - What went in and what it is worth are separate figures, shown together.
 *     For a young VUL the second is usually below the first, and hiding that
 *     gap would be flattery.
 *
 * ── How a value is stored ──
 *
 * The account's balance IS its value. Putting money in or taking it out is a
 * transfer (that moves the balance and is not income or spending), and a new
 * value is written as an ordinary inflow or expense for the difference,
 * marked `adjust: 'value'` so no total counts it as earned or spent - see
 * lib/flows.js. `valuedAt` on the account records the day the figure was
 * last confirmed, even when it had not moved.
 *
 * ── Kept out of what you can spend ──
 *
 * Investments count toward net worth and nowhere else: not the spendable
 * figure, not goals, not the forecast, not the balance badges. They are
 * yours, but they are not money you can reach without selling something.
 */

import { VALUE_DESC } from './flows'

/** Past this, a typed-in value is old enough to say so. */
export const STALE_AFTER_DAYS = 45

const DAY_MS = 864e5
const round2 = (/** @type {number} */ n) => Math.round(n * 100) / 100

/** A row that recorded this account's value. @param {Record<string, any>} t @param {string} name */
const isValueRow = (t, name) =>
  t?.account === name && (t.adjust === 'value' || (!t.adjust && t.description === VALUE_DESC))

/**
 * @param {Record<string, any>} account  an investment account
 * @param {Array<Record<string, any>>} [transactions]
 * @param {Date} [now]
 */
export function investmentStatus(account, transactions = [], now = new Date()) {
  const name = account?.name
  const value = round2(account?.balance ?? 0)

  let paidIn = Number(account?.investedStart) || 0
  let lastValued = account?.valuedAt ? new Date(account.valuedAt) : null
  if (lastValued && Number.isNaN(lastValued.getTime())) lastValued = null
  let contributions = 0

  for (const t of transactions ?? []) {
    if (!t) continue
    if (t.type === 'transfer') {
      if (t.toAccount === name) { paidIn += Math.abs(t.toAmount ?? t.amount ?? 0); contributions++ }
      else if (t.fromAccount === name) paidIn -= Math.abs(t.amount ?? 0)
      continue
    }
    if (isValueRow(t, name)) {
      const d = new Date(t.date)
      if (!Number.isNaN(d.getTime()) && d <= now && (!lastValued || d > lastValued)) lastValued = d
    }
  }
  paidIn = round2(paidIn)

  const ageDays = lastValued
    ? Math.max(0, Math.floor((startOfDay(now) - startOfDay(lastValued)) / DAY_MS))
    : null
  const gain = round2(value - paidIn)
  return {
    value,
    paidIn,
    contributions,
    gain,
    gainPct: paidIn > 0.005 ? gain / paidIn : null,
    valuedAt: lastValued,
    ageDays,
    stale: ageDays != null && ageDays > STALE_AFTER_DAYS,
    valued: lastValued != null,
  }
}

/** @param {Date} d */
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * "Today", "Yesterday", "3 days ago", "Sep 3". Short, for under a figure.
 * @param {Date|null} d
 * @param {Date} [now]
 */
export function valuedAgo(d, now = new Date()) {
  if (!d) return 'Not updated yet'
  const days = Math.floor((startOfDay(now) - startOfDay(d)) / DAY_MS)
  if (days <= 0) return 'Updated today'
  if (days === 1) return 'Updated yesterday'
  if (days < 7) return `Updated ${days} days ago`
  const sameYear = d.getFullYear() === now.getFullYear()
  return `As of ${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })}`
}

/**
 * The row that records a new value: the difference, as an inflow when it
 * went up and an expense when it went down. Null when it has not moved -
 * the caller still stamps `valuedAt`, because "I checked, it is the same" is
 * worth knowing.
 *
 * @param {object} input
 * @param {string} input.account
 * @param {number} input.current   the balance now
 * @param {number} input.value     what it is worth now
 * @param {string} input.dateIso
 */
export function valueRow({ account, current, value, dateIso }) {
  const delta = round2(value - current)
  if (Math.abs(delta) < 0.005) return null
  return {
    type: delta > 0 ? 'inflow' : 'expense',
    amount: Math.abs(delta),
    account,
    description: VALUE_DESC,
    category: 'Investment',
    adjust: 'value',
    date: dateIso,
  }
}
