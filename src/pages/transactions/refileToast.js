import db from '../../db/db'
import { recategorize, refile } from '../../db/txHelpers'

/**
 * What a list says after a row is filed under another category: Undo, or -
 * when more rows like it are still under the old one (othersLike.js) -
 * an offer to move them too. Taking it says how many moved, with an Undo
 * that puts every one of them back.
 *
 * The offer is a toast, not a question in the way: most refiles are one-offs,
 * and a sheet after each would be one tap too many. Its Undo is the one after
 * moving the others; a single refile can be undone from the tile again.
 *
 * The rows are read again when the offer is taken, so one edited or deleted
 * in the seconds between is left alone.
 *
 * @param {(message: string, type?: string, options?: Record<string, any>) => void} showToast
 * @param {object} p
 * @param {string} p.message  what the move itself says ("Filed under Food")
 * @param {Array<{id: number, category: string}>} p.before  what recategorize returned
 * @param {string} p.category  where they went
 * @param {string} p.from  where they came from
 * @param {Array<Record<string, any>>} [p.others]  rows like it, still under `from`
 * @param {string} p.tag  for the console
 */
export function announceRefile(showToast, { message, before, category, from, others = [], tag }) {
  const undo = (/** @type {Array<{id: number, category: string}>} */ rows) => () => {
    refile(rows).catch(e => console.error(`[${tag}] refile undo failed:`, e))
  }
  if (!others.length) {
    showToast(message, 'success', { actionLabel: 'Undo', onAction: undo(before) })
    return
  }
  // The count on the button, so the message stays one line on a phone.
  showToast(message, 'success', {
    actionLabel: `Move ${others.length} more`,
    onAction: async () => {
      try {
        const now = await db.transactions.bulkGet(others.map(o => o.id))
        const still = now.filter(r => r && r.category === from)
        const more = await recategorize(still, category)
        showToast(`${before.length + more.length} filed under ${category}`, 'success', {
          actionLabel: 'Undo',
          onAction: undo([...before, ...more]),
        })
      } catch (e) {
        console.error(`[${tag}] moving the others failed:`, e)
        showToast('Could not move the others', 'error')
      }
    },
  })
}
