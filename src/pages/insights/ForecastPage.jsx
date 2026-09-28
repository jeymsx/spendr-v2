import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SubPage from '../../components/SubPage'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import MoneyField from '../../components/ui/MoneyField'
import SectionLabel from '../../components/ui/SectionLabel'
import SectionHeading from '../../components/ui/SectionHeading'
import DetailRow from '../../components/ui/DetailRow'
import RollingNumber from '../../components/ui/RollingNumber'
import { SkeletonHero } from '../../components/ui/Skeleton'
import { useBack } from '../../hooks/useBack'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import useForecast, { saveFloor } from '../../hooks/useForecast'
import db from '../../db/db'
import { useToast } from '../../context/ToastContext'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { fmt, fmtCompact } from '../../lib/money'
import { moneyChangeHandler, numToMoneyStr, parseMoney } from '../../utils/moneyInput'
import { TrendRangeChips } from '../accounts/Trend'
import { UpcomingRow, toUpcomingItem } from '../dashboard/Upcoming'
import { ForecastChart } from './Charts'
import { NetWorthSkeleton } from './Skeleton'
import { AHEAD_RANGES, setInsights, useInsightsState } from './period'
import { useArrival } from './zoom'

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
 * Recurring, your loans, your debts and your cards (lib/forecast.js), which
 * is what keeps it honest: there is no second list to forget to update.
 */
export default function ForecastPage() {
  const arrival = useArrival()
  const back = useBack('/insights')
  const navigate = useNavigate()
  const base = useBaseCurrency()
  const kept = useInsightsState()
  const range = AHEAD_RANGES.find(r => r.key === kept.ahead) ?? AHEAD_RANGES[0]
  /* How much of the past leads into the projection: about a third of the
     chart, so today sits left of centre and most of the width is ahead. */
  const { forecast, floor } = useForecast(range.days, Math.min(60, Math.max(14, Math.round(range.days / 3))))
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
      band: /** @type {[number, number]} */ ([d.low, d.high]),
      ...(i === 0 ? { past: forecast.start } : {}),
    }))
    return [...past, ...ahead]
  }, [forecast])
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

  if (!forecast) {
    return (
      <SubPage title="Forecast" onBack={back}>
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

  return (
    <SubPage title="Forecast" onBack={back}>
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
            floor={floor} lowest={low}
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
                You run out on {short(neg.date)}
              </p>
            ) : under ? (
              <p className="mt-1 text-13 font-semibold text-amber-600 dark:text-amber-400">
                Drops below your floor on {short(under.date)}
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
              sub="Cash and banks, less cards"
            />
            <DetailRow
              label="Everyday spending"
              value={forecast.dailySpend ? `${fmt(forecast.dailySpend, base)} a day` : 'Not yet'}
              sub={forecast.dailySpend ? 'Your usual week, per day' : 'Needs a few weeks of spending'}
            />
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
                Your pay is not on Recurring yet, so the forecast only sees what goes out.
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
            <p className="px-5 text-13 text-slate-500 dark:text-slate-400">
              Nothing scheduled. Add bills and your pay on Recurring and they show up here.
            </p>
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

/** A day's net movement, for its heading. What is not counted - a card's due
 *  date, pay not yet marked - is left out, as the line leaves it out.
 *  @param {Array<Record<string, any>>} items @param {string} cur */
function signedSum(items, cur) {
  const net = items.reduce((s, it) => s + (it.counted ? it.sign * it.amount : 0), 0)
  if (Math.abs(net) < 0.005) return ''
  return `${net > 0 ? '+' : '−'}${fmtCompact(Math.abs(net), cur)}`
}

/**
 * The floor: the balance you do not want to go below. The forecast warns
 * the day it would, and "safe to spend" leaves it untouched. Zero means none.
 */
function FloorSheet({ open, onClose, floor, currency }) {
  const { showToast } = useToast()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(floor > 0 ? numToMoneyStr(floor) : '')
  }, [open, floor])

  const save = async () => {
    setSaving(true)
    try {
      await saveFloor(parseMoney(value) || 0)
      onClose()
      showToast(parseMoney(value) > 0 ? 'Floor saved' : 'Floor removed')
    } catch (e) {
      console.error('[Forecast] floor save failed:', e)
      showToast('Could not save the floor', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!saving}
      title="Floor"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="flex-[2]" onClick={save} loading={saving} disabled={saving}>Save</Button>
        </div>
      }
    >
      <p className="text-13 text-slate-500 dark:text-slate-400 mb-4">
        The least you want to keep in cash and banks. The forecast warns you before you dip
        below it. Leave it empty for none.
      </p>
      <MoneyField value={value} onChange={moneyChangeHandler(setValue)} currency={currency} />
    </Sheet>
  )
}
