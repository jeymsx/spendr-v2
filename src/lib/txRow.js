import { isLoanPayment } from './loans'
import { CORRECTION_DESC } from './flows'

/*
 * What a transaction's row in a list shows: its tile, and its words. One
 * place, because four lists draw a row (Transactions, the calendar's day,
 * Home's Recent, an account's history) and each had worked the words out
 * for itself.
 */

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
 * Only the tile. The words are txRowWords' below.
 *
 * @param {Record<string, any>|null|undefined} tx
 * @param {Record<string, any>} [catMap]  categories by name
 * @returns {Record<string, any>|null}
 */
export function txGlyphCat(tx, catMap = {}) {
  if (!tx) return null
  if (tx.type === 'transfer') {
    const transfer = catMap.Transfer ?? TRANSFER
    if (isLoanPayment(tx)) {
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

/**
 * The word a row's second line gives for what it is - after the account,
 * "GCash · Food".
 *
 * The category, except for the rows the app writes itself, whose category
 * said the wrong thing or nothing: a balance correction read "Income" or
 * "Others", which is what the totals need it filed under and not what it
 * is; a debt settled up is filed under a category nobody has, so the line
 * was just the account; and the part of a loan payment that goes to the
 * loan is a transfer, which has none.
 *
 * Empty for a plain transfer - its line is the two accounts.
 *
 * @param {Record<string, any>|null|undefined} tx
 * @param {Record<string, any>|null|undefined} [cat]  the row's category, when it has one
 */
export function txKindLabel(tx, cat) {
  if (!tx) return ''
  if (isLoanPayment(tx)) return 'Loan payment'
  if (tx.type === 'transfer') return ''
  if (tx.adjust === 'correction' || (!tx.adjust && tx.description === CORRECTION_DESC)) return 'Adjustment'
  if (tx.category === 'Debt Payment' || tx.category === 'Debt Collection') return 'Debt'
  return cat?.name ?? tx.category ?? ''
}

/**
 * A row's words in a list of every account's transactions: its title, and a
 * second line of where the money was and what kind of row it is -
 * "GCash · Food", "BPI → GCash", "BPI · Loan payment".
 *
 * A loan payment is titled with the loan. Its note, "Loan payment · Car
 * Loan", over "BPI → Car Loan" named the loan twice.
 *
 * @param {Record<string, any>} tx
 * @param {Record<string, any>|null|undefined} [cat]
 * @returns {{title: string, where: string, kind: string}}
 */
export function txRowWords(tx, cat) {
  const kind = txKindLabel(tx, cat)
  if (isLoanPayment(tx)) return { title: tx.toAccount, where: tx.fromAccount ?? '', kind }
  if (tx.type === 'transfer') {
    return { title: tx.description || `Transfer to ${tx.toAccount ?? ''}`, where: `${tx.fromAccount ?? ''} → ${tx.toAccount ?? ''}`, kind }
  }
  return { title: tx.description || tx.category || '—', where: tx.account ?? '', kind }
}
