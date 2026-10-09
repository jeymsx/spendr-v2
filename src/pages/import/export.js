/**
 * The ledger as CSV text: what Settings > Reports & exports > Transactions as
 * CSV downloads, and what the importer reads back (csv.js parseCSV).
 *
 * It lives beside the importer so the two lists of columns cannot drift: every
 * column written here has a reader there, and the round-trip test holds them
 * to it. No imports, because the Settings bundle loads this and the importer's
 * parser is not something Settings should pay for.
 *
 * ── The totals were always right ──
 *
 * A refund is stored as an expense with a NEGATIVE amount and a split is N
 * ordinary expenses, so SUM over `amount` and a pivot by category both come
 * out correct with no column here knowing either concept exists. That is the
 * whole payoff of the sign carrying the arithmetic.
 *
 * ── What was missing was the relationships ──
 *
 * Correct totals, unreadable rows. Two lines for one purchase looked like two
 * purchases, and a negative row looked like a typo rather than money that
 * came back from the line above it. refundOf, splitId and installmentId are
 * the links that were already in the data and had nowhere to go: which
 * purchase a refund came from, which legs are one purchase, which charges are
 * one plan. Empty on the ordinary rows, which is most of them.
 *
 * toAmount and toCurrency follow them: what arrived at the other end of a
 * transfer between two currencies. Blank everywhere else.
 *
 * ── And what makes a round trip whole ──
 *
 * currency, baseAmount and baseCurrency say what the amount is in and what it
 * was worth in the ledger's currency that day, priced once at write time
 * (lib/fxContext.js), and adjust marks a row that moved a balance without
 * being income or spending (lib/flows.js). Without them a dollar charge came
 * back as a peso one, priced at today's rate, and a balance correction came
 * back as income.
 *
 * What a CSV cannot carry is the other tables a row points at: the debt a
 * share created, the bill that posted a charge, the credit statement it
 * belongs to. Those are in a backup.
 */

export const CSV_HEADERS = [
  'txId', 'type', 'date', 'description', 'category',
  'payment', 'account', 'fromAccount', 'toAccount', 'amount',
  'refundOf', 'splitId', 'installmentId', 'toAmount', 'toCurrency',
  'currency', 'baseAmount', 'baseCurrency', 'adjust',
]

/**
 * One cell of a CSV that a spreadsheet will open.
 *
 * ── Text can be a formula ──
 *
 * Excel and Sheets run a cell that starts with = + - or @ as a formula, and a
 * tab or a carriage return in front hides the sign from a reader while the cell
 * still runs. A description of =HYPERLINK("http://evil", "Click") or
 * =cmd|' /C calc'!A0 typed into a note, or arriving in an imported file, would
 * run on whoever opened the export. So a text cell that starts with one of
 * those has an apostrophe put before it - the spreadsheet then shows it as
 * text, and csv.js takes the apostrophe off again on the way back in.
 *
 * ── A number is not text ──
 *
 * A number is written as it is, unquoted and unprotected: a refund of -500 has
 * to stay -500 in the sheet's own sum, and an apostrophe would make it a word.
 * Only a value that is typeof number gets this - a string of digits is text. A
 * number that is not finite is an empty cell.
 *
 * Every text cell is quoted, with its quotes doubled, so a comma, a quote or a
 * newline in it cannot move the cells after it.
 *
 * @param {unknown} v
 * @returns {string}
 */
export function csvCell(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  const s = String(v ?? '')
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

/**
 * A figure that may be missing: its number, or an empty cell.
 *
 * @param {unknown} v
 */
const figure = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? '' : csvCell(Number(v)))

/**
 * @param {Array<Record<string, any>>} transactions
 * @returns {string}  CRLF-separated, header first, no trailing newline
 */
export function transactionsToCsv(transactions) {
  const lines = [
    CSV_HEADERS.join(','),
    ...transactions.map(t => [
      csvCell(t.txId), csvCell(t.type), csvCell(t.date), csvCell(t.description),
      csvCell(t.category), csvCell(t.payment), csvCell(t.account),
      csvCell(t.fromAccount), csvCell(t.toAccount), figure(t.amount ?? 0),
      csvCell(t.refundOf), csvCell(t.splitId), csvCell(t.installmentId),
      figure(t.toAmount), csvCell(t.toCurrency),
      csvCell(t.currency), figure(t.baseAmount), csvCell(t.baseCurrency), csvCell(t.adjust),
    ].join(',')),
  ]
  return lines.join('\r\n')
}
