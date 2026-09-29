import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sliders04 } from '@untitledui/icons'
import SubPage from '../../components/SubPage'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import Button from '../../components/ui/Button'
import IconButton from '../../components/ui/IconButton'
import EmptyState from '../../components/ui/EmptyState'
import SectionLabel from '../../components/ui/SectionLabel'
import SectionHeading from '../../components/ui/SectionHeading'
import DetailRow from '../../components/ui/DetailRow'
import RollingNumber from '../../components/ui/RollingNumber'
import { SkeletonHero } from '../../components/ui/Skeleton'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import useForecast from '../../hooks/useForecast'
import db from '../../db/db'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { fmt, fmtCompact } from '../../lib/money'
import { FORECAST_SETTINGS_PATH } from '../../lib/forecast'
import { onDay } from '../../lib/dayWords'
import { TrendRangeChips } from '../accounts/Trend'
import { UpcomingRow, toUpcomingItem } from '../dashboard/Upcoming'
import { ForecastChart } from './Charts'
import { NetWorthSkeleton } from './Skeleton'
import { AHEAD_RANGES, setInsights, useInsightsState } from './period'
import { useArrival, useZoomBack } from './zoom'
import FloorSheet from './FloorSheet'

const DAY_LABEL = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })
/** "Sep 14". @param {Date} d */
const short = (d) => DAY_LABEL.format(d)

/**
 * What happens to your money from here.
 *
 * The one page on Insights that looks forward, so like Net worth it keeps a
 * range of its own and ignores the page's period - a forecast cannot follow
 * the month arrows back to August.
 *
 * Top to bottom it answers three questions, in the order people ask them:
 *
 *   Can I spend today?   Safe to spend, and what it is safe until.
 *   When is it tight?    The line, the floor on it, the tightest day.
 *   What makes it so?    Every bill, payday and payment ahead, by day.
 *
 * Nothing on it is typed in here except the floor - everything comes from
 * Recurring, your loans, your debts, your cards and the pay your history
 * shows (lib/forecast.js), which is what keeps it honest: there is no second
 * list to forget to update. How it is worked out and drawn is the settings
 * page behind the sliders at the top right (ForecastSettings.jsx).
 */
export default function ForecastPage() {
  const back = useZoomBack('/insights')
  const navigate = useNavigate()
  const base = useBaseCurrency()
  const kept = useInsightsState()
  const range = AHEAD_RANGES.find(r => r.key === kept.ahead) ?? AHEAD_RANGES[0]
  /* How much of the past leads into the projection: about a third of the
     chart, so today sits left of centre and most of the width is ahead. */
  const { forecast, floor, settings } = useForecast(range.days, Math.min(60, Math.max(14, Math.round(range.days / 3))))
  /* The likely range is a setting, and has nothing to draw around a figure
     you set yourself - that is what you said, not a guess from weeks that vary. */
  const showBand = settings.band && settings.spend !== 'custom'
  // Grown out of its card once its figures are in (zoom.js).
  const arrival = useArrival(!!forecast)
  const [floorOpen, setFloorOpen] = useState(false)

  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])
  const catMap = useMemo(() => Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])
  const acctByName = useMemo(() => Object.fromEntries((accounts ?? []).map(a => [a.name, a])), [accounts])

  /* One row per day, past then ahead. The past carries `past`, the days ahead
     `value` and `band`; today carries both, so the solid line and the dashed
     one meet on it. */
  const data = useMemo(() => {
    if (!forecast) return []
    const past = (forecast.past ?? []).slice(0, -1).map(d => ({ day: short(d.date), iso: d.iso, past: d.balance }))
    const ahead = forecast.days.map((d, i) => ({
      day: i === 0 ? 'Today' : short(d.date), iso: d.iso, value: d.balance,
      // The likely range is a setting; without it the line stands alone.
      ...(showBand ? { band: /** @type {[number, number]} */ ([d.low, d.high]) } : {}),
      ...(i === 0 ? { past: forecast.start } : {}),
    }))
    return [...past, ...ahead]
  }, [forecast, showBand])
  const todayIndex = Math.max(0, (forecast?.past?.length ?? 1) - 1)

  /* The events, by day, the way Transactions groups the past - a heading and
     a hairline, then one card for the day. */
  const byDay = useMemo(() => {
    const groups = []
    for (const e of forecast?.events ?? []) {
      const key = e.date.toDateString()
      let g = groups[groups.length - 1]
      if (!g || g.key !== key) { g = { key, date: e.date, items: [] }; groups.push(g) }
      g.items.push(toUpcomingItem(e, catMap, acctByName))
    }
    return groups
  }, [forecast, catMap, acctByName])

  const tune = (
    <IconButton label="Forecast settings" onClick={() => navigate(FORECAST_SETTINGS_PATH)}>
      <Sliders04 size={18} strokeWidth={1.8} aria-hidden="true" />
    </IconButton>
  )

  if (!forecast) {
    return (
      <SubPage title="Forecast" onBack={back} action={tune}>
        <div className={arrival}>
          <SkeletonHero className="mb-6" />
          <NetWorthSkeleton chips={AHEAD_RANGES.length} />
        </div>
      </SubPage>
    )
  }

  const low = forecast.lowest
  const neg = forecast.firstNegative
  const under = forecast.firstBelowFloor
  const until = forecast.safeUntil ? `Until payday, ${short(forecast.safeUntil)}` : 'For the next 2 weeks'
  const color = neg ? '#ef4444' : under ? '#f59e0b' : '#10b981'
  /* Occasional income is in the walk a day at a time, so it is in the pay
     too: switched on, it raised the projection while this row, and Pay
     ahead in the settings, left it out. */
  const occasional = forecast.dailyIncome > 0 ? Math.round(forecast.dailyIncome * forecast.horizonDays * 100) / 100 : 0
  const payAhead = forecast.events.filter(e => e.kind === 'income' && e.counted).reduce((s, e) => s + e.amount, 0) + occasional
  const learned = forecast.streams.length > 0
  const paySource = !forecast.hasIncome
    ? (settings.income === 'recurring' ? 'None on Recurring yet' : 'None found yet')
    : learned && settings.income === 'history' ? 'Found in your history'
      : learned ? 'Recurring, and found in your history' : 'From Recurring'
  const paySub = !occasional ? paySource
    : forecast.hasIncome ? `${paySource}, and occasional income` : 'Occasional income, spread out'
  const spendSub = settings.spend === 'custom' ? 'Set by you'
    : settings.spend === 'cautious' ? 'A busier week than usual, per day' : 'Your usual week, per day'
  const tuneIt = () => navigate(FORECAST_SETTINGS_PATH)

  return (
    <SubPage title="Forecast" onBack={back} action={tune}>
      <div className={arrival}>
        {/* ── Can I spend today? ── */}
        <section className="px-5 text-center">
          <SectionLabel inset="none">Safe to spend</SectionLabel>
          <p className="mt-2 text-38 leading-none font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
            <RollingNumber id="forecast:safe" value={forecast.safeToSpend} format={v => fmt(v, base)} />
          </p>
          <p className="mt-2 text-13 text-slate-500 dark:text-slate-400">
            {until}{floor > 0 ? `, above your ${fmtCompact(floor, base)} floor` : ''}
          </p>
        </section>

        {/* ── When is it tight? ── */}
        <section className="mt-6">
          <ForecastChart
            data={data} todayIndex={todayIndex} color={color} currency={base} rangeKey={range.key}
            floor={floor} lowest={low} band={showBand}
          />
          <div className="mt-2.5 px-5">
            <TrendRangeChips range={range.key} onRange={(key) => setInsights({ ahead: key })} ranges={AHEAD_RANGES} />
          </div>
          <div className="mt-4 px-5 text-center">
            <p className="text-13 text-slate-600 dark:text-slate-300 tabular-nums">
              Tightest day: <span className="font-semibold">{low.iso === forecast.days[0]?.iso ? 'today' : short(low.date)}</span>
              {' at '}<span className="font-semibold">{fmt(low.balance, base)}</span>
            </p>
            {neg ? (
              <p className="mt-1 text-13 font-semibold text-red-500 dark:text-red-400">
                You run out {onDay(neg.date)}
              </p>
            ) : under ? (
              <p className="mt-1 text-13 font-semibold text-amber-600 dark:text-amber-400">
                {under.iso === forecast.days[0]?.iso ? 'Below your floor today' : `Drops below your floor ${onDay(under.date)}`}
              </p>
            ) : null}
          </div>
        </section>

        {/* ── What goes into it ── */}
        <section className="mt-7 px-5">
          <Card clip>
            <DetailRow
              label="Starting from"
              value={fmt(forecast.start, base)}
              sub={settings.savings ? 'Cash and banks, less cards' : 'Spending accounts, less cards'}
            />
            <Tunable onOpen={tuneIt}>
              <DetailRow
                label="Pay"
                value={payAhead > 0 ? `+${fmt(payAhead, base)}` : 'None'}
                sub={paySub}
              />
            </Tunable>
            <Tunable onOpen={tuneIt}>
              <DetailRow
                label="Everyday spending"
                value={forecast.dailySpend ? `${fmt(forecast.dailySpend, base)} a day` : settings.spend === 'custom' ? 'None' : 'Not yet'}
                sub={forecast.dailySpend || settings.spend === 'custom' ? spendSub : 'Needs a few weeks of spending'}
              />
            </Tunable>
            <button
              type="button"
              onClick={() => setFloorOpen(true)}
              className="w-full text-left active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
            >
              <DetailRow
                label="Floor"
                value={floor > 0 ? fmt(floor, base) : 'None'}
                sub="The least you want to keep. Tap to change"
                isLast
              />
            </button>
          </Card>
          {!forecast.hasIncome && (
            <Card padding="md" className="mt-3">
              <p className="text-13 text-slate-600 dark:text-slate-300">
                {settings.income === 'recurring'
                  ? 'Your pay is not on Recurring yet, so the forecast only sees what goes out.'
                  : 'No regular pay in your history or on Recurring yet, so the forecast only sees what goes out.'}
              </p>
              <Button variant="tint" size="sm" className="mt-3 px-4" onClick={() => navigate('/recurring/new?type=income')}>
                Add your payday
              </Button>
            </Card>
          )}
        </section>

        {/* ── Every event ahead, by day ── */}
        <section className="mt-8">
          <SectionHeading>Coming up</SectionHeading>
          {byDay.length === 0 ? (
            <EmptyState
              art="calendar"
              size="sm"
              title="Nothing scheduled"
              body="Bills and pay on Recurring show up here."
            />
          ) : byDay.map(g => (
            <div key={g.key} className="pb-1">
              <div className="flex items-center gap-3 px-5 py-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {g.date.toDateString() === new Date().toDateString() ? 'Today' : g.date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                <Divider className="flex-1" />
                <span className="text-11 text-slate-400 dark:text-slate-500 tabular-nums">
                  {signedSum(g.items, base)}
                </span>
              </div>
              <Card clip className="mx-5">
                {g.items.map((item, i) => (
                  <UpcomingRow key={item.key} item={item} isLast={i === g.items.length - 1} />
                ))}
              </Card>
            </div>
          ))}
        </section>
      </div>

      <FloorSheet open={floorOpen} onClose={() => setFloorOpen(false)} floor={floor} currency={base} />
    </SubPage>
  )
}

/**
 * A row of "What goes into it" that opens the settings behind it.
 * @param {{onOpen: () => void, children: import('react').ReactNode}} props
 */
function Tunable({ onOpen, children }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
    >
      {children}
    </button>
  )
}

/** A day's net movement, for its heading. What is not counted - a card's due
 *  date, pay not yet marked - is left out, as the line leaves it out.
 *  @param {Array<Record<string, any>>} items @param {string} cur */
function signedSum(items, cur) {
  const net = items.reduce((s, it) => s + (it.counted ? it.sign * it.amount : 0), 0)
  if (Math.abs(net) < 0.005) return ''
  return `${net > 0 ? '+' : '−'}${fmtCompact(Math.abs(net), cur)}`
}
