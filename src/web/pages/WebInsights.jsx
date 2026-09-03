import { useState, useMemo } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { scheduledCutoff } from '../../utils/scheduled'
import { WebPageHeader, WebPanel, WebStat, WebEmpty, WebBar, money, moneyCompact } from '../components/WebPanel'

const RANGES = [
  { key: '1m',  label: 'This month' },
  { key: '3m',  label: '3 months' },
  { key: '6m',  label: '6 months' },
  { key: '12m', label: '12 months' },
  { key: 'all', label: 'All time' },
]

/**
 * Window boundaries as YYYY-MM-DD prefixes, compared against the stored ISO
 * dates as strings — no timezone arithmetic, so a charge can't slip a day.
 *
 * The mobile Insights page has its own range helper. This one is deliberately
 * simpler (whole months only, no 7-day view) rather than a copy of it, so
 * there's no near-identical function to drift.
 */
function windowFor(range, monthOffset) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')

  if (range === 'all') return { from: '0000', to: '9999', label: 'All time' }

  if (range === '1m') {
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    const from = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
    return {
      from, to: from + '￿',
      label: d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
    }
  }

  const months = { '3m': 3, '6m': 6, '12m': 12 }[range] ?? 3
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
  return {
    from: `${start.getFullYear()}-${pad(start.getMonth() + 1)}`,
    to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}￿`,
    label: `Last ${months} months`,
  }
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-lg
      bg-slate-900 dark:bg-white text-white dark:text-slate-900">
      {label && <p className="font-semibold mb-0.5">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="tabular-nums">
          {p.name}: <span className="font-bold">{money(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

export default function WebInsights() {
  const [range, setRange] = useState('1m')
  const [monthOffset, setMonthOffset] = useState(0)

  const txAll      = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const categories = useLiveQuery(() => db.categories.toArray(),   [], [])
  const accounts   = useLiveQuery(() => db.accounts.toArray(),     [], [])

  const catMap = useMemo(() =>
    Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])

  const win = useMemo(() => windowFor(range, monthOffset), [range, monthOffset])

  // Scheduled installments are commitments, not history — excluded here for
  // the same reason the transaction list hides them.
  const inWindow = useMemo(() => {
    const cutoff = scheduledCutoff()
    return (txAll ?? []).filter(t => {
      const d = t.date ?? ''
      return d <= cutoff && d >= win.from && d <= win.to
    })
  }, [txAll, win])

  const expenses = useMemo(() => inWindow.filter(t => t.type === 'expense'), [inWindow])
  const inflows  = useMemo(() => inWindow.filter(t => t.type === 'inflow'),  [inWindow])
  const spent    = useMemo(() => expenses.reduce((s, t) => s + (t.amount ?? 0), 0), [expenses])
  const earned   = useMemo(() => inflows.reduce((s, t) => s + (t.amount ?? 0), 0), [inflows])

  const byCategory = useMemo(() => {
    const m = {}
    expenses.forEach(t => {
      const key = t.category ?? 'Uncategorised'
      if (!m[key]) m[key] = { name: key, value: 0, color: catMap[key]?.color ?? '#6366f1', icon: catMap[key]?.icon ?? '📦' }
      m[key].value += t.amount ?? 0
    })
    return Object.values(m).sort((a, b) => b.value - a.value)
  }, [expenses, catMap])

  const byAccount = useMemo(() => {
    const m = {}
    expenses.forEach(t => {
      const key = t.account ?? '—'
      m[key] = (m[key] ?? 0) + (t.amount ?? 0)
    })
    return Object.entries(m)
      .map(([name, value]) => ({ name, value, color: (accounts ?? []).find(a => a.name === name)?.color }))
      .sort((a, b) => b.value - a.value)
  }, [expenses, accounts])

  // Monthly series — the wide chart a phone can't show without scrolling.
  const monthly = useMemo(() => {
    const m = {}
    inWindow.forEach(t => {
      const key = (t.date ?? '').slice(0, 7)
      if (!key) return
      if (!m[key]) m[key] = { key, expense: 0, income: 0 }
      if (t.type === 'expense') m[key].expense += t.amount ?? 0
      if (t.type === 'inflow')  m[key].income  += t.amount ?? 0
    })
    return Object.values(m).sort((a, b) => a.key.localeCompare(b.key)).map(r => ({
      ...r,
      label: new Date(`${r.key}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'short' }),
    }))
  }, [inWindow])

  // Daily series for a single month.
  const daily = useMemo(() => {
    if (range !== '1m') return []
    const days = {}
    inWindow.forEach(t => {
      const d = (t.date ?? '').slice(0, 10)
      if (!d) return
      if (!days[d]) days[d] = { key: d, expense: 0, income: 0 }
      if (t.type === 'expense') days[d].expense += t.amount ?? 0
      if (t.type === 'inflow')  days[d].income  += t.amount ?? 0
    })
    return Object.values(days).sort((a, b) => a.key.localeCompare(b.key))
      .map(r => ({ ...r, label: String(Number(r.key.slice(8, 10))) }))
  }, [inWindow, range])

  const series = range === '1m' ? daily : monthly
  const topExpenses = useMemo(() =>
    [...expenses].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 8), [expenses])

  // Budgets are monthly, so they only mean anything against a single month's
  // spend. On a 3m/6m/12m window the same figure would read as wildly over
  // budget when nothing is wrong. The expense filter matches mobile: an inflow
  // category with a budget field set is not a spending limit.
  const budgetsApply = range === '1m'
  const budgets = useMemo(() => {
    if (!budgetsApply) return []
    const bySpent = {}
    expenses.forEach(t => { bySpent[t.category] = (bySpent[t.category] ?? 0) + (t.amount ?? 0) })
    return (categories ?? [])
      .filter(c => c.type === 'expense' && (c.budget ?? 0) > 0)
      .map(c => ({ ...c, spent: bySpent[c.name] ?? 0 }))
      .sort((a, b) => (b.spent / b.budget) - (a.spent / a.budget))
  }, [categories, expenses, budgetsApply])

  if (txAll === undefined) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60dvh' }}>
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  const axis = { fontSize: 11, stroke: 'currentColor', opacity: 0.45 }

  return (
    <>
      <WebPageHeader
        title="Insights"
        subtitle={win.label}
        actions={
          <div className="flex items-center gap-2">
            {range === '1m' && (
              <div className="flex items-center gap-1">
                <button onClick={() => setMonthOffset(o => o - 1)} aria-label="Previous month"
                  className="w-8 h-8 rounded-xl flex items-center justify-center
                    bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <button onClick={() => setMonthOffset(o => Math.min(0, o + 1))} disabled={monthOffset >= 0}
                  aria-label="Next month"
                  className="w-8 h-8 rounded-xl flex items-center justify-center
                    bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300
                    disabled:opacity-30">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
            )}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.05]">
              {RANGES.map(r => (
                <button key={r.key}
                  onClick={() => { setRange(r.key); setMonthOffset(0) }}
                  className={[
                    'px-3 h-7 rounded-lg text-xs font-semibold transition-colors duration-150',
                    range === r.key
                      ? 'bg-white dark:bg-white/[0.12] text-slate-800 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400',
                  ].join(' ')}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-6 mb-6">
        <WebStat label="Spent"  value={money(spent)}  tone="bad"
                 hint={`${expenses.length} transaction${expenses.length === 1 ? '' : 's'}`} />
        <WebStat label="Earned" value={money(earned)} tone="good"
                 hint={`${inflows.length} deposit${inflows.length === 1 ? '' : 's'}`} />
        <WebStat label="Net"    value={money(earned - spent)}
                 tone={earned - spent >= 0 ? 'good' : 'bad'}
                 hint={
                   spent === 0 && earned === 0 ? '—'
                   : earned > 0 ? `${Math.round((spent / earned) * 100)}% of income spent`
                   : 'No income in this period'
                 } />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <WebPanel title="Where it went">
          {byCategory.length === 0 ? <WebEmpty>No spending in this period</WebEmpty> : (
            <div className="flex items-center gap-5">
              <div className="w-[190px] h-[190px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byCategory} dataKey="value" nameKey="name"
                      innerRadius={58} outerRadius={90} paddingAngle={2} stroke="none">
                      {byCategory.map((c, i) => <Cell key={i} fill={c.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                {byCategory.slice(0, 7).map(c => (
                  <div key={c.name} className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1">
                      {c.icon} {c.name}
                    </span>
                    <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200 shrink-0">
                      {moneyCompact(c.value)}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 w-9 text-right shrink-0">
                      {spent > 0 ? Math.round((c.value / spent) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </WebPanel>

        <WebPanel title={range === '1m' ? 'Daily flow' : 'Monthly flow'}>
          {series.length === 0 ? <WebEmpty>No activity in this period</WebEmpty> : (
            <div className="h-[190px] text-slate-500 dark:text-slate-400">
              <ResponsiveContainer width="100%" height="100%">
                {/* barCategoryGap/barGap and the two fills match the mobile
                    chart, so a month reads the same in either layout - the
                    expense bar was the accent blue here, which made it look
                    like a second income series. */}
                <BarChart data={series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}
                  barCategoryGap="28%" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.12} />
                  <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'currentColor', opacity: 0.06 }} />
                  <Bar dataKey="income"  name="Income"  fill="#22c55e" fillOpacity={0.85}
                    radius={[4, 4, 0, 0]} maxBarSize={44} />
                  <Bar dataKey="expense" name="Expense" fill="#ef4444" fillOpacity={0.85}
                    radius={[4, 4, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </WebPanel>
      </div>

      {/* items-start: without it an empty Biggest expenses stretches to the
          height of the three-panel column beside it. */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <WebPanel title="Biggest expenses" className="xl:col-span-2" flush>
          {topExpenses.length === 0 ? <WebEmpty>No expenses in this period</WebEmpty> : (
            <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm min-w-[420px]">
              <tbody>
                {topExpenses.map(t => (
                  <tr key={t.id} className="border-t border-slate-100 dark:border-white/[0.05]">
                    <td className="px-5 py-2.5 w-[52px] text-base">{catMap[t.category]?.icon ?? '📦'}</td>
                    <td className="px-2 py-2.5 min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[300px]">
                        {t.description || t.category || '—'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {t.account} · {new Date(t.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                      </p>
                    </td>
                    <td className="px-5 py-2.5 w-[136px] text-right font-bold tabular-nums
                      text-slate-800 dark:text-slate-100 whitespace-nowrap">
                      {money(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </WebPanel>

        <div className="flex flex-col gap-6 min-w-0">
          <WebPanel title="By account">
            {byAccount.length === 0 ? <WebEmpty>No spending in this period</WebEmpty> : (
              <div className="flex flex-col gap-3">
                {byAccount.map(a => (
                  <div key={a.name} className="min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">{a.name}</span>
                      <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200 shrink-0">
                        {moneyCompact(a.value)}
                      </span>
                    </div>
                    <WebBar pct={spent > 0 ? (a.value / spent) * 100 : 0} />
                  </div>
                ))}
              </div>
            )}
          </WebPanel>

          <WebPanel title="Budgets">
            {!budgetsApply ? (
              <WebEmpty>Budgets are monthly — switch to This month to see them</WebEmpty>
            ) : budgets.length === 0 ? <WebEmpty>No budgets set</WebEmpty> : (
              <div className="flex flex-col gap-3">
                {budgets.map(c => {
                  const pct = c.budget > 0 ? (c.spent / c.budget) * 100 : 0
                  const over = c.spent > c.budget
                  return (
                    <div key={`${c.name}-${c.type}`} className="min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                          {c.icon} {c.name}
                        </span>
                        <span className={`text-xs font-bold tabular-nums shrink-0 ${
                          over ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200'}`}>
                          {moneyCompact(c.spent)}
                          <span className="font-medium text-slate-500 dark:text-slate-400">
                            {' / '}{moneyCompact(c.budget)}
                          </span>
                        </span>
                      </div>
                      <WebBar pct={pct} tone={over ? 'bad' : pct >= 75 ? 'warn' : 'good'} />
                    </div>
                  )
                })}
              </div>
            )}
          </WebPanel>
        </div>
      </div>
    </>
  )
}
