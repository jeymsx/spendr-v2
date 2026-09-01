import { useState, useMemo, useEffect } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from 'recharts'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { scheduledCutoff } from '../utils/scheduled'

// ── Formatters ─────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)
function fmtCompact(v) {
  const abs = Math.abs(v ?? 0)
  if (abs >= 1_000_000) return '₱' + ((v ?? 0) / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return '₱' + ((v ?? 0) / 1_000).toFixed(1) + 'K'
  return fmt(v)
}
const pad = (n) => String(n).padStart(2, '0')
const MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function monthBounds(year, month) {
  const start = `${year}-${pad(month + 1)}-01`
  const end   = month === 11 ? `${year + 1}-01-01` : `${year}-${pad(month + 2)}-01`
  return { start, end }
}

// ── Range window ───────────────────────────────────────────────────────────────

function getRangeWindow(range, monthOffset) {
  const now = new Date()
  if (range === '7d') {
    const end   = new Date(now); end.setDate(end.getDate() + 1)
    const start = new Date(now); start.setDate(start.getDate() - 6)
    const f = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    return { start: f(start), end: f(end), year: null, month: null }
  }
  if (range === '1m') {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + monthOffset)
    return { ...monthBounds(d.getFullYear(), d.getMonth()), year: d.getFullYear(), month: d.getMonth() }
  }
  if (range === 'all') {
    return { start: '2000-01-01', end: '2100-01-01', year: null, month: null }
  }
  const numMonths = range === '3m' ? 3 : 6
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const start = new Date(now.getFullYear(), now.getMonth() - (numMonths - 1), 1)
  return {
    start: `${start.getFullYear()}-${pad(start.getMonth()+1)}-01`,
    end:   `${end.getFullYear()}-${pad(end.getMonth()+1)}-01`,
    year: null, month: null,
  }
}

// ── Chart: Donut ───────────────────────────────────────────────────────────────

function DonutChart({ segments, total, animKey, selected, onSelect }) {
  const active = selected != null ? segments[selected] : null
  return (
    <div className="[&_*]:outline-none [&_*]:focus:outline-none"
      style={{ position: 'relative', width: '100%', maxWidth: 280, margin: '0 auto', height: 270 }}>
      <ResponsiveContainer width="100%" height={270}>
        <PieChart>
          <defs>
            {segments.map((seg, i) => (
              <linearGradient key={i} id={`sg-${animKey}-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor={seg.color} stopOpacity={0.5} />
                <stop offset="100%" stopColor={seg.color} stopOpacity={1}   />
              </linearGradient>
            ))}
          </defs>
          <Pie
            key={animKey} data={segments} dataKey="value"
            cx="50%" cy="50%" innerRadius={90} outerRadius={116}
            paddingAngle={3} cornerRadius={6} startAngle={90} endAngle={-270}
            onClick={(_, i) => onSelect(selected === i ? null : i)}
            stroke="none" isAnimationActive animationBegin={0} animationDuration={600}
          >
            {segments.map((seg, i) => (
              <Cell key={i} fill={`url(#sg-${animKey}-${i})`}
                opacity={selected != null && selected !== i ? 0.3 : 1}
                style={{ cursor: 'pointer', outline: 'none' }} />
            ))}
          </Pie>
          <Tooltip formatter={(v, n) => [fmt(v), n]} contentStyle={{ display: 'none' }} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        {active ? (
          <>
            <span style={{ fontSize: 26, lineHeight: 1 }}>{active.icon}</span>
            <span className="text-xl font-bold text-slate-800 dark:text-white tabular-nums mt-1.5">{fmtCompact(active.value)}</span>
            <span className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
              {total > 0 ? (active.value / total * 100).toFixed(1) : 0}%
            </span>
          </>
        ) : (
          <>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Total spent</span>
            <span className="text-2xl font-bold text-slate-800 dark:text-white tabular-nums mt-1">{fmtCompact(total)}</span>
          </>
        )}
      </div>
    </div>
  )
}

// ── Chart: Area (daily / 7D) ───────────────────────────────────────────────────

const CHART_COLORS = {
  expenses: '#ef4444',
  income:   '#22c55e',
  netflow:  'var(--color-primary)',
}

function DailyAreaChart({ data, chartType = 'expenses' }) {
  const color      = CHART_COLORS[chartType] ?? CHART_COLORS.expenses
  const gradId     = `dailyGrad-${chartType}`
  const yTickFmt   = v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v
  const labelEvery = Math.ceil(data.length / 8)
  const xTick = ({ x, y, payload }) => {
    if (payload.index % labelEvery !== 0 && payload.index !== data.length - 1) return null
    return <text x={x} y={y+12} textAnchor="middle" fontSize={10} fill="#94a3b8">{payload.value}</text>
  }
  return (
    <div className="[&_*]:outline-none [&_*]:focus:outline-none px-5">
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 10, right: 0, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 3" vertical={false} stroke="rgba(148,163,184,0.12)" />
          <XAxis dataKey="day" tick={xTick} axisLine={false} tickLine={false} interval={0} />
          <YAxis tickFormatter={yTickFmt} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const val = payload[0].value
              return (
                <div className="bg-white dark:bg-[#1a2130] border border-slate-200 dark:border-white/10 rounded-2xl px-3 py-2 shadow-lg text-xs">
                  <p className="font-semibold mb-0.5" style={{ color }}>{label}</p>
                  <p className="font-medium text-slate-700 dark:text-white">{val < 0 ? '−' : ''}{fmtCompact(Math.abs(val))}</p>
                </div>
              )
            }}
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 2' }}
          />
          <Area type="monotone" dataKey="value"
            stroke={color} strokeWidth={2.5}
            fill={`url(#${gradId})`} dot={false} baseValue={0}
            activeDot={{ r: 5, fill: color, stroke: 'white', strokeWidth: 2 }}
            animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Chart: Multi-month bars (3M / 6M) ─────────────────────────────────────────

function MultiBarChart({ data }) {
  const yTickFmt = v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v
  return (
    <div className="[&_*]:outline-none [&_*]:focus:outline-none px-5">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 8, right: 0, left: -8, bottom: 0 }} barCategoryGap="28%" barGap={2}>
          <CartesianGrid strokeDasharray="4 3" vertical={false} stroke="rgba(148,163,184,0.12)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={yTickFmt} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div className="bg-white dark:bg-[#1a2130] border border-slate-200 dark:border-white/10 rounded-2xl px-3 py-2 shadow-lg text-xs">
                  <p className="font-semibold text-slate-600 dark:text-slate-300 mb-1">{label}</p>
                  {payload.map(p => (
                    <p key={p.dataKey} className="font-medium" style={{ color: p.fill }}>
                      {p.dataKey === 'income' ? 'Income' : 'Expense'}: {fmtCompact(p.value)}
                    </p>
                  ))}
                </div>
              )
            }}
            cursor={{ fill: 'rgba(148,163,184,0.08)' }}
          />
          <Bar dataKey="income"  fill="#22c55e" fillOpacity={0.85} radius={[4,4,0,0]} animationDuration={600} activeBar={{ stroke: 'none', fillOpacity: 1 }} />
          <Bar dataKey="expense" fill="#ef4444" fillOpacity={0.85} radius={[4,4,0,0]} animationDuration={600} activeBar={{ stroke: 'none', fillOpacity: 1 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Layout primitives ──────────────────────────────────────────────────────────

function SectionLabel({ children, action }) {
  return (
    <div className="px-5 flex items-center justify-between mb-3">
      <h2 className="text-base font-semibold text-slate-800 dark:text-white">{children}</h2>
      {action}
    </div>
  )
}

function Divider() {
  return <div className="mx-5 border-t border-slate-100 dark:border-white/[0.05] my-5" />
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
          className={`relative z-10 w-9 py-1 text-[10px] font-bold text-center transition-colors duration-200 ${
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
      <button onClick={() => onMonth(monthOffset - 1)}
        className="p-1 text-slate-400 dark:text-slate-500 active:text-slate-700 dark:active:text-slate-200">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <button onClick={() => !isCurrent && onMonth(0)} className="flex items-center gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">{monthLabel}</span>
        {!isCurrent && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">NOW</span>
        )}
      </button>
      <button onClick={() => onMonth(monthOffset + 1)} disabled={isCurrent}
        className="p-1 text-slate-400 dark:text-slate-500 active:text-slate-700 dark:active:text-slate-200 disabled:opacity-25">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
  )
}

// ── Hero Stats ─────────────────────────────────────────────────────────────────

function HeroStats({ totalSpent, totalEarned }) {
  const net    = totalEarned - totalSpent
  const netPos = net >= 0
  return (
    <div className="px-5 py-1 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500 mb-1.5">
        Total Spent
      </p>
      <p className="text-[44px] font-bold tracking-tight text-slate-900 dark:text-white tabular-nums leading-none">
        {fmtCompact(totalSpent)}
      </p>
      <div className="flex items-center justify-center gap-4 mt-2.5">
        {totalEarned > 0 && (
          <span className="text-[12px] font-medium text-slate-400 dark:text-slate-500">
            <span className="text-emerald-500 dark:text-emerald-400 font-semibold">{fmtCompact(totalEarned)}</span> income
          </span>
        )}
        {(totalEarned > 0 || totalSpent > 0) && (
          <span className={`text-[12px] font-semibold ${netPos ? 'text-emerald-500 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400'}`}>
            {netPos ? '+' : '−'}{fmtCompact(Math.abs(net))} net
          </span>
        )}
      </div>
    </div>
  )
}

// ── Trivia ─────────────────────────────────────────────────────────────────────

function ordinal(n) {
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v-20)%10] || s[v] || s[0])
}

function generateTrivia({ expenses, inflows, totalSpent, totalEarned, categorySegments, topCategory, dailyData, topExpenses, budgetData, monthName }) {
  const items = []
  const push = (emoji, text, valid = true) => { if (valid && text) items.push({ emoji, text }) }
  const numExpenses = expenses.length
  const hasExpenses = numExpenses > 0

  const zeroDays = dailyData.filter(d => d.value === 0).length
  push('📅', `You had ${zeroDays} spending-free day${zeroDays !== 1 ? 's' : ''} in ${monthName} — ${Math.round(zeroDays / dailyData.length * 100)}% of the period.`, zeroDays > 0 && hasExpenses && dailyData.length > 0)

  if (topExpenses.length > 0) {
    const top = topExpenses[0]
    push('💸', `Your biggest single expense: ${fmtCompact(top.amount)} on "${top.description || top.category}".`)
  }

  push('🧮', `${numExpenses} expense transaction${numExpenses !== 1 ? 's' : ''} in ${monthName} — averaging ${fmtCompact(totalSpent / numExpenses)} each.`, hasExpenses)

  if (topCategory && totalSpent > 0) {
    const pct = (topCategory.value / totalSpent * 100).toFixed(0)
    push('🏆', `${topCategory.icon} ${topCategory.name} took up ${pct}% of your spending.`)
  }

  if (categorySegments.length >= 2 && totalSpent > 0) {
    const top2 = categorySegments[0].value + categorySegments[1].value
    push('🎯', `${categorySegments[0].icon} ${categorySegments[0].name} and ${categorySegments[1].icon} ${categorySegments[1].name} together make up ${(top2 / totalSpent * 100).toFixed(0)}% of expenses.`)
  }

  if (totalEarned > 0) {
    const net = totalEarned - totalSpent
    const rate = Math.abs((net / totalEarned) * 100).toFixed(0)
    if (net >= 0) push('💰', `You saved ${fmtCompact(net)} in ${monthName} — a ${rate}% savings rate.`)
    else push('⚠️', `You overspent income by ${fmtCompact(Math.abs(net))} — a ${rate}% deficit.`)
  }

  if (hasExpenses) {
    const byDow = [0,0,0,0,0,0,0]
    for (const tx of expenses) byDow[new Date(tx.date).getDay()] += tx.amount ?? 0
    const maxDow = byDow.indexOf(Math.max(...byDow))
    const days = ['Sundays','Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays']
    push('📆', `${days[maxDow]} are your heaviest spending day in ${monthName}.`, byDow[maxDow] > 0)
  }

  const peak = dailyData.reduce((b, d) => d.value > b.value ? d : b, { day: 0, value: 0 })
  push('📈', `Highest-spend day: the ${ordinal(peak.day)} — ${fmtCompact(peak.value)}.`, peak.value > 0)

  const activeDays = dailyData.filter(d => d.value > 0).length
  push('📊', `On days you actually spent, you averaged ${fmtCompact(totalSpent / activeDays)} per day.`, activeDays > 0)

  const overBudget = budgetData.filter(d => d.spent > d.budget)
  if (overBudget.length > 0) push('🚨', `Over budget in ${overBudget.length} categor${overBudget.length !== 1 ? 'ies' : 'y'}: ${overBudget.map(d => d.name).join(', ')}.`)

  const underBudget = budgetData.filter(d => d.budget > 0 && d.spent < d.budget)
  if (underBudget.length > 0) {
    const saved = underBudget.reduce((s, d) => s + (d.budget - d.spent), 0)
    push('✅', `Stayed under budget in ${underBudget.length} categor${underBudget.length !== 1 ? 'ies' : 'y'}, saving ${fmtCompact(saved)} vs your limits.`)
  }

  return items
}

function SpendingTrivia({ trivia, triviaKey }) {
  const [idx, setIdx]   = useState(() => Math.floor(Math.random() * Math.max(trivia.length, 1)))
  const [fade, setFade] = useState(true)

  useEffect(() => {
    setIdx(Math.floor(Math.random() * Math.max(trivia.length, 1)))
    setFade(true)
  }, [triviaKey])

  if (!trivia.length) return null
  const item = trivia[idx % trivia.length]

  function next() {
    setFade(false)
    setTimeout(() => {
      setIdx(i => {
        let n = Math.floor(Math.random() * trivia.length)
        while (n === i && trivia.length > 1) n = Math.floor(Math.random() * trivia.length)
        return n
      })
      setFade(true)
    }, 150)
  }

  return (
    <div className="px-5">
      <button
        onClick={next}
        className="w-full rounded-2xl px-4 py-4 text-left active:opacity-70 transition-opacity duration-75
          bg-gradient-to-br from-primary/[0.22] to-primary/[0.08]
          border border-primary/[0.28] dark:border-primary/[0.20]"
        style={{ outline: 'none' }}
      >
        <div className="flex items-center gap-3" style={{ opacity: fade ? 1 : 0, transition: 'opacity 0.15s ease' }}>
          <span className="text-xl leading-none shrink-0">{item.emoji}</span>
          <p className="flex-1 text-[13px] font-medium text-slate-700 dark:text-slate-200 leading-relaxed">{item.text}</p>
          <span className="text-[10px] text-primary/50 font-semibold shrink-0 mt-0.5">tap</span>
        </div>
      </button>
    </div>
  )
}

// ── By Category ────────────────────────────────────────────────────────────────

function SpendingByCategory({ segments, total, animKey, rangeLabel }) {
  const [selected, setSelected] = useState(null)
  useEffect(() => setSelected(null), [animKey])

  if (!segments.length) {
    return (
      <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">No expenses {rangeLabel}</p>
    )
  }

  return (
    <div>
      <DonutChart segments={segments} total={total} animKey={animKey} selected={selected} onSelect={setSelected} />
      <div className={`px-5 pt-4 grid gap-x-4 gap-y-3 ${segments.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {segments.map((seg, i) => (
          <button
            key={i}
            onClick={() => setSelected(selected === i ? null : i)}
            className={`flex items-center gap-2 text-left transition-opacity duration-150 min-w-0 ${selected != null && selected !== i ? 'opacity-30' : ''}`}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">{seg.name}</span>
            <span className="text-xs font-semibold text-slate-800 dark:text-white tabular-nums shrink-0 ml-auto">{fmt(seg.value)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Spending Trend (adaptive) ──────────────────────────────────────────────────

const CHART_TYPE_OPTS = [
  { key: 'expenses', label: 'Expenses' },
  { key: 'income',   label: 'Income'   },
  { key: 'netflow',  label: 'Net Flow' },
]

function SpendingTrend({ range, dailyExpense, dailyIncome, dailyNetflow, sevenDayExpense, sevenDayIncome, sevenDayNetflow, multiBarData }) {
  const [chartType, setChartType] = useState('expenses')

  const isArea = range === '7d' || range === '1m'

  const activeData = isArea
    ? (range === '7d'
        ? (chartType === 'expenses' ? sevenDayExpense : chartType === 'income' ? sevenDayIncome : sevenDayNetflow)
        : (chartType === 'expenses' ? dailyExpense    : chartType === 'income' ? dailyIncome    : dailyNetflow))
    : multiBarData

  const hasData = isArea
    ? activeData.some(d => d.value !== 0)
    : multiBarData.some(d => d.expense > 0)

  const label = range === '7d'  ? 'Last 7 Days'
    : range === '1m'            ? 'Trend'
    : range === '3m'            ? 'Last 3 Months'
    : range === '6m'            ? 'Last 6 Months'
    : 'All Time'

  const typeFilter = isArea && (
    <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/[0.06] rounded-full p-0.5">
      {CHART_TYPE_OPTS.map(o => (
        <button
          key={o.key}
          onClick={() => setChartType(o.key)}
          className={[
            'px-2.5 py-1 text-[10px] font-semibold rounded-full transition-all duration-150',
            chartType === o.key
              ? 'bg-white dark:bg-[#1e2a3a] shadow-sm'
              : 'text-slate-400 dark:text-slate-500',
          ].join(' ')}
          style={chartType === o.key ? { color: CHART_COLORS[o.key] } : {}}
        >{o.label}</button>
      ))}
    </div>
  )

  return (
    <div>
      <SectionLabel action={typeFilter}>{label}</SectionLabel>
      {!hasData ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">No data for this period</p>
      ) : isArea ? (
        <DailyAreaChart data={activeData} chartType={chartType} />
      ) : (
        <MultiBarChart data={multiBarData} />
      )}
    </div>
  )
}

// ── Top Expenses ───────────────────────────────────────────────────────────────

function TopTransactions({ txs, catMap }) {
  if (!txs.length) return null
  return (
    <div>
      <SectionLabel>Top Expenses</SectionLabel>
      <div className="flex flex-col gap-2 mx-5">
        {txs.map((tx, i) => {
          const cat  = catMap[tx.category]
          const date = new Date(tx.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
          return (
            <div key={tx.id ?? i} className="card flex items-center gap-3 px-4 py-3 rounded-2xl">
              <div
                className="w-9 h-9 rounded-2xl flex items-center justify-center text-[17px] shrink-0"
                style={{ backgroundColor: (cat?.color ?? '#2D9DFF') + '22' }}
              >
                {cat?.icon ?? '📦'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-slate-800 dark:text-white truncate leading-snug">
                  {tx.description || tx.category || '—'}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{tx.category} · {date}</p>
              </div>
              <p className="text-[13px] font-semibold text-red-500 dark:text-red-400 tabular-nums shrink-0">{fmt(tx.amount)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Account Breakdown ──────────────────────────────────────────────────────────

function AccountBreakdown({ data, animKey }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(false)
    const raf = requestAnimationFrame(() => { const t = setTimeout(() => setReady(true), 60); return () => clearTimeout(t) })
    return () => cancelAnimationFrame(raf)
  }, [animKey])

  if (!data.length) return null
  const max = Math.max(...data.map(d => d.value), 1)

  return (
    <div>
      <SectionLabel>By Account</SectionLabel>
      <div className="mx-5 flex flex-col gap-2">
        {data.map((d, i) => (
          <div key={i} className="card px-4 py-3 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300 truncate">{d.name}</span>
              </div>
              <span className="text-[13px] font-semibold text-slate-800 dark:text-white tabular-nums shrink-0 ml-2">{fmt(d.value)}</span>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-white/[0.07] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: ready ? `${(d.value / max) * 100}%` : '0%', backgroundColor: d.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Budget ─────────────────────────────────────────────────────────────────────

function BudgetSection({ data, animKey }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(false)
    const raf = requestAnimationFrame(() => { const t = setTimeout(() => setReady(true), 70); return () => clearTimeout(t) })
    return () => cancelAnimationFrame(raf)
  }, [animKey])

  if (!data.length) return null

  return (
    <div>
      <SectionLabel>Budget</SectionLabel>
      <div className="px-5 grid grid-cols-2 gap-2.5">
        {data.map((d, i) => {
          const pct    = d.budget > 0 ? Math.min((d.spent / d.budget) * 100, 100) : 0
          const over   = d.spent > d.budget
          const warn   = pct >= 75 && !over
          const accent = over ? '#ef4444' : warn ? '#f59e0b' : '#22c55e'
          return (
            <div key={i} className="relative rounded-2xl overflow-hidden flex flex-col gap-1.5 px-3 pt-2.5 pb-0
              bg-slate-50 dark:bg-white/[0.03]">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] leading-none shrink-0">{d.icon}</span>
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-200 truncate">{d.name}</span>
              </div>
              <div className="flex items-baseline justify-between gap-1 mb-2">
                <span className="text-[13px] font-bold tabular-nums" style={{ color: accent }}>{fmtCompact(d.spent)}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">/{fmtCompact(d.budget)}</span>
              </div>
              <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/[0.06] dark:bg-white/[0.08]">
                <div className="h-full transition-all duration-700 ease-out"
                  style={{ width: ready ? `${pct}%` : '0%', backgroundColor: accent }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Insights() {
  const [range,       setRange]       = useState('1m')
  const [monthOffset, setMonthOffset] = useState(0)
  const [animKey,     setAnimKey]     = useState(0)

  const { rangeStart, rangeEnd, year, month } = useMemo(() => {
    const w = getRangeWindow(range, monthOffset)
    return { rangeStart: w.start, rangeEnd: w.end, year: w.year, month: w.month }
  }, [range, monthOffset])

  useEffect(() => { setAnimKey(k => k + 1) }, [range, monthOffset])

  const rangeTxs   = useLiveQuery(() =>
    db.transactions.where('date').between(rangeStart, rangeEnd, true, false).toArray(),
    [rangeStart, rangeEnd], null,
  )
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const accounts   = useLiveQuery(() => db.accounts.toArray(),   [], [])

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

  const totalSpent  = useMemo(() => expenses.reduce((s, t) => s + (t.amount ?? 0), 0), [expenses])
  const totalEarned = useMemo(() => inflows.reduce((s, t)  => s + (t.amount ?? 0), 0), [inflows])

  const categorySegments = useMemo(() => {
    const map = {}
    for (const tx of expenses) {
      const c = catMap[tx.category]
      if (!map[tx.category]) map[tx.category] = { name: tx.category, value: 0, color: c?.color ?? '#6366f1', icon: c?.icon ?? '📦' }
      map[tx.category].value += tx.amount ?? 0
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
    for (const tx of expenses) { const d = new Date(tx.date).getDate(); byExpDay[d] = (byExpDay[d] ?? 0) + (tx.amount ?? 0) }
    for (const tx of inflows)  { const d = new Date(tx.date).getDate(); byIncDay[d] = (byIncDay[d] ?? 0) + (tx.amount ?? 0) }
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
      const exp = expenses.filter(t => (t.date ?? '').startsWith(dateStr)).reduce((s, t) => s + (t.amount ?? 0), 0)
      const inc = inflows.filter(t  => (t.date ?? '').startsWith(dateStr)).reduce((s, t) => s + (t.amount ?? 0), 0)
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
          income:  txs.filter(t => t.type === 'inflow').reduce((s, t)  => s + (t.amount ?? 0), 0),
          expense: txs.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount ?? 0), 0),
        }
      })
    }
    if (range === 'all') {
      const txs = postedTxs
      if (!txs.length) return []
      const dates = txs.map(t => t.date ?? '').filter(Boolean).sort()
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
            income:  mo.filter(t => t.type === 'inflow').reduce((s, t)  => s + (t.amount ?? 0), 0),
            expense: mo.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount ?? 0), 0),
          })
          m++; if (m > 11) { m = 0; y++ }
        }
        return result
      } else {
        // Group by year
        const years = [...new Set(txs.map(t => t.date?.slice(0, 4)).filter(Boolean))].sort()
        return years.map(year => {
          const yt = txs.filter(t => (t.date ?? '').startsWith(year))
          return {
            label:   year,
            income:  yt.filter(t => t.type === 'inflow').reduce((s, t)  => s + (t.amount ?? 0), 0),
            expense: yt.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount ?? 0), 0),
          }
        })
      }
    }
    return []
  }, [range, postedTxs])

  const topExpenses = useMemo(() =>
    [...expenses].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 5),
    [expenses],
  )

  const accountBreakdown = useMemo(() => {
    const map = {}
    for (const tx of expenses) {
      const acct = acctMap[tx.account]
      if (!map[tx.account]) map[tx.account] = { name: tx.account, value: 0, color: acct?.color ?? '#6366f1' }
      map[tx.account].value += tx.amount ?? 0
    }
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [expenses, acctMap])

  const budgetData = useMemo(() => {
    if (range !== '1m') return []
    const spentByCat = {}
    for (const tx of expenses) spentByCat[tx.category] = (spentByCat[tx.category] ?? 0) + (tx.amount ?? 0)
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

        {/* Hero */}
        <HeroStats totalSpent={totalSpent} totalEarned={totalEarned} />

        {/* Trivia */}
        {triviaList.length > 0 && (
          <>
            <div className="h-4" />
            <SpendingTrivia trivia={triviaList} triviaKey={animKey} />
          </>
        )}

        <Divider />

        {/* By category */}
        <SpendingByCategory
          segments={categorySegments} total={totalSpent}
          animKey={animKey} rangeLabel={rangeLabel}
        />

        <Divider />

        {/* Trend chart */}
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

        {topExpenses.length > 0 && (
          <>
            <Divider />
            <TopTransactions txs={topExpenses} catMap={catMap} />
          </>
        )}

        {accountBreakdown.length > 0 && (
          <>
            <Divider />
            <AccountBreakdown data={accountBreakdown} animKey={animKey} />
          </>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
