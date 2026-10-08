import { supabase as defaultClient } from './supabase'

/**
 * The cloud tells this device when something changed, instead of this device
 * asking.
 *
 * Supabase Realtime streams a table's changes to every connected client over
 * one WebSocket. All this does is listen: a change to any row of yours, on any
 * device, calls `onChange`, and what to do about it - pull, announce - is the
 * sync's business (components/SyncManager.jsx). Nothing is read from the
 * event itself, which is why a table that only changes in unknown ways
 * (a new column, a note's body) needs no special case: the pull finds out.
 *
 * ── The tables ──
 *
 * Every one a pull reads. A table has to be in the database's
 * `supabase_realtime` publication to be heard (migration 030), which is the
 * one thing this cannot do from here.
 *
 * Deletions are heard as rows, not as DELETE events: the stream cannot filter
 * a delete to one person (the old row carries nothing but its key), and the
 * `deletions` table already gets a row for every delete the database sees
 * (migration 014), which is an INSERT and filters like any other.
 *
 * ── One channel per table ──
 *
 * Not one channel with a binding for each. A binding to a table that is not
 * in the publication fails the whole channel it is on, so a database a
 * migration behind would hear nothing at all. Separate channels share one
 * socket and fail on their own: transactions can be live while a table that
 * has not been published is simply quiet.
 *
 * ── What it cannot promise ──
 *
 * Events are not queued for a device that is offline, asleep or between
 * connections. Every (re)subscribe therefore calls `onChange` once, as a
 * catch-up for whatever was missed, and the window-focus sync stays as it was.
 */

export const REALTIME_TABLES = [
  'transactions', 'accounts', 'categories', 'debts', 'recurring', 'templates', 'goals',
  'badges', 'challenges', 'trash', 'note_folders', 'notes', 'user_preferences', 'deletions',
]

/** The one table whose being heard means the stream is live: the ledger. */
const LEDGER = 'transactions'

/**
 * @typedef {'connecting'|'on'|'off'} LiveState
 *
 * @param {string} userId
 * @param {object} handlers
 * @param {(table: string) => void} handlers.onChange  something changed, or may have
 * @param {(state: LiveState, why?: string) => void} [handlers.onState]
 * @param {typeof defaultClient} [client]
 * @returns {() => void} stop listening
 */
export function startRealtime(userId, { onChange, onState }, client = defaultClient) {
  let stopped = false
  /** @type {Array<any>} */
  const channels = []

  for (const table of REALTIME_TABLES) {
    const channel = client
      .channel(`spendr:${table}:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, () => {
        if (!stopped) onChange(table)
      })
      .subscribe((/** @type {string} */ status, /** @type {any} */ err) => {
        if (stopped) return
        if (status === 'SUBSCRIBED') {
          if (table === LEDGER) { onState?.('on'); onChange(table) }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (table === LEDGER) onState?.('off', err?.message ?? status)
        }
      })
    channels.push(channel)
  }
  onState?.('connecting')

  return () => {
    stopped = true
    for (const c of channels) client.removeChannel(c)
  }
}
