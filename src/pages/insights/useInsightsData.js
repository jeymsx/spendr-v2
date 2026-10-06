import { useMemo } from 'react'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { scheduledCutoff } from '../../utils/scheduled'
import { isoToDateInput, localMonthStartIso } from '../../utils/txDate'
import { txBase } from '../../lib/fxContext'
import { isIncome, isSpend } from '../../lib/flows'
import { MONTHS_SHORT, periodName, periodWindow, previousWindow } from './period'
import { generateTrivia } from './Trivia'
import { spendingRows } from '../../utils/installments'

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The UTC instants of LOCAL midnight on the 1st of a month and the next. @param {number} year @param {number} month */
function monthBounds(year, month) {
  return { start: localMonthStartIso(year, month), end: localMonthStartIso(year, month + 1) }
}

/* Income and spending, as lib/flows.js defines them: a balance correction or
   an investment's value moving is neither, and would otherwise read as a
   windfall or a splurge. */
/** @param {Array<Record<string, any>>} txs @param {'expense'|'inflow'} type */
const sumOf = (txs, type) => txs.filter(type === 'expense' ? isSpend : isIncome).reduce((s, t) => s + txBase(t), 0)

/**
 * Everything Insights draws for a period, read once and shared by the
 * overview and the pages it opens - so the donut, the Trend page and the Top
 * expenses list can never disagree about what a month cost.
 *
 * All of it in the ledger's currency (txBase): a comparison across rows is
 * only honest in one unit.
 *
 * Charges dated after today are committed, not spent - an installment booked
 * for later this month must not count against it yet - so every figure is
 * over the posted rows only, the same cutoff as Budget and Transactions.
 *
 * @param {import('./period').Period} period
 */
export function useInsightsData(period) {
  const win = useMemo(() => periodWindow(period), [period])
  const before = useMemo(() => previousWindow(period), [period])

  const rangeTxs = useLiveQuery(() =>
    db.transactions.where('date').between(win.start, win.end, true, false).toArray(),
  [win.start, win.end], null)
  const prevTxs = useLiveQuery(async () => (before
    ? db.transactions.where('date').between(before.start, before.end, true, false).toArray()
    : []),
  [before?.start, before?.end], null)
  const categories = useLiveQuery(() => db.categories.toArray(), [], undefined)
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], undefined)

  /* The first read only. A change of period keeps the last one's rows on
     screen until the next arrive, so rangeTxs is null exactly once. The
     other reads wait too: segments drawn before categories are all the
     fallback indigo, and recolour a frame later. */
  const loading = rangeTxs === null || categories === undefined || accounts === undefined

  const catMap = useMemo(() => Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])
  const acctMap = useMemo(() => Object.fromEntries((accounts ?? []).map(a => [a.name, a])), [accounts])

  const posted = useMemo(() => {
    const cutoff = scheduledCutoff()
    /* An installment plan is spent in full the month it was bought
       (utils/installments). The rows are a window of dates, so a plan is
       read by its labels: its "(1/N)" in the month bought, nothing later. */
    return spendingRows(rangeTxs ?? [], { complete: false }).filter(t => (t.date ?? '') <= cutoff)
  }, [rangeTxs])

  const expenses = useMemo(() => posted.filter(isSpend), [posted])
  const inflows = useMemo(() => posted.filter(isIncome), [posted])
  const totalSpent = useMemo(() => expenses.reduce((s, t) => s + txBase(t), 0), [expenses])
  const totalEarned = useMemo(() => inflows.reduce((s, t) => s + txBase(t), 0), [inflows])

  /* The stretch before, when there is one. Always wholly in the past, so
     there is nothing in it to cut off. */
  const previous = useMemo(() => {
    if (!before || !prevTxs) return null
    const prev = spendingRows(prevTxs, { complete: false })
    return { label: before.label, spent: sumOf(prev, 'expense'), earned: sumOf(prev, 'inflow') }
  }, [before, prevTxs])

  const categorySegments = useMemo(() => {
    /** @type {Record<string, {name: string, value: number, color: string, icon: string}>} */
    const map = {}
    for (const tx of expenses) {
      const c = catMap[tx.category]
      if (!map[tx.category]) map[tx.category] = { name: tx.category, value: 0, color: c?.color ?? '#6366f1', icon: c?.icon ?? '📦' }
      map[tx.category].value += txBase(tx)
    }
    /* A category whose refunds outweigh its spending has no slice to draw:
       a negative wedge is not a wedge. It is still in the total. */
    return Object.values(map).filter(s => s.value > 0).sort((a, b) => b.value - a.value)
  }, [expenses, catMap])

  // ── Day by day: 1M and 7D ──
  const daily = useMemo(() => {
    if (period.range === '1m' && win.year != null && win.month != null) {
      /** @type {Record<number, number>} */ const exp = {}
      /** @type {Record<number, number>} */ const inc = {}
      for (const tx of expenses) { const d = new Date(tx.date).getDate(); exp[d] = (exp[d] ?? 0) + txBase(tx) }
      for (const tx of inflows) { const d = new Date(tx.date).getDate(); inc[d] = (inc[d] ?? 0) + txBase(tx) }
      return Array.from({ length: win.days }, (_, i) => {
        const day = i + 1
        return { day, label: `${MONTHS_SHORT[win.month ?? 0]} ${day}`, expense: exp[day] ?? 0, income: inc[day] ?? 0 }
      })
    }
    if (period.range === '7d') {
      const now = new Date()
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i))
        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        // The local day, and each row in the ledger's currency, like every other series here.
        const onDay = (/** @type {Record<string, any>} */ t) => isoToDateInput(t.date) === key
        return {
          day: DAYS_SHORT[d.getDay()],
          label: `${DAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`,
          expense: expenses.filter(onDay).reduce((s, t) => s + txBase(t), 0),
          income: inflows.filter(onDay).reduce((s, t) => s + txBase(t), 0),
        }
      })
    }
    return []
  }, [period.range, win, expenses, inflows])

  /* The days that have happened. A running month's last days are zeros that
     have not been lived yet: counting them as quiet days, or averaging over
     them, would flatter the month. */
  const lived = useMemo(() => (period.range === '1m' ? daily.slice(0, win.elapsed) : daily), [period.range, daily, win.elapsed])

  // ── Month by month (or year by year): 3M, 6M, All ──
  const multiBarData = useMemo(() => {
    if (period.range === '3m' || period.range === '6m') {
      const n = period.range === '3m' ? 3 : 6
      const now = new Date()
      return Array.from({ length: n }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
        const { start, end } = monthBounds(d.getFullYear(), d.getMonth())
        const txs = posted.filter(t => t.date >= start && t.date < end)
        return { label: MONTHS_SHORT[d.getMonth()], income: sumOf(txs, 'inflow'), expense: sumOf(txs, 'expense') }
      })
    }
    if (period.range === 'all') {
      if (!posted.length) return []
      // Local calendar days, so the grouping agrees with monthBounds.
      const dates = posted.map(t => isoToDateInput(t.date)).filter(Boolean).sort()
      const first = dates[0], last = dates[dates.length - 1]
      const fy = parseInt(first.slice(0, 4), 10), fm = parseInt(first.slice(5, 7), 10) - 1
      const ly = parseInt(last.slice(0, 4), 10), lm = parseInt(last.slice(5, 7), 10) - 1
      if ((ly - fy) * 12 + (lm - fm) <= 6) {
        const out = []
        let y = fy, m = fm
        while (y < ly || (y === ly && m <= lm)) {
          const { start, end } = monthBounds(y, m)
          const txs = posted.filter(t => (t.date ?? '') >= start && (t.date ?? '') < end)
          out.push({ label: `${MONTHS_SHORT[m]} ${y}`, income: sumOf(txs, 'inflow'), expense: sumOf(txs, 'expense') })
          m++; if (m > 11) { m = 0; y++ }
        }
        return out
      }
      const years = [...new Set(posted.map(t => isoToDateInput(t.date).slice(0, 4)).filter(Boolean))].sort()
      return years.map(year => {
        const txs = posted.filter(t => isoToDateInput(t.date).startsWith(year))
        return { label: year, income: sumOf(txs, 'inflow'), expense: sumOf(txs, 'expense') }
      })
    }
    return []
  }, [period.range, posted])

  /* Biggest first, by what each cost in the ledger's currency - ¥5,000 is
     not bigger than ₱3,000. Refunds are money back, not purchases, so they
     are not "top expenses" at all. */
  const rankedExpenses = useMemo(() =>
    expenses.filter(t => txBase(t) > 0).sort((a, b) => txBase(b) - txBase(a)),
  [expenses])

  const accountBreakdown = useMemo(() => {
    /** @type {Record<string, {name: string, value: number, color: string, acct: Record<string, any>|null}>} */
    const map = {}
    for (const tx of expenses) {
      const acct = acctMap[tx.account]
      if (!map[tx.account]) map[tx.account] = { name: tx.account, value: 0, color: acct?.color ?? '#6366f1', acct: acct ?? null }
      /* In the ledger's currency, not each account's. These are bars, and a
         bar is a comparison - drawing $40 longer than ₱2,000 because forty
         is a smaller number would be the chart lying. */
      map[tx.account].value += txBase(tx)
    }
    return Object.values(map).filter(a => a.value > 0).sort((a, b) => b.value - a.value)
  }, [expenses, acctMap])

  const budgetData = useMemo(() => {
    if (period.range !== '1m') return []
    /** @type {Record<string, number>} */
    const spentByCat = {}
    for (const tx of expenses) spentByCat[tx.category] = (spentByCat[tx.category] ?? 0) + txBase(tx)
    return (categories ?? [])
      .filter(c => c.type === 'expense' && (c.budget ?? 0) > 0)
      .map(c => ({ name: c.name, icon: c.icon, color: c.color, budget: c.budget, spent: spentByCat[c.name] ?? 0 }))
      .sort((a, b) => (b.spent / b.budget) - (a.spent / a.budget))
  }, [period.range, expenses, categories])

  const trivia = useMemo(() => {
    if (!expenses.length) return []
    return generateTrivia({
      expenses, inflows, totalSpent, totalEarned,
      categorySegments, topCategory: categorySegments[0] ?? null,
      dailyData: lived.map(d => ({ day: d.day, value: d.expense, label: d.label })),
      topExpenses: rankedExpenses.slice(0, 5),
      budgetData, monthName: periodName(period),
    })
  }, [expenses, inflows, totalSpent, totalEarned, categorySegments, lived, rankedExpenses, budgetData, period])

  return {
    loading, win, catMap, acctMap, accounts: accounts ?? [], categories: categories ?? [],
    expenses, inflows, totalSpent, totalEarned, previous,
    categorySegments, daily, lived, multiBarData, rankedExpenses, accountBreakdown, trivia,
  }
}

/**
 * The Trend chart's three series from the day-by-day rows: what went out,
 * what came in, and the difference.
 *
 * @param {Array<{day: number|string, expense: number, income: number}>} daily
 */
export function dailySeries(daily) {
  return {
    expenses: daily.map(d => ({ day: d.day, value: d.expense })),
    income: daily.map(d => ({ day: d.day, value: d.income })),
    netflow: daily.map(d => ({ day: d.day, value: d.income - d.expense })),
  }
}
