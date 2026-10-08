import { supabase as defaultClient } from './supabase'

/**
 * Your devices telling each other about a transaction the moment it is saved.
 *
 * Saving on the phone has always reached the laptop by way of the database:
 * the phone sends the row, the database stores it, announces it, and the laptop
 * hears. That is the part this skips. Over the same socket the app already
 * keeps open (lib/realtime.js), the phone says it to the other devices
 * directly - Supabase Broadcast - and the laptop puts it in its ledger as the
 * message arrives. The database still gets the row by the usual push, and
 * still announces it; the laptop meets the same transaction a moment later and
 * finds it already there.
 *
 * ── It is only ever a head start ──
 *
 * Nothing depends on a message getting through. If this device is not joined
 * (offline, not yet connected, the policy of migration 031 not run), nothing is
 * sent, and the usual path carries the transaction as before. If a message is
 * lost, only the head start is.
 *
 * ── Private, and only yours ──
 *
 * A transaction is money. The channel is private, one per user, and the
 * policies of migration 031 let a signed-in user join the channel with their own
 * id and no other - a public channel is one anybody holding the project's key
 * could listen to by guessing its name.
 *
 * `self` is off: this device does not hear itself.
 */

export const SHARE_EVENT = 'tx'

/** @param {string} userId */
export const shareTopic = (userId) => `spendr:live:${userId}`

/**
 * @param {string} userId
 * @param {object} handlers
 * @param {(row: Record<string, any>) => void} handlers.onTransaction  a transaction another device saved, as the table holds it
 * @param {typeof defaultClient} [client]
 * @returns {{share: (row: Record<string, any>) => boolean, stop: () => void}}
 *   `share` says whether the message was sent: false when this device is not joined
 */
export function startShare(userId, { onTransaction }, client = defaultClient) {
  let stopped = false
  let joined = false

  const channel = client
    .channel(shareTopic(userId), { config: { private: true, broadcast: { self: false, ack: false } } })
    .on('broadcast', { event: SHARE_EVENT }, (/** @type {{payload?: Record<string, any>}} */ message) => {
      const row = message?.payload
      if (!stopped && row?.tx_id) onTransaction(row)
    })
    .subscribe((/** @type {string} */ status) => {
      joined = !stopped && status === 'SUBSCRIBED'
    })

  return {
    share(row) {
      if (stopped || !joined || !row?.tx_id) return false
      // Not awaited: it is a head start, and nobody is waiting on it.
      Promise.resolve(channel.send({ type: 'broadcast', event: SHARE_EVENT, payload: row })).catch(() => {})
      return true
    },
    stop() {
      stopped = true
      joined = false
      client.removeChannel(channel)
    },
  }
}
