/**
 * Which currency, and what it looks like.
 *
 * ── Why this is not just a symbol lookup ──
 *
 * The app was written peso-only. Not as a decision - it is simply what was in
 * front of whoever wrote the first screen, and the nineteen after it copied
 * it. `₱` is hardcoded in about seventy places, `en-PH` in twenty-six, and
 * `accounts.currency` has been in the Dexie schema since v1 while every row
 * ever written set it to the literal 'PHP'.
 *
 * So this is the registry those places were missing. It is deliberately data
 * and pure functions: no Dexie, no React, no fetch. What the CURRENT currency
 * is belongs to lib/money.js (the app-wide default) and to an account's own
 * `currency` field; what a currency IS belongs here.
 *
 * ── The decimals are not all two ──
 *
 * Yen, won and dong are quoted whole. Writing ¥1,200.00 is not more precise,
 * it is wrong in the way that tells a reader the app has never seen a yen.
 *
 * ── The minus sign ──
 *
 * U+2212 MINUS SIGN, not a hyphen, and before the symbol: −$340.50. It is the
 * width of a plus and sits at the digits' height, which is what keeps a column
 * of tabular figures lining up. The peso formatter this generalises already
 * did it; this only keeps doing it for the rest.
 */

/** The fallback everywhere, and what every existing row already says. */
export const DEFAULT_CURRENCY = 'PHP'

/**
 * The currencies offered in the pickers.
 *
 * Picked for who actually uses this: the Philippines, plus the places
 * Filipinos hold accounts and get paid from. Not an exhaustive ISO 4217 list -
 * a hundred and eighty rows in a phone-sized select is worse than twenty.
 *
 * `name` is Title Case because it is a label in a picker, not prose.
 *
 * `symbol` is what gets rendered, so where a bare glyph would be ambiguous in
 * a peso app the symbol is disambiguated: A$, S$, C$, HK$, NZ$, NT$, so a
 * dollar amount always says WHICH dollar.
 */
/** @type {Record<string, {symbol: string, name: string, decimals: number}>} */
export const CURRENCIES = {
  PHP: { symbol: '₱',   name: 'Philippine Peso',      decimals: 2 },
  USD: { symbol: '$',   name: 'US Dollar',            decimals: 2 },
  EUR: { symbol: '€',   name: 'Euro',                 decimals: 2 },
  GBP: { symbol: '£',   name: 'British Pound',        decimals: 2 },
  JPY: { symbol: '¥',   name: 'Japanese Yen',         decimals: 0 },
  AUD: { symbol: 'A$',  name: 'Australian Dollar',    decimals: 2 },
  CAD: { symbol: 'C$',  name: 'Canadian Dollar',      decimals: 2 },
  SGD: { symbol: 'S$',  name: 'Singapore Dollar',     decimals: 2 },
  HKD: { symbol: 'HK$', name: 'Hong Kong Dollar',     decimals: 2 },
  NZD: { symbol: 'NZ$', name: 'New Zealand Dollar',   decimals: 2 },
  CHF: { symbol: 'CHF', name: 'Swiss Franc',          decimals: 2 },
  AED: { symbol: 'AED', name: 'UAE Dirham',           decimals: 2 },
  SAR: { symbol: 'SAR', name: 'Saudi Riyal',          decimals: 2 },
  QAR: { symbol: 'QAR', name: 'Qatari Riyal',         decimals: 2 },
  KRW: { symbol: '₩',   name: 'South Korean Won',     decimals: 0 },
  CNY: { symbol: 'CN¥', name: 'Chinese Yuan',         decimals: 2 },
  TWD: { symbol: 'NT$', name: 'New Taiwan Dollar',    decimals: 2 },
  MYR: { symbol: 'RM',  name: 'Malaysian Ringgit',    decimals: 2 },
  THB: { symbol: '฿',   name: 'Thai Baht',            decimals: 2 },
  IDR: { symbol: 'Rp',  name: 'Indonesian Rupiah',    decimals: 0 },
  VND: { symbol: '₫',   name: 'Vietnamese Dong',      decimals: 0 },
  INR: { symbol: '₹',   name: 'Indian Rupee',         decimals: 2 },
}

/**
 * Whether a string could be a currency code at all.
 *
 * The registry's twenty-two are the ones this app offers a flag and a curated
 * name for; they were never meant to be the only ones somebody may HOLD. The
 * provider sends a hundred and eighty, currencyOf can describe any of them
 * through Intl, and refusing to store 'NOK' because it is not on our
 * shortlist would be the app's own list overruling the user's bank.
 *
 * Shape only, and deliberately: three letters is ISO 4217, and the two-to-four
 * range lets the crypto tickers the provider also sends through rather than
 * silently discarding a currency somebody selected.
 *
 * @param {unknown} code
 */
export function isCurrencyCode(code) {
  return typeof code === 'string' && /^[A-Za-z]{2,4}$/.test(code)
}

/** Every code, in the order the pickers should show them. */
export const CURRENCY_CODES = Object.keys(CURRENCIES)

/**
 * The registry entry, never undefined.
 *
 * An unknown code renders as its own code rather than as a blank: a balance
 * labelled "NOK 500.00" is readable and obviously foreign, which is what
 * somebody wants to see if a currency arrived from a sync written by a newer
 * version of the app than theirs.
 *
 * @param {string|null|undefined} code
 */
export function currencyOf(code) {
  if (!code) return CURRENCIES[DEFAULT_CURRENCY]
  const up = String(code).toUpperCase()
  const c = CURRENCIES[up]
  if (c) return c

  /* Not in the registry, which is now the common case: the registry holds the
     twenty-two you can open an account in, and the rate table carries a
     hundred and eighty. Intl knows the rest - it has the symbol and, more
     importantly, how many places the currency is actually quoted to, which is
     the thing that would otherwise print a Japanese figure with centavos. */
  try {
    const nf = new Intl.NumberFormat('en-PH', { style: 'currency', currency: up })
    const sym = nf.formatToParts(0).find(p => p.type === 'currency')?.value
    return {
      symbol: sym && sym !== up ? sym : up + ' ',
      name: currencyName(up),
      decimals: nf.resolvedOptions().maximumFractionDigits ?? 2,
    }
  } catch {
    /* A code Intl will not take - a crypto ticker, most likely. Its own
       letters are a better label than a blank. */
    return { symbol: up + ' ', name: up, decimals: 2 }
  }
}

/** @param {string|null|undefined} code */
export const symbolOf = (code) => currencyOf(code).symbol

/** How many decimals a currency is written with: 2 for most, 0 for the yen and the won. @param {string|null|undefined} code */
export const decimalsOf = (code) => currencyOf(code).decimals

/**
 * Currencies that must NOT be given a flag by the rule below.
 *
 * The rule is "the first two letters are the country", and it is right for
 * 172 of the 180 codes the rate table carries. It is confidently WRONG for
 * these, which is worse than having no answer: BTC would fly the flag of
 * Bhutan, ETH Ethiopia, DOT the Dominican Republic and SOL Somalia.
 *
 * Crypto and the metals have no country. The X-codes are ISO 4217's own
 * reservation for things that are not one currency of one state - CFA francs
 * shared by fourteen countries, the East Caribbean dollar by eight, the IMF's
 * drawing rights by none - and picking one member's flag would be a claim
 * this app has no business making.
 */
const NO_FLAG = new Set([
  'ADA', 'ARB', 'BNB', 'BTC', 'DAI', 'DOT', 'ETH', 'LTC', 'OP', 'SOL', 'XRP',
  'XAG', 'XAU', 'XPD', 'XPT',
  'XAF', 'XOF', 'XCD', 'XDR',
])

/** The two that the rule gets wrong in a fixable way.
 *  @type {Record<string, string>} */
const COUNTRY_OVERRIDE = {
  // Netherlands Antilles is dissolved; the guilder is Curacao's and Sint Maarten's.
  ANG: 'CW',
  // CFP franc, whose three territories share French Polynesia's flag in practice.
  XPF: 'PF',
}

/**
 * The country whose flag stands for a currency, or null.
 *
 * ── The rule is the first two letters, and that is not a hack ──
 *
 * ISO 4217 builds a currency code from the ISO 3166 country code plus a
 * letter for the currency's name: US + D, PH + P, NO + K, TH + B. It holds
 * for 172 of the 180 codes the provider sends, which is why there is a rule
 * here and not a table of 180 rows to keep in step with a list that changes.
 *
 * The exceptions are handled above, and they are handled by REFUSING rather
 * than guessing - see NO_FLAG.
 *
 * @param {string} code
 * @returns {string|null} ISO 3166 alpha-2, uppercase
 */
export function countryOf(code) {
  const up = String(code ?? '').toUpperCase()
  if (!/^[A-Z]{2,4}$/.test(up)) return null
  if (NO_FLAG.has(up)) return null
  return COUNTRY_OVERRIDE[up] ?? (up.length >= 2 ? up.slice(0, 2) : null)
}

/**
 * A currency's name, for the ones the registry does not carry.
 *
 * The registry holds twenty-two - the ones this app draws a flag for and
 * offers in its pickers. The rate table carries a hundred and sixty-six, and
 * the "all currencies" sheet lists every one of them, so something has to
 * name the other hundred and forty-four.
 *
 * `Intl.DisplayNames` is that something: it is in the browser already, it
 * names 160 of the 166 correctly, and shipping a table of our own would be
 * shipping a worse copy of data the platform has. The registry still wins
 * where it has an entry, so the pickers keep the Title Case wording chosen
 * for them.
 *
 * Falls back to the code, which is what an unknown currency is called.
 *
 * @param {string} code
 */
export function currencyName(code) {
  const up = String(code ?? '').toUpperCase()
  if (CURRENCIES[up]) return CURRENCIES[up].name
  try {
    const named = new Intl.DisplayNames(['en'], { type: 'currency' }).of(up)
    if (named && named !== up) return named
  } catch { /* old browser, or a code Intl will not take */ }
  return up
}

/**
 * Grouping, per decimal count. Built once each, because Intl.NumberFormat is
 * expensive to construct and these render inside lists.
 *
 * 'en-PH' rather than a locale per currency, on purpose: the reader is the
 * same person whatever the account, and switching 1,234.56 to 1.234,56 in the
 * middle of their own list because one row is in euros helps nobody.
 */
const groupers = new Map()
function grouper(/** @type {number} */ decimals) {
  let g = groupers.get(decimals)
  if (!g) {
    g = new Intl.NumberFormat('en-PH', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    groupers.set(decimals, g)
  }
  return g
}

const MINUS = '−'

/**
 * The full figure, signed. "₱1,200.00", "−$340.50", "¥1,200".
 *
 * @param {number} [v]
 * @param {string} [code]
 * @returns {string}
 */
export function formatAmount(v, code) {
  const n = Number.isFinite(v) ? /** @type {number} */ (v) : 0
  const { symbol, decimals } = currencyOf(code)
  return (n < 0 ? MINUS : '') + symbol + grouper(decimals).format(Math.abs(n))
}

/**
 * A figure rounded to the places its currency is quoted to.
 *
 * ── Why this exists ──
 *
 * Money arrives here as binary floats, and adding them is not exact: 0.1 plus
 * 0.2 is 0.30000000000000004. A balance that has had a few hundred
 * transactions applied to it drifts the same way, and every screen hid it
 * because `fmt` rounds on the way out - except the account form, which put
 * the stored number straight into a text field and showed somebody their
 * balance as 140.0000000123.
 *
 * Rounding at the currency's own places is exact rather than lossy here,
 * because every amount that moves a balance is already a whole number of
 * cents: typed amounts are capped at two places by moneyChangeHandler, splits
 * distribute in cents, and installments store the monthly figure you typed.
 * The true result is always on the cent; rounding only removes the noise
 * around it.
 *
 * Half away from zero, which is how money is conventionally rounded - plain
 * Math.round sends -2.5 to -2. The EPSILON nudge is what makes 1.005 round to
 * 1.01 instead of 1.00, since 1.005 is stored as 1.00499999999999989...
 *
 * @param {number} n
 * @param {string} [code]  the currency, for its decimal places; two if omitted
 * @returns {number}
 */
export function roundMoney(n, code) {
  if (!Number.isFinite(n)) return 0
  const f = 10 ** currencyOf(code).decimals
  const r = Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * f) / f
  // Never a negative zero: it prints as "0" but compares and sorts oddly.
  return r === 0 ? 0 : r
}

/**
 * The figure to the whole unit: "₱128,450", "−$340". For a headline, where
 * the centavos are noise at 56px - never for a ledger row, where they are
 * the point. Rounded half away from zero, the same way roundMoney rounds.
 *
 * @param {number} [v]
 * @param {string} [code]
 * @returns {string}
 */
export function formatWhole(v, code) {
  const n = Number.isFinite(v) ? /** @type {number} */ (v) : 0
  const whole = Math.round(Math.abs(n) + Number.EPSILON)
  return (n < 0 && whole !== 0 ? MINUS : '') + symbolOf(code) + grouper(0).format(whole)
}

/** Largest first, so the first tier a figure reaches is the one it is written in. */
const COMPACT_TIERS = /** @type {const} */ ([
  [1_000_000_000_000, 'T'],
  [1_000_000_000, 'B'],
  [1_000_000, 'M'],
  [1_000, 'K'],
])

/**
 * The short one, for anywhere a column is narrower than an amount:
 * "₱1.2K", "$3.4M", "₱2.0B", and the full figure below a thousand.
 *
 * It goes up to a trillion. Without the B tier ten billion read "₱10000.0M"
 * and a corrupt figure of a quadrillion "₱999999999.9M" - the longest string
 * on the screen, in the place that exists to be short.
 *
 * @param {number} [v]
 * @param {string} [code]
 * @returns {string}
 */
export function compactAmount(v, code) {
  const n = Number.isFinite(v) ? /** @type {number} */ (v) : 0
  const abs = Math.abs(n)
  const sign = (n < 0 ? MINUS : '') + symbolOf(code)
  for (const [from, mark] of COMPACT_TIERS) {
    if (abs >= from) return sign + (abs / from).toFixed(1) + mark
  }
  return formatAmount(n, code)
}

/**
 * Every single-character currency mark in the registry, as the inside of a
 * character class: "₱$€£¥₩฿₫₹".
 *
 * For the two places that READ money out of text rather than writing it -
 * quick log's parser and the transaction search - both of which had the peso
 * hardcoded, so "$50 lunch" parsed the 50 and left a stray dollar sign in the
 * description, and searching "$500" matched nothing.
 *
 * Single characters only, deliberately. The multi-letter marks (A$, CHF, RM)
 * are prose as much as notation, and admitting them to a character class
 * would mean "RM" in a note stopped being letters.
 *
 * Derived from the registry rather than typed out again, so a currency added
 * above is understood by the parsers in the same commit.
 */
export const SINGLE_MARKS = [...new Set(
  Object.values(CURRENCIES).map(c => c.symbol).filter(s => s.length === 1),
)].join('')

/**
 * The masked figure, for when balances are hidden.
 *
 * It keeps the symbol, because the dots are already telling you the number is
 * none of your business and hiding WHICH currency as well only makes the row
 * unidentifiable. Written here rather than as '₱ ••••' in eleven files, which
 * is what it was.
 *
 * @param {string} [code]
 * @param {number} [dots]
 */
export function maskedAmount(code, dots = 4) {
  return symbolOf(code) + ' ' + '•'.repeat(dots)
}
