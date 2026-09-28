import { useEffect, useState } from 'react'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useNudge } from '../hooks/useNudge'
import { useSyncState } from '../hooks/useSyncState'
import { buildReminders } from '../lib/reminders'
import { REMINDERS_CHANGED, refreshSubscription, syncReminders } from '../lib/push'

/**
 * Keeps the server's reminder list in step with the ledger. Renders nothing.
 *
 * Mounted only for a signed-in user (see SyncManager). It rebuilds the list a
 * few seconds after the accounts, the transactions, the bills or the daily
 * check-in's setting change - a card paid, a bill added, a pull from another
 * device - and syncReminders sends it only when it differs from the last one
 * sent, and only when one of this person's devices has reminders on. So for
 * everybody who never turns them on, this costs one list build per change
 * and no network at all.
 *
 * Any device keeps the list current, not just the phone that receives it:
 * pay the card on the laptop and the phone's "due in 3 days" is withdrawn,
 * log lunch there and the phone's check-in for today goes with it.
 *
 * ── Not before the ledger has caught up ──
 *
 * Each upload replaces the whole list. A laptop opened after a day away has
 * not yet pulled the lunch the phone logged, so its first build still has
 * today's check-in in it - and uploading that would put back what the phone
 * had just withdrawn, with nothing on the phone to take it out again (its
 * own list has not changed). So nothing goes up until the first sync of the
 * session is done.
 */
export default function ReminderSync({ userId }) {
  const accounts  = useLiveQuery(() => db.accounts.toArray(), [], undefined)
  const txs       = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const recurring = useLiveQuery(() => db.recurring.toArray(), [], undefined)
  const nudge     = useNudge()
  const { caughtUp } = useSyncState()
  /* Bumped when the connection comes back, so an upload that failed offline
     is tried again without waiting for the next edit - and when reminders are
     turned on here, so the list goes up straight away. */
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const bump = () => setTick(n => n + 1)
    window.addEventListener('online', bump)
    window.addEventListener(REMINDERS_CHANGED, bump)
    return () => {
      window.removeEventListener('online', bump)
      window.removeEventListener(REMINDERS_CHANGED, bump)
    }
  }, [])

  useEffect(() => {
    refreshSubscription(userId).catch(e => console.warn('[reminders] refresh:', e?.message ?? e))
  }, [userId])

  useEffect(() => {
    if (!accounts || !txs || !recurring || nudge === undefined || !caughtUp) return
    const t = setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      const list = buildReminders({ accounts, transactions: txs, recurring, nudge })
      syncReminders(userId, list).catch(e => console.warn('[reminders] sync:', e?.message ?? e))
    }, 3000)
    return () => clearTimeout(t)
  }, [userId, accounts, txs, recurring, nudge, caughtUp, tick])

  return null
}
