import { useId } from 'react'
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  PieChart, Pie, Cell,
} from 'recharts'
import { fmt, fmtCompact } from '../../lib/money'
import { niceAxis, flatAxis, trendAxis } from '../../pages/insights/Charts'
import { prefersReducedMotion } from '../../components/ui/motion'
import { TREND_SERIES } from '../../lib/trendSettings'
import { Empty } from './display'

/**
 * The desktop's charts: the phone's chart kinds (Recharts), drawn at a
 * desktop's size with a desktop's axes - 11px labels, hairline guides, a
 * tooltip on the panel's own surface.
 */

const AXIS = { fontSize: 11, fill: 'var(--d-text-3)' }
const GRID = 'var(--d-border)'

/** @param {number} v */
const tick = (v) => (Math.abs(v) >= 1000 ? fmtCompact(v).replace(/\.0(?=[KMB])/, '') : fmt(v).replace(/\.00$/, ''))

/**
 * What a chart says when there is nothing to draw - no points, or every
 * point at nought - instead of a scale running from ₱0 to ₱1.50 over an
 * empty floor: the glass picture and a line, in the chart's own height, so
 * nothing below moves when the first figure arrives.
 *
 * @typedef {{title: string, body?: string}} ChartEmptyText
 * @param {{empty?: ChartEmptyText, height: number|string}} props
 */
export function ChartEmpty({ empty, height }) {
  return (
    <div className={`flex items-center justify-center ${typeof height === 'string' ? 'h-full min-h-[200px]' : ''}`} style={typeof height === 'number' ? { height } : undefined}>
      <Empty art="chartFlat" size="sm" title={empty?.title ?? 'Nothing to show yet'} body={empty?.body} />
    </div>
  )
}

/** @param {{rows: Array<{label: string, value: string, color?: string}>, title?: string}} props */
function Tip({ title, rows }) {
  return (
    <div className="d-pop px-3 py-2 text-12 min-w-[140px]" style={{ animation: 'none' }}>
      {title && <div className="font-semibold text-[var(--d-text)] mb-1">{title}</div>}
      {rows.map(r => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[var(--d-text-2)]">
            {r.color && <span className="d-swatch" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="d-num font-medium text-[var(--d-text)]">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * A line with a soft fill under it, on an axis that spans what the line did
 * (not from zero): a balance or a net worth over time.
 *
 * @param {{data: Array<{label: string, value: number}>, color?: string, height?: number, currency?: string, valueLabel?: string,
 *          empty?: ChartEmptyText}} props
 */
export function AreaTrend({ data, color = 'var(--d-accent)', height = 220, currency, valueLabel = 'Value', empty }) {
  const id = useId().replace(/:/g, '')
  // A line of noughts says nothing; a line that holds at a figure still does.
  if (data.length < 2 || data.every(d => !d.value)) return <ChartEmpty empty={empty} height={height} />
  const values = data.map(d => d.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const { floor, ceil, ticks } = hi - lo < 1 ? flatAxis(hi) : niceAxis(lo, hi)
  const last = data.length - 1
  const marks = new Set([0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * last)))
  return (
    <div className="[&_*]:outline-none">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`a${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="label" axisLine={false} tickLine={false} interval={0} height={24}
            tick={({ x, y, payload }) => (marks.has(payload.index)
              ? <text x={x} y={y + 14} textAnchor={payload.index === 0 ? 'start' : payload.index === last ? 'end' : 'middle'} {...AXIS}>{payload.value}</text>
              : <g />)}
          />
          <YAxis domain={[floor, ceil]} ticks={ticks} interval={0} tickFormatter={tick} tick={AXIS} axisLine={false} tickLine={false} width={56} />
          {floor < 0 && ceil > 0 && <ReferenceLine y={0} stroke="var(--d-border-strong)" />}
          <Tooltip
            cursor={{ stroke: 'var(--d-border-strong)', strokeWidth: 1 }}
            content={({ active, payload, label }) => (active && payload?.length
              ? <Tip title={String(label)} rows={[{ label: valueLabel, value: fmt(Number(payload[0].value), currency) }]} />
              : null)}
          />
          <Area
            type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#a${id})`} baseValue={floor}
            dot={false} activeDot={{ r: 4, fill: color, stroke: 'var(--d-panel)', strokeWidth: 2 }}
            isAnimationActive={!prefersReducedMotion()} animationDuration={600}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** The colour of each Trend line - the same three the phone draws, in the desktop's own tones. */
export const TREND_COLORS = { expenses: 'var(--d-neg)', income: 'var(--d-pos)', netflow: 'var(--d-accent)' }
/** What each is called on the desktop: what it is, as the cards above say it. */
export const TREND_WORDS = { expenses: 'Spent', income: 'Came in', netflow: 'Net' }

/**
 * The Trend chart: one or more series of money over time, drawn over each
 * other as lines, lines with a fill, or bars - as the Trend settings say
 * (lib/trendSettings.js), the same ones the phone's Trend page reads. A point
 * of null is a day that has not happened yet, and is left empty.
 *
 * @param {{trend: {expenses: import('../../pages/insights/trendData').TrendPoint[], income: import('../../pages/insights/trendData').TrendPoint[],
 *            netflow: import('../../pages/insights/trendData').TrendPoint[]},
 *          series: import('../../lib/trendSettings').TrendSeriesKey[], settings: import('../../lib/trendSettings').TrendSettings,
 *          height?: number, currency?: string, empty?: ChartEmptyText}} props
 */
export function TrendPlot({ trend, series, settings, height = 300, currency, empty }) {
  const id = useId().replace(/:/g, '')
  const { chart, smooth, points: dots, average } = settings
  const keys = TREND_SERIES.filter(k => series.includes(k))
  const multi = keys.length > 1
  const rows = trend[keys[0] ?? 'expenses'].map((p, i) => ({
    tick: p.tick, label: p.label,
    .../** @type {Record<string, number|null>} */ (Object.fromEntries(keys.map(k => [k, trend[k][i].value]))),
  }))
  const known = (/** @type {string} */ k) => rows.flatMap(r => { const v = /** @type {any} */ (r)[k]; return v == null ? [] : [/** @type {number} */ (v)] })
  const all = keys.flatMap(known)
  if (!all.some(v => v)) return <ChartEmpty empty={empty} height={height} />
  const { floor, ceil, ticks } = trendAxis(all)
  const curve = smooth ? 'monotone' : 'linear'
  const last = rows.length - 1
  const every = Math.max(1, Math.ceil(rows.length / 8))
  const animate = !prefersReducedMotion()
  return (
    <div className="[&_*]:outline-none">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%" barGap={2}>
          <defs>
            {keys.map(k => (
              <linearGradient key={k} id={`t${id}${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TREND_COLORS[k]} stopOpacity={multi ? 0.12 : 0.18} />
                <stop offset="100%" stopColor={TREND_COLORS[k]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="tick" axisLine={false} tickLine={false} interval={0} height={24}
            tick={({ x, y, payload }) => {
              /* The last point is always labelled, so a regular label that
                 lands just before it is dropped rather than run into it. */
              const shown = payload.index === last || (payload.index % every === 0 && last - payload.index >= every / 2)
              if (!shown) return <g />
              const anchor = payload.index === last && chart !== 'bars' ? 'end' : payload.index === 0 && chart !== 'bars' ? 'start' : 'middle'
              return <text x={x} y={y + 14} textAnchor={anchor} {...AXIS}>{payload.value}</text>
            }}
          />
          <YAxis domain={[floor, ceil]} ticks={ticks} interval={0} tickFormatter={tick} tick={AXIS} axisLine={false} tickLine={false} width={56} />
          {floor < 0 && ceil > 0 && <ReferenceLine y={0} stroke="var(--d-border-strong)" />}
          <Tooltip
            cursor={chart === 'bars' ? { fill: 'var(--d-hover)' } : { stroke: 'var(--d-border-strong)', strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = active ? payload?.[0]?.payload : null
              if (!p || keys.every(k => p[k] == null)) return null
              return <Tip title={String(p.label)} rows={keys.flatMap(k => (p[k] == null ? [] : [{
                label: TREND_WORDS[k], value: fmt(Number(p[k]), currency), color: multi ? TREND_COLORS[k] : undefined,
              }]))} />
            }}
          />
          {average && keys.map(k => known(k).length > 0 && (
            <ReferenceLine key={`avg-${k}`} y={known(k).reduce((s, v) => s + v, 0) / known(k).length}
              stroke={TREND_COLORS[k]} strokeOpacity={0.7} strokeDasharray="5 4"
              /* Said in words only when there is one line to say it of: three labels on top of each other say nothing. */
              label={multi ? undefined : { value: `Average ${fmtCompact(known(k).reduce((s, v) => s + v, 0) / known(k).length)}`, position: 'insideTopRight', fontSize: 11, fill: TREND_COLORS[k] }} />
          ))}
          {chart === 'bars' && keys.map(k => (
            <Bar key={k} dataKey={k} fill={TREND_COLORS[k]} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={animate} />
          ))}
          {chart === 'area' && keys.map(k => (
            <Area key={k} type={curve} dataKey={k} stroke={TREND_COLORS[k]} strokeWidth={2} fill={`url(#t${id}${k})`} baseValue={0}
              // One point has no line to draw; a dot is all there is to show.
              dot={dots || known(k).length < 2 ? { r: 3, fill: TREND_COLORS[k], stroke: 'var(--d-panel)', strokeWidth: 1.5 } : false}
              activeDot={{ r: 4, fill: TREND_COLORS[k], stroke: 'var(--d-panel)', strokeWidth: 2 }} isAnimationActive={animate} animationDuration={600} />
          ))}
          {chart === 'line' && keys.map(k => (
            <Line key={k} type={curve} dataKey={k} stroke={TREND_COLORS[k]} strokeWidth={2}
              dot={dots || known(k).length < 2 ? { r: 3, fill: TREND_COLORS[k], stroke: 'var(--d-panel)', strokeWidth: 1.5 } : false}
              activeDot={{ r: 4, fill: TREND_COLORS[k], stroke: 'var(--d-panel)', strokeWidth: 2 }} isAnimationActive={animate} animationDuration={600} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Money in and out side by side, one pair of bars per period.
 *
 * @param {{data: Array<{label: string, income: number, expense: number}>, height?: number|string, currency?: string,
 *          empty?: ChartEmptyText}} props
 */
export function InOutBars({ data, height = 220, currency, empty }) {
  if (data.every(d => !d.income && !d.expense)) return <ChartEmpty empty={empty} height={height} />
  const max = Math.max(1, ...data.flatMap(d => [d.income, d.expense]))
  const { ceil, ticks } = niceAxis(0, max)
  return (
    <div className={`[&_*]:outline-none ${typeof height === 'string' ? 'h-full' : ''}`}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={3} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS} height={24} />
          <YAxis domain={[0, ceil]} ticks={ticks.filter(t => t >= 0)} tickFormatter={tick} tick={AXIS} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            cursor={{ fill: 'var(--d-hover)' }}
            content={({ active, payload, label }) => (active && payload?.length
              ? <Tip title={String(label)} rows={[
                { label: 'Came in', value: fmt(Number(payload[0]?.payload?.income ?? 0), currency), color: 'var(--d-pos)' },
                { label: 'Spent', value: fmt(Number(payload[0]?.payload?.expense ?? 0), currency), color: 'var(--d-neg)' },
              ]} />
              : null)}
          />
          <Bar dataKey="income" fill="var(--d-pos)" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={!prefersReducedMotion()} />
          <Bar dataKey="expense" fill="var(--d-neg)" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={!prefersReducedMotion()} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * One series of bars - a day's spending across a month.
 *
 * @param {{data: Array<{label: string, value: number}>, height?: number|string, currency?: string, color?: string, valueLabel?: string,
 *          empty?: ChartEmptyText}} props
 */
export function Bars({ data, height = 200, currency, color = 'var(--d-accent)', valueLabel = 'Spent', empty }) {
  if (data.every(d => !d.value)) return <ChartEmpty empty={empty} height={height} />
  const max = Math.max(1, ...data.map(d => d.value))
  const { ceil, ticks } = niceAxis(0, max)
  const last = data.length - 1
  const every = Math.max(1, Math.ceil(data.length / 8))
  return (
    <div className={`[&_*]:outline-none ${typeof height === 'string' ? 'h-full' : ''}`}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="label" axisLine={false} tickLine={false} interval={0} height={24}
            tick={({ x, y, payload }) => (payload.index % every === 0 || payload.index === last
              ? <text x={x} y={y + 14} textAnchor="middle" {...AXIS}>{payload.value}</text>
              : <g />)}
          />
          <YAxis domain={[0, ceil]} ticks={ticks.filter(t => t >= 0)} tickFormatter={tick} tick={AXIS} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            cursor={{ fill: 'var(--d-hover)' }}
            content={({ active, payload, label }) => (active && payload?.length
              ? <Tip title={String(label)} rows={[{ label: valueLabel, value: fmt(Number(payload[0].value), currency) }]} />
              : null)}
          />
          <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={!prefersReducedMotion()} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * A ring of parts with the total in its middle.
 *
 * @param {{data: Array<{name: string, value: number, color: string}>, size?: number, center?: import('react').ReactNode,
 *          active?: string|null, onActive?: (name: string|null) => void}} props
 */
export function Ring({ data, size = 200, center, active = null, onActive }) {
  return (
    <div className="relative [&_*]:outline-none" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data.length ? data : [{ name: 'none', value: 1, color: 'var(--d-sunken)' }]}
            dataKey="value" nameKey="name" innerRadius="70%" outerRadius="100%" paddingAngle={data.length > 1 ? 1.5 : 0}
            stroke="none" isAnimationActive={!prefersReducedMotion()} animationDuration={500}
            onMouseEnter={(_, i) => onActive?.(data[i]?.name ?? null)}
            onMouseLeave={() => onActive?.(null)}
          >
            {(data.length ? data : [{ name: 'none', value: 1, color: 'var(--d-sunken)' }]).map(d => (
              <Cell key={d.name} fill={d.color} opacity={active && active !== d.name ? 0.35 : 1} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">{center}</div>}
    </div>
  )
}
