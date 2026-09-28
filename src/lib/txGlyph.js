import { loanPaymentNote } from './loans'
import { CORRECTION_DESC } from './flows'

/** The Transfer system category as the app seeds it (lib/phCategories.js). */
const TRANSFER = { name: 'Transfer', icon: '🔄', color: '#2D9DFF' }
const NEUTRAL = '#64748b'
/** The categories the app files a row under without making one for it, in
 *  the colours the Net worth page gives people: what you owe them, and what
 *  they owe you.
 *  @type {Record<string, string>} */
const WRITTEN = { 'Debt Payment': '#ec4899', 'Debt Collection': '#14b8a6' }

/**
 * What a transaction's tile draws: the category CategoryGlyph is handed for
 * the icon and its colour.
 *
 * Usually that is simply the row's category. Three kinds of row have none
 * worth drawing, and each showed an emoji in a list of line icons:
 *
 *   A transfer carries no category at all, so it fell through to the 💸
 *   fallback. It is drawn as the Transfer category - the arrows, in its
 *   colour - or, when it is the part of a loan payment that goes to the
 *   loan, as a bank.
 *
 *   A row filed under a category the app writes but never creates - a debt
 *   settled up is 'Debt Payment' - has no category row to look up, so it
 *   printed the fallback too. The name alone is enough for CategoryGlyph.
 *
 *   A balance correction is filed under Income or Others, which is what the
 *   totals need, but it is neither: it gets a tile of its own.
 *
 * Only the tile. The row's text keeps the real category, so the list still
 * reads the way it did.
 *
 * @param {Record<string, any>|null|undefined} tx
 * @param {Record<string, any>} [catMap]  categories by name
 * @returns {Record<string, any>|null}
 */
export function txGlyphCat(tx, catMap = {}) {
  if (!tx) return null
  if (tx.type === 'transfer') {
    const transfer = catMap.Transfer ?? TRANSFER
    if (tx.toAccount && tx.description === loanPaymentNote(tx.toAccount)) {
      return { name: 'Loan payment', color: transfer.color ?? TRANSFER.color }
    }
    return transfer
  }
  if (tx.adjust === 'correction' || (!tx.adjust && tx.description === CORRECTION_DESC)) {
    return { name: CORRECTION_DESC, color: NEUTRAL }
  }
  if (!tx.category) return null
  return catMap[tx.category] ?? { name: tx.category, color: WRITTEN[tx.category] ?? NEUTRAL }
}
