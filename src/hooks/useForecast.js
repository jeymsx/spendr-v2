import { useMemo } from 'react'
import db from '../db/db'
import { useLiveQuery } from './useLiveQuery'
import { useBaseCurrency } from '../context/CurrencyContext'
import useRates from './useRates'
import { buildForecast } from '../lib/forecast'
import { FORECAST_FLOOR_KEY, FORECAST_SETTINGS_KEY, forecastOptions, readForecastSettings } from '../lib/forecastSettings'

/** The meta key the forecast's floor is kept under. */
export const FLOOR_KEY = FORECAST_FLOOR_KEY

/**
 * The forecast, kept current as the ledger changes - lib/forecast.js over
 * the live tables. Null until everything it reads has loaded, so a figure
 * never draws once without the bills and again with them.
 *
 * Home's "Next 30 days" and the Forecast page both read it, with their own
 * horizon, so the two cannot disagree about today. The Forecast settings
 * (lib/forecastSettings.js) are read here for the same reason: where pay
 * comes from and how spending is estimated change every forecast at once.
 *
 * @param {number} [horizonDays]
 * @param {number} [historyDays]  days of what already happened, for a chart
 */
export default function useForecast(horizonDays = 30, historyDays = 0) {
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], undefined)
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const recurring = useLiveQuery(() => db.recurring.toArray(), [], undefined)
  const debts = useLiveQuery(() => db.debts.toArray(), [], undefined)
  const floorRow = useLiveQuery(async () => (await db.meta.get(FLOOR_KEY)) ?? null, [], undefined)
  const settingsRow = useLiveQuery(async () => (await db.meta.get(FORECAST_SETTINGS_KEY)) ?? null, [], undefined)
  const base = useBaseCurrency()
  const { table: rates } = useRates()

  const floor = Math.max(0, Number(floorRow?.value) || 0)
  const settings = useMemo(() => readForecastSettings(settingsRow?.value), [settingsRow])
  const ready = accounts !== undefined && transactions !== undefined
    && recurring !== undefined && debts !== undefined && floorRow !== undefined && settingsRow !== undefined

  const forecast = useMemo(() => (ready
    ? buildForecast({
      accounts, transactions, recurring, debts, base, rates, horizonDays, floor,
      // "Recent days" off: no past for the chart to lead in with.
      historyDays: settings.past ? historyDays : 0,
      ...forecastOptions(settings),
    })
    : null),
  [ready, accounts, transactions, recurring, debts, base, rates, horizonDays, floor, historyDays, settings])

  return { forecast, floor, settings, recurring: recurring ?? [], accounts: accounts ?? [] }
}

/** Save the floor. @param {number} value */
export function saveFloor(value) {
  const v = Math.max(0, Math.round((Number(value) || 0) * 100) / 100)
  return db.meta.put({ key: FLOOR_KEY, value: v, updatedAt: new Date().toISOString() })
}

/**
 * Change some of the forecast settings, keeping the rest.
 * @param {Partial<import('../lib/forecastSettings').ForecastSettings>} patch
 */
export async function saveForecastSettings(patch) {
  const row = await db.meta.get(FORECAST_SETTINGS_KEY)
  const value = readForecastSettings({ ...readForecastSettings(row?.value), ...patch })
  return db.meta.put({ key: FORECAST_SETTINGS_KEY, value, updatedAt: new Date().toISOString() })
}
