// Parse a display string (may contain commas) → number
export const parseMoney = (str) =>
  parseFloat(String(str ?? '').replace(/,/g, '')) || 0

// Format a number → display string with commas (no forced decimals)
export function numToMoneyStr(num) {
  if (!num) return '0'
  const str = String(num)
  const [int, dec] = str.split('.')
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec ? `${formatted}.${dec}` : formatted
}

// onChange handler factory for money inputs.
// Strips commas, validates, reformats with commas, then calls setState.
export function moneyChangeHandler(setState) {
  return (e) => {
    let v = e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, '')
    const parts = v.split('.')
    if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('')
    if (parts.length === 2 && parts[1].length > 2) v = parts[0] + '.' + parts[1].slice(0, 2)
    const intPart = v.split('.')[0]
    if (intPart.length > 10) return
    if (intPart.length > 1 && intPart.startsWith('0')) v = v.replace(/^0+/, '') || '0'
    const intFmt = v.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const dec = v.includes('.') ? '.' + v.split('.')[1] : ''
    setState(intFmt + dec || '0')
  }
}
