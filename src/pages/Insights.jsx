import { useState, useMemo } from 'react'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { scheduledCutoff } from '../utils/scheduled'
import { isoToDateInput, localMonthStartIso } from '../utils/txDate'
import Divider from '../components/ui/Divider'
import SectionLabel from '../components/ui/SectionLabel'
/* IconTrendUp is aliased: this file already has one, hand-drawn at a fixed
   26px for the income stat row. That one cannot take a size, and a 104px
   watermark needs to. Two trend glyphs in one file is not ideal, but they are
   different jobs at a 4x size difference, and unifying them would change a
   stat row nobody asked about. */
import { fmtCompact } from '../lib/money'
import { SpendingByCategory } from './insights/Panels'
import { TopTransactions, AccountBreakdown } from './insights/Tables'
import { SpendingTrend } from './insights/Trend'
import NetWorthTrend from './insights/NetWorthTrend'
import LazyWrappedCard from './recap/LazyWrappedCard'
import { useRecapMonth } from './recap/useRecapMonth'
import { addMonths, monthKeyOf, wrappedOnHome } from '../lib/recap'
import { generateTrivia, SpendingTrivia } from './insights/Trivia'
import { HeroSkeleton, TriviaSkeleton, CategorySkeleton, TrendSkeleton } from './insights/Skeleton'
import { txBase } from '../lib/fxContext'

// ── Formatters ─────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0')
const MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

/* The UTC instants of LOCAL midnight on the 1st of this month and the next.
   They were the strings "2026-09-01" and "2026-10-01", compared against UTC
   timestamps - so everything logged before 8am on the 1st in Manila landed in
   the previous month, and on that month's daily chart as day 1. */
function monthBounds(year, month) {
  return { start: localMonthStartIso(year, month), end: localMonthStartIso(year, month + 1) }
}

// ── Range window ───────────────────────────────────────────────────────────────

function getRangeWindow(range, monthOffset) {
  const now = new Date()
  if (range === '7d') {
    // Local midnights, as instants - see monthBounds.
    const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    return { start: start.toISOString(), end: end.toISOString(), year: null, month: null }
  }
  if (range === '1m') {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + monthOffset)
    return { ...monthBounds(d.getFullYear(), d.getMonth()), year: d.getFullYear(), month: d.getMonth() }
  }
  if (range === 'all') {
    return { start: '2000-01-01', end: '2100-01-01', year: null, month: null }
  }
  const numMonths = range === '3m' ? 3 : 6
  return {
    start: localMonthStartIso(now.getFullYear(), now.getMonth() - (numMonths - 1)),
    end:   localMonthStartIso(now.getFullYear(), now.getMonth() + 1),
    year: null, month: null,
  }
}

// ── Range Chips ────────────────────────────────────────────────────────────────

const RANGE_OPTS = [
  { key: '7d',  label: '7D'  },
  { key: '1m',  label: '1M'  },
  { key: '3m',  label: '3M'  },
  { key: '6m',  label: '6M'  },
  { key: 'all', label: 'All' },
]

function RangeChips({ range, onRange }) {
  const activeIdx = RANGE_OPTS.findIndex(r => r.key === range)
  return (
    <div className="relative flex items-center">
      {/* sliding frosted glass pill */}
      <div
        className="absolute top-0 bottom-0 rounded-xl border bg-primary/[0.10] dark:bg-primary/[0.12] border-primary/30 dark:border-primary/[0.25] pointer-events-none"
        style={{
          width: `${100 / RANGE_OPTS.length}%`,
          transform: `translateX(${activeIdx * 100}%)`,
          transition: 'transform 0.26s cubic-bezier(0.34, 1.4, 0.64, 1)',
        }}
      />
      {RANGE_OPTS.map(r => (
        <button
          key={r.key}
          onClick={() => onRange(r.key)}
          className={`relative z-10 w-9 py-1 text-10 font-bold text-center transition-colors duration-200 ${
            range === r.key ? 'text-primary' : 'text-slate-400 dark:text-slate-500'
          }`}
        >{r.label}</button>
      ))}
    </div>
  )
}

function MonthNav({ monthOffset, onMonth }) {
  const isCurrent = monthOffset === 0
  const monthLabel = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + monthOffset)
    return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
  }, [monthOffset])

  return (
    <div className="flex items-center justify-center gap-3 pb-1 mt-4">
      <button onClick={() => onMonth(monthOffset - 1)} aria-label="Previous month"
        className="p-1 text-slate-400 dark:text-slate-500 active:text-slate-700 dark:active:text-slate-200">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <button onClick={() => !isCurrent && onMonth(0)} className="press press-fade active:opacity-60 flex items-center gap-1.5">
        <span className="text-13 font-semibold text-slate-600 dark:text-slate-300">{monthLabel}</span>
        {!isCurrent && (
          <span className="text-10 font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Now</span>
        )}
      </button>
      <button onClick={() => onMonth(monthOffset + 1)} disabled={isCurrent} aria-label="Next month"
        className="p-1 text-slate-400 dark:text-slate-500 active:text-slate-700 dark:active:text-slate-200 disabled:opacity-25">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
  )
}

// ── Hero Stats ─────────────────────────────────────────────────────────────────

/**
 * The month's headline, in the shape every other headline in this app uses.
 *
 * It was its own thing on all three lines, and the label was the tell: a 12px
 * BOLD caption at 0.14em tracking in slate-400/500, where Goals, Debts and an
 * account's detail page all use SectionLabel - semibold, no tracking, and
 * slate-500/400, which is the same two greys the other way round. Nobody
 * decides that; it is what happens when a caption is copied from the wrong
 * screen. This page already used SectionLabel for "Total spent" in the donut
 * below, so the same two words appeared twice on one screen in two voices.
 *
 * The figure followed: 44px bold against the 38px semibold that Goals, Debts
 * and AccountDetail share. It was the loudest number in the app for no reason
 * anyone chose.
 *
 * ── The sub-line is one line now ──
 *
 * Two readings in a flex row became "₱18.4K income · −₱11.6K net", which is
 * the one quiet 13px line the other heroes put there. Both facts survive, and
 * the figures keep their semantic colours - the sign of the net is the only
 * thing on this page that says whether the month went well.
 */
function HeroStats({ totalSpent, totalEarned }) {
  const net    = totalEarned - totalSpent
  const netPos = net >= 0
  const showNet = totalEarned > 0 || totalSpent > 0

  return (
    <section className="px-5">
      <SectionLabel className="text-center">Total spent</SectionLabel>
      <p className="mt-2 text-center text-38 leading-none font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
        {fmtCompact(totalSpent)}
      </p>

      {(totalEarned > 0 || showNet) && (
        <p className="mt-2 text-center text-13 text-slate-500 dark:text-slate-400 tabular-nums">
          {totalEarned > 0 && (
            <>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {fmtCompact(totalEarned)}
              </span>
              {' income'}
            </>
          )}
          {totalEarned > 0 && showNet && ' · '}
          {showNet && (
            <span className={`font-semibold ${
              netPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
            }`}>
              {netPos ? '+' : '−'}{fmtCompact(Math.abs(net))} net
            </span>
          )}
        </p>
      )}
    </section>
  )
}

// ── Budget ─────────────────────────────────────────────────────────────────────

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Insights() {
  const [range,       setRange]       = useState('1m')
  const [monthOffset, setMonthOffset] = useState(0)

  /* Identifies the window on screen. Recharts restarts a series' animation
     when its key changes, and the gradient ids are namespaced with it so two
     windows can never collide in <defs>.

     Derived from the two values that define the window rather than bumped by
     an effect. The counter re-rendered the whole page a second time on every
     range change, and on the first of those two renders the charts were
     still carrying the previous window's key. */
  const animKey = `${range}-${monthOffset}`

  const { rangeStart, rangeEnd, year, month } = useMemo(() => {
    const w = getRangeWindow(range, monthOffset)
    return { rangeStart: w.start, rangeEnd: w.end, year: w.year, month: w.month }
  }, [range, monthOffset])

  const rangeTxs   = useLiveQuery(() =>
    db.transactions.where('date').between(rangeStart, rangeEnd, true, false).toArray(),
    [rangeStart, rangeEnd], null,
  )
  const categories = useLiveQuery(() => db.categories.toArray(), [], undefined)
  const accounts   = useLiveQuery(() => db.accounts.toArray(),   [], undefined)
  // The Wrapped card follows the month arrows when they point at a finished month.
  const recapMonth = useRecapMonth(range === '1m' && year != null ? `${year}-${pad(month + 1)}` : null)
  /* The first read only. A change of range keeps the last window's rows on
     screen until the next arrive, so rangeTxs is null exactly once. The other
     reads wait too: segments drawn before categories are all the fallback
     indigo, and recolour a frame later - and a recap card that arrived after
     the skeletons had become the page pushed the whole column down under a
     reader's thumb. */
  const loading = rangeTxs === null || categories === undefined || accounts === undefined
    || recapMonth === undefined

  const catMap  = useMemo(() => Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])
  const acctMap = useMemo(() => Object.fromEntries((accounts ?? []).map(a => [a.name, a])), [accounts])

  // Charges dated beyond today are committed, not spent — an installment
  // scheduled later this month must not count against this month's totals.
  const postedTxs = useMemo(() => {
    const cutoff = scheduledCutoff()
    return (rangeTxs ?? []).filter(t => (t.date ?? '') <= cutoff)
  }, [rangeTxs])

  const expenses = useMemo(() => postedTxs.filter(t => t.type === 'expense'), [postedTxs])
  const inflows  = useMemo(() => postedTxs.filter(t => t.type === 'inflow'),  [postedTxs])

  const totalSpent  = useMemo(() => expenses.reduce((s, t) => s + txBase(t), 0), [expenses])
  const totalEarned = useMemo(() => inflows.reduce((s, t)  => s + txBase(t), 0), [inflows])

  const categorySegments = useMemo(() => {
    const map = {}
    for (const tx of expenses) {
      const c = catMap[tx.category]
      if (!map[tx.category]) map[tx.category] = { name: tx.category, value: 0, color: c?.color ?? '#6366f1', icon: c?.icon ?? '📦' }
      map[tx.category].value += txBase(tx)
    }
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [expenses, catMap])

  const topCategory = categorySegments[0] ?? null

  // Daily data — 1M only (expenses, income, netflow)
  const { dailyExpense, dailyIncome, dailyNetflow } = useMemo(() => {
    if (range !== '1m' || year == null || month == null)
      return { dailyExpense: [], dailyIncome: [], dailyNetflow: [] }
    const days     = new Date(year, month + 1, 0).getDate()
    const byExpDay = {}, byIncDay = {}
    for (const tx of expenses) { const d = new Date(tx.date).getDate(); byExpDay[d] = (byExpDay[d] ?? 0) + txBase(tx) }
    for (const tx of inflows)  { const d = new Date(tx.date).getDate(); byIncDay[d] = (byIncDay[d] ?? 0) + txBase(tx) }
    const days_arr = Array.from({ length: days }, (_, i) => i + 1)
    return {
      dailyExpense: days_arr.map(d => ({ day: d, value: byExpDay[d] ?? 0 })),
      dailyIncome:  days_arr.map(d => ({ day: d, value: byIncDay[d] ?? 0 })),
      dailyNetflow: days_arr.map(d => ({ day: d, value: (byIncDay[d] ?? 0) - (byExpDay[d] ?? 0) })),
    }
  }, [range, expenses, inflows, year, month])

  // 7-day data (expenses, income, netflow)
  const { sevenDayExpense, sevenDayIncome, sevenDayNetflow } = useMemo(() => {
    if (range !== '7d') return { sevenDayExpense: [], sevenDayIncome: [], sevenDayNetflow: [] }
    const now = new Date()
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() - (6 - i))
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
      const label   = DAYS_SHORT[d.getDay()]
      // The local day, and each row in the ledger's currency, like every other series here.
      const exp = expenses.filter(t => isoToDateInput(t.date) === dateStr).reduce((s, t) => s + txBase(t), 0)
      const inc = inflows.filter(t  => isoToDateInput(t.date) === dateStr).reduce((s, t) => s + txBase(t), 0)
      return { label, exp, inc }
    })
    return {
      sevenDayExpense: days.map(d => ({ day: d.label, value: d.exp })),
      sevenDayIncome:  days.map(d => ({ day: d.label, value: d.inc })),
      sevenDayNetflow: days.map(d => ({ day: d.label, value: d.inc - d.exp })),
    }
  }, [range, expenses, inflows])

  // Multi-month / all-time bar data — 3M / 6M / All
  const multiBarData = useMemo(() => {
    if (range === '3m' || range === '6m') {
      const numMonths = range === '3m' ? 3 : 6
      const now = new Date()
      return Array.from({ length: numMonths }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (numMonths - 1 - i), 1)
        const { start, end } = monthBounds(d.getFullYear(), d.getMonth())
        const txs = postedTxs.filter(t => t.date >= start && t.date < end)
        return {
          label:   MONTHS_SHORT[d.getMonth()],
          income:  txs.filter(t => t.type === 'inflow').reduce((s, t)  => s + txBase(t), 0),
          expense: txs.filter(t => t.type === 'expense').reduce((s, t) => s + txBase(t), 0),
        }
      })
    }
    if (range === 'all') {
      const txs = postedTxs
      if (!txs.length) return []
      // Local calendar days, so the grouping agrees with monthBounds.
      const dates = txs.map(t => isoToDateInput(t.date)).filter(Boolean).sort()
      const firstDate = dates[0], lastDate = dates[dates.length - 1]
      const fy = parseInt(firstDate.slice(0, 4), 10), fm = parseInt(firstDate.slice(5, 7), 10) - 1
      const ly = parseInt(lastDate.slice(0, 4),  10), lm = parseInt(lastDate.slice(5, 7),  10) - 1
      const monthSpan = (ly - fy) * 12 + (lm - fm)
      if (monthSpan <= 6) {
        // Group by month
        const result = []
        let y = fy, m = fm
        while (y < ly || (y === ly && m <= lm)) {
          const { start, end } = monthBounds(y, m)
          const mo = txs.filter(t => (t.date ?? '') >= start && (t.date ?? '') < end)
          result.push({
            label:   `${MONTHS_SHORT[m]} ${y}`,
            income:  mo.filter(t => t.type === 'inflow').reduce((s, t)  => s + txBase(t), 0),
            expense: mo.filter(t => t.type === 'expense').reduce((s, t) => s + txBase(t), 0),
          })
          m++; if (m > 11) { m = 0; y++ }
        }
        return result
      } else {
        // Group by year
        const years = [...new Set(txs.map(t => isoToDateInput(t.date).slice(0, 4)).filter(Boolean))].sort()
        return years.map(year => {
          const yt = txs.filter(t => isoToDateInput(t.date).startsWith(year))
          return {
            label:   year,
            income:  yt.filter(t => t.type === 'inflow').reduce((s, t)  => s + txBase(t), 0),
            expense: yt.filter(t => t.type === 'expense').reduce((s, t) => s + txBase(t), 0),
          }
        })
      }
    }
    return []
  }, [range, postedTxs])

  // By what each cost in the ledger's currency - ¥5,000 is not bigger than ₱3,000.
  const topExpenses = useMemo(() =>
    [...expenses].sort((a, b) => txBase(b) - txBase(a)).slice(0, 5),
    [expenses],
  )

  const accountBreakdown = useMemo(() => {
    const map = {}
    for (const tx of expenses) {
      const acct = acctMap[tx.account]
      // The account itself, not just its colour: the row draws its card.
      if (!map[tx.account]) map[tx.account] = { name: tx.account, value: 0, color: acct?.color ?? '#6366f1', acct: acct ?? null }
      /* In the ledger's currency, not each account's. These are BARS, and a
         bar is a comparison - drawing $40 longer than ₱2,000 because forty is
         a smaller number would be the chart lying. The account's own figure
         is on its card, where it is not being compared to anything. */
      map[tx.account].value += txBase(tx)
    }
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [expenses, acctMap])

  const budgetData = useMemo(() => {
    if (range !== '1m') return []
    const spentByCat = {}
    for (const tx of expenses) spentByCat[tx.category] = (spentByCat[tx.category] ?? 0) + txBase(tx)
    return (categories ?? [])
      .filter(c => c.type === 'expense' && (c.budget ?? 0) > 0)
      .map(c => ({ name: c.name, icon: c.icon, color: c.color, budget: c.budget, spent: spentByCat[c.name] ?? 0 }))
      .sort((a, b) => (b.spent / b.budget) - (a.spent / a.budget))
  }, [range, expenses, categories])

  const triviaList = useMemo(() => {
    if (!expenses.length) return []
    const triviaDaily = range === '7d' ? sevenDayExpense : range === '1m' ? dailyExpense : []
    const triviaMonth = range === '7d'  ? 'the last 7 days'
      : range === '1m'  ? MONTHS[month ?? 0]
      : range === '3m'  ? 'the last 3 months'
      : range === '6m'  ? 'the last 6 months'
      : 'all time'
    return generateTrivia({
      expenses, inflows, totalSpent, totalEarned,
      categorySegments, topCategory, dailyData: triviaDaily, topExpenses,
      budgetData, monthName: triviaMonth,
    })
  }, [range, expenses, inflows, totalSpent, totalEarned, categorySegments, topCategory, dailyExpense, sevenDayExpense, topExpenses, budgetData, month])

  const rangeLabel = range === '7d'  ? 'in the last 7 days'
    : range === '1m'  ? 'this month'
    : range === '3m'  ? 'in the last 3 months'
    : range === '6m'  ? 'in the last 6 months'
    : 'of all time'

  return (
    <div className="flex flex-col page-enter" style={{ minHeight: 'calc(100dvh - 80px)' }}>

      {/* Header */}
      <div className="px-5 pt-safe-header pb-2 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Insights</h1>
        <RangeChips
          range={range}
          onRange={r => { setRange(r); if (r !== '1m') setMonthOffset(0) }}
        />
      </div>

      {/* Month nav — 1M only */}
      {range === '1m' && (
        <MonthNav
          monthOffset={monthOffset}
          onMonth={o => { if (o <= 0) setMonthOffset(o) }}
        />
      )}

      <div className="flex flex-col py-5">

        {/* Each section swaps for its skeleton in its own slot, so the
            column's shape - and NetWorthTrend's place in it - holds across
            the first read. See insights/Skeleton.jsx. */}

        {/* Hero */}
        {loading
          ? <HeroSkeleton />
          : <HeroStats totalSpent={totalSpent} totalEarned={totalEarned} />}

        {/* Trivia */}
        {loading ? <TriviaSkeleton /> : triviaList.length > 0 && (
          <>
            <div className="h-4" />
            <SpendingTrivia trivia={triviaList} triviaKey={animKey} />
          </>
        )}

        <Divider inset="gutter" className="my-5" />

        {/* By category */}
        {loading ? <CategorySkeleton /> : (
          <SpendingByCategory
            key={animKey}
            segments={categorySegments} total={totalSpent}
            animKey={animKey} rangeLabel={rangeLabel}
          />
        )}

        <Divider inset="gutter" className="my-5" />

        {/* A finished month's Wrapped, above net worth - except last month's
            while Home is leading with it, in the first days of this one. */}
        {!loading && recapMonth && !(wrappedOnHome() && recapMonth === addMonths(monthKeyOf(new Date()), -1)) && (
          <>
            <LazyWrappedCard month={recapMonth} className="px-5" />
            <Divider inset="gutter" className="my-5" />
          </>
        )}

        {/* Net worth over time. First among the charts because it is the one
            question the rest of this page never answers - every other figure
            here is about money moving, and none says whether you are better
            off than you were. It keeps its own range; see the component. */}
        <NetWorthTrend />

        <Divider inset="gutter" className="my-5" />

        {/* Trend chart */}
        {loading ? <TrendSkeleton /> : (
          <SpendingTrend
            range={range}
            dailyExpense={dailyExpense}
            dailyIncome={dailyIncome}
            dailyNetflow={dailyNetflow}
            sevenDayExpense={sevenDayExpense}
            sevenDayIncome={sevenDayIncome}
            sevenDayNetflow={sevenDayNetflow}
            multiBarData={multiBarData}
          />
        )}

        {topExpenses.length > 0 && (
          <>
            <Divider inset="gutter" className="my-5" />
            <TopTransactions txs={topExpenses} catMap={catMap} />
          </>
        )}

        {accountBreakdown.length > 0 && (
          <>
            <Divider inset="gutter" className="my-5" />
            <AccountBreakdown data={accountBreakdown} animKey={animKey} />
          </>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
