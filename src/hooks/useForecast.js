import { useMemo } from 'react'
import db from '../db/db'
import { useLiveQuery } from './useLiveQuery'
import { useBaseCurrency } from '../context/CurrencyContext'
import useRates from './useRates'
import { buildForecast } from '../lib/forecast'

/** The meta key the forecast's floor is kept under. */
export const FLOOR_KEY = 'forecastFloor'

/**
 * The forecast, kept current as the ledger changes - lib/forecast.js over
 * the live tables. Null until everything it reads has loaded, so a figure
 * never draws once without the bills and again with them.
 *
 * Home's "Next 30 days" and the Forecast page both read it, with their own
 * horizon, so the two cannot disagree about today.
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
  const base = useBaseCurrency()
  const { table: rates } = useRates()

  const floor = Math.max(0, Number(floorRow?.value) || 0)
  const ready = accounts !== undefined && transactions !== undefined
    && recurring !== undefined && debts !== undefined && floorRow !== undefined

  const forecast = useMemo(() => (ready
    ? buildForecast({ accounts, transactions, recurring, debts, base, rates, horizonDays, floor, historyDays })
    : null),
  [ready, accounts, transactions, recurring, debts, base, rates, horizonDays, floor, historyDays])

  return { forecast, floor, recurring: recurring ?? [], accounts: accounts ?? [] }
}

/** Save the floor. @param {number} value */
export function saveFloor(value) {
  const v = Math.max(0, Math.round((Number(value) || 0) * 100) / 100)
  return db.meta.put({ key: FLOOR_KEY, value: v, updatedAt: new Date().toISOString() })
}
