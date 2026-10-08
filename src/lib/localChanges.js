import db, { BOOKKEEPING, SYNCED_TABLES } from '../db/db'
import { FORECAST_FLOOR_KEY, FORECAST_SETTINGS_KEY } from './forecastSettings'
import { NUDGE_KEY } from './nudge'
import { isWritingRemote } from './syncSignal'
import { TREND_SETTINGS_KEY } from './trendSettings'

/**
 * Tells you when something you did changed what the cloud should have.
 *
 * Sync used to push only when it ran - on opening the app, on coming back to
 * the window, on a pull - so a transaction added on the phone sat on the
 * phone until one of those happened, and the laptop could not know about it
 * however quickly it asked. Pushing as it happens starts here: a hook on every
 * table that syncs, calling back after any write that is yours.
 *
 * ── What is not yours ──
 *
 *   the cloud's own writes      a pull puts rows into these same tables
 *                               (syncSignal.js says when)
 *   bookkeeping                 a row marked sent, a row given its stable id:
 *                               how a row is filed, not what it says. These
 *                               are what a push itself writes, so counting
 *                               them would make every push start another
 *
 * ── Hooks, not a poll ──
 *
 * Dexie calls them inside the write, synchronously, so nothing can be written
 * without being seen. They must return nothing: for `creating` a returned
 * value becomes the primary key, and for `updating` it is merged into the
 * change.
 *
 * Every table that syncs, plus transactions, which are not in SYNCED_TABLES
 * (they are keyed by txId, not syncId), and badges (keyed by their name). Preferences are in `meta`, which is
 * also full of local bookkeeping - watermarks, the last sync - so only the
 * keys that sync are watched there.
 */

/** The `meta` rows that are a preference the cloud keeps (lib/sync.js pushPreferences). */
export const SYNCED_META_KEYS = new Set([
  'displayName', 'currency', 'skipConfirm', 'budgetRollover',
  NUDGE_KEY, FORECAST_SETTINGS_KEY, FORECAST_FLOOR_KEY, TREND_SETTINGS_KEY,
])

/**
 * Call `onChange` after every write of yours that has to reach the cloud, with
 * the name of the table it was in (`meta` for a preference), so a push can send
 * that table and leave the others alone.
 *
 * @param {(table: string) => void} onChange
 * @returns {() => void} stop watching
 */
export function watchLocalChanges(onChange) {
  const tell = (/** @type {string} */ table) => { if (!isWritingRemote()) onChange(table) }
  /** @type {Array<() => void>} */
  const undo = []

  for (const name of ['transactions', 'badges', ...SYNCED_TABLES]) {
    const table = db.table(name)
    const creating = () => { tell(name) }
    const deleting = () => { tell(name) }
    const updating = (/** @type {Record<string, any>|null|undefined} */ mods) => {
      if (!mods || typeof mods !== 'object') return
      if (Object.keys(mods).every(k => BOOKKEEPING.has(k))) return
      tell(name)
    }
    table.hook('creating', creating)
    table.hook('deleting', deleting)
    table.hook('updating', updating)
    undo.push(() => {
      table.hook('creating').unsubscribe(creating)
      table.hook('deleting').unsubscribe(deleting)
      table.hook('updating').unsubscribe(updating)
    })
  }

  const meta = {
    creating: (/** @type {any} */ _key, /** @type {any} */ row) => { if (SYNCED_META_KEYS.has(row?.key)) tell('meta') },
    updating: (/** @type {any} */ _mods, /** @type {any} */ key) => { if (SYNCED_META_KEYS.has(key)) tell('meta') },
  }
  db.meta.hook('creating', meta.creating)
  db.meta.hook('updating', meta.updating)
  undo.push(() => {
    db.meta.hook('creating').unsubscribe(meta.creating)
    db.meta.hook('updating').unsubscribe(meta.updating)
  })

  return () => { for (const f of undo) f() }
}
