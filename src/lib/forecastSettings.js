import { INCOME_LOOKBACKS } from './incomeStreams'

/**
 * How the forecast is worked out and what its page shows - the Forecast
 * settings page writes these, and every forecast in the app reads them
 * (Home's "Next 30 days", the Insights tile, the Forecast page and the
 * running-short notifications), so none of them can disagree.
 *
 * Kept in meta as one object and carried by backups (lib/backup.js). Not
 * synced: like the floor, it is how this device shows you the numbers, and
 * a second phone can see them its own way.
 */

/** The meta key the settings are kept under. */
export const FORECAST_SETTINGS_KEY = 'forecastSettings'

/**
 * @typedef {object} ForecastSettings
 * @property {'recurring'|'history'|'both'} income  where pay comes from
 * @property {'3m'|'6m'|'12m'} lookback  how far back pay is looked for
 * @property {boolean} occasional  count income that keeps no rhythm, as a daily average
 * @property {'typical'|'cautious'|'custom'} spend  how everyday spending is estimated
 * @property {number} customDaily  everyday spending per day, for 'custom'
 * @property {boolean} savings  count savings accounts in the starting balance
 * @property {boolean} band  draw the likely range around the line
 * @property {boolean} past  draw the recent days before today
 */

/** @type {ForecastSettings} */
export const DEFAULT_FORECAST_SETTINGS = {
  /* Both: pay on Recurring where you have set it up, and pay the ledger
     shows where you have not - the whole reason reading history exists is
     that most people never type their salary in twice. */
  income: 'both',
  lookback: '6m',
  occasional: false,
  spend: 'typical',
  customDaily: 0,
  savings: true,
  band: true,
  past: true,
}

const INCOME = ['recurring', 'history', 'both']
const SPEND = ['typical', 'cautious', 'custom']

/**
 * Stored settings, with anything missing or unknown put back to its default -
 * a row written by a newer version, or by hand, can never break the forecast.
 *
 * @param {unknown} value  what meta holds, or nothing
 * @returns {ForecastSettings}
 */
export function readForecastSettings(value) {
  const v = /** @type {Record<string, any>} */ (value && typeof value === 'object' ? value : {})
  const d = DEFAULT_FORECAST_SETTINGS
  const bool = (/** @type {any} */ x, /** @type {boolean} */ dflt) => (typeof x === 'boolean' ? x : dflt)
  return {
    income: INCOME.includes(v.income) ? v.income : d.income,
    lookback: INCOME_LOOKBACKS.some(l => l.key === v.lookback) ? v.lookback : d.lookback,
    occasional: bool(v.occasional, d.occasional),
    spend: SPEND.includes(v.spend) ? v.spend : d.spend,
    customDaily: Number.isFinite(Number(v.customDaily)) && Number(v.customDaily) > 0
      ? Math.round(Number(v.customDaily) * 100) / 100
      : 0,
    savings: bool(v.savings, d.savings),
    band: bool(v.band, d.band),
    past: bool(v.past, d.past),
  }
}

/**
 * The part of the settings the forecast itself takes (lib/forecast.js
 * buildForecast); `band` and `past` are only about how the page draws it.
 *
 * @param {ForecastSettings} s
 */
export function forecastOptions(s) {
  return {
    income: s.income,
    incomeLookbackDays: INCOME_LOOKBACKS.find(l => l.key === s.lookback)?.days ?? 183,
    occasional: s.occasional,
    spend: s.spend,
    customDaily: s.customDaily,
    countSavings: s.savings,
  }
}
