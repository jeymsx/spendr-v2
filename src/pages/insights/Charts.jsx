import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from 'recharts'
import CategoryGlyph from '../../components/CategoryGlyph'
import SectionLabel from '../../components/ui/SectionLabel'
import { fmt, fmtCompact } from '../../lib/money'

// ── Chart: Donut ───────────────────────────────────────────────────────────────

export function DonutChart({ segments, total, animKey, selected, onSelect }) {
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
            <span className="leading-none"><CategoryGlyph cat={active} size={26} /></span>
            <span className="text-xl font-bold text-slate-800 dark:text-white tabular-nums mt-1.5">{fmtCompact(active.value)}</span>
            <span className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
              {total > 0 ? (active.value / total * 100).toFixed(1) : 0}%
            </span>
          </>
        ) : (
          <>
            <SectionLabel>Total spent</SectionLabel>
            <span className="text-2xl font-bold text-slate-800 dark:text-white tabular-nums">{fmtCompact(total)}</span>
          </>
        )}
      </div>
    </div>
  )
}

// ── Chart: Area (daily / 7D) ───────────────────────────────────────────────────

export const CHART_COLORS = {
  expenses: '#ef4444',
  income:   '#22c55e',
  netflow:  'var(--color-primary)',
}

export function DailyAreaChart({ data, chartType = 'expenses' }) {
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
                <div className="bg-lifted border border-slate-200 dark:border-white/10 rounded-2xl px-3 py-2 shadow-lg text-xs">
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

export function MultiBarChart({ data }) {
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
                <div className="bg-lifted border border-slate-200 dark:border-white/10 rounded-2xl px-3 py-2 shadow-lg text-xs">
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
