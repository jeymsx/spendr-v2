/**
 * What a transaction row MEANS, once refunds and splits exist.
 *
 * ── Why a refund is a negative expense and not its own type ──
 *
 * The obvious design is `type: 'refund'`. It was the first plan, and measuring
 * killed it: 45 places in this app sum `type === 'expense'`. A new type has to
 * be taught to every one of them, and the failure mode when one is missed is
 * SILENT - that screen simply leaves the refund out and quietly overstates
 * what you spent. There is no error, no test failure, nothing to notice.
 *
 * A refund written as an expense with a NEGATIVE amount needs none of them
 * changed, because they all add. The arithmetic comes out right everywhere for
 * free:
 *
 *   applyBalanceEffect   expense does `-a`; a = -500 gives +500, money back
 *   getCreditStatus      a negative charge reduces the statement it belongs to
 *   budgets / insights   the category total falls, which is the whole point
 *   reportData           same, and the PDF needed no change at all
 *
 * What it does cost is DISPLAY: four places render an expense as `−₱{amount}`
 * and would print `−₱-500.00`. Four visible, testable sites against 45 silent
 * ones is not a close call. Those four take their sign from here now.
 *
 * `refundOf` carries the MEANING - which purchase came back - while the sign
 * carries the arithmetic. A plain property, no index, no Dexie migration:
 * the same thing `installmentId` does, for the same reason.
 *
 * ── Splits ──
 *
 * A split purchase is N ordinary expenses sharing a `splitId`, not one row
 * holding an array. Same reasoning: every existing sum-by-category is already
 * correct about them without knowing they exist, because they are simply
 * expenses. The id only exists so the UI can show them as one thing and edit
 * or delete them as a unit.
 */

/** True when this row is money coming back on a purchase.
 *  @param {Record<string, any>} [tx] */
export function isRefund(tx) {
  return tx?.refundOf != null || (tx?.type === 'expense' && (tx?.amount ?? 0) < 0)
}

/** True when this row is one leg of a split purchase.
 *  @param {Record<string, any>} [tx] */
export function isSplit(tx) {
  return tx?.splitId != null
}

/**
 * The sign, colour and magnitude to render for a row.
 *
 * A refund is green and `+`, because that is what it does to your money, and
 * it is shown at its magnitude so nobody reads `−₱-500`. The type table is
 * the fallback for everything else.
 *
 * @param {Record<string, any>} [tx]
 * @param {{account?: string|null}} [ctx] an account page shows one SIDE of a
 *   transfer, so it needs to know which side it is looking at
 */
export function amountDisplay(tx, ctx = {}) {
  const amount = tx?.amount ?? 0
  const magnitude = Math.abs(amount)

  if (isRefund(tx)) {
    return { sign: '+', magnitude, tone: 'refund' }
  }

  const { account } = ctx
  if (tx?.type === 'transfer') {
    if (account && tx.fromAccount === account) return { sign: '−', magnitude, tone: 'out' }
    if (account && tx.toAccount === account)   return { sign: '+', magnitude, tone: 'in' }
    return { sign: '', magnitude, tone: 'transfer' }
  }
  if (tx?.type === 'inflow') return { sign: '+', magnitude, tone: 'in' }
  return { sign: '−', magnitude, tone: 'out' }
}

/** Tailwind for each tone, in one place so the four call sites agree. */
export const TONE_CLASS = {
  out:      'text-red-500 dark:text-red-400',
  in:       'text-emerald-600 dark:text-emerald-400',
  refund:   'text-emerald-600 dark:text-emerald-400',
  transfer: 'text-blue-500 dark:text-blue-400',
}

/**
 * What a purchase actually cost, after everything that came back.
 *
 * Refunds are found by `refundOf`, so a partial refund nets correctly and two
 * partials net together. Returns the ORIGINAL amount when nothing came back,
 * which is what every caller wants as its default.
 *
 * @param {Record<string, any>} [tx]        the original purchase
 * @param {Array<Record<string, any>>} [all] every transaction, unfiltered
 */
export function netOf(tx, all = []) {
  if (!tx?.txId) return tx?.amount ?? 0
  const back = all.reduce(
    (s, r) => (r.refundOf === tx.txId ? s + Math.abs(r.amount ?? 0) : s), 0)
  return Math.round(((tx.amount ?? 0) - back) * 100) / 100
}

/**
 * How much has already come back on a purchase, for the line that says so.
 *
 * @param {Record<string, any>} [tx]
 * @param {Array<Record<string, any>>} [all]
 */
export function refundedAmount(tx, all = []) {
  if (!tx?.txId) return 0
  return Math.round(all.reduce(
    (s, r) => (r.refundOf === tx.txId ? s + Math.abs(r.amount ?? 0) : s), 0) * 100) / 100
}

/**
 * What is still refundable, so the form cannot hand back more than was spent.
 *
 * Clamped at zero rather than going negative: an over-refund is already
 * stored and the honest thing is to stop offering more, not to invent a
 * negative allowance.
 *
 * @param {Record<string, any>} [tx]
 * @param {Array<Record<string, any>>} [all]
 */
export function refundableAmount(tx, all = []) {
  return Math.max(0, netOf(tx, all))
}

/**
 * The legs of a split, oldest first, or [tx] when it is not one.
 *
 * Matches findInstallmentGroup's contract deliberately - callers treat a
 * single row and a group the same way.
 *
 * @param {Record<string, any>} [tx]
 * @param {Array<Record<string, any>>} [all]
 */
export function splitGroup(tx, all = []) {
  if (!tx?.splitId) return tx ? [tx] : []
  const legs = all.filter(t => t.splitId === tx.splitId)
  return (legs.length ? legs : [tx]).slice().sort(
    (a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')) || (a.id ?? 0) - (b.id ?? 0))
}

/** The whole purchase, when you are looking at one leg of a split.
 *  @param {Record<string, any>} [tx]
 *  @param {Array<Record<string, any>>} [all] */
export function splitTotal(tx, all = []) {
  return Math.round(splitGroup(tx, all)
    .reduce((s, t) => s + (t.amount ?? 0), 0) * 100) / 100
}
