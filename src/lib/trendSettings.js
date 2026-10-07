/**
 * How the Trend chart in Insights is drawn - the sliders beside it write
 * these, and the phone's Trend page and the desktop's Trend tab both read
 * them, so the two draw the same chart.
 *
 * Kept in meta as one object, carried by backups (lib/backup.js), and synced
 * through user_preferences (029), as the forecast's settings are, so a chart
 * set up on the laptop is the same on the phone.
 */

/** The meta key the settings are kept under. */
export const TREND_SETTINGS_KEY = 'trendSettings'

/** Where the settings are changed: a page on the phone, a panel on the desktop. */
export const TREND_SETTINGS_PATH = '/insights/trend/settings'

/**
 * @typedef {'expenses'|'income'|'netflow'} TrendSeriesKey
 *
 * @typedef {object} TrendSettings
 * @property {'line'|'area'|'bars'} chart  how the money is drawn: a line, a line with a soft fill under it, or bars
 * @property {TrendSeriesKey[]} series  what the chart shows - one or more, drawn over each other, in a fixed order
 * @property {'auto'|'day'|'week'|'month'} grain  how much time one point covers; auto is a day up to 1M and a month beyond
 * @property {boolean} smooth  curve the line through the points, rather than joining them with straight strokes
 * @property {boolean} points  a dot on every point of a line
 * @property {boolean} average  a dashed line at the period's average
 */

/** @type {TrendSettings} */
export const DEFAULT_TREND_SETTINGS = {
  chart: 'line',
  series: ['expenses'],
  grain: 'auto',
  smooth: true,
  points: false,
  average: false,
}

export const TREND_CHARTS = /** @type {const} */ (['line', 'area', 'bars'])
/** In the order they are drawn, listed and toggled. */
export const TREND_SERIES = /** @type {const} */ (['expenses', 'income', 'netflow'])
export const TREND_GRAINS = /** @type {const} */ (['auto', 'day', 'week', 'month'])

/**
 * The series a stored value names: a list, or - from before the chart could
 * show several - a single name. Anything unknown is dropped, a repeat is
 * counted once, and the order is always the canonical one, so two devices
 * that picked the same lines in a different order store the same thing. Nothing
 * valid left means the default: a chart of no lines is not a setting.
 *
 * @param {unknown} value
 * @returns {TrendSeriesKey[]}
 */
function readSeries(value) {
  const named = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const picked = TREND_SERIES.filter(k => named.includes(k))
  return picked.length ? picked : [...DEFAULT_TREND_SETTINGS.series]
}

/**
 * Stored settings, with anything missing or unknown put back to its default -
 * a row written by a newer version, or by hand, can never break the chart.
 *
 * @param {unknown} value  what meta holds, or nothing
 * @returns {TrendSettings}
 */
export function readTrendSettings(value) {
  const v = /** @type {Record<string, any>} */ (value && typeof value === 'object' ? value : {})
  const d = DEFAULT_TREND_SETTINGS
  const bool = (/** @type {any} */ x, /** @type {boolean} */ dflt) => (typeof x === 'boolean' ? x : dflt)
  return {
    chart: TREND_CHARTS.includes(v.chart) ? v.chart : d.chart,
    series: readSeries(v.series),
    grain: TREND_GRAINS.includes(v.grain) ? v.grain : d.grain,
    smooth: bool(v.smooth, d.smooth),
    points: bool(v.points, d.points),
    average: bool(v.average, d.average),
  }
}
