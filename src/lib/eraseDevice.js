import db from '../db/db'
import { clearLock } from './appLock'
import { supabase } from './supabase'
import { dropStaleCaches } from './staleCaches'

/**
 * Everything Spendr keeps on this device, gone: what Reset app does, and what
 * Delete my account does after the cloud copy has gone.
 *
 * Every table the database has, by `db.tables`, so a table added later is
 * wiped without anyone remembering to list it here. Goals and badges were
 * once left behind (goals pointing at accounts that no longer existed, badges
 * the fresh start announced all over again), then challenges and the notes
 * tables - each made "erase everything" untrue.
 *
 * The app lock too: a fresh start behind yesterday's Face ID would be a locked
 * door on an empty room. And the look, which lives in localStorage because it
 * has to be known before the database opens; dropped rather than rewritten, so
 * the reload that follows falls back to the defaults.
 *
 * It does not reload or sign out: the caller does, in the order it needs.
 */
export async function eraseThisDevice() {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
  clearLock()
  // And any copy of the cloud an old service worker kept (lib/staleCaches.js).
  await dropStaleCaches()
  try {
    localStorage.removeItem('spendr-theme')
    localStorage.removeItem('accentColor')
    localStorage.removeItem('spendr-style')
    localStorage.removeItem('spendr-crash-log')
  } catch { /* storage blocked: nothing to reset */ }
}

/**
 * Delete the signed-in account, and everything it owns in the cloud, for good
 * (035_public_readiness.sql delete_my_account). Throws with words a person can
 * read when it cannot.
 */
export async function deleteMyAccount() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('You’re offline. Connect to the internet to delete your account.')
  }
  const { error } = await supabase.rpc('delete_my_account')
  if (!error) return
  if (/could not find the function|schema cache|does not exist/i.test(error.message ?? '')) {
    throw new Error('Account deletion isn’t set up on the server yet.')
  }
  throw new Error('Could not delete your account. Check your connection and try again.')
}
