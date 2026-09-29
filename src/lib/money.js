/**
 * Money, formatted. One copy.
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
 * ── Why the peso is no longer written into it ──
 *
 * It was `'₱' + _php.format(…)` until somebody needed a dollar account, and
 * then every one of the 55 files importing this was showing a peso sign in
 * front of a dollar figure. The glyph now comes from lib/currency.js, and
 * WHICH currency comes from one of two places:
 *
 *   the base currency   the app-wide default, set from the preference at
 *                       boot. What `fmt(v)` uses, so all 55 call sites keep
 *                       their one-argument call and start telling the truth.
 *   an explicit code    `fmt(v, acct.currency)`, for anywhere the amount
 *                       belongs to a particular account rather than to the
 *                       ledger as a whole.
 *
 * ── The base is module state, and that is deliberate ──
 *
 * A context value would be more React-ish and would mean touching all 55
 * files to read it. This is a single app-wide setting that changes when
 * somebody edits their profile, so CurrencyProvider owns it: the provider
 * writes it here and remounts the tree when it changes, which is what makes
 * reading module state during a render safe. Nothing else may call the
 * setter. `useBaseCurrency()` is there for a component that wants the code
 * itself rather than a formatted figure.
 *
 * ── The two exceptions, kept local on purpose ──
 *
 * components/pdf/MonthlyReport.jsx writes "PHP 1,200.00" rather than
 * "₱1,200.00". That is not drift: the PDF renders with Helvetica, which has
 * no peso glyph, so importing this would put a blank box in every row of a
 * document people print.
 *
 * pages/Budget.jsx keeps a whole-unit formatter for its chart axis, where two
 * decimals on every tick is noise rather than precision.
 */

import {
  DEFAULT_CURRENCY, compactAmount, decimalsOf, formatAmount, isCurrencyCode, maskedAmount, symbolOf,
} from './currency'

let base = DEFAULT_CURRENCY

/**
 * The app-wide currency. Read by `fmt` when no code is passed.
 *
 * Only CurrencyProvider calls this. An unknown code is ignored rather than
 * stored, so a corrupted preference cannot leave every figure in the app
 * labelled with garbage.
 *
 * @param {string|null|undefined} code
 */
export function setBaseCurrency(code) {
  const up = code ? String(code).toUpperCase() : ''
  /* Shape, not membership. The registry's twenty-two are the ones with a
     curated name and a flag, never the only ones a ledger may be kept in -
     currencyOf describes any code through Intl, so refusing NOK here would be
     our shortlist overruling somebody's bank. Garbage still cannot stick. */
  base = isCurrencyCode(up) ? up : DEFAULT_CURRENCY
  return base
}

/** @returns {string} */
export function getBaseCurrency() {
  return base
}

/**
 * The full figure, signed. "₱1,200.00", "−$340.50".
 *
 * @param {number} [v]
 * @param {string} [code]  the amount's own currency; the base if omitted
 * @returns {string}
 */
export const fmt = (v, code) => formatAmount(v, code ?? base)

/**
 * The short one, for anywhere a column is narrower than an amount:
 * "₱1.2K", "$3.4M", and the full figure below a thousand.
 *
 * @param {number} [v]
 * @param {string} [code]
 * @returns {string}
 */
export const fmtCompact = (v, code) => compactAmount(v, code ?? base)

/**
 * What a figure reads as while balances are hidden: "₱ ••••".
 *
 * @param {string} [code]
 * @param {number} [dots]
 */
export const fmtHidden = (code, dots = 4) => maskedAmount(code ?? base, dots)

/**
 * Just the glyph: "₱", "$", "A$".
 *
 * For the places that are not formatting a number at all - the prefix sitting
 * inside an amount field, a "₱0.00" placeholder, the label on a slider. There
 * were about forty of those and every one of them was the peso.
 *
 * A function rather than a constant because the base currency can change
 * under it. It is safe to call during a render of a component that does not
 * consume CurrencyContext: the provider remounts the tree when the currency
 * changes, precisely so that this is true. See context/CurrencyContext.jsx.
 *
 * @param {string} [code]
 */
export const baseSymbol = (code) => symbolOf(code ?? base)

/**
 * How many places an amount is typed to: its currency's own - none for the
 * yen or the won - and the base's when no code is given. moneyChangeHandler
 * stops the typing there, so a field never takes a figure its currency does
 * not have.
 *
 * @param {string} [code]
 */
export const baseDecimals = (code) => decimalsOf(code ?? base)

/**
 * An empty amount field's placeholder: "0.00", or "0" for a currency quoted
 * whole, which is how the field will take it.
 *
 * @param {string} [code]
 */
export const zeroAmount = (code) => (baseDecimals(code) > 0 ? '0.00' : '0')
