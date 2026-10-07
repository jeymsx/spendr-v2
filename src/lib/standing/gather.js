import { spendingRows } from '../../utils/installments'
import { getCreditStatus } from '../../utils/creditCycle'
import { isoToDateInput, txMonthKey } from '../../utils/txDate'
import { isIncome, isSpend } from '../flows'
import { txBase } from '../fxContext'
import { allocateGoals } from '../goals'
import { netWorthBreakdown } from '../netWorth'
import { isoOf, monthName, num, shortDate } from './format'
import { quietRunOf, weekdayPatternOf } from './facts'

/**
 * The note's facts, from the ledger: the one place that reads the app's own
 * tables and the forecast and says what they come to.
 *
 * Pure - the rows and the forecast are handed in, so the same numbers can be
 * checked here against Insights, Budget and Home without a screen. Nothing in
 * it is a rule about what to say; that is the composer's. This only answers
 * "what is true", and answers it the way the rest of the app does: spending
 * is a plan's whole price on the day it was bought, charges dated after today
 * are committed rather than spent, and every figure is in the ledger's
 * currency.
 *
 * @typedef {import('./facts').StandingFacts} StandingFacts
 *
 * @param {object} input
 * @param {Date} input.now
 * @param {string} [input.name]
 * @param {string} input.base    the ledger's currency
 * @param {Array<Record<string, any>>} input.txs   every row, unfiltered
 * @param {Array<Record<string, any>>} input.accounts
 * @param {Array<Record<string, any>>} input.categories
 * @param {Array<Record<string, any>>} [input.recurring]
 * @param {Array<Record<string, any>>} [input.goals]
 * @param {Array<Record<string, any>>} [input.debts]
 * @param {boolean} [input.includeDebts]   whether "Count debts" is on
 * @param {import('../fx').RateTable|null} [input.rates]
 * @param {Record<string, any>|null} [input.forecast]   lib/forecast.js buildForecast, or null while it is being worked out
 * @param {number|null} [input.worthChange]   how net worth has moved since the 1st
 * @returns {StandingFacts}
 */
export function gatherFacts({
  now, name = '', base, txs, accounts, categories, recurring = [], goals = [], debts = [],
  includeDebts = true, rates = null, forecast = null, worthChange = null,
}) {
  const y = now.getFullYear()
  const m = now.getMonth()
  const day = now.getDate()
  const days = new Date(y, m + 1, 0).getDate()
  const todayKey = isoOf(now)
  const cutoff = new Date(y, m, day, 23, 59, 59, 999).toISOString()
  const monthKey = todayKey.slice(0, 7)
  const prev = new Date(y, m - 1, 1)
  const prevKey = isoOf(prev).slice(0, 7)
  const prevDays = new Date(y, m, 0).getDate()
  const prevUpTo = `${prevKey}-${String(Math.min(day, prevDays)).padStart(2, '0')}`

  // ── What was spent and what came in: posted rows only, a plan once ──
  const posted = spendingRows(txs).filter(t => (t.date ?? '') <= cutoff)
  const spendRows = posted.filter(isSpend)
  const incomeRows = posted.filter(isIncome)
  const monthSpend = spendRows.filter(t => txMonthKey(t.date) === monthKey)
  const monthIncome = incomeRows.filter(t => txMonthKey(t.date) === monthKey)
  const sum = (/** @type {Array<Record<string, any>>} */ rows) => rows.reduce((t, r) => t + txBase(r), 0)

  /** @type {Map<string, number>} */
  const byDay = new Map()
  for (const t of spendRows) {
    const k = isoToDateInput(t.date)
    if (k) byDay.set(k, (byDay.get(k) ?? 0) + txBase(t))
  }
  const spendByDay = [...byDay.entries()].map(([iso, amount]) => ({ iso, amount }))
  const dayAmount = (/** @type {Date} */ d) => byDay.get(isoOf(d)) ?? 0
  const back = (/** @type {number} */ n) => new Date(y, m, day - n)

  const dates = txs.map(t => isoToDateInput(t.date)).filter(Boolean).sort()
  const since = dates[0] ?? null

  const prevSpend = spendRows.filter(t => { const k = isoToDateInput(t.date); return k >= `${prevKey}-01` && k <= prevUpTo })
  const lastSpend = spendRows.filter(t => txMonthKey(t.date) === prevKey)
  const lastIncome = incomeRows.filter(t => txMonthKey(t.date) === prevKey)
  const hasLast = since != null && since < `${monthKey}-01`

  // ── Where it went ──
  /** @type {Map<string, number>} */
  const byCat = new Map()
  for (const t of monthSpend) byCat.set(t.category, (byCat.get(t.category) ?? 0) + txBase(t))
  const byCategory = [...byCat.entries()].map(([n, value]) => ({ name: n, value })).filter(c => c.value > 0).sort((a, b) => b.value - a.value)

  const billCats = new Set((recurring ?? []).filter(r => r?.active !== false && r?.type !== 'inflow' && r?.category).map(r => r.category))
  const limitOf = new Map((categories ?? []).filter(c => num(c.budget) > 0).map(c => [c.name, num(c.budget)]))
  // The biggest single purchase that is not a bill: not from Recurring, not most of a category's limit.
  const buys = monthSpend
    .filter(t => t.recurringId == null && !billCats.has(t.category) && txBase(t) > 0 && !(limitOf.has(t.category) && txBase(t) >= limitOf.get(t.category) * 0.8))
    .sort((a, b) => txBase(b) - txBase(a))
  const buy = buys[0]
  let biggestDay = null
  for (const [k, v] of byDay) {
    if (k.startsWith(monthKey) && v > (biggestDay?.amount ?? 0)) biggestDay = { label: shortDate(new Date(`${k}T12:00:00`)), amount: v }
  }

  // ── The budget ──
  const budgetRows = (categories ?? [])
    .filter(c => (c.type ?? 'expense') === 'expense' && num(c.budget) > 0)
    .map(c => ({ name: c.name, budget: num(c.budget), spent: byCat.get(c.name) ?? 0, fixed: billCats.has(c.name) }))

  // ── What is coming: the forecast's bills, pay and warnings ──
  let plan = null
  if (forecast) {
    const events = /** @type {any[]} */ (forecast.events ?? [])
    const pay = events.filter(e => e.sign === 1 && e.kind === 'income' && e.date >= new Date(y, m, day)).sort((a, b) => a.date - b.date)[0]
    plan = {
      safe: typeof forecast.safeToSpend === 'number' ? forecast.safeToSpend : null,
      payDate: forecast.safeUntil ?? pay?.date ?? null,
      payName: pay?.name ?? null,
      payAmount: pay ? num(pay.amount) : null,
      bills: events
        .filter(e => e.sign === -1 && ['bill', 'card', 'loan', 'debt'].includes(e.kind))
        .sort((a, b) => a.date - b.date)
        .map(e => ({ name: String(e.name ?? ''), amount: num(e.amount), date: e.date, kind: e.kind, account: e.account ?? null, overdue: !!e.overdue })),
      shortOn: forecast.firstNegative?.date ?? null,
      belowFloorOn: forecast.firstBelowFloor?.date ?? null,
      floor: num(forecast.floor),
      liquid: typeof forecast.start === 'number' ? forecast.start : null,
    }
  }

  // ── What it is all worth ──
  const nw = netWorthBreakdown({ accounts, transactions: txs, view: base, ledger: base, rates, debts, includeDebts })
  const worth = {
    total: nw.total, spending: nw.spending, savings: nw.savings, invested: nw.invested,
    owed: nw.credit + nw.loans + nw.youOwe, owedToYou: nw.owedToYou, changeMonth: worthChange,
  }

  const cards = (accounts ?? []).filter(a => a.type === 'credit').map(a => {
    const st = getCreditStatus(/** @type {any} */ (a), txs)
    const limit = num(a.creditLimit) > 0 ? num(a.creditLimit) : null
    return { name: a.name, owed: Math.max(0, num(st.currentBalance)), limit, free: limit != null ? Math.max(0, num(st.availableCredit)) : null }
  })

  // The goal closest to done, or - when every one is - one that is.
  const alloc = allocateGoals({ goals: /** @type {any[]} */ (goals ?? []), accounts: /** @type {any[]} */ (accounts ?? []), base, rates })
  const open = alloc.active.filter(g => !g.complete && g.target > 0).sort((a, b) => b.pct - a.pct)[0]
  const done = alloc.active.find(g => g.complete)
  const g = open ?? done ?? null

  return {
    now,
    name: String(name ?? '').trim(),
    currency: base,
    txCount: txs.length,
    loggedToday: txs.filter(t => isoToDateInput(t.date) === todayKey).length,
    month: {
      day, days,
      spent: sum(monthSpend),
      earned: sum(monthIncome),
      spentToday: dayAmount(now),
      spentYesterday: since != null ? dayAmount(back(1)) : null,
      prevSpent: hasLast ? sum(prevSpend) : null,
      quietRun: quietRunOf(spendByDay, now, since),
      biggestDay,
      byCategory,
      biggestBuy: buy ? { name: String(buy.description || buy.category || '').trim(), amount: txBase(buy), category: buy.category ?? null } : null,
      last7: Array.from({ length: 7 }, (_, i) => dayAmount(back(6 - i))),
      weekday: weekdayPatternOf(spendByDay, now, since),
    },
    budget: budgetRows.length ? { total: budgetRows.reduce((t, r) => t + r.budget, 0), rows: budgetRows } : null,
    plan,
    worth,
    cards,
    goal: g ? { name: g.name, saved: g.saved, target: g.target, pct: g.pct, left: g.remaining } : null,
    last: hasLast
      ? { spent: sum(lastSpend), earned: sum(lastIncome), label: monthName(prev) }
      : { spent: null, earned: null, label: null },
  }
}
