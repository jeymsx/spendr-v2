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

// onChange handler factory for money inputs.
// Strips commas, validates, reformats with commas, then calls setState.
/* `decimals`: how many places the amount's currency has (lib/money.js
   baseDecimals) - the ledger's, unless the field is in an account's own
   currency. A yen or a won has none: "1,500.75" was accepted, stored, and
   shown back as ¥1,501. A point typed into one stays, and takes nothing
   after it; dropping it let the digits after it run on, and "1500.75"
   came out as ¥150,075. */
/** @param {(v: string) => void} setState @param {number} [decimals] */
export function moneyChangeHandler(setState, decimals = baseDecimals()) {
  return (/** @type {{target: {value: string}}} */ e) => {
    let v = e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, '')
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
