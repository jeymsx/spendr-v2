// Parse a display string (may contain commas) → number
/** @param {string|number} [str] */
export const parseMoney = (str) =>
  parseFloat(String(str ?? '').replace(/,/g, '')) || 0

// Format a number → display string with commas (no forced decimals)
/** @param {number} num */
export function numToMoneyStr(num) {
  if (!num) return '0'
  const str = String(num)
  const [int, dec] = str.split('.')
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec ? `${formatted}.${dec}` : formatted
}

// onChange handler factory for money inputs.
// Strips commas, validates, reformats with commas, then calls setState.
/** @param {(v: string) => void} setState */
export function moneyChangeHandler(setState) {
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
    if (parts.length === 2 && parts[1].length > 2) v = parts[0] + '.' + parts[1].slice(0, 2)
    const intPart = v.split('.')[0]
    if (intPart.length > 10) return
    if (intPart.length > 1 && intPart.startsWith('0')) v = v.replace(/^0+/, '') || '0'
    const intFmt = v.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const dec = v.includes('.') ? '.' + v.split('.')[1] : ''
    setState(intFmt + dec || '0')
  }
}
