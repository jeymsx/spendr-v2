import { isAdjustment } from './flows'
import { fmt } from './money'

/**
 * What to say when another device has added to your ledger.
 *
 * The toast you see after saving on this device says what you just did. This
 * is the same moment seen from the other side: you did not do it, so it says
 * where it came from - and does it in the fewest words, because it appears
 * uninvited, over whatever you are looking at.
 *
 * One transaction is named, with its figure ("From your other device: Lunch,
 * ₱150"). Several are counted, and never listed: a toast is a glance, and a
 * second device that has been offline for a day should say "6 new
 * transactions", not scroll.
 *
 * Only what is new. A row this device already had - its own, coming back
 * round, or one it was sent twice - is not announced, which is what keeps a
 * device from toasting its own work.
 */

/** @param {Record<string, any>} t */
function line(t) {
  const money = (/** @type {number} */ n) => fmt(Math.abs(Number(n) || 0), t.currency || undefined)
  if (t.type === 'transfer') {
    const to = t.toAccount ? ` to ${t.toAccount}` : ''
    return `${money(t.amount)}${to}`
  }
  const what = (t.description || t.category || (t.type === 'inflow' ? 'Income' : 'Expense')).toString().trim()
  return t.type === 'inflow' ? `${what}, +${money(t.amount)}` : `${what}, ${money(t.amount)}`
}

/**
 * @param {Array<Record<string, any>>} added  transactions the pull has just put on this device
 * @returns {string|null}  null when there is nothing worth saying
 */
export function remoteToastMessage(added) {
  const worth = (added ?? []).filter(t => t && !isAdjustment(t))
  if (!worth.length) return null
  if (worth.length === 1) return `From your other device: ${line(worth[0])}`
  return `${worth.length} new transactions from your other device`
}
