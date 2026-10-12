import { nameKey } from '../../lib/nameKey'
import { canRecategorize } from './shared'

/**
 * The rows "Change the others too?" offers to move with one you just filed
 * under another category: the same kind, the same description (case, spacing
 * and invisible characters aside), and still under the category it left.
 *
 * Still under the old one, so a row you had already filed somewhere else on
 * purpose is left where you put it. Not a split's legs: they share a
 * description and are filed apart on purpose. Not what cannot be refiled at
 * all (canRecategorize: transfers, refunds, settlements, adjustments). A
 * plan's months match together or not at all, since they share all three.
 *
 * @param {Record<string, any>} tx  the row as it was before it moved
 * @param {Array<Record<string, any>>} all  the ledger
 * @param {Iterable<number>} [moved]  ids that moved with it already (a plan's other months)
 * @returns {Array<Record<string, any>>}
 */
export function othersLike(tx, all, moved = []) {
  const key = nameKey(tx?.description)
  if (!key || !tx?.category) return []
  const skip = new Set([tx.id, ...moved])
  return (all ?? []).filter(o =>
    o?.id != null && !skip.has(o.id)
    && o.type === tx.type
    && o.category === tx.category
    && !o.splitId
    && canRecategorize(o)
    && nameKey(o.description) === key)
}
