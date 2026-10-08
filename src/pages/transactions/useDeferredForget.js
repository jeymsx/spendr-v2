import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../../context/ToastContext'
import { deleteForever } from '../../db/trash'

/**
 * Deleting out of Recently deleted for good, with an Undo - the phone's list
 * and the desktop's table both.
 *
 * Nothing here deletes until it is final. A row (or several) is HIDDEN from
 * the list, a toast offers Undo, and the entries are deleted for real only when
 * that runs out, when another delete starts, when the page is left, or when
 * the caller settles first (before it empties everything, or deletes one from
 * an open sheet).
 *
 * ── Why it waits, instead of deleting and re-inserting on Undo ──
 *
 * The entry stays in the trash - with its rows, its debts and its sync
 * identity - the whole time, so there is nothing to put back: Undo only stops
 * the clock and shows it again. Re-inserting would mean rebuilding a synced row
 * after its deletion had been queued for the server, which has to be raced
 * against that deletion. And if the app is closed or the tab is killed
 * mid-toast, the worst that happens is that the entry is still in Recently
 * deleted, where it expires on its own in thirty days. Deleting first and
 * restoring on Undo would lose it for good in the same situation, and that is
 * the one failure an Undo exists to prevent.
 *
 * Only one Undo is on offer: a delete that starts while another is waiting
 * makes the first final, as the toast has one slot on the phone.
 */

/**
 * How long a deleted row can still be got back, in ms. The toast that carries
 * the Undo and the timer that makes the delete final are meant to end
 * together. The phone's toast with a button stays up 6 seconds on its own; the
 * desktop's stays longer (7). So this figure is passed to the toast explicitly,
 * on both, rather than trusted to match.
 */
export const UNDO_MS = 6000

/**
 * @typedef {object} Waiting
 * @property {number[]} ids  the trash entries that are hidden and not yet deleted
 * @property {ReturnType<typeof setTimeout>} timer  what makes them final
 */

/**
 * @returns {{
 *   hidden: number[],
 *   forgetWithUndo: (ids: number|number[], message?: string) => boolean,
 *   settle: () => Promise<void>,
 * }}
 *   hidden: trash entry ids to leave out of the list while their Undo is on offer.
 *   forgetWithUndo: hide `ids` at once and delete them for good when the Undo
 *   runs out; `message` is the toast's words. Returns true, so it can be a
 *   SwipeRow's onDelete.
 *   settle: make whatever is waiting final now. Await it before a delete or an
 *   empty-all of the caller's own, so the two never race.
 */
export function useDeferredForget() {
  const { showToast, dismiss } = useToast()
  /* Rows deleted and not yet deleted for good. They are HIDDEN here, not
     deleted: the entry stays in the trash until its Undo has run out. */
  const [hidden, setHidden] = useState(/** @type {number[]} */ ([]))
  /** The one delete whose Undo is still on offer. */
  const waiting = useRef(/** @type {Waiting|null} */ (null))

  /**
   * Make the delete that is waiting final: delete it for good, now.
   *
   * Called when its Undo runs out, when another delete starts, when the page
   * is left, and before everything is emptied.
   */
  const settle = useCallback(async () => {
    const w = waiting.current
    if (!w) return
    waiting.current = null
    clearTimeout(w.timer)
    try {
      let failed = false
      // One at a time and each on its own: one that cannot be deleted must not
      // keep the rest from going.
      for (const id of w.ids) {
        try {
          await deleteForever(id)
        } catch (e) {
          failed = true
          console.error('[RecentlyDeleted] delete for good failed:', e)
        }
      }
      if (failed) showToast('Could not delete it. Try again.', 'error')
    } finally {
      // Back into the list only now, so a row that is going does not flash. One
      // that could not be deleted comes back with the news above.
      setHidden(h => h.filter(x => !w.ids.includes(x)))
    }
  }, [showToast])

  /** @param {Waiting} w */
  const undo = useCallback((w) => {
    // Only the delete that is still waiting can be undone: a later one has
    // already made this one final.
    if (waiting.current !== w) return
    clearTimeout(w.timer)
    waiting.current = null
    setHidden(h => h.filter(x => !w.ids.includes(x)))
  }, [])

  const forgetWithUndo = useCallback((/** @type {number|number[]} */ ids, message = 'Deleted for good') => {
    const list = Array.isArray(ids) ? ids : [ids]
    if (!list.length) return false
    // Another delete ends the one before it: only one Undo is on offer.
    settle()
    setHidden(h => [...h, ...list])
    /** @type {Waiting} */
    const w = { ids: list, timer: setTimeout(settle, UNDO_MS) }
    waiting.current = w
    showToast(message, 'success', { actionLabel: 'Undo', duration: UNDO_MS, onAction: () => undo(w) })
    return true
  }, [settle, undo, showToast])

  /* Leaving the page settles what is waiting - it was asked for - and takes
     the Undo down with it, since there is no longer a row to bring back. Not
     on the dev server's trial unmount, when nothing is waiting. */
  useEffect(() => () => {
    if (!waiting.current) return
    settle()
    dismiss?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { hidden, forgetWithUndo, settle }
}
