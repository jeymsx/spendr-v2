import { useNavigate } from 'react-router-dom'
import { useToast } from '../../context/ToastContext'
import { fmt } from '../../lib/money'
import { coolDaysFor, coolUntilFrom } from '../../lib/wishes'
import { decideWish, undoDecision, deleteWish, restoreWish, updateWish } from '../../db/wishes'

/**
 * What can be done to a wish, the same on the phone and the computer
 * (pages/Wishlist.jsx, web/pages/WebWishlist.jsx, pages/WishForm.jsx):
 *
 *   buy      Add expense with the price and name filled in; the wish is marked
 *            when that expense is saved (AddExpense), not before
 *   skip     its price counts as kept, with Undo
 *   putBack  waiting again, for as long as its price says
 *   remove   gone, with Undo
 *
 * @param {{base?: string}} [opts]
 */
export function useWishActions({ base } = {}) {
  const navigate = useNavigate()
  const { showToast } = useToast()

  /** @param {WishRow} wish */
  function buy(wish) {
    navigate('/expense', { state: { prefill: { amount: wish.price, description: wish.name }, wish: wish.syncId } })
  }

  /** @param {WishRow} wish */
  async function skip(wish) {
    if (wish.id == null) return
    try {
      const before = await decideWish(wish.id, 'skipped')
      showToast(`${fmt(wish.price, wish.currency || undefined)} kept`, 'success', {
        actionLabel: 'Undo',
        onAction: () => {
          if (before) undoDecision(/** @type {number} */ (wish.id), before).catch(e => console.error('[Wishlist] undo failed:', e))
        },
      })
    } catch (e) {
      console.error('[Wishlist] skip failed:', e)
      showToast('Could not save that', 'error')
    }
  }

  /** @param {WishRow} wish */
  async function putBack(wish) {
    if (wish.id == null) return
    await updateWish(wish.id, {
      status: 'waiting', decidedAt: null, txId: null, goalName: null,
      coolUntil: coolUntilFrom(coolDaysFor(wish.price, wish.currency || base)),
    })
    showToast('Back on your wishlist')
  }

  /** @param {WishRow} wish */
  async function remove(wish) {
    if (wish.id == null) return
    try {
      const row = await deleteWish(wish.id)
      showToast('Wish deleted', 'success', {
        actionLabel: 'Undo',
        onAction: () => { if (row) restoreWish(row).catch(e => console.error('[Wishlist] restore failed:', e)) },
      })
    } catch (e) {
      console.error('[Wishlist] delete failed:', e)
      showToast('Could not delete that', 'error')
    }
  }

  return { buy, skip, putBack, remove }
}
