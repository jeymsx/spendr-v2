import { Activity, ArrowDownLeft, ArrowUpRight, Dotpoints01, Minus, Scales02 } from '@untitledui/icons'
import SubPage from '../../components/SubPage'
import Card from '../../components/ui/Card'
import Segmented from '../../components/ui/Segmented'
import Switch from '../../components/ui/Switch'
import Skeleton from '../../components/ui/Skeleton'
import { useBack } from '../../hooks/useBack'
import useTrendSettings, { saveTrendSettings } from '../../hooks/useTrendSettings'
import { TREND_SERIES } from '../../lib/trendSettings'
import { RowDivider, RowIcon, SectionCard, SectionHeader, SettingsRow } from '../settings/shared'
import { TREND_HEIGHT, TREND_NAMES, TrendChart } from './Charts'
import { usePeriod } from './period'
import { TrendEmpty, trendTitle } from './Trend'
import { useTrend } from './trendData'
import { useInsightsData } from './useInsightsData'

/** An Untitled UI glyph at the settings rows' size and weight. @param {import('react').ComponentType<any>} Cmp */
const ico = (Cmp) => <Cmp size={18} strokeWidth={1.8} aria-hidden="true" />

/** What each line is, and the tile it sits on - the colours the chart draws them in. */
const LINES = /** @type {const} */ ({
  expenses: { color: 'red', icon: ArrowUpRight, note: 'Money going out' },
  income: { color: 'green', icon: ArrowDownLeft, note: 'Money coming in' },
  netflow: { color: 'blue', icon: Scales02, note: 'Income less expenses' },
})

/**
 * How the Trend chart is drawn: a line, a line with a fill, or bars; which of
 * its lines are on; how much time a point covers; and the small things - a
 * curve, a dot on every point, a line at the average.
 *
 * The chart at the top is the Trend chart itself, for the period Insights is
 * on, so every change shows at once and nothing is a promise to go and check.
 * Each change saves as it is made, and travels to the other devices
 * (lib/trendSettings.js).
 */
export default function TrendSettings() {
  const back = useBack('/insights/trend')
  const { settings, ready } = useTrendSettings()
  const { period } = usePeriod()
  const data = useInsightsData(period)
  const { series: trend } = useTrend(data, period, settings.grain)
  const drawn = settings.series.some(k => trend[k].some(p => p.value != null && p.value !== 0))

  const set = (/** @type {Partial<import('../../lib/trendSettings').TrendSettings>} */ patch) => {
    saveTrendSettings(patch).catch(e => console.error('[TrendSettings] save failed:', e))
  }
  /* One line always stays on: the last switch cannot be turned off. */
  const lineOn = (/** @type {import('../../lib/trendSettings').TrendSeriesKey} */ key, /** @type {boolean} */ on) => {
    set({ series: TREND_SERIES.filter(k => (k === key ? on : settings.series.includes(k))) })
  }

  return (
    <SubPage title="Trend settings" onBack={back}>
      {/* ── The chart, as it will be drawn ── */}
      <section className="px-5">
        <Card className="pt-4 pb-3">
          <p className="px-5 mb-2 text-12 font-semibold text-slate-500 dark:text-slate-400">{trendTitle(period)}</p>
          {data.loading || !ready
            ? <div className="px-5"><Skeleton className="rounded-2xl" style={{ height: TREND_HEIGHT }} /></div>
            : drawn
              ? <TrendChart trend={trend} series={settings.series} settings={settings} animKey={`${period.range}|${settings.series.join()}|${settings.chart}|${settings.grain}`} />
              : <TrendEmpty kind={settings.series.length === 1 ? settings.series[0] : 'netflow'} height={TREND_HEIGHT} />}
        </Card>
      </section>

      {/* ── How it is drawn ── */}
      <div className="mt-7">
        <SectionHeader>Chart</SectionHeader>
        <div className="mx-5">
          <Segmented
            options={[
              { value: 'line', label: 'Line' },
              { value: 'area', label: 'Area' },
              { value: 'bars', label: 'Bars' },
            ]}
            value={settings.chart}
            onChange={(/** @type {any} */ v) => set({ chart: v })}
          />
        </div>
      </div>

      {/* ── Which lines ── */}
      <div className="mt-7">
        <SectionHeader>Shows</SectionHeader>
        <SectionCard>
          {TREND_SERIES.map((key, i) => {
            const on = settings.series.includes(key)
            const line = LINES[key]
            return (
              <div key={key}>
                {i > 0 && <RowDivider />}
                <SettingsRow
                  iconEl={<RowIcon color={line.color}>{ico(line.icon)}</RowIcon>}
                  label={TREND_NAMES[key]}
                  sublabel={line.note}
                  right={<Switch on={on} disabled={on && settings.series.length === 1} onChange={v => lineOn(key, v)} label={TREND_NAMES[key]} />}
                />
              </div>
            )
          })}
        </SectionCard>
        <p className="mt-3 px-5 text-12 text-slate-500 dark:text-slate-400">Turn on more than one to compare them.</p>
      </div>

      {/* ── How much time a point covers ── */}
      <div className="mt-7">
        <SectionHeader>One point per</SectionHeader>
        <div className="mx-5">
          <Segmented
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
            value={settings.grain}
            onChange={(/** @type {any} */ v) => set({ grain: v })}
          />
          <p className="mt-2 px-1 text-12 text-slate-500 dark:text-slate-400">Auto: days up to 1M, then months.</p>
        </div>
      </div>

      {/* ── The small things ── */}
      <div className="mt-7">
        <SectionHeader>Details</SectionHeader>
        <SectionCard>
          {settings.chart !== 'bars' && (
            <>
              <SettingsRow
                iconEl={<RowIcon color="blue">{ico(Activity)}</RowIcon>}
                label="Curved line"
                sublabel="Round off the corners"
                right={<Switch on={settings.smooth} onChange={v => set({ smooth: v })} label="Curved line" />}
              />
              <RowDivider />
              <SettingsRow
                iconEl={<RowIcon color="violet">{ico(Dotpoints01)}</RowIcon>}
                label="Dots"
                sublabel="A dot on every point"
                right={<Switch on={settings.points} onChange={v => set({ points: v })} label="Dots" />}
              />
              <RowDivider />
            </>
          )}
          <SettingsRow
            iconEl={<RowIcon color="amber">{ico(Minus)}</RowIcon>}
            label="Average"
            sublabel="A dashed line across it"
            right={<Switch on={settings.average} onChange={v => set({ average: v })} label="Average" />}
          />
        </SectionCard>
        <p className="mt-3 px-5 text-12 text-slate-500 dark:text-slate-400">
          These follow you to your other devices.
        </p>
      </div>
    </SubPage>
  )
}
