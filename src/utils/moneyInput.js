import { roundMoney } from '../lib/currency'
import { baseDecimals, getBaseCurrency } from '../lib/money'

// Parse a display string (may contain commas) → number
/** @param {string|number} [str] */
export const parseMoney = (str) =>
  parseFloat(String(str ?? '').replace(/,/g, '')) || 0

/**
 * A number, as the string a money field should be prefilled with.
 *
 * Rounded to the currency's places first, which is the fix for a balance appearing as
 * 140.0000000123. The stored figure carries binary float noise from every
 * addition that ever built it; `fmt` rounds on the way to the screen, so the
 * noise was invisible everywhere except here, where the raw number went
 * straight into a text field.
 *
 * The ledger's places unless `code` says otherwise, as moneyChangeHandler
 * takes them - a prefill must never be more precise than the field would
 * accept from your keyboard. Commas, no forced trailing zeros.
 *
 * @param {number} num
 * @param {string} [code]  the amount's currency; the base if omitted
 */
export function numToMoneyStr(num, code) {
  if (!num) return '0'
  const r = roundMoney(num, code ?? getBaseCurrency())
  if (!r) return '0'
  const str = String(r)
  const [int, dec] = str.split('.')
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec ? `${formatted}.${dec}` : formatted
}

/* What a typed or pasted value says its sign and magnitude are, before the
   handler strips it to digits. Any dash: the hyphen, the Unicode minus and
   the typographic dashes a spreadsheet or a bank's SMS may carry. */
const MINUS = /[-\u2010-\u2015\u2212\uFE63\uFF0D]/
// "(500)", an accountant's negative.
const ACCOUNTING_NEGATIVE = /\(\s*[^)]*\d[^)]*\)/
// "1e9", "2E+3", "1.5e3": a digit, an e, and a digit.
const EXPONENT = /\d[eE]\+?\d/
// "1.234,50" and "1 234,5": dots or spaces group the thousands and the comma is the decimal.
const COMMA_DECIMAL = /^\d{1,3}(?:[.\s]\d{3})+,\d{1,2}$/
// "1.234.567": two or more dot groups can only be thousands.
const DOT_THOUSANDS = /^\d{1,3}(?:\.\d{3}){2,}$/

/**
 * The digits and the one decimal point in what was typed or pasted - or null
 * when it says something a plain amount cannot, and the field should stay as
 * it was.
 *
 * Stripping everything that is not a digit is right for a currency symbol
 * ("₱500" is 500) and for the grouping commas the field puts in itself, and it
 * was wrong for four things that look like numbers:
 *
 *   - "-500" and "(500)" lost their sign and became +500. Every money field
 *     here takes an amount, not a signed one, so these are refused rather
 *     than quietly turned into a different, positive figure. A dash anywhere
 *     counts: pasted into "12" the result is "12-500", and stripping that to
 *     "12500" is the same mistake.
 *   - "1e9" lost its e and became 19, and "1e15" became 115. Exponent
 *     notation is not an amount anyone types.
 *   - "1.234,50", a European or spreadsheet amount, lost its comma
 *     and became 1.23. Where the shape is unambiguous (dots or spaces in
 *     groups of three, then a comma and one or two digits) it is read as
 *     1234.50; "1.234.567" is read as 1,234,567.
 *
 * A lone comma stays a thousands comma and is stripped, as it always was: the
 * field reformats as you type, so "1,50" is as likely to be "1,250" with a 2
 * deleted as it is a decimal comma, and a guess is no better than leaving it.
 *
 * @param {string} raw  the whole value of the input after the keystroke or paste
 * @returns {string|null}
 */
export function typedMoneyDigits(raw) {
  const s = String(raw ?? '')
  if (MINUS.test(s) || ACCOUNTING_NEGATIVE.test(s) || EXPONENT.test(s)) return null
  // Only what a figure is made of, to see its shape; the symbol and any words fall away.
  const shape = s.replace(/[^\d.,\s]/g, '').trim()
  if (COMMA_DECIMAL.test(shape)) return shape.replace(/[.\s]/g, '').replace(',', '.')
  if (DOT_THOUSANDS.test(shape)) return shape.replace(/\./g, '')
  return s.replace(/,/g, '').replace(/[^0-9.]/g, '')
}

// onChange handler factory for money inputs.
// Strips commas, validates, reformats with commas, then calls setState.
// A value that is not a plain amount (typedMoneyDigits) leaves the field as it was.
/* `decimals`: how many places the amount's currency has (lib/money.js
   baseDecimals) - the ledger's, unless the field is in an account's own
   currency. A yen or a won has none: "1,500.75" was accepted, stored, and
   shown back as ¥1,501. A point typed into one stays, and takes nothing
   after it; dropping it let the digits after it run on, and "1500.75"
   came out as ¥150,075. */
/** @param {(v: string) => void} setState @param {number} [decimals] */
export function moneyChangeHandler(setState, decimals = baseDecimals()) {
  return (/** @type {{target: {value: string}}} */ e) => {
    const digits = typedMoneyDigits(e.target.value)
    // Not an amount: no setState, so a controlled input snaps back to what it showed.
    if (digits === null) return
    let v = digits
    /* Re-split after the join, which is the whole bug this used to have.
       `parts` was computed once from the raw value, so after the extra points
       were joined away it still reported the ORIGINAL count - and the
       two-decimal guard below, which only fires at a length of exactly 2,
       never ran. Typing "12.34.56" produced "12.3456", and parseMoney handed
       that sub-centavo amount straight to the ledger. */
    let parts = v.split('.')
    if (parts.length > 2) {
      v = parts[0] + '.' + parts.slice(1).join('')
      parts = v.split('.')
    }
    if (parts.length === 2 && parts[1].length > decimals) v = parts[0] + '.' + parts[1].slice(0, decimals)
    const intPart = v.split('.')[0]
    if (intPart.length > 10) return
    if (intPart.length > 1 && intPart.startsWith('0')) v = v.replace(/^0+/, '') || '0'
    const intFmt = v.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const dec = v.includes('.') ? '.' + v.split('.')[1] : ''
    setState(intFmt + dec || '0')
  }
}
