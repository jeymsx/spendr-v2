import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Sliders04 } from '@untitledui/icons'
import SubPage from '../../components/SubPage'
import Card from '../../components/ui/Card'
import IconButton from '../../components/ui/IconButton'
import Divider from '../../components/ui/Divider'
import SectionHeading from '../../components/ui/SectionHeading'
import SectionLabel from '../../components/ui/SectionLabel'
import { fmtCompact } from '../../lib/money'
import { TREND_SERIES, TREND_SETTINGS_PATH } from '../../lib/trendSettings'
import useTrendSettings from '../../hooks/useTrendSettings'
import { txBase } from '../../lib/fxContext'
import { PeriodControls } from './PeriodBar'
import { changeOf, usePeriod } from './period'
import { SpendingTrend, trendTitle } from './Trend'
import { TrendSkeleton } from './Skeleton'
import { useInsightsData } from './useInsightsData'
import { useTrend } from './trendData'
import { useArrival, useZoomBack } from './zoom'

/**
 * How the period's money moved: the chart the overview used to carry, with
 * the room to say what it means.
 *
 * Under the chart, the period against the one before - the same days of last
 * month while this one is running - and then its shape in a few figures: an
 * average day, the busiest one, the heaviest day of the week. For the longer
 * ranges, which have no "before", each month's figures instead.
 *
 * Opened from the Trend card, or from Income or Net on the overview with
 * that series already chosen (?type=). Otherwise it opens on the series the
 * Trend settings say, and is drawn as they say - a line, a line with a fill,
 * or bars - with the same toggle for every range.
 */

const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

/**
 * One line of the comparison: what it is, now, before, and which way it
 * went - as a share for spending and income, and as an amount for net, which
 * can cross zero, where a percentage stops meaning anything.
 */
function CompareRow({ label, now, before, goodWhenUp, signed = false }) {
  const money = (/** @type {number} */ v) => `${signed ? (v >= 0 ? '+' : '−') : ''}${fmtCompact(Math.abs(v))}`
  let text = ''
  let tone = 'text-slate-400 dark:text-slate-500'
  if (signed) {
    const diff = now - before
    if (Math.abs(diff) >= 0.5) {
      text = `${diff > 0 ? '↑' : '↓'} ${fmtCompact(Math.abs(diff))}`
      tone = (diff > 0) === goodWhenUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
    } else text = 'Same'
  } else {
    const change = changeOf(now, before)
    if (change) {
      text = change.same ? 'Same' : `${change.up ? '↑' : '↓'} ${change.pct}%`
      if (!change.same) tone = change.up === goodWhenUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
    }
  }
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex-1 min-w-0 text-13 text-slate-600 dark:text-slate-300 truncate">{label}</span>
      <span className="text-right shrink-0">
        <span className="block text-13 font-semibold text-slate-900 dark:text-white tabular-nums">{money(now)}</span>
        <span className="block text-11 text-slate-400 dark:text-slate-500 tabular-nums">was {money(before)}</span>
      </span>
      <span className={`w-16 text-right shrink-0 text-12 font-semibold tabular-nums ${tone}`}>{text}</span>
    </div>
  )
}

/** A figure with what it is under it. */
function Fact({ label, value }) {
  return (
    <Card padding="sm" className="min-w-0">
      <p className="text-12 text-slate-500 dark:text-slate-400 truncate">{label}</p>
      <p className="mt-0.5 text-15 font-semibold text-slate-900 dark:text-white tabular-nums truncate">{value}</p>
    </Card>
  )
}

export default function TrendPage() {
  const back = useZoomBack('/insights')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { settings, ready } = useTrendSettings()
  /* What the toggle was last set to. Held here, above the chart, so changing
     the period does not put it back. Until it is touched the series is the
     address's, or the settings'. */
  const [picked, setPicked] = useState(/** @type {import('../../lib/trendSettings').TrendSeriesKey[]|null} */ (null))
  const asked = /** @type {any} */ (params.get('type'))
  const series = picked ?? (TREND_SERIES.includes(asked) ? [asked] : settings.series)
  const { period } = usePeriod()
  const data = useInsightsData(period)
  // Grown out of its card once its figures are in (zoom.js).
  const arrival = useArrival(!data.loading)
  const isArea = period.range === '1m' || period.range === '7d'
  const { series: trend } = useTrend(data, period, settings.grain)

  /* The shape of the days that have happened. */
  const facts = useMemo(() => {
    if (!isArea) return []
    const lived = data.lived
    const days = lived.length
    if (!days || !data.expenses.length) return []
    const peak = lived.reduce((b, d) => (d.expense > b.expense ? d : b), lived[0])
    const quiet = lived.filter(d => d.expense === 0).length
    const byDow = [0, 0, 0, 0, 0, 0, 0]
    for (const t of data.expenses) byDow[new Date(t.date).getDay()] += txBase(t)
    const heaviest = byDow.indexOf(Math.max(...byDow))
    return [
      { label: 'Average day', value: fmtCompact(data.totalSpent / days) },
      { label: 'Biggest day', value: peak.expense > 0 ? `${peak.label} · ${fmtCompact(peak.expense)}` : 'None' },
      { label: 'No-spend days', value: `${quiet} of ${days}` },
      { label: 'Busiest weekday', value: WEEKDAYS[heaviest] },
    ]
  }, [isArea, data.lived, data.expenses, data.totalSpent])

  const net = data.totalEarned - data.totalSpent
  const prev = data.previous
  const tune = (
    <IconButton label="Trend settings" onClick={() => navigate(TREND_SETTINGS_PATH)}>
      <Sliders04 size={18} strokeWidth={1.8} aria-hidden="true" />
    </IconButton>
  )

  return (
    <SubPage title="Trend" onBack={back} action={tune}>
      <div className={arrival}>
        <PeriodControls className="mb-6" />

        {data.loading || !ready ? <TrendSkeleton /> : (
          <SpendingTrend
            trend={trend}
            series={series}
            onSeries={setPicked}
            settings={settings}
            title={trendTitle(period)}
            animKey={`${period.range}-${period.month ?? ''}`}
          />
        )}

        {!data.loading && prev && (
          <section className="mt-8">
            <SectionHeading subtitle={`vs ${prev.label}`}>Compared with before</SectionHeading>
            <Card clip className="mx-5">
              <CompareRow label="Spent" now={data.totalSpent} before={prev.spent} goodWhenUp={false} />
              <Divider inset="row" />
              <CompareRow label="Came in" now={data.totalEarned} before={prev.earned} goodWhenUp />
              <Divider inset="row" />
              <CompareRow label="Net" now={net} before={prev.earned - prev.spent} goodWhenUp signed />
            </Card>
          </section>
        )}

        {!data.loading && facts.length > 0 && (
          <section className="mt-8">
            <SectionHeading>The shape of it</SectionHeading>
            <div className="px-5 grid grid-cols-2 gap-3">
              {facts.map(f => <Fact key={f.label} label={f.label} value={f.value} />)}
            </div>
          </section>
        )}

        {!data.loading && !isArea && data.multiBarData.length > 0 && (
          <section className="mt-8">
            <SectionHeading>{period.range === 'all' && !/\s/.test(data.multiBarData[0]?.label ?? '') ? 'Year by year' : 'Month by month'}</SectionHeading>
            <Card clip className="mx-5">
              {[...data.multiBarData].reverse().map((m, i, all) => (
                <div key={m.label}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="flex-1 min-w-0 text-13 font-medium text-slate-800 dark:text-white truncate">{m.label}</span>
                    <span className="text-right shrink-0">
                      <span className="block text-13 font-semibold text-slate-900 dark:text-white tabular-nums">{fmtCompact(m.expense)} spent</span>
                      <span className={`block text-11 tabular-nums ${m.income - m.expense >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {m.income - m.expense >= 0 ? '+' : '−'}{fmtCompact(Math.abs(m.income - m.expense))} net
                      </span>
                    </span>
                  </div>
                  {i < all.length - 1 && <Divider inset="row" />}
                </div>
              ))}
            </Card>
            <div className="mt-2">
              <SectionLabel inset="gutter" gap="none">Net is what came in, less what went out.</SectionLabel>
            </div>
          </section>
        )}
      </div>
    </SubPage>
  )
}
