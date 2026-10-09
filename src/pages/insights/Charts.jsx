import { useId } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, ReferenceLine, ReferenceDot,
  ComposedChart, Line,
} from 'recharts'
import CategoryGlyph from '../../components/CategoryGlyph'
import SectionLabel from '../../components/ui/SectionLabel'
import { fmt, fmtCompact } from '../../lib/money'
import { prefersReducedMotion } from '../../components/ui/motion'
import { TREND_SERIES } from '../../lib/trendSettings'

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

// ── Chart: Trend ───────────────────────────────────────────────────────────────

export const CHART_COLORS = {
  expenses: '#ef4444',
  income:   '#22c55e',
  netflow:  'var(--color-primary)',
}

/** The Trend chart's height - its empty state holds exactly this much too. */
export const TREND_HEIGHT = 180

/**
 * Round figures for the side of the Trend chart: zero, and steps above it -
 * and below it when a net figure went under. Nothing is drawn below zero for
 * a series that never went there, which niceAxis alone would add.
 *
 * Exported for Charts.test.js.
 *
 * @param {number[]} values  the figures the chart draws; may be empty
 */
export function trendAxis(values) {
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  if (hi - lo < 1) return flatAxis(0)
  const nice = niceAxis(lo, hi)
  const floor = lo === 0 ? 0 : nice.floor
  const ceil = hi === 0 ? 0 : nice.ceil
  return { floor, ceil, ticks: nice.ticks.filter(t => t >= floor && t <= ceil) }
}

export const TREND_NAMES = { expenses: 'Expenses', income: 'Income', netflow: 'Net flow' }

/**
 * The period's money over time, as a line, a line with a fill, or bars -
 * whichever the Trend settings say (lib/trendSettings.js) - for one or more
 * of the three series, drawn over each other on one scale. One chart for every
 * range, so the same toggle and the same settings work for a week of days and
 * for six months.
 *
 * The caller keys it (`animKey`) on the period and the settings, so a change
 * to either draws the chart afresh rather than morphing the old one into it:
 * a half-finished morph is how the previous series' colour got left on screen.
 *
 * @param {{trend: {expenses: import('./trendData').TrendPoint[], income: import('./trendData').TrendPoint[], netflow: import('./trendData').TrendPoint[]},
 *          series: import('../../lib/trendSettings').TrendSeriesKey[],
 *          settings: import('../../lib/trendSettings').TrendSettings, animKey?: string}} props
 */
export function TrendChart({ trend, series, settings, animKey = '' }) {
  const uid = useId().replace(/:/g, '')
  const { chart, smooth, points: dots, average } = settings
  const keys = TREND_SERIES.filter(k => series.includes(k))
  const multi = keys.length > 1
  /* One row per point with a column per line, which is what lets Recharts
     draw them on one axis and one tooltip. */
  const rows = trend[keys[0] ?? 'expenses'].map((p, i) => ({
    tick: p.tick, label: p.label,
    .../** @type {Record<string, number|null>} */ (Object.fromEntries(keys.map(k => [k, trend[k][i].value]))),
  }))
  const known = (/** @type {string} */ k) => rows.flatMap(r => { const v = /** @type {any} */ (r)[k]; return v == null ? [] : [/** @type {number} */ (v)] })
  const all = keys.flatMap(known)
  const { floor, ceil, ticks } = trendAxis(all)
  const curve = smooth ? 'monotone' : 'linear'
  const animate = !prefersReducedMotion()
  const labelEvery = Math.ceil(rows.length / 8)
  const last = rows.length - 1
  const xTick = ({ x, y, payload }) => {
    /* The last point is always labelled, so a regular label that lands just
       before it is dropped - on a 30-day month "29" and "30" sat on top of
       each other and read as "2930". */
    const regular = payload.index % labelEvery === 0 && last - payload.index >= labelEvery / 2
    if (!regular && payload.index !== last) return null
    // Anchored inward at the right edge, or "30" is cut to "3".
    const anchor = payload.index === last && chart !== 'bars' ? 'end' : 'middle'
    return <text x={x} y={y + 12} textAnchor={anchor} fontSize={10} fill="#94a3b8">{payload.value}</text>
  }
  // A line's last point sits on the right edge, so its dot needs a little room or it is cut in half.
  const edge = chart === 'bars' ? 0 : 6
  const lead = CHART_COLORS[keys[0] ?? 'expenses']
  return (
    <div className="[&_*]:outline-none [&_*]:focus:outline-none px-5">
      <ResponsiveContainer width="100%" height={TREND_HEIGHT}>
        <ComposedChart key={animKey} data={rows} margin={{ top: 10, right: edge, left: -8, bottom: 0 }} barCategoryGap="22%" barGap={1}>
          <defs>
            {keys.map(k => (
              <linearGradient key={k} id={`trendGrad-${uid}-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={CHART_COLORS[k]} stopOpacity={multi ? 0.16 : 0.25} />
                <stop offset="100%" stopColor={CHART_COLORS[k]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="4 3" vertical={false} stroke="rgba(148,163,184,0.12)" />
          <XAxis dataKey="tick" tick={xTick} axisLine={false} tickLine={false} interval={0} />
          <YAxis domain={[floor, ceil]} ticks={ticks} interval={0} tickFormatter={compactTick} tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false} tickLine={false} width={axisWidth(ticks)} />
          {floor < 0 && ceil > 0 && <ReferenceLine y={0} stroke="rgba(148,163,184,0.4)" />}
          <Tooltip
            content={({ active, payload }) => {
              const p = active ? payload?.[0]?.payload : null
              if (!p || keys.every(k => p[k] == null)) return null
              return (
                <div className="bg-lifted border border-slate-200 dark:border-white/10 rounded-2xl px-3 py-2 shadow-lg text-xs">
                  <p className="font-semibold mb-0.5 text-slate-600 dark:text-slate-300">{p.label}</p>
                  {keys.map(k => p[k] == null ? null : (
                    <p key={k} className="flex items-baseline justify-between gap-3 font-medium">
                      <span style={{ color: CHART_COLORS[k] }}>{TREND_NAMES[k]}</span>
                      <span className="text-slate-700 dark:text-white tabular-nums">{p[k] < 0 ? '−' : ''}{fmtCompact(Math.abs(p[k]))}</span>
                    </p>
                  ))}
                </div>
              )
            }}
            cursor={chart === 'bars' ? { fill: 'rgba(148,163,184,0.08)' } : { stroke: lead, strokeWidth: 1, strokeDasharray: '4 2' }}
          />
          {average && keys.map(k => known(k).length > 0 && (
            <ReferenceLine key={`avg-${k}`} y={known(k).reduce((s, v) => s + v, 0) / known(k).length}
              stroke={CHART_COLORS[k]} strokeOpacity={0.7} strokeDasharray="5 4"
              /* Said in words only when there is one line to say it of: three
                 labels on top of each other say nothing. */
              label={multi ? undefined : { value: `Average ${fmtCompact(known(k).reduce((s, v) => s + v, 0) / known(k).length)}`, position: 'insideTopRight', fontSize: 10, fill: CHART_COLORS[k] }} />
          ))}
          {chart === 'bars' && keys.map(k => (
            <Bar key={k} dataKey={k} fill={CHART_COLORS[k]} fillOpacity={0.85} radius={[4, 4, 0, 0]} maxBarSize={28}
              activeBar={{ stroke: 'none', fillOpacity: 1 }} isAnimationActive={animate} animationDuration={600} />
          ))}
          {chart === 'area' && keys.map(k => (
            <Area key={k} type={curve} dataKey={k} stroke={CHART_COLORS[k]} strokeWidth={multi ? 2 : 2.5} fill={`url(#trendGrad-${uid}-${k})`} baseValue={0}
              // A single point has no line to draw; a dot is all there is to show.
              dot={dots || known(k).length < 2 ? { r: 3, fill: CHART_COLORS[k], strokeWidth: 0 } : false}
              activeDot={{ r: 5, fill: CHART_COLORS[k], stroke: 'white', strokeWidth: 2 }} isAnimationActive={animate} animationDuration={800} />
          ))}
          {chart === 'line' && keys.map(k => (
            <Line key={k} type={curve} dataKey={k} stroke={CHART_COLORS[k]} strokeWidth={multi ? 2 : 2.5}
              dot={dots || known(k).length < 2 ? { r: 3, fill: CHART_COLORS[k], strokeWidth: 0 } : false}
              activeDot={{ r: 5, fill: CHART_COLORS[k], stroke: 'white', strokeWidth: 2 }} isAnimationActive={animate} animationDuration={800} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Chart: Net worth over time ────────────────────────────────────────────────

/** A y-axis figure with no currency sign, like the Trend chart's: "120K",
 *  "1.2M", "3.4B", and a real minus for a net worth below zero. */
function compactTick(v) {
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (a >= 1e12) return `${sign}${+(a / 1e12).toFixed(1)}T`
  if (a >= 1e9) return `${sign}${+(a / 1e9).toFixed(1)}B`
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
/**
 * An axis for a line that does not move: zero, and a round figure twice as
 * far out as the line (1,000 when the line is at zero).
 * @param {number} v
 */
export function flatAxis(v) {
  const round = (/** @type {number} */ x) => { const m = 10 ** Math.floor(Math.log10(x)); return Math.ceil(x / m) * m }
  if (v >= 0) {
    const top = v > 0 ? round(v * 2) : 1000
    return { floor: 0, ceil: top, ticks: [0, top / 2, top] }
  }
  const bottom = -round(-v * 2)
  return { floor: bottom, ceil: 0, ticks: [bottom, bottom / 2, 0] }
}

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
  /* A line that never moves - an empty ledger, all zeros - has no span for
     niceAxis to divide, which drew an axis of -1, 0 and 1. A flat line gets
     a plain one instead: zero and a round figure above (or below) it. */
  const axis = hi - lo < 1 ? flatAxis(hi) : niceAxis(Math.min(lo, nearZero ? 0 : lo), hi)
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
