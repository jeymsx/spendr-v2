/**
 * A transfer's fee, and how to find it.
 *
 * The transfer form writes a fee as its own expense - under Transfer Fee, on
 * the account the money left, at the same moment as the transfer - so the
 * fee counts as spending and the transfer stays a move between your own
 * accounts. Nothing on either row pointed at the other, and nothing needs
 * to: the category, the account and the moment are the link. That is what
 * lets a transfer take its fee with it when it is deleted, and move it when
 * it is re-routed, for every fee ever saved rather than only new ones.
 *
 * The moment is compared as an instant, not as text: a row that has been
 * round the server comes back as "+00:00" where the other still says "Z".
 */

/** The category a transfer's fee is filed under. */
export const TRANSFER_FEE = 'Transfer Fee'

/**
 * @param {Record<string, any>|null|undefined} row
 * @param {Record<string, any>|null|undefined} transfer
 */
export function isFeeOf(row, transfer) {
  if (!row || !transfer || transfer.type !== 'transfer') return false
  if (row.type !== 'expense' || row.category !== TRANSFER_FEE) return false
  if (!row.account || row.account !== transfer.fromAccount) return false
  const a = Date.parse(row.date)
  const b = Date.parse(transfer.date)
  return Number.isFinite(a) && a === b
}

/**
 * The fee a transfer was saved with, or null.
 * @param {Record<string, any>|null|undefined} transfer
 * @param {Array<Record<string, any>>} [all]
 */
export function feeOf(transfer, all = []) {
  if (!transfer || transfer.type !== 'transfer') return null
  return (all ?? []).find(r => isFeeOf(r, transfer)) ?? null
}

/** What the form calls a fee: "Transfer fee · BPI → GCash". @param {string} from @param {string} to */
export const feeDescription = (from, to) => `Transfer fee · ${from} → ${to}`

/** Whether a fee still says what the form wrote, so it may be rewritten. @param {string|null|undefined} d */
export const isFormFeeDescription = (d) => !d || /^Transfer fee · /.test(String(d))
