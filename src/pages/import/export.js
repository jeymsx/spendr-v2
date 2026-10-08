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

/** @param {unknown} v */
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

/**
 * @param {Array<Record<string, any>>} transactions
 * @returns {string}  CRLF-separated, header first, no trailing newline
 */
export function transactionsToCsv(transactions) {
  const lines = [
    CSV_HEADERS.join(','),
    ...transactions.map(t => [
      esc(t.txId), esc(t.type), esc(t.date), esc(t.description),
      esc(t.category), esc(t.payment), esc(t.account),
      esc(t.fromAccount), esc(t.toAccount), Number(t.amount ?? 0),
      esc(t.refundOf), esc(t.splitId), esc(t.installmentId),
      t.toAmount ?? '', esc(t.toCurrency),
      esc(t.currency), t.baseAmount ?? '', esc(t.baseCurrency), esc(t.adjust),
    ].join(',')),
  ]
  return lines.join('\r\n')
}
