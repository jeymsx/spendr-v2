import { useId } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Card from '../../components/ui/Card'
import CategoryGlyph from '../../components/CategoryGlyph'
import SectionHeading from '../../components/ui/SectionHeading'
import { IconChevronRight } from '../../components/icons'
import { fmt, fmtCompact } from '../../lib/money'
import { txBase } from '../../lib/fxContext'
import { CHART_COLORS } from './Charts'
import { NET_RANGE_WORDS } from './netWorth'
import { openFrom } from './zoom'

/**
 * The rest of Insights, as four cards that each open a page: how the
 * spending moved, the biggest purchases, which accounts paid, and net worth.
 *
 * These were four full sections one under another - two charts, two lists -
 * with nothing to say which mattered or where the page was going. Each is a
 * card now with the one thing worth knowing on its face: the shape of the
 * month's spending and its busiest day, the biggest purchase, the account
 * that paid most, the net worth and how it moved. Everything else is a tap
 * away, on a page with room for it.
 *
 * Every card shows something even when the period has nothing in it, so the
 * grid keeps its shape: an empty period is a quiet card, not a hole.
 */

/**
 * A line through `values`, as SVG path data in a `w` x `h` box: from zero
 * up, or - `zero: false` - across the values' own range, for a figure like
 * net worth that never goes near zero. Exported for the tests.
 *
 * @param {number[]} values @param {{w?: number, h?: number, zero?: boolean}} [o]
 */
export function sparkPath(values, { w = 100, h = 32, zero = true } = {}) {
  if (values.length < 2) return ''
  const lo = zero ? Math.min(0, ...values) : Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const pad = 2
  const x = (/** @type {number} */ i) => ((i / (values.length - 1)) * w).toFixed(2)
  const y = (/** @type {number} */ v) => (pad + (h - pad * 2) * (1 - (v - lo) / span)).toFixed(2)
  return values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')
}

/** @param {{values: number[], color: string, zero?: boolean}} props */
function Sparkline({ values, color, zero = true }) {
  const id = useId().replace(/:/g, '')
  const line = sparkPath(values, { zero })
  if (!line) return <div className="h-9" />
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="w-full h-9 overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line}L100,32L0,32Z`} fill={`url(#spark-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * The period's spending as a row of small bars - a day or a month each -
 * with the peak at full strength, since that is the one the caption names.
 * A spiky line at this size read as noise; bars read as days. Days of a
 * running month that have not happened yet are the faintest stubs, so the
 * row is always the month's full width.
 *
 * @param {{values: number[], color: string, lived: number}} props
 */
function MiniBars({ values, color, lived }) {
  const max = Math.max(0, ...values)
  const peak = max > 0 ? values.indexOf(max) : -1
  return (
    <div className="h-9 flex items-end gap-px" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className="flex-1 rounded-t-[2px]"
          style={{
            height: max > 0 && v > 0 ? `${Math.max(8, (v / max) * 100)}%` : '2px',
            backgroundColor: color,
            opacity: i >= lived ? 0.08 : i === peak ? 1 : v > 0 ? 0.42 : 0.18,
          }}
        />
      ))}
    </div>
  )
}

/** Each account's share of the spending, end to end. @param {{parts: Array<{name: string, value: number, color: string}>}} props */
function StackBar({ parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <div className="h-2.5 rounded-full overflow-hidden flex gap-[2px] bg-slate-100 dark:bg-white/[0.06]" aria-hidden="true">
      {total > 0 && parts.map(p => (
        <span key={p.name} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} />
      ))}
    </div>
  )
}

/**
 * One card: what it is, the thing worth knowing, a line under it.
 *
 * @param {{to: string, zoom: string, title: string, caption: import('react').ReactNode, label: string,
 *          children: import('react').ReactNode}} props
 */
function Tile({ to, zoom, title, caption, label, children, wide = false }) {
  const navigate = useNavigate()
  return (
    <Card
      as={Link}
      to={to}
      interactive
      data-zoom={zoom}
      aria-label={label}
      onClick={(/** @type {React.MouseEvent<HTMLAnchorElement>} */ e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        openFrom(e.currentTarget, () => navigate(to), zoom)
      }}
      className={`h-[132px] flex flex-col px-3 pt-3 pb-3 min-w-0${wide ? ' col-span-2' : ''}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-13 font-semibold text-slate-800 dark:text-white truncate">{title}</span>
        <span className="text-slate-300 dark:text-slate-600 shrink-0"><IconChevronRight size={14} strokeWidth="2.2" /></span>
      </span>
      <span className="flex-1 min-h-0 flex flex-col justify-center">{children}</span>
      <span className="text-12 text-slate-500 dark:text-slate-400 truncate">{caption}</span>
    </Card>
  )
}

/**
 * @param {{data: ReturnType<typeof import('./useInsightsData').useInsightsData>, range: string,
 *          netWorth: ReturnType<typeof import('./netWorth').useNetWorthSeries>,
 *          forecast?: ReturnType<typeof import('../../lib/forecast').buildForecast>|null}} props
 */
export default function Explore({ data, range, netWorth, forecast = null }) {
  const { daily, multiBarData, rankedExpenses, accountBreakdown, catMap } = data

  // ── Trend: the spending's shape, and its busiest day or month ──
  const byDay = range === '1m' || range === '7d'
  const points = byDay
    ? data.lived.map(d => ({ label: d.label, value: d.expense }))
    : multiBarData.map(d => ({ label: d.label, value: d.expense }))
  const peak = points.reduce((b, p) => (p.value > b.value ? p : b), { label: '', value: 0 })
  const trendValues = byDay ? daily.map(d => d.expense) : points.map(p => p.value)
  const trendCaption = peak.value > 0
    ? `Peak ${peak.label} · ${fmtCompact(peak.value)}`
    : data.win.running ? 'No spending yet' : 'No spending'

  // ── Top expenses: the biggest one ──
  const top = rankedExpenses[0] ?? null
  const topCat = top ? catMap[top.category] : null

  // ── By account: who paid most ──
  const spent = accountBreakdown.reduce((s, a) => s + a.value, 0)
  const lead = accountBreakdown[0] ?? null
  const leadShare = lead && spent > 0 ? Math.round((lead.value / spent) * 100) : 0

  // ── Net worth: where it stands, and which way it went ──
  const nw = netWorth.data
  const nwDelta = nw.length > 1 ? nw.at(-1).value - nw[0].value : 0
  const rising = nwDelta >= 0

  return (
    <section>
      <SectionHeading>Explore</SectionHeading>
      <div className="px-5 grid grid-cols-2 gap-3">
        <Tile
          to="/insights/trend"
          zoom="trend"
          title="Trend"
          label={`Trend. ${trendCaption}`}
          caption={trendCaption}
        >
          <MiniBars values={trendValues} color={CHART_COLORS.expenses} lived={byDay ? data.lived.length : trendValues.length} />
        </Tile>

        <Tile
          to="/insights/expenses"
          zoom="expenses"
          title="Top expenses"
          label={top ? `Top expenses. Biggest: ${top.description || top.category}, ${fmt(txBase(top))}` : 'Top expenses. Nothing spent'}
          caption={top ? `Biggest of ${rankedExpenses.length}` : 'Nothing spent'}
        >
          {top ? (
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-15" aria-hidden="true"
                style={{ backgroundColor: (topCat?.color ?? '#2D9DFF') + '22' }}>
                <CategoryGlyph cat={topCat} size={16} />
              </span>
              <span className="min-w-0 flex flex-col">
                <span className="text-13 font-medium text-slate-800 dark:text-white truncate">{top.description || top.category}</span>
                <span className="text-13 font-semibold text-red-500 dark:text-red-400 tabular-nums truncate">{fmtCompact(txBase(top))}</span>
              </span>
            </span>
          ) : <span className="h-8" />}
        </Tile>

        <Tile
          to="/insights/accounts"
          zoom="accounts"
          title="By account"
          label={lead ? `By account. ${lead.name} paid ${leadShare}%` : 'By account. Nothing spent'}
          caption={lead ? `${lead.name} · ${leadShare}%` : 'Nothing spent'}
        >
          <StackBar parts={accountBreakdown} />
        </Tile>

        <Tile
          to="/insights/net-worth"
          zoom="net-worth"
          title="Net worth"
          label={netWorth.current != null
            ? `Net worth. ${fmt(netWorth.current)}, ${rising ? 'up' : 'down'} ${fmtCompact(Math.abs(nwDelta))} ${NET_RANGE_WORDS[netWorth.range.key]}`
            : 'Net worth'}
          caption={nw.length > 1 ? (
            <span className={rising ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>
              {rising ? '+' : '−'}{fmtCompact(Math.abs(nwDelta))}
              <span className="text-slate-500 dark:text-slate-400"> {NET_RANGE_WORDS[netWorth.range.key]}</span>
            </span>
          ) : 'No history yet'}
        >
          <span className="flex flex-col gap-1">
            <span className="text-17 font-semibold text-slate-900 dark:text-white tabular-nums truncate">
              {fmtCompact(netWorth.current ?? 0)}
            </span>
            <Sparkline values={nw.map(p => p.value)} color={rising ? '#10b981' : '#ef4444'} zero={false} />
          </span>
        </Tile>

        {/* The one card that looks forward, full width under the four that
            look back - it is a different question, and it keeps its own
            range, as Net worth does. */}
        {forecast && (
          <Tile
            to="/insights/forecast"
            zoom="forecast"
            title="Next 30 days"
            wide
            label={`Next 30 days. Safe to spend ${fmt(forecast.safeToSpend)}`}
            caption={forecast.firstNegative ? (
              <span className="text-red-500 dark:text-red-400">
                Runs short {forecast.firstNegative.date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
              </span>
            ) : `Tightest ${forecast.lowest.date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · ${fmtCompact(forecast.lowest.balance)}`}
          >
            <span className="flex items-end gap-4">
              <span className="flex flex-col shrink-0">
                <span className="text-11 text-slate-500 dark:text-slate-400">Safe to spend</span>
                <span className="text-17 font-semibold text-slate-900 dark:text-white tabular-nums">
                  {fmtCompact(forecast.safeToSpend)}
                </span>
              </span>
              <span className="flex-1 min-w-0">
                <Sparkline
                  values={forecast.days.map(d => d.balance)}
                  color={forecast.firstNegative ? '#ef4444' : '#10b981'}
                  zero={false}
                />
              </span>
            </span>
          </Tile>
        )}
      </div>
    </section>
  )
}
