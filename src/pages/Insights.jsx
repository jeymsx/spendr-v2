import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigationType } from 'react-router-dom'
import { addMonths, monthKeyOf, wrappedOnHome } from '../lib/recap'
import { changeOf, monthOfPeriod, periodPhrase, useInsightsState, usePeriod } from './insights/period'
import { useInsightsData } from './insights/useInsightsData'
import { useNetWorthSeries } from './insights/netWorth'
import { MonthNav, RangeChips } from './insights/PeriodBar'
import { CategoryLegend, DonutHero, StatPair } from './insights/Summary'
import Highlights, { shownHighlights } from './insights/Highlights'
import Explore from './insights/Explore'
import useForecast from '../hooks/useForecast'
import WrappedLink from './insights/WrappedLink'
import { beginReturn, trackScroll } from './insights/zoom'
import { useRecapMonth } from './recap/useRecapMonth'
import {
  DonutSkeleton, ExploreSkeleton, HighlightsSkeleton, LegendSkeleton, StatPairSkeleton,
} from './insights/Skeleton'

/* The pages the Explore cards open, fetched while this one is read, so a
   tap never waits on a download behind the card that is opening. */
function preloadPages() {
  for (const load of [
    () => import('./insights/TrendPage'), () => import('./insights/ExpensesPage'),
    () => import('./insights/AccountsPage'), () => import('./insights/NetWorthPage'),
    () => import('./insights/ForecastPage'),
  ]) load().catch(() => { /* offline and not cached yet: the tap will try again */ })
}

/**
 * Insights: where the money went, in the order you would ask.
 *
 * ── The flow ──
 *
 *   1. The donut - what the period cost, by category, and how that compares
 *      with before - then Income and Net beside each other, then the key to
 *      the donut, each category a way to its own page.
 *   2. Highlights - small true things about the period, to swipe through.
 *   3. Explore - Trend, Top expenses, By account and Net worth as four
 *      cards, each with its one figure worth knowing, each opening a page
 *      with room for the rest (insights/*Page.jsx).
 *   4. The month's Wrapped, as one slim way in at the foot.
 *
 * It was eight sections of equal weight under one another, three screens
 * long: a headline and a donut that both said "Total spent", a random fact
 * between them, the Wrapped card in the middle, and a second set of range
 * chips half way down that meant something different from the first. It is
 * about a screen and a half now, with one set of controls at the top.
 *
 * ── Back puts you where you were ──
 *
 * The period is shared with the pages the cards open (insights/period.js),
 * and so is how far down this page was: Back from Trend lands on the same
 * month, scrolled to the same place, and the page closes back into the card
 * you left through (insights/zoom.js).
 */
export default function Insights() {
  const { period, setRange, setMonth } = usePeriod()
  const kept = useInsightsState()
  const data = useInsightsData(period)
  const netWorth = useNetWorthSeries(kept.net)
  // The Next 30 days card - the same walk Home's card and the Forecast page read.
  const { forecast } = useForecast(30)
  const month = period.range === '1m' ? monthOfPeriod(period) : null
  // The Wrapped link follows the month arrows when they point at a finished month.
  const recapMonth = useRecapMonth(month)
  /* The forecast card is part of Explore's height, so the page counts as
     loaded only once it is in - otherwise a restored scroll lands short. */
  const loading = data.loading || !forecast

  /* Recharts restarts a series' animation when its key changes, and the
     gradient ids are namespaced with it so two periods never collide. */
  const animKey = `${period.range}-${month ?? ''}`
  // A slice picked in one period is not a slice of the next.
  const [pick, setPick] = useState({ key: animKey, i: /** @type {number|null} */ (null) })
  const selected = pick.key === animKey ? pick.i : null

  // ── Back from a page this one opened ──
  const back = useNavigationType() === 'POP'
  const firstBack = useRef(back)
  const returning = useRef(/** @type {ReturnType<typeof beginReturn>} */ (null))
  const tracker = useRef(/** @type {ReturnType<typeof trackScroll>|null} */ (null))
  const restored = useRef(false)
  useLayoutEffect(() => {
    // Before the first paint: the screen stays covered until the page is back in place.
    returning.current = beginReturn(firstBack.current)
    tracker.current = trackScroll()
    if (restored.current) tracker.current.ready()
    preloadPages()
    return () => {
      returning.current?.cancel()
      returning.current = null
      tracker.current?.stop()
      tracker.current = null
    }
  }, [])
  /* Put back once everything that has height is in - the Wrapped link at
     the foot included, or the page is too short to scroll as far as it was. */
  const settled = !loading && recapMonth !== undefined
  useEffect(() => {
    if (!settled || restored.current) return
    restored.current = true
    const saved = kept.scroll
    const main = document.getElementById('app-main')
    if (firstBack.current && main && saved > 0) main.scrollTop = saved
    const landing = returning.current
    returning.current = null
    // Two frames: past the scroll events of the reset and of the restore.
    requestAnimationFrame(() => requestAnimationFrame(() => tracker.current?.ready()))
    /* At once, not a frame later: a Back closing through the View Transitions
       API holds the screen until this names the card, and while it does the
       browser runs no frames. The surface waits its frame by itself. */
    if (landing) landing.land()
  }, [settled, kept.scroll])

  const showWrapped = !!recapMonth && !(wrappedOnHome() && recapMonth === addMonths(monthKeyOf(new Date()), -1))
  const highlights = shownHighlights(data.trivia)

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 80px)' }}>
      <header className="px-5 pt-safe-header pb-2 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Insights</h1>
        <RangeChips range={period.range} onRange={setRange} />
      </header>

      {month && <MonthNav month={month} onMonth={setMonth} className="mt-4 pb-1" />}

      <div className="flex flex-col pt-4 pb-8">
        {loading ? <DonutSkeleton /> : (
          <DonutHero
            segments={data.categorySegments}
            total={data.totalSpent}
            animKey={animKey}
            selected={selected}
            onSelect={(i) => setPick({ key: animKey, i })}
            change={data.previous ? changeOf(data.totalSpent, data.previous.spent) : null}
            compareLabel={data.previous?.label ?? null}
            emptyPhrase={periodPhrase(period)}
          />
        )}

        <div className="mt-4">
          {loading ? <StatPairSkeleton /> : <StatPair income={data.totalEarned} spent={data.totalSpent} />}
        </div>

        {(loading || data.categorySegments.length > 0) && (
          <div className="mt-4">
            {loading ? <LegendSkeleton /> : <CategoryLegend segments={data.categorySegments} selected={selected} />}
          </div>
        )}

        {loading ? <div className="mt-8"><HighlightsSkeleton /></div> : highlights.length > 0 && (
          <div className="mt-8"><Highlights items={highlights} /></div>
        )}

        <div className="mt-8">
          {loading ? <ExploreSkeleton /> : <Explore data={data} range={period.range} netWorth={netWorth} forecast={forecast} />}
        </div>

        {!loading && showWrapped && (
          <div className="mt-6"><WrappedLink month={recapMonth} /></div>
        )}
      </div>
    </div>
  )
}
