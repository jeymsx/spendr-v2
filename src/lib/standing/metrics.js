import { daysBetween, num } from './format'

/**
 * What the facts add up to: the pace of the month, what is left, what is
 * close to full, what is due soon. Worked out once, so the level of the note
 * (level.js) and every sentence (sentences.js) read the same figures and
 * cannot disagree about whether the month is running warm.
 *
 * Pure and total: any facts, however thin or odd, give metrics - with null
 * for anything there was not enough to say.
 *
 * @typedef {import('./facts').StandingFacts} StandingFacts
 * @typedef {import('./facts').BillFact} BillFact
 *
 * @typedef {object} Metrics
 * @property {number} day
 * @property {number} days
 * @property {number} daysLeft        counting today, as Budget does
 * @property {number} elapsedPct      how much of the month has gone, 0-100
 * @property {number} spent
 * @property {number} earned
 * @property {number} net             earned less spent
 * @property {number} spentToday
 * @property {boolean} hasBudget
 * @property {number} budgetTotal
 * @property {number} budgetSpent     of the budgeted categories
 * @property {number} remaining       what the budget has left; negative when it is past
 * @property {number} usedPct
 * @property {number|null} allowance  what can be spent a day for the rest of the month
 * @property {{name: string, spent: number, budget: number}|null} anchor   the one category that is already done and is most of the month's spending
 * @property {number|null} flexUsedPct   the budget's used share, leaving the anchor out
 * @property {number|null} paceGap    points ahead (+) or behind (-) the month, once there are days enough to say
 * @property {number|null} cushion    how far under the pace the budget is, in money, when it is
 * @property {number|null} vsPrev     spending against the same days last month, in per cent
 * @property {Array<{name: string, budget: number, spent: number, ratio: number}>} fullCats   at or over their limit, worst first
 * @property {{name: string, budget: number, spent: number, ratio: number}|null} closeCat   the closest to full that is not
 * @property {BillFact[]} bills       due in the next two weeks
 * @property {number} billsTotal
 * @property {BillFact|null} dueSoon  the first thing due within three days, or overdue
 * @property {number|null} payIn      days to the next pay
 * @property {boolean} payToday
 * @property {boolean} monthStart     the first days of the month
 * @property {boolean} monthEnd       the last days of it
 */

const BILL_DAYS = 14

/**
 * @param {StandingFacts} f
 * @returns {Metrics}
 */
export function metricsOf(f) {
  const mo = f.month ?? /** @type {any} */ ({})
  const now = f.now
  const days = Math.max(1, Math.round(num(mo.days, 30)))
  const day = Math.min(days, Math.max(1, Math.round(num(mo.day, 1))))
  const daysLeft = days - day + 1
  const elapsedPct = (day / days) * 100
  const spent = Math.max(0, num(mo.spent))
  const earned = Math.max(0, num(mo.earned))

  // ── The budget ──
  const rows = (f.budget?.rows ?? []).filter(r => num(r.budget) > 0)
    .map(r => ({ name: r.name, budget: num(r.budget), spent: Math.max(0, num(r.spent)), fixed: !!r.fixed }))
  const budgetTotal = rows.reduce((t, r) => t + r.budget, 0)
  const hasBudget = budgetTotal > 0
  const budgetSpent = rows.reduce((t, r) => t + r.spent, 0)
  const remaining = budgetTotal - budgetSpent
  const usedPct = hasBudget ? (budgetSpent / budgetTotal) * 100 : 0
  const allowance = hasBudget && remaining > 0 ? remaining / daysLeft : null

  /* The category that is already done and is most of what has gone: rent, paid
     on the 1st. Leave it out and the rest of the month's pace is honest -
     with it in, 48% used on day 7 reads as alarm when it is one bill. */
  let anchor = null
  let flexUsedPct = null
  if (hasBudget && day <= 20) {
    const done = rows
      .filter(r => r.spent > 0 && (r.fixed || r.spent >= r.budget * 0.9) && r.spent >= budgetSpent * 0.4)
      .sort((a, b) => b.spent - a.spent)[0]
    if (done && budgetTotal - done.budget > 0) {
      anchor = { name: done.name, spent: done.spent, budget: done.budget }
      flexUsedPct = ((budgetSpent - done.spent) / (budgetTotal - done.budget)) * 100
    }
  }

  // A pace over the first two days is one purchase; say nothing until there is more.
  const paceGap = hasBudget && day >= 3 ? (flexUsedPct ?? usedPct) - elapsedPct : null
  const cushion = hasBudget && paceGap != null && paceGap < 0
    ? (-paceGap / 100) * (anchor ? budgetTotal - anchor.budget : budgetTotal)
    : null

  const prev = mo.prevSpent
  const vsPrev = typeof prev === 'number' && prev > 0 && day >= 4 ? ((spent - prev) / prev) * 100 : null

  const ratioRows = rows.map(r => ({ ...r, ratio: r.spent / r.budget }))
  /* Over its limit is news. Exactly at it is the budget working - rent
     reaching its limit on the 1st - and is not. */
  const fullCats = ratioRows
    .filter(r => Math.round(r.spent - r.budget) > 0)
    .sort((a, b) => b.ratio - a.ratio)
  const closeCat = ratioRows
    .filter(r => r.ratio >= 0.75 && r.ratio < 1 && r.name !== anchor?.name)
    .sort((a, b) => b.ratio - a.ratio)[0] ?? null

  // ── What is coming ──
  const plan = f.plan
  const bills = (plan?.bills ?? []).filter(b => b.overdue || daysBetween(now, b.date) <= BILL_DAYS)
  const billsTotal = bills.reduce((t, b) => t + Math.abs(num(b.amount)), 0)
  const dueSoon = bills.find(b => b.overdue || daysBetween(now, b.date) <= 3) ?? null
  const payIn = plan?.payDate ? daysBetween(now, plan.payDate) : null
  const payToday = payIn === 0

  return {
    day, days, daysLeft, elapsedPct, spent, earned, net: earned - spent, spentToday: Math.max(0, num(mo.spentToday)),
    hasBudget, budgetTotal, budgetSpent, remaining, usedPct, allowance,
    anchor, flexUsedPct, paceGap, cushion, vsPrev, fullCats, closeCat,
    bills, billsTotal, dueSoon, payIn, payToday,
    monthStart: day <= 3,
    monthEnd: daysLeft <= 3,
  }
}
