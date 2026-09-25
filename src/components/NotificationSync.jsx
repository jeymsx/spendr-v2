import { useEffect, useRef, useState } from 'react'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { collectNotifications } from '../lib/notifications'
import { recordNotifications, releaseSeenAt } from '../db/notifications'
import { CURRENT_VERSION, WHATS_NEW_HEADLINE } from './WhatsNewModal'

/** How often to look again while the app stays open, for the 9am items. */
const TICK_MS = 5 * 60 * 1000
/** A budget alert this recent is news, and gets a toast as well. */
const FRESH_MS = 2 * 60 * 1000
/** Long enough after a change for a burst of writes - an import, a sync - to finish. */
const SETTLE_MS = 800

/**
 * Keeps the notifications list current. Renders nothing.
 *
 * Mounted once, for every signed-in or signed-out session inside the app:
 * notifications are worked out on the device from the ledger, so they need
 * no account and no network. It recomputes shortly after anything they
 * depend on changes, every few minutes while the app is on screen - "due
 * today" is a 9am event, and the app may already be open at 9 - and when the
 * app comes back to the foreground. Not while it is hidden: nothing is
 * looking, and the next look catches up.
 *
 * A budget alert that has only just happened is shown as a toast too, which
 * is the moment it is useful: right after logging the expense that crossed
 * the line. Only in the tab on screen, and never over a toast with a button
 * on it - an Undo knocked off the screen by a budget alert is an Undo lost.
 */
export default function NotificationSync() {
  const { showToast } = useToast()
  // A ref, so a provider re-render handing out a new function is not a reason to recompute.
  const toastRef = useRef(showToast)
  useEffect(() => { toastRef.current = showToast }, [showToast])
  const mounted = useRef(true)
  // Set in the effect, not only cleared: React mounts twice in development.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const accounts     = useLiveQuery(() => db.accounts.toArray(), [], undefined)
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const recurring    = useLiveQuery(() => db.recurring.toArray(), [], undefined)
  const categories   = useLiveQuery(() => db.categories.toArray(), [], undefined)
  const badges       = useLiveQuery(() => db.badges.toArray(), [], undefined)
  const rollover     = useLiveQuery(async () => (await db.meta.get('budgetRollover'))?.value ?? false, [], undefined)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const bump = () => { if (document.visibilityState === 'visible') setTick(n => n + 1) }
    const id = setInterval(bump, TICK_MS)
    document.addEventListener('visibilitychange', bump)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', bump) }
  }, [])

  useEffect(() => {
    if ([accounts, transactions, recurring, categories, badges, rollover].some(v => v === undefined)) return
    const t = setTimeout(async () => {
      const now = new Date()
      try {
        const seenAt = await releaseSeenAt(CURRENT_VERSION, now)
        const candidates = collectNotifications({
          accounts, transactions, recurring, categories, badges,
          globalRollover: !!rollover,
          whatsNew: seenAt ? { version: CURRENT_VERSION, headline: WHATS_NEW_HEADLINE, at: seenAt } : null,
          now,
        })
        const fresh = await recordNotifications(candidates, now)
        /* Recorded is recorded: a newer pass will not offer these again, so
           a change that landed meanwhile must not swallow the toast. */
        if (!mounted.current || document.visibilityState !== 'visible') return
        for (const n of fresh) {
          const isBudget = n.kind === 'budget-warn' || n.kind === 'budget-over'
          if (isBudget && now.getTime() - Date.parse(n.at) < FRESH_MS) {
            toastRef.current(n.title, 'warning', { ifIdle: true })
          }
        }
      } catch (e) {
        console.warn('[notifications] could not record:', /** @type {any} */ (e)?.message ?? e)
      }
    }, SETTLE_MS)
    return () => clearTimeout(t)
  }, [accounts, transactions, recurring, categories, badges, rollover, tick])

  return null
}
