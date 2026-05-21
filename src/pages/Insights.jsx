import { useState, useMemo, useEffect } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from 'recharts'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'

// ── Formatters ─────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt  = (v) => '₱' + _phpFmt.format(v ?? 0)
const fmtK = (v) => {
  const abs = Math.abs(v ?? 0)
  if (abs >= 1_000_000) return '₱' + ((v ?? 0) / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return '₱' + ((v ?? 0) / 1_000).toFixed(1) + 'K'
  return fmt(v)
}
const pad = (n) => String(n).padStart(2, '0')

const MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function monthBounds(year, month) {
  const start = `${year}-${pad(month + 1)}-01`
  const end   = month === 11
    ? `${year + 1}-01-01`
    : `${year}-${pad(month + 2)}-01`
  return { start, end }
}

// ── Donut Chart ────────────────────────────────────────────────────────────────

function DonutChart({ segments, total, animKey, selected, onSelect }) {
  const active = selected != null ? segments[selected] : null

  return (
    <div className="[&_*]:outline-none [&_*]:focus:outline-none" style={{ position: 'relative', width: '100%', maxWidth: 240, margin: '0 auto', height: 220 }}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            key={animKey}
            data={segments}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={74}
            outerRadius={92}
            paddingAngle={3}
            cornerRadius={6}
            startAngle={90}
            endAngle={-270}
            onClick={(_, i) => onSelect(selected === i ? null : i)}
            stroke="none"
            isAnimationActive={true}
            animationBegin={0}
            animationDuration={600}
          >
            {segments.map((seg, i) => (
              <Cell
                key={i}
                fill={seg.color}
                opacity={selected != null && selected !== i ? 0.35 : 1}
                style={{ cursor: 'pointer', outline: 'none' }}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [fmt(value), name]}
            contentStyle={{ display: 'none' }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Center label — absolutely positioned over the chart */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        {active ? (
          <>
            <span style={{ fontSize: 22, lineHeight: 1 }}>{active.icon}</span>
            <span className="text-base font-bold text-slate-800 dark:text-white tabular-nums mt-1">
              {fmtK(active.value)}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {total > 0 ? (active.value / total * 100).toFixed(1) : 0}%
            </span>
          </>
        ) : (
          <>
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
              Total spent
            </span>
            <span className="text-lg font-bold text-slate-800 dark:text-white tabular-nums mt-0.5">
              {fmtK(total)}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// ── Bar Chart — 6 months ───────────────────────────────────────────────────────

function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-[#1a2130] border border-slate-200 dark:border-white/[0.10]
      rounded-2xl px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-slate-600 dark:text-slate-300 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="font-medium" style={{ color: p.fill }}>
          {p.dataKey === 'income' ? 'Income' : 'Expense'}: {fmtK(p.value)}
        </p>
      ))}
    </div>
  )
}

function BarChart6({ data }) {
  const yTickFmt = v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v

  return (
    <div className="[&_*]:outline-none [&_*]:focus:outline-none">
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="28%" barGap={2}>
        <CartesianGrid strokeDasharray="4 3" vertical={false} stroke="rgba(148,163,184,0.15)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={yTickFmt}
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
        <Bar dataKey="income"  fill="#22c55e" fillOpacity={0.85} radius={[4, 4, 0, 0]} animationDuration={600} activeBar={{ stroke: 'none', strokeWidth: 0, fillOpacity: 1 }} />
        <Bar dataKey="expense" fill="#ef4444" fillOpacity={0.85} radius={[4, 4, 0, 0]} animationDuration={600} activeBar={{ stroke: 'none', strokeWidth: 0, fillOpacity: 1 }} />
      </BarChart>
    </ResponsiveContainer>
    </div>
  )
}

// ── Daily chart — daily spending ───────────────────────────────────────────────

function DailyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-[#1a2130] border border-slate-200 dark:border-white/[0.10]
      rounded-2xl px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-primary">Day {label}</p>
      <p className="font-medium text-slate-700 dark:text-white mt-0.5">{fmtK(payload[0].value)}</p>
    </div>
  )
}

function DailyChart({ data }) {
  const yTickFmt  = v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v
  const labelEvery = Math.ceil(data.length / 8)

  const xTick = (props) => {
    const { x, y, payload } = props
    if (payload.index % labelEvery !== 0 && payload.index !== data.length - 1) return null
    return (
      <text x={x} y={y + 12} textAnchor="middle" fontSize={10} fill="#94a3b8">
        {payload.value}
      </text>
    )
  }

  return (
    <div className="[&_*]:outline-none [&_*]:focus:outline-none">
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="dailyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#2D9DFF" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#2D9DFF" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 3" vertical={false} stroke="rgba(148,163,184,0.15)" />
        <XAxis
          dataKey="day"
          tick={xTick}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis
          tickFormatter={yTickFmt}
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip
          content={<DailyTooltip />}
          cursor={{ stroke: '#2D9DFF', strokeWidth: 1, strokeDasharray: '4 2' }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#2D9DFF"
          strokeWidth={2.5}
          fill="url(#dailyGrad)"
          dot={false}
          activeDot={{ r: 5, fill: '#2D9DFF', stroke: 'white', strokeWidth: 2 }}
          animationDuration={800}
        />
      </AreaChart>
    </ResponsiveContainer>
    </div>
  )
}

// ── Month Selector ─────────────────────────────────────────────────────────────

function MonthSelector({ offset, onChange }) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  const label     = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  const isCurrent = offset === 0

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(offset - 1)}
        className="p-1 text-slate-400 dark:text-slate-500 active:text-slate-700 dark:active:text-slate-200 transition-colors"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <button
        onClick={() => !isCurrent && onChange(0)}
        className="flex items-center gap-1.5"
      >
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{label}</span>
        {!isCurrent && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 dark:bg-primary/15 text-primary">
            Today
          </span>
        )}
      </button>

      <button
        onClick={() => onChange(offset + 1)}
        disabled={isCurrent}
        className="p-1 text-slate-400 dark:text-slate-500 active:text-slate-700 dark:active:text-slate-200 transition-colors disabled:opacity-25"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  )
}

// ── Summary Cards ──────────────────────────────────────────────────────────────

function SummaryCards({ totalSpent, totalEarned, topCategory }) {
  const net    = totalEarned - totalSpent
  const netPos = net >= 0

  return (
    <div className="px-4">
      <div className="card rounded-2xl overflow-hidden">
        {/* 3-stat row */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-white/[0.06]">
          <div className="px-3.5 py-3.5">
            <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mb-1.5">Spent</p>
            <p className="text-[17px] font-bold leading-none text-red-500 dark:text-red-400 tabular-nums">{fmtK(totalSpent)}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">expenses</p>
          </div>
          <div className="px-3.5 py-3.5">
            <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mb-1.5">Earned</p>
            <p className="text-[17px] font-bold leading-none text-emerald-500 dark:text-emerald-400 tabular-nums">{fmtK(totalEarned)}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">inflows</p>
          </div>
          <div className="px-3.5 py-3.5">
            <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mb-1.5">Net</p>
            <p className={`text-[17px] font-bold leading-none tabular-nums ${netPos ? 'text-primary' : 'text-amber-500 dark:text-amber-400'}`}>
              {netPos ? '+' : '−'}{fmtK(Math.abs(net))}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">{netPos ? 'surplus' : 'deficit'}</p>
          </div>
        </div>
        {/* Top category footer row */}
        {topCategory && (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5
            border-t border-slate-100 dark:border-white/[0.06]">
            <span className="text-sm leading-none">{topCategory.icon}</span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">Top</span>
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate flex-1">{topCategory.name}</span>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums shrink-0">{fmtK(topCategory.value)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="px-4">
      <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-3 px-0.5">
        {title}
      </h2>
      <div className="card rounded-2xl overflow-hidden">
        {children}
      </div>
    </div>
  )
}

// ── Spending by Category ───────────────────────────────────────────────────────

function SpendingByCategory({ segments, total, animKey }) {
  const [selected, setSelected] = useState(null)
  useEffect(() => setSelected(null), [animKey])

  if (!segments.length) {
    return (
      <Section title="By category">
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-10">No expenses this month</p>
      </Section>
    )
  }

  return (
    <Section title="By category">
      <div className="px-4 pt-4 pb-2">
        <DonutChart
          segments={segments} total={total}
          animKey={animKey} selected={selected} onSelect={setSelected}
        />
      </div>
      <div className="px-4 pb-3 flex flex-col divide-y divide-slate-100 dark:divide-white/[0.05]">
        {segments.map((seg, i) => {
          const pctNum = total > 0 ? (seg.value / total * 100) : 0
          return (
            <button
              key={i}
              onClick={() => setSelected(selected === i ? null : i)}
              className={`flex flex-col gap-2 py-3 text-left transition-opacity w-full ${selected != null && selected !== i ? 'opacity-35' : ''}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base w-7 text-center leading-none shrink-0">{seg.icon}</span>
                <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{seg.name}</span>
                <span className="text-sm font-semibold text-slate-800 dark:text-white tabular-nums shrink-0">{fmt(seg.value)}</span>
              </div>
              <div className="h-1 bg-slate-100 dark:bg-white/[0.07] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pctNum}%`, backgroundColor: seg.color }} />
              </div>
            </button>
          )
        })}
      </div>
    </Section>
  )
}

// ── Top Transactions ───────────────────────────────────────────────────────────

function TopTransactions({ txs, catMap }) {
  if (!txs.length) {
    return (
      <Section title="Top expenses">
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-10">No expenses this month</p>
      </Section>
    )
  }
  return (
    <Section title="Top expenses">
      <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
        {txs.map((tx, i) => {
          const cat  = catMap[tx.category]
          const date = new Date(tx.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
          return (
            <div key={tx.id ?? i} className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[17px] shrink-0
                bg-slate-50 dark:bg-white/[0.05]">
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
    </Section>
  )
}

// ── Account Breakdown ──────────────────────────────────────────────────────────

function isDueSoon(dueDay) {
  if (!dueDay) return false
  const now  = new Date()
  let d = new Date(now.getFullYear(), now.getMonth(), dueDay)
  if (d <= now) d = new Date(now.getFullYear(), now.getMonth() + 1, dueDay)
  return (d - now) / 864e5 <= 7
}

function nextDueLabel(dueDay) {
  if (!dueDay) return null
  const now = new Date()
  let d = new Date(now.getFullYear(), now.getMonth(), dueDay)
  if (d <= now) d = new Date(now.getFullYear(), now.getMonth() + 1, dueDay)
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function AccountBreakdown({ data, animKey }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(false)
    const raf = requestAnimationFrame(() => {
      const t = setTimeout(() => setReady(true), 60)
      return () => clearTimeout(t)
    })
    return () => cancelAnimationFrame(raf)
  }, [animKey])

  if (!data.length) {
    return (
      <Section title="By account">
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-10">No expenses this month</p>
      </Section>
    )
  }

  const max = Math.max(...data.map(d => d.value), 1)

  return (
    <Section title="By account">
      <div className="px-4 py-3.5 flex flex-col gap-4">
        {data.map((d, i) => {
          const dueSoon = d.isCredit && isDueSoon(d.dueDay)
          const dueLabel = dueSoon ? nextDueLabel(d.dueDay) : null
          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300 truncate">{d.name}</span>
                  {dueSoon && (
                    <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 whitespace-nowrap">
                      Due {dueLabel}
                    </span>
                  )}
                </div>
                <span className="text-[13px] font-semibold text-slate-800 dark:text-white tabular-nums shrink-0 ml-2">{fmt(d.value)}</span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-white/[0.07] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: ready ? `${(d.value / max) * 100}%` : '0%', backgroundColor: d.color }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ── Budget vs Actual ───────────────────────────────────────────────────────────

function BudgetVsActual({ data, animKey }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(false)
    const raf = requestAnimationFrame(() => {
      const t = setTimeout(() => setReady(true), 70)
      return () => clearTimeout(t)
    })
    return () => cancelAnimationFrame(raf)
  }, [animKey])

  return (
    <Section title="Budget">
      <div className="px-4 py-3 flex flex-col gap-4">
        {data.map((d, i) => {
          const pct      = d.budget > 0 ? Math.min((d.spent / d.budget) * 100, 100) : 0
          const over     = d.spent > d.budget
          const warn     = pct >= 75 && !over
          const barColor = over ? '#ef4444' : warn ? '#f59e0b' : d.color
          const valClass = over
            ? 'text-red-500 dark:text-red-400'
            : warn ? 'text-amber-500 dark:text-amber-400'
            : 'text-slate-500 dark:text-slate-400'
          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm leading-none">{d.icon}</span>
                  <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{d.name}</span>
                </div>
                <span className={`text-[11px] font-semibold tabular-nums ${valClass}`}>
                  {fmt(d.spent)}{' '}
                  <span className="font-normal text-slate-400 dark:text-slate-500">/ {fmt(d.budget)}</span>
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-white/[0.07] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: ready ? `${pct}%` : '0%', backgroundColor: barColor }}
                />
              </div>
              {over && (
                <p className="text-[10px] text-red-500 dark:text-red-400 mt-1">
                  Over by {fmt(d.spent - d.budget)}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ── Spending Trivia ───────────────────────────────────────────────────────────

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function generateTrivia({
  expenses, inflows, totalSpent, totalEarned,
  categorySegments, topCategory, dailyData, topExpenses,
  accountBreakdown, sixMonthData, sixMonthTxs,
  budgetData, catMap, monthName,
}) {
  const items = []
  const push = (emoji, text, valid = true) => { if (valid && text) items.push({ emoji, text }) }

  const numExpenses = expenses.length
  const numInflows  = inflows.length
  const hasExpenses = numExpenses > 0
  const hasInflows  = numInflows > 0

  // ── This month ────────────────────────────────────────────────────────────

  // Spending-free days
  const zeroDays = dailyData.filter(d => d.value === 0).length
  push('📅', `You had ${zeroDays} spending-free day${zeroDays !== 1 ? 's' : ''} in ${monthName} — ${Math.round(zeroDays / dailyData.length * 100)}% of the month.`, zeroDays > 0 && hasExpenses)

  // Biggest single expense
  if (topExpenses.length > 0) {
    const top = topExpenses[0]
    push('💸', `Your biggest single expense this month: ${fmtK(top.amount)} on "${top.description || top.category}".`)
  }

  // Transaction count & average
  push('🧮', `You made ${numExpenses} expense transaction${numExpenses !== 1 ? 's' : ''} this month — averaging ${fmtK(totalSpent / numExpenses)} each.`, hasExpenses)

  // Top category share
  if (topCategory && totalSpent > 0) {
    const pct = (topCategory.value / totalSpent * 100).toFixed(0)
    push('🏆', `${topCategory.icon} ${topCategory.name} took up ${pct}% of your spending — your biggest category this month.`)
  }

  // Top 2 categories combined
  if (categorySegments.length >= 2 && totalSpent > 0) {
    const top2 = categorySegments[0].value + categorySegments[1].value
    const pct  = (top2 / totalSpent * 100).toFixed(0)
    push('🎯', `${categorySegments[0].icon} ${categorySegments[0].name} and ${categorySegments[1].icon} ${categorySegments[1].name} together make up ${pct}% of your expenses this month.`)
  }

  // Net savings / savings rate
  if (totalEarned > 0) {
    const net  = totalEarned - totalSpent
    const rate = Math.abs((net / totalEarned) * 100).toFixed(0)
    if (net >= 0) push('💰', `You saved ${fmtK(net)} this month — a savings rate of ${rate}%.`)
    else          push('⚠️', `You overspent your income by ${fmtK(Math.abs(net))} this month — a ${rate}% deficit.`)
  }

  // Earn-per-spend ratio
  if (totalEarned > 0 && totalSpent > 0) {
    const ratio = (totalEarned / totalSpent).toFixed(2)
    push('⚖️', `For every ₱1 you spent this month, you earned ₱${ratio}.`)
  }

  // Most active day of week
  if (hasExpenses) {
    const byDow = [0, 0, 0, 0, 0, 0, 0]
    for (const tx of expenses) byDow[new Date(tx.date).getDay()] += tx.amount ?? 0
    const maxDow = byDow.indexOf(Math.max(...byDow))
    const days   = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
    push('📆', `${days[maxDow]} are your heaviest spending day this month — ${fmtK(byDow[maxDow])} total.`, byDow[maxDow] > 0)
  }

  // Weekday vs weekend
  if (hasExpenses) {
    let weekday = 0, weekend = 0
    for (const tx of expenses) {
      const dow = new Date(tx.date).getDay()
      if (dow === 0 || dow === 6) weekend += tx.amount ?? 0
      else                        weekday += tx.amount ?? 0
    }
    if (weekend > weekday && weekend > 0 && weekday > 0)
      push('🎉', `You spend more on weekends (${fmtK(weekend)}) than weekdays (${fmtK(weekday)}) this month.`)
    else if (weekday > 0 && weekend > 0)
      push('💼', `You spend more on weekdays (${fmtK(weekday)}) than weekends (${fmtK(weekend)}) this month.`)
  }

  // Peak single day
  const peak = dailyData.reduce((b, d) => d.value > b.value ? d : b, { day: 0, value: 0 })
  push('📈', `Your highest-spend day this month was the ${ordinal(peak.day)} — ${fmtK(peak.value)} in a single day.`, peak.value > 0)

  // Average on active days
  const activeDays = dailyData.filter(d => d.value > 0).length
  push('📊', `On days when you actually spent money, you averaged ${fmtK(totalSpent / activeDays)} per day.`, activeDays > 0)

  // Most used account
  if (accountBreakdown.length > 0) {
    const top = accountBreakdown[0]
    push('💳', `${top.name} was your most-used account for expenses this month — ${fmtK(top.value)} total.`)
  }

  // Unique categories used
  push('🗂️', `You spent across ${categorySegments.length} different categor${categorySegments.length !== 1 ? 'ies' : 'y'} this month.`, hasExpenses)

  // Smallest expense
  if (hasExpenses) {
    const smallest = expenses.reduce((b, t) => (t.amount ?? 0) < (b.amount ?? 0) ? t : b)
    push('🪙', `Your smallest expense this month was just ${fmtK(smallest.amount)} — "${smallest.description || smallest.category}".`, (smallest.amount ?? 0) > 0)
  }

  // Over budget categories
  const overBudget = budgetData.filter(d => d.spent > d.budget)
  if (overBudget.length > 0) {
    const names = overBudget.map(d => `${d.icon} ${d.name}`).join(', ')
    push('🚨', `You exceeded your budget in ${overBudget.length} categor${overBudget.length !== 1 ? 'ies' : 'y'} this month: ${names}.`)
  }

  // Under budget savings
  const underBudget = budgetData.filter(d => d.budget > 0 && d.spent < d.budget)
  if (underBudget.length > 0) {
    const saved = underBudget.reduce((s, d) => s + (d.budget - d.spent), 0)
    push('✅', `You stayed under budget in ${underBudget.length} categor${underBudget.length !== 1 ? 'ies' : 'y'} this month, saving ${fmtK(saved)} vs your limits.`)
  }

  // Inflow breakdown
  push('💵', `You logged ${numInflows} income transaction${numInflows !== 1 ? 's' : ''} this month — averaging ${fmtK(totalEarned / numInflows)} each.`, hasInflows && numInflows > 1)

  // ── 6-month trends ─────────────────────────────────────────────────────────

  const validMonths = sixMonthData.filter(m => m.expense > 0)

  // Worst spending month
  if (validMonths.length > 0) {
    const worst = sixMonthData.reduce((b, m) => m.expense > b.expense ? m : b)
    push('📉', `${worst.label} was your biggest spending month in the last 6 months — ${fmtK(worst.expense)}.`, worst.expense > 0)
  }

  // Best spending month
  if (validMonths.length >= 2) {
    const best = validMonths.reduce((b, m) => m.expense < b.expense ? m : b)
    push('🌟', `${best.label} was your lightest spending month recently — just ${fmtK(best.expense)}.`)
  }

  // 6-month average
  const avg6 = sixMonthData.reduce((s, m) => s + m.expense, 0) / 6
  push('📊', `Your average monthly spending over the last 6 months is ${fmtK(avg6)}.`, avg6 > 0)

  // 6-month total spend
  const total6 = sixMonthData.reduce((s, m) => s + m.expense, 0)
  push('🧾', `You've spent a combined ${fmtK(total6)} over the past 6 months.`, total6 > 0)

  // 6-month total income
  const income6 = sixMonthData.reduce((s, m) => s + m.income, 0)
  push('💵', `Over the last 6 months, you've brought in a total of ${fmtK(income6)}.`, income6 > 0)

  // Month-over-month expense change
  const cur = sixMonthData[5], prev = sixMonthData[4]
  if (cur && prev && prev.expense > 0) {
    const diff = cur.expense - prev.expense
    const pct  = Math.abs(diff / prev.expense * 100).toFixed(0)
    if (diff > 0) push('📈', `You spent ${pct}% more this month compared to last month.`)
    else if (diff < 0) push('📉', `You spent ${pct}% less this month compared to last month — good progress!`)
  }

  // Month-over-month income change
  if (cur && prev && prev.income > 0 && cur.income > 0) {
    const diff = cur.income - prev.income
    const pct  = Math.abs(diff / prev.income * 100).toFixed(0)
    if (diff > 0) push('🚀', `Your income grew by ${pct}% compared to last month.`)
    else if (diff < 0) push('📉', `Your income was ${pct}% lower than last month.`)
  }

  // Profitable months count
  const profitMonths = sixMonthData.filter(m => m.income > m.expense && m.income > 0)
  push('🌈', `You had ${profitMonths.length} out of 6 months where income exceeded expenses.`, sixMonthData.some(m => m.income > 0))

  // Highest income month
  if (sixMonthData.some(m => m.income > 0)) {
    const best = sixMonthData.reduce((b, m) => m.income > b.income ? m : b)
    push('💹', `${best.label} was your highest-earning month in the last 6 months — ${fmtK(best.income)}.`, best.income > 0)
  }

  // Average monthly net savings (6-month)
  const avg6Net = sixMonthData.reduce((s, m) => s + (m.income - m.expense), 0) / 6
  push('🏦', `You've averaged ${avg6Net >= 0 ? '' : '-'}${fmtK(Math.abs(avg6Net))} in ${avg6Net >= 0 ? 'net savings' : 'net overspending'} per month over the last 6 months.`, sixMonthData.some(m => m.income > 0))

  // Top category by amount over 6 months
  const catTotals6 = {}
  for (const tx of sixMonthTxs.filter(t => t.type === 'expense')) {
    catTotals6[tx.category] = (catTotals6[tx.category] ?? 0) + (tx.amount ?? 0)
  }
  const topCat6 = Object.entries(catTotals6).sort((a, b) => b[1] - a[1])[0]
  if (topCat6) {
    const cat = catMap[topCat6[0]]
    push('🏅', `Over 6 months, ${cat?.icon ?? '📦'} ${topCat6[0]} has been your #1 spending category — ${fmtK(topCat6[1])} total.`)
  }

  // Most frequent category over 6 months (by tx count)
  const catCount6 = {}
  for (const tx of sixMonthTxs.filter(t => t.type === 'expense')) {
    catCount6[tx.category] = (catCount6[tx.category] ?? 0) + 1
  }
  const topCatCount6 = Object.entries(catCount6).sort((a, b) => b[1] - a[1])[0]
  if (topCatCount6 && topCatCount6[1] > 1) {
    const cat = catMap[topCatCount6[0]]
    push('🔢', `${cat?.icon ?? '📦'} ${topCatCount6[0]} is your most frequent category — ${topCatCount6[1]} transactions over the last 6 months.`)
  }

  // Total expense transactions over 6 months
  const totalTx6 = sixMonthTxs.filter(t => t.type === 'expense').length
  push('📋', `You've logged ${totalTx6} expense transactions over the last 6 months — about ${Math.round(totalTx6 / 6)} per month.`, totalTx6 > 0)

  return items
}

function SpendingTrivia({ trivia, triviaKey }) {
  const [idx,  setIdx]  = useState(() => Math.floor(Math.random() * Math.max(trivia.length, 1)))
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
    <div className="px-4">
      <button
        onClick={next}
        className="w-full rounded-2xl px-4 pt-4 pb-3.5 text-left active:opacity-70 transition-opacity duration-75
          bg-gradient-to-br from-primary/[0.28] to-primary/[0.12]
          border border-primary/[0.35] dark:border-primary/[0.28]"
        style={{ outline: 'none' }}
      >
        <div style={{ opacity: fade ? 1 : 0, transition: 'opacity 0.15s ease' }}>
          <div className="flex items-start gap-3 mb-3">
            <span className="text-xl leading-none mt-0.5 shrink-0">{item.emoji}</span>
            <p className="flex-1 text-[13px] font-medium text-slate-700 dark:text-slate-200 leading-relaxed tracking-[-0.01em]">
              {item.text}
            </p>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-right">
            Tap for another
          </p>
        </div>
      </button>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Insights() {
  const [monthOffset,  setMonthOffset]  = useState(0)
  const [animKey,      setAnimKey]      = useState(0)
  const [exportingPdf, setExportingPdf] = useState(false)

  const { showToast } = useToast()

  async function handleExportPdf() {
    setExportingPdf(true)
    try {
      const { downloadMonthlyReport } = await import('../utils/reportData.js')
      await downloadMonthlyReport(year, month + 1) // month is 0-indexed in Insights
      showToast('Report downloaded')
    } catch (e) {
      console.error(e)
      showToast('Failed to generate report', 'error')
    } finally {
      setExportingPdf(false)
    }
  }

  const { year, month } = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + monthOffset)
    return { year: d.getFullYear(), month: d.getMonth() }
  }, [monthOffset])

  const { start: monthStart, end: monthEnd } = useMemo(
    () => monthBounds(year, month), [year, month],
  )

  const sixStart = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 5)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
  }, [])

  const monthTxs    = useLiveQuery(() =>
    db.transactions.where('date').between(monthStart, monthEnd, true, false).toArray(),
    [monthStart, monthEnd], null,
  )
  const sixMonthTxs = useLiveQuery(() =>
    db.transactions.where('date').aboveOrEqual(sixStart).toArray(),
    [sixStart], [],
  )
  const categories  = useLiveQuery(() => db.categories.toArray(), [], [])
  const accounts    = useLiveQuery(() => db.accounts.toArray(),   [], [])

  useEffect(() => { setAnimKey(k => k + 1) }, [monthOffset])

  const catMap  = useMemo(() =>
    Object.fromEntries((categories ?? []).map(c => [c.name, c])),
    [categories],
  )
  const acctMap = useMemo(() =>
    Object.fromEntries((accounts ?? []).map(a => [a.name, a])),
    [accounts],
  )

  const expenses = useMemo(() => (monthTxs ?? []).filter(t => t.type === 'expense'), [monthTxs])
  const inflows  = useMemo(() => (monthTxs ?? []).filter(t => t.type === 'inflow'),  [monthTxs])

  const totalSpent  = useMemo(() => expenses.reduce((s, t) => s + (t.amount ?? 0), 0), [expenses])
  const totalEarned = useMemo(() => inflows.reduce((s, t)  => s + (t.amount ?? 0), 0), [inflows])

  const categorySegments = useMemo(() => {
    const map = {}
    for (const tx of expenses) {
      const c = catMap[tx.category]
      if (!map[tx.category]) {
        map[tx.category] = { name: tx.category, value: 0, color: c?.color ?? '#6366f1', icon: c?.icon ?? '📦' }
      }
      map[tx.category].value += tx.amount ?? 0
    }
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [expenses, catMap])

  const topCategory = categorySegments[0] ?? null

  const dailyData = useMemo(() => {
    const days  = new Date(year, month + 1, 0).getDate()
    const byDay = {}
    for (const tx of expenses) {
      const d = new Date(tx.date).getDate()
      byDay[d] = (byDay[d] ?? 0) + (tx.amount ?? 0)
    }
    return Array.from({ length: days }, (_, i) => ({ day: i + 1, value: byDay[i + 1] ?? 0 }))
  }, [expenses, year, month])

  const topExpenses = useMemo(() =>
    [...expenses].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 5),
    [expenses],
  )

  const accountBreakdown = useMemo(() => {
    const map = {}
    for (const tx of expenses) {
      const acct  = acctMap[tx.account]
      const color = acct?.color ?? '#6366f1'
      if (!map[tx.account]) map[tx.account] = {
        name: tx.account,
        value: 0,
        color,
        isCredit: acct?.type === 'credit',
        dueDay:   acct?.dueDate ?? null,
      }
      map[tx.account].value += tx.amount ?? 0
    }
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [expenses, acctMap])

  const budgetData = useMemo(() => {
    const spentByCat = {}
    for (const tx of expenses) {
      spentByCat[tx.category] = (spentByCat[tx.category] ?? 0) + (tx.amount ?? 0)
    }
    return (categories ?? [])
      .filter(c => c.type === 'expense' && (c.budget ?? 0) > 0)
      .map(c => ({ name: c.name, icon: c.icon, color: c.color, budget: c.budget, spent: spentByCat[c.name] ?? 0 }))
      .sort((a, b) => (b.spent / b.budget) - (a.spent / a.budget))
  }, [expenses, categories])

  const sixMonthData = useMemo(() => {
    const now    = new Date()
    const result = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const { start, end } = monthBounds(d.getFullYear(), d.getMonth())
      const txs = (sixMonthTxs ?? []).filter(t => t.date >= start && t.date < end)
      result.push({
        label:   MONTHS_SHORT[d.getMonth()],
        income:  txs.filter(t => t.type === 'inflow').reduce((s, t)  => s + (t.amount ?? 0), 0),
        expense: txs.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount ?? 0), 0),
      })
    }
    return result
  }, [sixMonthTxs])

  const triviaList = useMemo(() => generateTrivia({
    expenses, inflows, totalSpent, totalEarned,
    categorySegments, topCategory, dailyData, topExpenses,
    accountBreakdown, sixMonthData, sixMonthTxs: sixMonthTxs ?? [],
    budgetData, catMap, monthName: MONTHS[month],
  }), [expenses, inflows, totalSpent, totalEarned, categorySegments, topCategory,
       dailyData, topExpenses, accountBreakdown, sixMonthData, sixMonthTxs,
       budgetData, catMap, month])

  return (
    <div className="flex flex-col page-enter" style={{ minHeight: 'calc(100dvh - 80px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-14 pb-3">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Insights</h1>
        <MonthSelector offset={monthOffset} onChange={(o) => { if (o <= 0) setMonthOffset(o) }} />
      </div>

      <div className="flex flex-col gap-5 py-4">
        <SummaryCards totalSpent={totalSpent} totalEarned={totalEarned} topCategory={topCategory} />

        {triviaList.length > 0 && <SpendingTrivia trivia={triviaList} triviaKey={animKey} />}

        <SpendingByCategory segments={categorySegments} total={totalSpent} animKey={animKey} />

        <Section title="6-month trend">
          <div className="px-3 py-4">
            <BarChart6 data={sixMonthData} />
          </div>
        </Section>

        <Section title="Daily spending">
          <div className="px-3 py-4">
            {monthTxs === null ? (
              <div className="h-[180px]" />
            ) : dailyData.some(d => d.value > 0) ? (
              <DailyChart data={dailyData} />
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">No expenses this month</p>
            )}
          </div>
        </Section>

        <TopTransactions txs={topExpenses} catMap={catMap} />

        <AccountBreakdown data={accountBreakdown} animKey={animKey} />

        {budgetData.length > 0 && <BudgetVsActual data={budgetData} animKey={animKey} />}

        <div className="px-4 pb-2">
          <button
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl text-sm font-semibold
              text-primary bg-primary/[0.08] dark:bg-primary/[0.12]
              border border-primary/20 disabled:opacity-50
              active:scale-[0.98] transition-all duration-100"
          >
            {exportingPdf
              ? <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              : <span>↓</span>}
            {exportingPdf ? 'Generating PDF…' : 'Export as PDF'}
          </button>
        </div>
        <div className="h-4" />
      </div>
    </div>
  )
}
