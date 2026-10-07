import EmptyState from '../../components/ui/EmptyState'
import { TREND_SERIES } from '../../lib/trendSettings'
import { CHART_COLORS, TREND_HEIGHT, TREND_NAMES, TrendChart } from './Charts'
import { SectionHeading } from './shared'
import { periodName } from './period'

// ── Trend placeholder ──────────────────────────────────────────────────────────

/** What each series is of, for the line saying there is none of it. */
export const TREND_EMPTY = {
  expenses: 'expenses',
  income:   'income',
  netflow:  'activity',
}

/**
 * Holds the chart's exact height when there is nothing to draw.
 *
 * The empty state was a single `py-8` line, so switching Expenses -> Income on
 * a month with no income collapsed the section from 160px to about 52px and
 * shoved everything below it - Top expenses, the whole rest of the page - up
 * the screen. Toggling back shoved it down again. A control that makes the
 * page jump is a control people stop touching.
 *
 * So the height is passed in from the caller rather than guessed - the
 * chart's own, TREND_HEIGHT - matching its ResponsiveContainer exactly. The
 * px-5 wrapper matches too, so the box is identical either way.
 *
 * One picture for every series: a chart with a flat line across it. It was a
 * glyph each - a line going down for expenses, up for income - which drew a
 * trend for a period that has none.
 */
export function TrendEmpty({ kind, height }) {
  const noun = TREND_EMPTY[kind] ?? TREND_EMPTY.expenses
  return (
    <div className="px-5">
      <div style={{ height }} className="flex flex-col items-center justify-center">
        <EmptyState size="sm" art="chartFlat" title={`No ${noun} in this period`} />
      </div>
    </div>
  )
}

// ── Spending Trend ─────────────────────────────────────────────────────────────

/**
 * What the chart is of, in the words over it.
 * @param {{range: string, month?: number|null}} period
 */
export function trendTitle(period) {
  return period.range === '7d' ? 'Last 7 days'
    : period.range === '1m' ? periodName(/** @type {any} */ (period))
      : period.range === '3m' ? 'Last 3 months'
        : period.range === '6m' ? 'Last 6 months' : 'All time'
}

/**
 * The period's money over time, as the Trend settings draw it, with a chip
 * above it for each of the lines it can show - for every range, day by day or
 * month by month alike. Any of them can be on together, drawn over each other;
 * one always stays on, because a chart of nothing is not an answer.
 *
 * What is chosen is the caller's (`series`, `onSeries`), not kept here: this
 * used to remount whenever the period changed, and took the choice with it -
 * go to Income, switch from 1M to 3M, and the toggle said Expenses again.
 *
 * @param {{trend: {expenses: import('./trendData').TrendPoint[], income: import('./trendData').TrendPoint[],
 *          netflow: import('./trendData').TrendPoint[]},
 *          series: import('../../lib/trendSettings').TrendSeriesKey[],
 *          onSeries: (series: import('../../lib/trendSettings').TrendSeriesKey[]) => void,
 *          settings: import('../../lib/trendSettings').TrendSettings, title: string, animKey?: string}} props
 */
export function SpendingTrend({ trend, series, onSeries, settings, title, animKey = '' }) {
  const hasData = series.some(k => trend[k].some(p => p.value != null && p.value !== 0))
  const toggle = (/** @type {import('../../lib/trendSettings').TrendSeriesKey} */ key) => {
    const on = series.includes(key)
    if (on && series.length === 1) return
    onSeries(TREND_SERIES.filter(k => (k === key ? !on : series.includes(k))))
  }

  /* Bare chips, each tinted in its own line's colour when it is on - so the
     row is the chart's key as well as its switches, and with two lines up
     there is no legend to look away for.

     It began as one pill that slid between three labels, which only works
     when exactly one is chosen. Fixed-width chips keep the row the same size
     whatever is on, so the heading beside it never shifts; 60px fits the
     longest label, "Expenses". */
  const typeFilter = (
    <div className="flex items-center gap-0.5" role="group" aria-label="Lines shown">
      {TREND_SERIES.map(key => {
        const on = series.includes(key)
        const color = CHART_COLORS[key]
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            aria-pressed={on}
            className={[
              'w-[60px] py-1 text-10 font-semibold rounded-full border transition-colors duration-200',
              on ? 'seg-active' : 'text-slate-500 dark:text-slate-400',
            ].join(' ')}
            style={{
              ...(on ? { '--seg-color': color } : {}),
              // color-mix rather than string-concatenating an alpha suffix: netflow's
              // colour is `var(--color-primary)`, and 'var(--color-primary)' + '22'
              // is not a colour.
              backgroundColor: on ? `color-mix(in srgb, ${color} 16%, transparent)` : 'transparent',
              borderColor: on ? `color-mix(in srgb, ${color} 40%, transparent)` : 'transparent',
            }}
          >{TREND_NAMES[key]}</button>
        )
      })}
    </div>
  )

  return (
    <div>
      <SectionHeading align="center" action={typeFilter}>{title}</SectionHeading>
      {hasData
        ? <TrendChart trend={trend} series={series} settings={settings} animKey={`${animKey}|${series.join()}|${settings.chart}`} />
        : <TrendEmpty kind={series.length === 1 ? series[0] : 'netflow'} height={TREND_HEIGHT} />}
    </div>
  )
}
