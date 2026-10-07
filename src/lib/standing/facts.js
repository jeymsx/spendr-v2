import { daysBetween, isoOf, num, startOfDay, weekdayName } from './format'

/**
 * Everything the note is allowed to know, read once and handed to the
 * composer as plain data - so a note can be written for any situation by
 * writing the situation down, without a database (scenarios.js does exactly
 * that, for the tests and the gallery).
 *
 * Every part may be missing and none may be trusted to be tidy: the composer
 * says what it can from what is there, and nothing more.
 *
 * @typedef {object} BillFact
 * @property {string} name
 * @property {number} amount
 * @property {Date} date
 * @property {'bill'|'card'|'loan'|'debt'} kind
 * @property {string|null} account
 * @property {boolean} overdue
 *
 * @typedef {object} MonthFact
 * @property {number} day          today's date in the month, 1-31
 * @property {number} days         days in the month
 * @property {number} spent        spent so far this month
 * @property {number} earned       came in so far this month
 * @property {number} spentToday
 * @property {number|null} spentYesterday
 * @property {number|null} prevSpent   spent over the same days last month, or null when there was no last month
 * @property {number} quietRun     days in a row, counting back from today, with nothing spent
 * @property {{label: string, amount: number}|null} biggestDay
 * @property {Array<{name: string, value: number}>} byCategory   biggest first
 * @property {{name: string, amount: number, category: string|null}|null} biggestBuy   the biggest single purchase outside the bills
 * @property {number[]} last7      what each of the last seven days cost, oldest first, today last
 * @property {{name: string, rank: 'quiet'|'busy'|null}|null} weekday   how today's weekday usually goes
 *
 * @typedef {object} BudgetFact
 * @property {number} total
 * @property {Array<{name: string, budget: number, spent: number, fixed: boolean}>} rows
 *
 * @typedef {object} PlanFact
 * @property {number|null} safe        safe to spend, from the forecast
 * @property {Date|null} payDate
 * @property {string|null} payName
 * @property {number|null} payAmount
 * @property {BillFact[]} bills        what is due, soonest first
 * @property {Date|null} shortOn       the first day the money would run out
 * @property {Date|null} belowFloorOn  the first day it would dip under the floor
 * @property {number} floor
 * @property {number|null} liquid      what can be spent today
 *
 * @typedef {object} WorthFact
 * @property {number} total
 * @property {number} spending
 * @property {number} savings
 * @property {number} invested
 * @property {number} owed          cards, loans, and what is owed to people
 * @property {number} owedToYou
 * @property {number|null} changeMonth   how it has moved since the 1st
 *
 * @typedef {object} CardFact
 * @property {string} name
 * @property {number} owed
 * @property {number|null} limit
 * @property {number|null} free
 *
 * @typedef {object} GoalFact
 * @property {string} name
 * @property {number} saved
 * @property {number} target
 * @property {number} pct
 * @property {number} left
 *
 * @typedef {object} StandingFacts
 * @property {Date} now
 * @property {string} name
 * @property {string} currency
 * @property {number} txCount        everything ever logged
 * @property {number} loggedToday    rows written for today
 * @property {MonthFact} month
 * @property {BudgetFact|null} budget
 * @property {PlanFact|null} plan
 * @property {WorthFact|null} worth
 * @property {CardFact[]} cards
 * @property {GoalFact|null} goal
 * @property {{spent: number|null, earned: number|null, label: string|null}} last   the month before
 */

/**
 * Days in a row with nothing spent, counting back from today. Today counts
 * when nothing has been spent in it yet - the note is read during the day, and
 * "no spending today" is the start of a streak, not the end of one.
 *
 * @param {Array<{iso: string, amount: number}>} spendByDay  every day that had any, in any order
 * @param {Date} now
 * @param {string|null} [since]  the first day there is a ledger for, so a streak cannot reach back before it
 */
export function quietRunOf(spendByDay, now, since = null) {
  const spent = new Set(spendByDay.filter(d => d.amount > 0).map(d => d.iso))
  let run = 0
  for (let i = 0; i < 400; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const iso = isoOf(d)
    if (since && iso < since) break
    if (spent.has(iso)) break
    run++
  }
  return run
}

/**
 * How today's weekday usually goes: "quiet" when it costs well under a normal
 * day, "busy" when it costs well over, and nothing when there is no clear
 * pattern. Needs six weeks of history to say anything - a pattern in three
 * Wednesdays is a coincidence.
 *
 * @param {Array<{iso: string, amount: number}>} spendByDay  the last twelve weeks, a row per day that had spending
 * @param {Date} now
 * @param {string|null} since  the first day there is a ledger for
 * @returns {{name: string, rank: 'quiet'|'busy'|null}|null}
 */
export function weekdayPatternOf(spendByDay, now, since) {
  if (!since) return null
  const weeks = Math.floor(daysBetween(new Date(`${since}T12:00:00`), now) / 7)
  if (weeks < 6) return null
  const span = Math.min(weeks, 12)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - span * 7)
  const startIso = isoOf(start)
  const todayIso = isoOf(now)
  const sums = [0, 0, 0, 0, 0, 0, 0]
  for (const d of spendByDay) {
    if (d.iso < startIso || d.iso >= todayIso) continue
    const dow = new Date(`${d.iso}T12:00:00`).getDay()
    sums[dow] += num(d.amount)
  }
  const perDay = sums.map(v => v / span)
  const mean = perDay.reduce((a, b) => a + b, 0) / 7
  if (mean <= 0) return null
  const today = perDay[now.getDay()]
  const rank = today <= mean * 0.55 ? 'quiet' : today >= mean * 1.7 ? 'busy' : null
  return { name: `${weekdayName(startOfDay(now))}s`, rank }
}
