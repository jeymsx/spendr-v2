import db, { BOOKKEEPING, SYNCED_TABLES } from '../db/db'
import { changedKeys } from '../db/changedKeys'
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
 *   bookkeeping                 a row marked sent (synced, syncedAt), a row given
 *                               its stable id: how a row is filed, not what it
 *                               says. These are what a push itself writes, so
 *                               counting them would make every push start
 *                               another
 *
 * ── What this cannot hear ──
 *
 * A write of yours made while a pull is writing too: the counter in
 * syncSignal.js is global, not per write, so it cannot tell the two apart and
 * stays quiet for both. The row itself does not forget - it is marked as
 * changed (a small table's updatedAt is no longer its syncedAt, a note's
 * `synced` is not set) - so SyncManager asks for a push when a sync or a pull
 * ends and finds one (lib/sync.js unsentTables).
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
 * `onTransaction` is for the ledger alone, and later: it is called with the
 * transaction's key once the write has been committed - not when it is made,
 * which is before it is certain, a write that is rolled back would otherwise
 * have been announced - so a transaction can be handed to the other devices
 * the moment it is saved (lib/liveShare.js) rather than when the next push
 * has got it to the cloud.
 *
 * @param {(table: string) => void} onChange
 * @param {(key: any) => void} [onTransaction]
 * @returns {() => void} stop watching
 */
export function watchLocalChanges(onChange, onTransaction) {
  const tell = (/** @type {string} */ table) => { if (!isWritingRemote()) onChange(table) }
  /** @type {Array<() => void>} */
  const undo = []

  for (const name of ['transactions', 'badges', ...SYNCED_TABLES]) {
    const table = db.table(name)
    const toLedger = name === 'transactions' ? onTransaction : undefined
    /** @this {any} */
    const creating = function (/** @type {any} */ _key, /** @type {any} */ _row, /** @type {any} */ transaction) {
      tell(name)
      // The key of a new row is only known once it has been added.
      if (toLedger && !isWritingRemote()) this.onsuccess = (/** @type {any} */ key) => transaction?.on?.('complete', () => toLedger(key))
    }
    const deleting = () => { tell(name) }
    const updating = (/** @type {Record<string, any>|null|undefined} */ mods, /** @type {any} */ key, /** @type {any} */ row, /** @type {any} */ transaction) => {
      if (!mods || typeof mods !== 'object') return
      // Only what really changed (db/db.js changedKeys): a list that is the same list is not an edit.
      if (changedKeys(mods, row).every(k => BOOKKEEPING.has(k))) return
      tell(name)
      if (toLedger && !isWritingRemote()) transaction?.on?.('complete', () => toLedger(key))
    }
    // Dexie types the hook's `this` as its own context; this one only sets onsuccess on it.
    table.hook('creating', /** @type {any} */ (creating))
    table.hook('deleting', deleting)
    table.hook('updating', updating)
    undo.push(() => {
      table.hook('creating').unsubscribe(/** @type {any} */ (creating))
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
