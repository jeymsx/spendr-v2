/**
 * A charge dated after today hasn't happened yet.
 *
 * Installment plans write one charge per month up front, which is what lets
 * getCreditStatus reduce available credit by the whole plan immediately — the
 * card issuer locks the full amount at purchase, so that figure is right. But
 * those same rows are not money spent yet, and showing next December's charge
 * in this month's history (or at the top of "Recent") is just noise.
 *
 * So they are filtered out of the "what I spent" surfaces and left everywhere
 * that reasons about what is owed:
 *
 *   hidden  Transactions list, Dashboard recent + month totals, Insights, budgets
 *   kept    available credit, the account sheet's Next Statement section
 *
 * Filter at the point of display, never in the useLiveQuery — the credit math
 * reads the same arrays and must still see every future charge.
 *
 * Nothing is stored or migrated: a row simply starts appearing on its own date.
 */

/** End of today, local, as a UTC ISO string — comparable to a stored tx.date. */
export function scheduledCutoff() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

/** True when this charge is dated beyond today. */
export function isScheduled(tx, cutoff = scheduledCutoff()) {
  return (tx?.date ?? '') > cutoff
}

/** Drop charges dated beyond today. Pass a cutoff to avoid recomputing per call. */
export function postedOnly(txs, cutoff = scheduledCutoff()) {
  return (txs ?? []).filter(t => (t?.date ?? '') <= cutoff)
}
