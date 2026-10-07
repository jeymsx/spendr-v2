import { useMemo } from 'react'
import { isoToDateInput } from '../../utils/txDate'
import { txBase } from '../../lib/fxContext'
import { MONTHS_SHORT } from './period'

/**
 * What the Trend chart draws, from the period's rows: one point per day, per
 * week or per month, as the Trend settings ask (lib/trendSettings.js), and
 * the three series - what went out, what came in, and the difference - over
 * those points.
 *
 * Kept apart from useInsightsData, which reads and sums the period once for
 * every page, so a change of how the Trend is cut cannot touch what the
 * overview or the Top expenses list say.
 */

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ORDER = ['day', 'week', 'month']

/**
 * What a range can be cut into. A week is only ever days; a month, days or
 * weeks; the longer ranges anything from a day to a month - except All, which
 * can run for years, and a point per day for years is not a chart anyone can
 * read.
 */
const ALLOWED = /** @type {Record<string, string[]>} */ ({
  '7d': ['day'],
  '1m': ['day', 'week'],
  '3m': ['day', 'week', 'month'],
  '6m': ['day', 'week', 'month'],
  all: ['week', 'month'],
})

/**
 * The grain a range is actually drawn at. "Auto" is what the Trend always
 * was: a day for 7D and 1M, a month for the longer ranges. A grain the range
 * cannot be cut into - a month of a month, a day of all time - is the nearest
 * one it can, so changing range never leaves the chart with nothing to draw.
 *
 * @param {string} range
 * @param {string} grain  'auto', 'day', 'week' or 'month'
 * @returns {'day'|'week'|'month'}
 */
export function grainFor(range, grain) {
  const allowed = ALLOWED[range] ?? ALLOWED['1m']
  if (!ORDER.includes(grain)) return range === '7d' || range === '1m' ? 'day' : 'month'
  if (allowed.includes(grain)) return /** @type {'day'|'week'|'month'} */ (grain)
  const at = ORDER.indexOf(grain)
  const nearest = allowed.reduce((best, g) => (Math.abs(ORDER.indexOf(g) - at) < Math.abs(ORDER.indexOf(best) - at) ? g : best), allowed[0])
  return /** @type {'day'|'week'|'month'} */ (nearest)
}

/**
 * One point before it is split into series. `tick` is what is written under
 * the axis, `label` what it is called when pointed at, `short` the bare date
 * a week's label is made from; `happened` is false for a day of a running
 * month that has not come yet.
 *
 * @typedef {{tick: string, label: string, short: string, expense: number, income: number, happened: boolean}} TrendRow
 *
 * One point of the chart: its figure is null for a day that has not happened,
 * which the chart leaves empty rather than drawing as a day of nothing.
 *
 * @typedef {{tick: string, label: string, value: number|null}} TrendPoint
 */

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
const keyOf = (/** @type {Date} */ d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dayStart = (/** @type {Date} */ d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const nextDay = (/** @type {Date} */ d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)

/**
 * A run of days as weeks of seven, counted from the first day - not from a
 * Monday, which would leave the first week of a period a stump and make its
 * line start with a dip that never happened. Only the last may be short.
 *
 * @param {TrendRow[]} days
 * @returns {TrendRow[]}
 */
function weeks(days) {
  const out = []
  for (let i = 0; i < days.length; i += 7) {
    const run = days.slice(i, i + 7)
    const first = run[0], last = run[run.length - 1]
    out.push({
      tick: first.tick,
      label: run.length === 1 ? first.short : `${first.short} – ${last.short}`,
      short: first.short,
      expense: run.reduce((s, d) => s + d.expense, 0),
      income: run.reduce((s, d) => s + d.income, 0),
      happened: run.some(d => d.happened),
    })
  }
  return out
}

/**
 * Every day from the start of the period to today, for the ranges whose rows
 * come only by the month.
 *
 * @param {{range: string, expenses: Array<Record<string, any>>, inflows: Array<Record<string, any>>, start: string}} p
 * @returns {TrendRow[]}
 */
function daysOfLongRange({ range, expenses, inflows, start }) {
  /** @type {Map<string, number>} */ const spent = new Map()
  /** @type {Map<string, number>} */ const earned = new Map()
  const add = (/** @type {Map<string, number>} */ m, /** @type {Record<string, any>} */ t) => {
    const k = isoToDateInput(t.date)
    if (k) m.set(k, (m.get(k) ?? 0) + txBase(t))
  }
  for (const t of expenses) add(spent, t)
  for (const t of inflows) add(earned, t)

  let first
  if (range === 'all') {
    const keys = [...spent.keys(), ...earned.keys()].sort()
    if (!keys.length) return []
    const [y, m, d] = keys[0].split('-').map(Number)
    first = new Date(y, m - 1, d)
  } else {
    first = dayStart(new Date(start))
  }
  const today = dayStart(new Date())
  // Past a year, "Aug 3" could be any of them: say which.
  const years = (today.getTime() - first.getTime()) / 864e5 > 365
  const out = []
  for (let d = first; d <= today; d = nextDay(d)) {
    const key = keyOf(d)
    const short = `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
    out.push({
      tick: years ? `${MONTHS_SHORT[d.getMonth()]} ’${pad(d.getFullYear() % 100)}` : short,
      label: `${DAYS_SHORT[d.getDay()]}, ${short}`,
      short,
      expense: spent.get(key) ?? 0,
      income: earned.get(key) ?? 0,
      happened: true,
    })
  }
  return out
}

/**
 * The period's points at a grain: the day-by-day rows for 7D and 1M, the
 * month-by-month ones for 3M and longer, and from either, weeks - or, for
 * the longer ranges, days.
 *
 * @param {{range: string, grain: string,
 *          daily: Array<{day: number|string, label: string, expense: number, income: number}>, lived: Array<unknown>,
 *          multiBarData: Array<{label: string, income: number, expense: number}>,
 *          expenses: Array<Record<string, any>>, inflows: Array<Record<string, any>>, start: string}} p
 * @returns {TrendRow[]}
 */
export function trendRows({ range, grain, daily, lived, multiBarData, expenses, inflows, start }) {
  const g = grainFor(range, grain)
  if (range === '7d' || range === '1m') {
    const days = daily.map((d, i) => ({
      tick: String(d.day), label: d.label, short: d.label, expense: d.expense, income: d.income, happened: i < lived.length,
    }))
    return g === 'week' ? weeks(days) : days
  }
  if (g === 'month') {
    return multiBarData.map(m => ({ tick: m.label, label: m.label, short: m.label, expense: m.expense, income: m.income, happened: true }))
  }
  const days = daysOfLongRange({ range, expenses, inflows, start })
  return g === 'week' ? weeks(days) : days
}

/**
 * The Trend chart's three series - what went out, what came in, and the
 * difference - over the same points, so any of them can be drawn over any
 * other.
 *
 * @param {TrendRow[]} rows
 * @returns {{expenses: TrendPoint[], income: TrendPoint[], netflow: TrendPoint[]}}
 */
export function trendSeries(rows) {
  const of = (/** @type {(r: TrendRow) => number} */ f) =>
    rows.map(r => ({ tick: r.tick, label: r.label, value: r.happened ? f(r) : null }))
  return {
    expenses: of(r => r.expense),
    income: of(r => r.income),
    netflow: of(r => r.income - r.expense),
  }
}

/**
 * The Trend's series for a period at the grain the settings ask for, and the
 * grain that was drawn - which is not always the one asked for.
 *
 * @param {ReturnType<typeof import('./useInsightsData').useInsightsData>} data
 * @param {{range: string}} period
 * @param {string} grain  the setting
 */
export function useTrend(data, period, grain) {
  const { daily, lived, multiBarData, expenses, inflows, win } = data
  const start = win.start
  const range = period.range
  return useMemo(() => {
    const rows = trendRows({ range, grain, daily, lived, multiBarData, expenses, inflows, start })
    return { grain: grainFor(range, grain), series: trendSeries(rows) }
  }, [range, grain, daily, lived, multiBarData, expenses, inflows, start])
}

/**
 * What a panel over the chart calls it: "Day by day", "Week by week", "Month
 * by month" - and "Year by year" when All has been cut into years.
 *
 * @param {'day'|'week'|'month'} grain
 * @param {string} range
 * @param {Array<{label: string}>} multiBarData
 */
export function grainTitle(grain, range, multiBarData) {
  if (grain === 'day') return 'Day by day'
  if (grain === 'week') return 'Week by week'
  return range === 'all' && multiBarData[0] && !/\s/.test(multiBarData[0].label) ? 'Year by year' : 'Month by month'
}
