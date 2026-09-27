import { useMemo, useSyncExternalStore } from 'react'
import { localMonthStartIso } from '../../utils/txDate'
import { addMonths, monthKeyOf, parseMonth } from '../../lib/recap'

/**
 * What Insights is looking at: a stretch of time, the stretch before it, and
 * where you were on the page.
 *
 * ── One period, shared by the page and its subpages ──
 *
 * Insights is an overview now, and Trend, Top expenses and By account are
 * pages of their own, opened from it. They all look at the same stretch of
 * time, so it lives here rather than in any one of them: pick August on the
 * overview and the Trend page opens on August; move to July on the Trend page
 * and Back finds the overview on July too.
 *
 * Not in the address. A page's URL is fixed in its history entry, so a period
 * changed on the Trend page could never reach the overview's entry below it -
 * Back would land on the month you had already left. A store both read is
 * the one place a change can be seen from either side.
 *
 * Kept in sessionStorage, so it survives a reload and an iPhone putting the
 * app away, and is gone when the app is closed: opening Insights fresh
 * starts on this month, as it always has.
 *
 * ── The month is `null` for "this month" ──
 *
 * Not today's key. A phone left on Insights overnight on the 30th should show
 * the new month in the morning, and "this month" is what was chosen.
 */

export const RANGES = [
  { key: '7d',  label: '7D'  },
  { key: '1m',  label: '1M'  },
  { key: '3m',  label: '3M'  },
  { key: '6m',  label: '6M'  },
  { key: 'all', label: 'All' },
]
const RANGE_KEYS = RANGES.map(r => r.key)

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * @typedef {{range: string, month: string|null}} Period
 * @typedef {object} Window
 * @property {string} start   the first instant, as an ISO string
 * @property {string} end     the instant after the last
 * @property {number|null} year   a 1M window's year and month (0-11); null otherwise
 * @property {number|null} month
 * @property {number} days     a 1M window's length in days, or 7; 0 for the longer ranges
 * @property {number} elapsed  how many of those days have happened
 * @property {boolean} running whether it reaches today
 */

/** The month a 1M period shows: its own when that is before this one, else this one. @param {Period} period @param {Date} [now] */
export function monthOfPeriod(period, now = new Date()) {
  const current = monthKeyOf(now)
  const m = period.month
  return typeof m === 'string' && /^\d{4}-\d{2}$/.test(m) && m < current ? m : current
}

/**
 * The instants a period covers - local midnights, as the ledger's `date`
 * index is compared against them (utils/txDate.js says why not dates).
 *
 * @param {Period} period @param {Date} [now]
 * @returns {Window}
 */
export function periodWindow(period, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
  if (period.range === '7d') {
    return {
      start: new Date(y, m, d - 6).toISOString(), end: new Date(y, m, d + 1).toISOString(),
      year: null, month: null, days: 7, elapsed: 7, running: true,
    }
  }
  if (period.range === '1m') {
    const key = monthOfPeriod(period, now)
    const { year, month } = parseMonth(key)
    const days = new Date(year, month + 1, 0).getDate()
    const running = key === monthKeyOf(now)
    return {
      start: localMonthStartIso(year, month), end: localMonthStartIso(year, month + 1),
      year, month, days, elapsed: running ? d : days, running,
    }
  }
  if (period.range === 'all') {
    return { start: '2000-01-01', end: '2100-01-01', year: null, month: null, days: 0, elapsed: 0, running: true }
  }
  const n = period.range === '3m' ? 3 : 6
  return {
    start: localMonthStartIso(y, m - (n - 1)), end: localMonthStartIso(y, m + 1),
    year: null, month: null, days: 0, elapsed: 0, running: true,
  }
}

/**
 * The stretch to compare with, and what to call it.
 *
 * A week against the week before ("last week", short enough for the middle
 * of the donut). A month against the month before - and
 * while this month is still running, only as far into last month as this
 * one has got, or the 27th of September would be measured against the whole
 * of August and every month would look cheap until its last day.
 *
 * The longer ranges have none. Three months against the three before are
 * two different seasons, and the Trend page draws them month by month anyway.
 *
 * @param {Period} period @param {Date} [now]
 * @returns {{start: string, end: string, label: string}|null}
 */
export function previousWindow(period, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
  if (period.range === '7d') {
    return { start: new Date(y, m, d - 13).toISOString(), end: new Date(y, m, d - 6).toISOString(), label: 'last week' }
  }
  if (period.range !== '1m') return null
  const key = monthOfPeriod(period, now)
  const { year, month } = parseMonth(addMonths(key, -1))
  const length = new Date(year, month + 1, 0).getDate()
  const upTo = key === monthKeyOf(now) ? Math.min(d, length) : length
  return {
    start: localMonthStartIso(year, month),
    end: new Date(year, month, upTo + 1).toISOString(),
    label: upTo >= length ? MONTHS_SHORT[month] : `${MONTHS_SHORT[month]} 1–${upTo}`,
  }
}

/**
 * How a figure moved against the one before, or null when there is nothing
 * to measure it against. `pct` is whole and never negative; `up` says which
 * way. Under half a percent either way is the same.
 *
 * @param {number} now @param {number} before
 * @returns {{pct: number, up: boolean, same: boolean}|null}
 */
export function changeOf(now, before) {
  if (!(before > 0) || !Number.isFinite(now)) return null
  const pct = ((now - before) / before) * 100
  return { pct: Math.min(999, Math.round(Math.abs(pct))), up: pct > 0, same: Math.abs(pct) < 0.5 }
}

/**
 * The period in words, for a subpage's title line and an empty state:
 * "September", "September 2025", "the last 7 days".
 *
 * @param {Period} period @param {Date} [now]
 */
export function periodName(period, now = new Date()) {
  if (period.range === '7d') return 'the last 7 days'
  if (period.range === '3m') return 'the last 3 months'
  if (period.range === '6m') return 'the last 6 months'
  if (period.range === 'all') return 'all time'
  const { year, month } = parseMonth(monthOfPeriod(period, now))
  return year === now.getFullYear() ? MONTHS[month] : `${MONTHS[month]} ${year}`
}

/** "in September", "this month", "in the last 7 days" - for "No expenses …". @param {Period} period @param {Date} [now] */
export function periodPhrase(period, now = new Date()) {
  if (period.range === '1m' && monthOfPeriod(period, now) === monthKeyOf(now)) return 'this month'
  if (period.range === 'all') return 'yet'
  return `in ${periodName(period, now)}`
}

// ── The store ────────────────────────────────────────────────────────────

const KEY = 'spendr-insights'

/**
 * @typedef {object} InsightsState
 * @property {string} range
 * @property {string|null} month   null for this month
 * @property {string} net          the net worth chart's own range
 * @property {number} scroll       how far down the overview was when you left it
 */

/** @type {InsightsState} */
const DEFAULTS = { range: '1m', month: null, net: '6m', scroll: 0 }
const NET_KEYS = ['1m', '3m', '6m', '1y', 'all']

/** @returns {InsightsState} */
function load() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
    if (raw && typeof raw === 'object') {
      return {
        range: RANGE_KEYS.includes(raw.range) ? raw.range : DEFAULTS.range,
        month: typeof raw.month === 'string' ? raw.month : null,
        net: NET_KEYS.includes(raw.net) ? raw.net : DEFAULTS.net,
        scroll: Number.isFinite(raw.scroll) ? raw.scroll : 0,
      }
    }
  } catch { /* nothing kept yet, or storage refused: start fresh */ }
  return DEFAULTS
}

let state = load()
const listeners = new Set()

/**
 * @param {Partial<InsightsState>} patch
 * @param {boolean} [quiet]  keep it without telling anyone: the scroll
 *   position is written as a page is left, and nothing should re-render
 *   for it, least of all the page being unmounted
 */
export function setInsights(patch, quiet = false) {
  state = { ...state, ...patch }
  try { sessionStorage.setItem(KEY, JSON.stringify(state)) } catch { /* a private window: fine, just not kept */ }
  if (!quiet) for (const l of listeners) l()
}

/** @param {() => void} l */
function subscribe(l) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
const snapshot = () => state

/** Everything kept, live. */
export function useInsightsState() {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/**
 * The period, and the two ways to change it. A range other than 1M forgets
 * the month, as the page always has: coming back to 1M starts on this month.
 */
export function usePeriod() {
  const s = useInsightsState()
  const period = useMemo(() => ({ range: s.range, month: s.range === '1m' ? s.month : null }), [s.range, s.month])
  return {
    period,
    /** @param {string} range */
    setRange: (range) => setInsights({ range, month: range === '1m' ? state.month : null }),
    /** @param {string|null} month "2026-08", or null for this month */
    setMonth: (month) => setInsights({ month: month && month < monthKeyOf(new Date()) ? month : null }),
  }
}

/** For tests: the store as it started. */
export function resetInsights() {
  state = DEFAULTS
  try { sessionStorage.removeItem(KEY) } catch { /* as above */ }
  for (const l of listeners) l()
}
