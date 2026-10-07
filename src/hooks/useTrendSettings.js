import { useMemo } from 'react'
import db from '../db/db'
import { useLiveQuery } from './useLiveQuery'
import { TREND_SETTINGS_KEY, readTrendSettings } from '../lib/trendSettings'

/**
 * How the Trend chart is drawn, kept current as it is changed - on this
 * device or, through sync, on another (lib/trendSettings.js).
 *
 * Read with the defaults filled in while the row is still being read, so the
 * chart draws once, as it will be, and never once as a bar and then again as
 * the line it was set to.
 */
export default function useTrendSettings() {
  const row = useLiveQuery(async () => (await db.meta.get(TREND_SETTINGS_KEY)) ?? null, [], undefined)
  const settings = useMemo(() => readTrendSettings(row?.value), [row])
  return { settings, ready: row !== undefined }
}

/**
 * Change some of the trend settings, keeping the rest. Stamped, so the sync
 * knows which device changed it last.
 *
 * @param {Partial<import('../lib/trendSettings').TrendSettings>} patch
 */
export async function saveTrendSettings(patch) {
  const row = await db.meta.get(TREND_SETTINGS_KEY)
  const value = readTrendSettings({ ...readTrendSettings(row?.value), ...patch })
  return db.meta.put({ key: TREND_SETTINGS_KEY, value, updatedAt: new Date().toISOString() })
}
