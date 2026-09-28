import { useState } from 'react'
import { EASE_OUT } from '../../components/ui/motion'
import EmptyState from '../../components/ui/EmptyState'
import { CHART_COLORS, DailyAreaChart, MultiBarChart } from './Charts'
import { SectionHeading } from './shared'

// ── Trend placeholder ──────────────────────────────────────────────────────────

/** What each series is of, for the line saying there is none of it. */
export const TREND_EMPTY = {
  expenses: 'expenses',
  income:   'income',
  netflow:  'activity',
  bars:     'activity',
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

// ── Spending Trend (adaptive) ──────────────────────────────────────────────────

export const CHART_TYPE_OPTS = [
  { key: 'expenses', label: 'Expenses' },
  { key: 'income',   label: 'Income'   },
  { key: 'netflow',  label: 'Net flow' },
]

/**
 * The period's money over time: day by day for 7D and 1M, as expenses,
 * income or the two netted; month by month (or year by year) as paired bars
 * for the longer ranges.
 *
 * @param {{isArea: boolean, series: {expenses: Array<{day: number|string, value: number}>,
 *          income: Array<{day: number|string, value: number}>, netflow: Array<{day: number|string, value: number}>},
 *          multiBarData: Array<{label: string, income: number, expense: number}>, title: string,
 *          initialType?: string}} props
 */
export function SpendingTrend({ isArea, series, multiBarData, title, initialType = 'expenses' }) {
  const [chartType, setChartType] = useState(CHART_TYPE_OPTS.some(o => o.key === initialType) ? initialType : 'expenses')

  const activeData = isArea
    ? series[/** @type {'expenses'|'income'|'netflow'} */ (chartType)] ?? series.expenses
    : multiBarData

  const hasData = isArea
    ? activeData.some(d => d.value !== 0)
    : multiBarData.some(d => d.expense > 0 || d.income > 0)

  const label = title

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
          transition: `transform 0.3s ${EASE_OUT}, background-color 0.2s, border-color 0.2s`,
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
