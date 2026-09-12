/**
 * Pesos, formatted. One copy.
 *
 * ── What this replaces ──
 *
 * Twenty-one hand-written `const fmt = (v) => …` and twenty-six separate
 * `new Intl.NumberFormat('en-PH', …)` constructions, spread across pages,
 * sheets and components. Nobody decided that; it is what happens when the
 * twentieth screen is written by copying the nineteenth.
 *
 * It was verified before it was deleted, because "they all look the same" is
 * not the same as "they are the same" when the thing being unified is how
 * money renders. Grouped by normalised body, the twenty-one fell into five
 * spellings and two behaviours: nineteen identical up to the local formatter's
 * name, and one deliberate exception (below). All twenty-six formatters were
 * `{ minimumFractionDigits: 2, maximumFractionDigits: 2 }` on `en-PH`, so
 * there was no rounding difference hiding in any of them. Same for the seven
 * copies of fmtCompact: three spellings, one behaviour, since `return fmt(v)`
 * and `return sign + _php.format(abs)` produce the same string.
 *
 * ── The two exceptions, kept local on purpose ──
 *
 * components/pdf/MonthlyReport.jsx writes "PHP 1,200.00" rather than
 * "₱1,200.00". That is not drift: the PDF renders with Helvetica, which has
 * no peso glyph, so importing this would put a blank box in every row of a
 * document people print.
 *
 * pages/Budget.jsx keeps a whole-peso formatter for its chart axis, where two
 * decimals on every tick is noise rather than precision.
 *
 * ── The minus sign ──
 *
 * U+2212 MINUS SIGN, not a hyphen. It is the width of a plus and sits at the
 * same height as the digits, which is what keeps a column of tabular figures
 * lining up. Every one of the twenty-one already used it; this only writes it
 * down once.
 */

const _php = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * The full figure, signed. "₱1,200.00", "−₱340.50".
 *
 * @param {number} [v]
 * @returns {string}
 */
export const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _php.format(Math.abs(n))
}

/**
 * The short one, for anywhere a column is narrower than a peso amount:
 * "₱1.2K", "₱3.4M", and the full figure below a thousand.
 *
 * @param {number} [v]
 * @returns {string}
 */
export function fmtCompact(v) {
  const abs = Math.abs(v ?? 0)
  const sign = (v ?? 0) < 0 ? '−₱' : '₱'
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000) return sign + (abs / 1_000).toFixed(1) + 'K'
  return fmt(v)
}
