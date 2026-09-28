import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, ReferenceLine, ReferenceDot,
  ComposedChart, Line,
} from 'recharts'
import CategoryGlyph from '../../components/CategoryGlyph'
import SectionLabel from '../../components/ui/SectionLabel'
import { fmt, fmtCompact } from '../../lib/money'
import { prefersReducedMotion } from '../../components/ui/motion'

// ── Chart: Donut ───────────────────────────────────────────────────────────────

/**
 * The categories as a ring, the total in its middle - or the slice you
 * tapped - and `caption` under the total: how it compares with before.
 */
export function DonutChart({ segments, total, animKey, selected, onSelect, caption = null }) {
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
            stroke="none" isAnimationActive={!prefersReducedMotion()} animationBegin={0} animationDuration={600}
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
            {caption}
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
  const last = data.length - 1
  const xTick = ({ x, y, payload }) => {
    /* The last day is always labelled, so a regular label that lands just
       before it is dropped - on a 30-day month "29" and "30" sat on top of
       each other and read as "2930". */
    const regular = payload.index % labelEvery === 0 && last - payload.index >= labelEvery / 2
    if (!regular && payload.index !== last) return null
    // Anchored inward at the right edge, or "30" is cut to "3".
    const anchor = payload.index === last ? 'end' : 'middle'
    return <text x={x} y={y+12} textAnchor={anchor} fontSize={10} fill="#94a3b8">{payload.value}</text>
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
            isAnimationActive={!prefersReducedMotion()} animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Chart: Net worth over time ────────────────────────────────────────────────

/** A y-axis figure with no currency sign, like the Trend chart's: "120K",
 *  "1.2M", and a real minus for a net worth below zero. */
function compactTick(v) {
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (a >= 1e6) return `${sign}${+(a / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${sign}${+(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`
  return `${sign}${Math.round(a)}`
}

/**
 * How wide the figure axis has to be for its longest label. A fixed 40px cut
 * the minus sign off a net worth below zero - "−450K" read as "450K" - and
 * Recharts, finding labels it thought would collide, dropped one of them.
 *
 * @param {number[]} ticks
 */
function axisWidth(ticks) {
  const longest = Math.max(...ticks.map(t => compactTick(t).length))
  return Math.max(40, longest * 6 + 18)
}

/**
 * Round figures for the side of the chart: 0, 40K, 80K, 120K rather than
 * wherever the data happened to start and stop. About four steps, each 1, 2,
 * 2.5 or 5 times a power of ten, with the ends pushed out to the next step
 * so the line never touches the top or bottom.
 *
 * Exported for Charts.test.js.
 *
 * @param {number} lo
 * @param {number} hi
 */
export function niceAxis(lo, hi) {
  const span = hi - lo || Math.abs(hi) || 1
  const raw = span / 3
  const mag = 10 ** Math.floor(Math.log10(raw))
  const n = raw / mag
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag
  let floor = Math.floor(lo / step) * step
  let ceil = Math.ceil(hi / step) * step
  if (floor === lo) floor -= step
  if (ceil === hi) ceil += step
  // A line that barely moved can fit inside one step; give it a guide above.
  if ((ceil - floor) / step < 2) ceil += step
  const ticks = []
  for (let t = floor; t <= ceil + step / 2; t += step) ticks.push(Math.round(t / step) * step)
  return { floor, ceil, ticks }
}

/**
 * The same chart as the Trend below it - dashed guides, a date axis, a
 * figure axis - drawn from a net worth instead of a day's spending.
 *
 * One difference, and it is the point of the chart: the figure axis does not
 * start at zero. A net worth of P120,000 that moved by P8,000 is a flat line
 * on a zero-based axis, and the whole question here is which way it moved.
 * So the axis spans what the line actually did, with a little room above and
 * below, and the fill runs down to the bottom of that.
 *
 * Five date labels, evenly spread, with the first and last anchored inward so
 * neither is cut off at the edge or runs into its neighbour.
 */
export function NetWorthChart({ data, color, currency, rangeKey }) {
  const values = data.map(d => d.value)
  const { floor, ceil, ticks } = niceAxis(Math.min(...values), Math.max(...values))
  const last = data.length - 1
  const marks = new Set([0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * last)))
  const xTick = ({ x, y, payload }) => {
    const i = payload.index
    if (!marks.has(i)) return null
    const anchor = i === 0 ? 'start' : i === last ? 'end' : 'middle'
    return <text x={x} y={y + 12} textAnchor={anchor} fontSize={10} fill="#94a3b8">{payload.value}</text>
  }
  const gradId = `netWorthGrad-${rangeKey}`
  return (
    <div className="[&_*]:outline-none [&_*]:focus:outline-none px-5">
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart key={rangeKey} data={data} margin={{ top: 10, right: 4, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 3" vertical={false} stroke="rgba(148,163,184,0.12)" />
          <XAxis dataKey="day" tick={xTick} axisLine={false} tickLine={false} interval={0} />
          <YAxis
            domain={[floor, ceil]}
            ticks={ticks}
            interval={0}
            tickFormatter={compactTick}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={axisWidth(ticks)}
          />
          {/* Where it crosses from owing to owning, when the line goes near it. */}
          {floor < 0 && ceil > 0 && <ReferenceLine y={0} stroke="rgba(148,163,184,0.45)" strokeWidth={1} />}
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div className="bg-lifted border border-slate-200 dark:border-white/10 rounded-2xl px-3 py-2 shadow-lg text-xs">
                  <p className="font-semibold mb-0.5" style={{ color }}>{label}</p>
                  <p className="font-medium text-slate-700 dark:text-white tabular-nums">{fmt(payload[0].value, currency)}</p>
                </div>
              )
            }}
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 2' }}
          />
          <Area type="monotone" dataKey="value"
            stroke={color} strokeWidth={2.5}
            fill={`url(#${gradId})`} dot={false} baseValue={floor}
            activeDot={{ r: 5, fill: color, stroke: 'white', strokeWidth: 2 }}
            isAnimationActive={!prefersReducedMotion()} animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Chart: The forecast ────────────────────────────────────────────────────────

/**
 * The forecast as a projection: what happened, then what is likely.
 *
 * Solid up to today - the money as it actually was, from the ledger - then
 * dashed from today on, because a forecast is a guess and should look like
 * one. Around the dashed line, a band: where it lands with a quieter week's
 * spending and with a busier one (lib/forecast spendRange). The bills, pay
 * and loan payments are fixed, so the band is narrow near today and opens up
 * the further out it looks - which is exactly how sure the forecast is.
 *
 * The floor and zero lines, and the dot on the tightest day, are the ones
 * the single line had. Stepped, because money moves in steps: a payday is a
 * jump, not a slope.
 *
 * @param {{data: Array<{day: string, iso: string, past?: number, value?: number, band?: [number, number]}>,
 *          todayIndex: number, color: string, currency: string, rangeKey: string,
 *          floor?: number, lowest?: {iso: string}|null, band?: boolean}} props
 */
export function ForecastChart({ data, todayIndex, color, currency, rangeKey, floor = 0, lowest = null, band = true }) {
  const values = data.flatMap(d => [d.past, d.value, ...(d.band ?? [])]).filter(v => Number.isFinite(v))
  const lo = Math.min(...values, floor > 0 ? floor : Infinity)
  const hi = Math.max(...values)
  const nearZero = lo < Math.max(1, hi * 0.15)
  const axis = niceAxis(Math.min(lo, nearZero ? 0 : lo), hi)
  const last = data.length - 1
  /* The first day, today, and three more after it - today always labelled,
     since it is where the line changes from fact to guess. */
  const ahead = last - todayIndex
  const marks = new Set([0, todayIndex, ...[1 / 3, 2 / 3, 1].map(f => todayIndex + Math.round(f * ahead))])
  const xTick = ({ x, y, payload }) => {
    const i = payload.index
    if (!marks.has(i)) return null
    if (i !== todayIndex && Math.abs(i - todayIndex) < Math.max(3, last * 0.12)) return null
    const anchor = i === 0 ? 'start' : i === last ? 'end' : 'middle'
    return <text x={x} y={y + 12} textAnchor={anchor} fontSize={10} fill="#94a3b8" fontWeight={i === todayIndex ? 600 : 400}>{payload.value}</text>
  }
  const bandId = `forecastBand-${rangeKey}`
  const pastId = `forecastPast-${rangeKey}`
  const low = lowest ? data.find(d => d.iso === lowest.iso && d.value != null) : null
  const today = data[todayIndex]
  return (
    <div className="[&_*]:outline-none [&_*]:focus:outline-none px-5">
      <ResponsiveContainer width="100%" height={196}>
        <ComposedChart key={rangeKey} data={data} margin={{ top: 10, right: 4, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={bandId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.12} />
            </linearGradient>
            <linearGradient id={pastId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.16} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 3" vertical={false} stroke="rgba(148,163,184,0.12)" />
          <XAxis dataKey="day" tick={xTick} axisLine={false} tickLine={false} interval={0} />
          <YAxis
            domain={[axis.floor, axis.ceil]}
            ticks={axis.ticks}
            interval={0}
            tickFormatter={compactTick}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={axisWidth(axis.ticks)}
          />
          {floor > 0 && (
            <ReferenceLine y={floor} stroke="#f59e0b" strokeDasharray="5 4" strokeWidth={1.5} ifOverflow="extendDomain" />
          )}
          {nearZero && <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1.25} />}
          {/* Where the ledger stops and the guess begins. */}
          {today && todayIndex > 0 && (
            <ReferenceLine x={today.day} stroke="rgba(148,163,184,0.45)" strokeDasharray="2 3" strokeWidth={1} />
          )}
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload
              const isPast = p.value == null
              return (
                <div className="bg-lifted border border-slate-200 dark:border-white/10 rounded-2xl px-3 py-2 shadow-lg text-xs">
                  <p className="font-semibold mb-0.5" style={{ color }}>{label}</p>
                  <p className="font-medium text-slate-700 dark:text-white tabular-nums">
                    {isPast ? fmt(p.past, currency) : `About ${fmt(p.value, currency)}`}
                  </p>
                  {!isPast && p.band && p.band[1] - p.band[0] > 0.5 && (
                    <p className="text-slate-500 dark:text-slate-400 tabular-nums">
                      Likely {fmtCompact(p.band[0], currency)} to {fmtCompact(p.band[1], currency)}
                    </p>
                  )}
                </div>
              )
            }}
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 2' }}
          />
          <Area type="stepAfter" dataKey="band" stroke="none" fill={`url(#${bandId})`}
            isAnimationActive={!prefersReducedMotion()} animationDuration={700} activeDot={false} />
          <Area type="stepAfter" dataKey="past" stroke={color} strokeWidth={2.25} fill={`url(#${pastId})`}
            baseValue={axis.floor} dot={false} connectNulls={false}
            activeDot={{ r: 5, fill: color, stroke: 'white', strokeWidth: 2 }}
            isAnimationActive={!prefersReducedMotion()} animationDuration={700} />
          <Line type="stepAfter" dataKey="value" stroke={color} strokeWidth={2.25} strokeDasharray="6 5"
            dot={false} connectNulls={false}
            activeDot={{ r: 5, fill: color, stroke: 'white', strokeWidth: 2 }}
            isAnimationActive={!prefersReducedMotion()} animationDuration={700} />
          {low && (
            <ReferenceDot x={low.day} y={low.value} r={4.5}
              fill={low.value < 0 ? '#ef4444' : low.value < floor ? '#f59e0b' : color}
              stroke="white" strokeWidth={2} ifOverflow="visible" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {/* What the three marks mean, once - the dashes and the band are the
          whole difference between this and a statement of fact. */}
      <div className="mt-1 flex items-center justify-center gap-4 text-11 text-slate-500 dark:text-slate-400" aria-hidden="true">
        {todayIndex > 0 && (
          <span className="flex items-center gap-1.5">
            <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke={color} strokeWidth="2.25" /></svg>
            So far
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke={color} strokeWidth="2.25" strokeDasharray="4 3" /></svg>
          Projected
        </span>
        {band && (
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-2.5 rounded-sm" style={{ background: color, opacity: 0.22 }} />
            Likely range
          </span>
        )}
      </div>
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
          <Bar dataKey="income"  fill="#22c55e" fillOpacity={0.85} radius={[4,4,0,0]} isAnimationActive={!prefersReducedMotion()} animationDuration={600} activeBar={{ stroke: 'none', fillOpacity: 1 }} />
          <Bar dataKey="expense" fill="#ef4444" fillOpacity={0.85} radius={[4,4,0,0]} isAnimationActive={!prefersReducedMotion()} animationDuration={600} activeBar={{ stroke: 'none', fillOpacity: 1 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
