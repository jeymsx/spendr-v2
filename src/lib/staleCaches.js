/**
 * Caches the service worker no longer fills, and must not keep.
 *
 * 'supabase-api' held a copy of every cloud response - the whole ledger, the
 * notes, people's names - written by a NetworkFirst rule that is gone now (see
 * the note in vite.config.js). Removing a rule does not remove what it already
 * stored, so every device that ran the old worker still has that copy, and Reset
 * app and Sign out never touched it. It goes on start, and again whenever this
 * device is erased or signed out.
 */
export const STALE_CACHES = ['supabase-api']

/** Delete them. Never throws: there may be no Cache Storage at all. */
export async function dropStaleCaches() {
  try {
    if (typeof caches === 'undefined') return
    await Promise.all(STALE_CACHES.map(name => caches.delete(name)))
  } catch { /* private mode, or storage blocked: nothing to delete */ }
}
