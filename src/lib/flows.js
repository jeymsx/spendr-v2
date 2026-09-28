/**
 * What counts as income and what counts as spending - one definition.
 *
 * ── Why this file exists ──
 *
 * Eighteen screens total up "what came in" and "what went out": Insights,
 * Home, the budget, the recap, the PDF, badges, challenges, notifications.
 * Each one used to write its own `type === 'expense'`. That was fine while
 * every expense row was a purchase, and it stops being fine the moment the app
 * writes a row that moves a balance WITHOUT being a purchase.
 *
 * Two such rows exist:
 *
 *   'correction'  You told an account its real balance. The difference is
 *                 written as an ordinary inflow or expense so the ledger still
 *                 explains the balance - but you didn't earn it or spend it.
 *   'value'       An investment's value moved. The market did that, not you.
 *
 * Both stay ordinary inflow/expense rows on purpose, for the reason
 * lib/txMoney.js gives for refunds: every balance, trend, net-worth sweep, sync
 * mapper and trash path already handles those two types correctly, and a new
 * type would have to be taught to all of them - silently wrong wherever one
 * was missed. The meaning travels on `adjust` instead, and only the TOTALS
 * need to know about it. They ask here.
 *
 * Older corrections were written before `adjust` existed. They all carry the
 * description the app gave them, so that is matched too.
 */

/** The description the app writes on a balance correction. */
export const CORRECTION_DESC = 'Balance adjustment'
/** The description the app writes on an investment value update. */
export const VALUE_DESC = 'Value update'

/**
 * True for a row the app wrote to move a balance, not money you earned or
 * spent. It still moves balances and net worth; it just isn't income or
 * spending.
 * @param {Record<string, any>} [tx]
 */
export function isAdjustment(tx) {
  if (!tx) return false
  if (tx.adjust) return true
  return tx.description === CORRECTION_DESC || tx.description === VALUE_DESC
}

/**
 * Spending: an expense row that is a real outflow. Refunds (negative expenses)
 * are included, so they net against what they refund, exactly as before.
 * @param {Record<string, any>} [tx]
 */
export function isSpend(tx) {
  return tx?.type === 'expense' && !isAdjustment(tx)
}

/**
 * Income: an inflow row that is money you actually received.
 * @param {Record<string, any>} [tx]
 */
export function isIncome(tx) {
  return tx?.type === 'inflow' && !isAdjustment(tx)
}

/**
 * Either of the above - a row that belongs in an income or spending total.
 * @param {Record<string, any>} [tx]
 */
export function isFlowRow(tx) {
  return isSpend(tx) || isIncome(tx)
}
