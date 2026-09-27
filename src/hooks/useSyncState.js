import { useSyncExternalStore } from 'react'

/**
 * Where this session stands with the cloud: whether a sync is running now,
 * and whether one has finished since the app opened.
 *
 * ── Why anything but SyncManager cares ──
 *
 * A verdict worked out from a ledger that has not caught up is wrong in a way
 * that spreads. A laptop last synced three days ago sees three days with
 * nothing logged and calls a running challenge lost; the verdict goes up
 * with a fresh timestamp, wins against every other device's copy, and a
 * finished challenge is never judged again. So AchievementContext waits for
 * `caughtUp` before it writes one, and holds its awards while `syncing` - a
 * pull lands the other device's transactions a moment before its badges, and
 * in between, something already earned there would look new here.
 *
 * ── A store, not state ──
 *
 * SyncManager renders every screen through its <Outlet />, so state there
 * that flipped at the start and end of every sync - on launch, and on every
 * return to the app - would re-render the whole app twice for it. A store
 * re-renders only what reads it.
 *
 * Signed out, or with no cloud configured, there is nothing to catch up with:
 * `caughtUp` is true from the start and nothing waits.
 */

/** @typedef {{syncing: boolean, caughtUp: boolean}} SyncState */

/** @type {SyncState} */
let state = { syncing: false, caughtUp: true }
/** @type {Set<() => void>} */
const listeners = new Set()

/** @param {Partial<SyncState>} patch */
export function setSyncState(patch) {
  const next = { ...state, ...patch }
  if (next.syncing === state.syncing && next.caughtUp === state.caughtUp) return
  state = next
  for (const l of listeners) l()
}

/** @returns {SyncState} */
export function getSyncState() {
  return state
}

/** @param {() => void} listener */
function subscribe(listener) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** @returns {SyncState} */
export function useSyncState() {
  return useSyncExternalStore(subscribe, getSyncState, getSyncState)
}
