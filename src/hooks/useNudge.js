import db from '../db/db'
import { useLiveQuery } from './useLiveQuery'
import { NUDGE_KEY, parseNudge } from '../lib/nudge'

/**
 * The daily check-in's setting, read and written. The rules are lib/nudge.js.
 *
 * The stored value: 'HH:MM', 'off', null when never set, or undefined while
 * the database is still being read.
 *
 * @returns {string|null|undefined}
 */
export function useNudge() {
  return useLiveQuery(async () => (await db.meta.get(NUDGE_KEY))?.value ?? null, [], undefined)
}

/**
 * Turn the check-in on at a time, or off with null. Stamped, so the newer
 * choice wins when two devices disagree (sync.js, pullPreferences).
 *
 * @param {string|null} value
 */
export async function setNudge(value) {
  const next = value && parseNudge(value) ? value : 'off'
  await db.meta.put({ key: NUDGE_KEY, value: next, updatedAt: new Date().toISOString() })
}
