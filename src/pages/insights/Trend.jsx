import { useState } from 'react'
import EmptyState from '../../components/ui/EmptyState'
import { CHART_COLORS, DailyAreaChart, MultiBarChart } from './Charts'
import { SectionHeading } from './shared'

// ── Trend placeholder ──────────────────────────────────────────────────────────

/* Lucide's own geometry, hand-drawn rather than installed.
 
   lucide-react would be a ~30KB dependency and a second icon idiom for four
   glyphs, in a file where every other icon is already a 24x24, 2px-stroke,
   currentColor path. These are lucide's trending-down, trending-up, activity
   and bar-chart with their half-integer vertices snapped to whole numbers -
   lucide draws trending-down through 13.5,8.5, and a 2px stroke on a
   half-integer coordinate is antialiased across two pixel rows at 1x. */

export function IconTrendDown() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 17L14 9l-5 5L2 7" />
      <path d="M16 17h6v-6" />
    </svg>
  )
}

export function IconTrendUp() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 7L14 15l-5-5L2 17" />
      <path d="M16 7h6v6" />
    </svg>
  )
}

export function IconActivity() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  )
}

export function IconBars() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 20v-4M12 20V10M18 20V4" />
    </svg>
  )
}

export const TREND_EMPTY = {
  expenses: { Icon: IconTrendDown, noun: 'expenses' },
  income:   { Icon: IconTrendUp,   noun: 'income'   },
  netflow:  { Icon: IconActivity,  noun: 'activity' },
  bars:     { Icon: IconBars,      noun: 'activity' },
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
 * So the height is passed in from the caller rather than guessed: 160 for the
 * area chart, 180 for the multi-month bars, matching each ResponsiveContainer
 * exactly. The px-5 wrapper matches too, so the box is identical either way.
 */
export function TrendEmpty({ kind, height }) {
  const { Icon, noun } = TREND_EMPTY[kind] ?? TREND_EMPTY.expenses
  return (
    <div className="px-5">
      <div style={{ height }} className="flex flex-col items-center justify-center">
        <EmptyState size="sm" icon={<Icon />} title={`No ${noun} in this period`} />
      </div>
    </div>
  )
}

// ── Spending Trend (adaptive) ──────────────────────────────────────────────────

export const CHART_TYPE_OPTS = [
  { key: 'expenses', label: 'Expenses' },
  { key: 'income',   label: 'Income'   },
  { key: 'netflow',  label: 'Net flow' },
]

export function SpendingTrend({ range, dailyExpense, dailyIncome, dailyNetflow, sevenDayExpense, sevenDayIncome, sevenDayNetflow, multiBarData }) {
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

  const label = range === '7d'  ? 'Last 7 days'
    : range === '1m'            ? 'Trend'
    : range === '3m'            ? 'Last 3 months'
    : range === '6m'            ? 'Last 6 months'
    : 'All time'

  /* Bare labels and one pill that slides. No track.
 
     It started as a flat tint holding a flat white pill, then gained a glass
     track with a hairline rim - which looked right in the middle and wrong at
     both ends, because the pill's rounded edge landed a hair inside the
     track's and read as a double outline. There is nothing for a track to do
     here that the pill is not already doing: three equal-width adjacent
     labels read as one control on their own, and the pill says which is on.
     So the glass moved onto the pill and the container went away.
 
     Fixed-width segments are what make the travel possible. The thumb is
     `100% / N` and moves by multiples of its own width, which only lands
     correctly if every segment is the same size - the old auto-width px-2.5
     buttons could not have been animated this way. 60px fits the longest
     label, "Expenses". */
  const activeTypeIdx = CHART_TYPE_OPTS.findIndex(o => o.key === chartType)
  const activeColor = CHART_COLORS[chartType] ?? CHART_COLORS.expenses
  const typeFilter = isArea && (
    <div className="relative flex items-center">
      <div
        className="absolute inset-y-0 left-0 rounded-full border backdrop-blur-md pointer-events-none"
        style={{
          width: `calc(100% / ${CHART_TYPE_OPTS.length})`,
          transform: `translateX(${activeTypeIdx * 100}%)`,
          transition: 'transform 0.3s cubic-bezier(0.34, 1.4, 0.64, 1), background-color 0.2s, border-color 0.2s',
          // color-mix rather than string-concatenating an alpha suffix: netflow's
          // colour is `var(--color-primary)`, and 'var(--color-primary)' + '22'
          // is not a colour.
          backgroundColor: `color-mix(in srgb, ${activeColor} 16%, transparent)`,
          borderColor: `color-mix(in srgb, ${activeColor} 40%, transparent)`,
        }}
      />
      {CHART_TYPE_OPTS.map(o => (
        <button
          key={o.key}
          onClick={() => setChartType(o.key)}
          aria-pressed={chartType === o.key}
          className={[
            'relative z-10 w-[60px] py-1 text-10 font-semibold rounded-full',
            'transition-colors duration-200',
            chartType === o.key ? 'seg-active' : 'text-slate-500 dark:text-slate-400',
          ].join(' ')}
          style={chartType === o.key ? { '--seg-color': CHART_COLORS[o.key] } : undefined}
        >{o.label}</button>
      ))}
    </div>
  )

  return (
    <div>
      <SectionHeading align="center" action={typeFilter}>{label}</SectionHeading>
      {!hasData ? (
        <TrendEmpty
          kind={isArea ? chartType : 'bars'}
          height={isArea ? 160 : 180}
        />
      ) : isArea ? (
        <DailyAreaChart data={activeData} chartType={chartType} />
      ) : (
        <MultiBarChart data={multiBarData} />
      )}
    </div>
  )
}
