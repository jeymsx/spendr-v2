import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseMoney, numToMoneyStr, moneyChangeHandler } from './moneyInput'
import { setBaseCurrency, zeroAmount } from '../lib/money'

/**
 * The money input, which every amount in the app is typed through.
 *
 * It had no tests, and it is the one place a typing mistake becomes a wrong
 * number rather than a wrong pixel: a handler that lets a second decimal point
 * through, or drops a leading digit, writes a different amount to the ledger
 * than the one on the screen.
 */

describe('parseMoney', () => {
  it('reads a plain number', () => {
    expect(parseMoney('1200')).toBe(1200)
    expect(parseMoney('1200.50')).toBe(1200.5)
  })

  it('reads the commas its own formatter puts in', () => {
    expect(parseMoney('1,234,567.89')).toBe(1234567.89)
  })

  it('is zero rather than NaN on anything unreadable', () => {
    // NaN would flow into a balance and poison every figure downstream.
    expect(parseMoney('')).toBe(0)
    expect(parseMoney(undefined)).toBe(0)
    expect(parseMoney(null)).toBe(0)
    expect(parseMoney('abc')).toBe(0)
  })

  it('takes a number as readily as a string', () => {
    expect(parseMoney(1200)).toBe(1200)
  })
})

describe('numToMoneyStr', () => {
  it('groups thousands without forcing decimals', () => {
    expect(numToMoneyStr(1200)).toBe('1,200')
    expect(numToMoneyStr(1234567)).toBe('1,234,567')
  })

  it('keeps the decimals that are there', () => {
    expect(numToMoneyStr(1200.5)).toBe('1,200.5')
    expect(numToMoneyStr(0.25)).toBe('0.25')
  })

  it('shows a bare zero rather than an empty field', () => {
    expect(numToMoneyStr(0)).toBe('0')
    expect(numToMoneyStr(undefined)).toBe('0')
  })

  /* What the account form showed for a balance built from a few hundred
     transactions. fmt rounds on the way to the screen, so this was the only
     field that ever showed the float noise underneath. */
  it('never prefills a field with float noise', () => {
    expect(numToMoneyStr(140.0000000123)).toBe('140')
    expect(numToMoneyStr(0.1 + 0.2)).toBe('0.3')
    expect(numToMoneyStr(1234.5600000001)).toBe('1,234.56')
    expect(numToMoneyStr(99.99499999)).toBe('99.99')
  })

  it('rounds half away from zero, as money does', () => {
    // 1.005 is stored as 1.00499999999999989 - the EPSILON nudge is what
    // stops it rounding down to 1.00.
    expect(numToMoneyStr(1.005)).toBe('1.01')
    expect(numToMoneyStr(2.675)).toBe('2.68')
  })

  it('shows nothing of a figure that rounds away to nought', () => {
    expect(numToMoneyStr(0.0000000123)).toBe('0')
  })

  it('round-trips through parseMoney', () => {
    for (const n of [0, 1, 999, 1000, 1234.56, 1234567.89]) {
      expect(parseMoney(numToMoneyStr(n))).toBe(n)
    }
  })
})

describe('moneyChangeHandler', () => {
  /** Fires the handler with what a user just typed, returns what it set. */
  const typed = (/** @type {string} */ value) => {
    const set = vi.fn()
    moneyChangeHandler(set)({ target: { value } })
    return set.mock.calls.length ? set.mock.calls[0][0] : undefined
  }

  it('adds the grouping commas as you type', () => {
    expect(typed('1200')).toBe('1,200')
    expect(typed('1234567')).toBe('1,234,567')
  })

  it('throws away anything that is not a digit or a point', () => {
    expect(typed('₱1,2a0b0')).toBe('1,200')
  })

  it('caps the decimals at two, because pesos have two', () => {
    expect(typed('12.3456')).toBe('12.34')
    expect(typed('100.999')).toBe('100.99')
  })

  /**
   * The regression test for a real bug.
   *
   * A second decimal point used to escape the two-decimal cap: "12.34.56"
   * became "12.3456", and parseMoney handed that sub-centavo amount to the
   * ledger from a field whose whole job is to refuse one.
   *
   * One stale variable. `parts` was computed once from the raw value, so
   * after the extra points were joined away it still reported the original
   * count, and the guard below - which only fires at a length of exactly 2 -
   * never ran:
   *
   *     const parts = v.split('.')                                   // 3
   *     if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('')
   *     if (parts.length === 2 && parts[1].length > 2) ...           // skipped
   *
   * Re-splitting after the join is the fix. These are the two inputs that
   * used to get through.
   */
  it('holds the two-decimal cap even against a second decimal point', () => {
    expect(typed('12.34.56')).toBe('12.34')
    expect(typed('1.2.3.4')).toBe('1.23')
  })

  it('strips a leading zero rather than writing 0123', () => {
    expect(typed('0123')).toBe('123')
  })

  it('keeps a lone zero, which is a legitimate thing to be typing', () => {
    expect(typed('0')).toBe('0')
  })

  it('keeps the zero in 0.50', () => {
    expect(typed('0.50')).toBe('0.50')
  })

  /**
   * Ten integer digits is ₱9,999,999,999 - past that the field stops accepting
   * input entirely rather than truncating, so a stuck key cannot silently
   * write a different number from the one being typed.
   */
  it('refuses an eleventh integer digit instead of truncating', () => {
    expect(typed('12345678901')).toBeUndefined()
    expect(typed('1234567890')).toBe('1,234,567,890')
  })
})

/**
 * Pasting is the same event as typing, with more characters in it. Stripping
 * to digits was right for a currency symbol and for commas, and silently wrong
 * for a sign, an exponent and a European amount - each became a different,
 * valid-looking number in the field.
 */
describe('pasting an amount', () => {
  /** What the field shows after `value` lands in it; undefined when the handler leaves the field alone. */
  const pasted = (/** @type {string} */ value) => {
    const set = vi.fn()
    moneyChangeHandler(set)({ target: { value } })
    return set.mock.calls.length ? set.mock.calls[0][0] : undefined
  }

  it('reads thousands commas and a leading currency symbol', () => {
    expect(pasted('1,234.50')).toBe('1,234.50')
    expect(parseMoney(pasted('1,234.50'))).toBe(1234.5)
    expect(pasted('₱500')).toBe('500')
    expect(pasted('₱ 1,234,567.89')).toBe('1,234,567.89')
    expect(pasted('PHP 2,500')).toBe('2,500')
    expect(pasted('$99.99')).toBe('99.99')
  })

  it('reads a comma as the decimal when dots or spaces group the thousands', () => {
    expect(pasted('1.234,50')).toBe('1,234.50')
    expect(parseMoney(pasted('1.234,50'))).toBe(1234.5)
    expect(pasted('₱1.234.567,8')).toBe('1,234,567.8')
    expect(pasted('1 234,50')).toBe('1,234.50')
    expect(pasted('1.234.567')).toBe('1,234,567')
  })

  it('leaves a lone comma a thousands comma, because the field itself writes them', () => {
    // "1,250" with the 2 deleted is "1,50", and that is 150, not 1.50.
    expect(pasted('1,50')).toBe('150')
    expect(pasted('12,345')).toBe('12,345')
  })

  /** The bug: "1e9" came out as 19 and "1e15" as 115. */
  it('refuses exponent notation and keeps the field as it was', () => {
    expect(pasted('1e9')).toBeUndefined()
    expect(pasted('1e15')).toBeUndefined()
    expect(pasted('2E3')).toBeUndefined()
    expect(pasted('1.5e3')).toBeUndefined()
    expect(pasted('₱1e9')).toBeUndefined()
    // Into a field that already says 12: "12" + "e5".
    expect(pasted('12e5')).toBeUndefined()
  })

  it('still ignores a stray letter that is not part of an exponent', () => {
    expect(pasted('12e')).toBe('12')
    expect(pasted('e12')).toBe('12')
    expect(pasted('1,2a0b0')).toBe('1,200')
  })

  /** The bug: "-500" lost its minus and the field said a positive 500. */
  it('refuses a negative rather than turning it into a positive', () => {
    expect(pasted('-500')).toBeUndefined()
    expect(pasted('\u2212500')).toBeUndefined()
    expect(pasted('-₱500')).toBeUndefined()
    expect(pasted('₱-500')).toBeUndefined()
    expect(pasted('(500)')).toBeUndefined()
    expect(pasted('500-')).toBeUndefined()
    // Pasted at the end of 12, which is what the handler is handed.
    expect(pasted('12-500')).toBeUndefined()
  })

  it('does not mistake a lone minus typed first for a number', () => {
    expect(pasted('-')).toBeUndefined()
  })

  it('refuses nothing it used to take', () => {
    expect(pasted('')).toBe('0')
    expect(pasted('0')).toBe('0')
    expect(pasted('500.5')).toBe('500.5')
    expect(pasted('1234567890')).toBe('1,234,567,890')
  })
})

/* A yen or a won is quoted whole. "1,500.75" was accepted for one, stored,
   and shown back as ¥1,501 - the field took a figure the currency does not
   have. */
describe('a currency quoted whole', () => {
  afterEach(() => { setBaseCurrency('PHP') })

  /** Types `text` one key at a time, as a field sees it; returns what it shows. */
  const keyed = (/** @type {string} */ text, /** @type {number|undefined} */ decimals) => {
    let shown = ''
    for (const ch of text) {
      const set = vi.fn()
      moneyChangeHandler(set, decimals)({ target: { value: shown + ch } })
      if (set.mock.calls.length) shown = set.mock.calls[0][0]
    }
    return shown
  }

  /* The point stays and takes nothing after it. Dropping it let the next
     digits run on, so "1500.75" typed a key at a time came out as 150,075. */
  it('takes no digits after the point when its currency has none', () => {
    expect(keyed('1500.75', 0)).toBe('1,500.')
    expect(parseMoney(keyed('1500.75', 0))).toBe(1500)
    expect(keyed('12.3.4', 0)).toBe('12.')
    expect(keyed('1500', 0)).toBe('1,500')
  })

  it("takes the ledger's places when a field names no currency", () => {
    setBaseCurrency('JPY')
    expect(keyed('1500.75', undefined)).toBe('1,500.')
    setBaseCurrency('PHP')
    expect(keyed('1500.75', undefined)).toBe('1,500.75')
  })

  it('prefills whole, in a whole ledger or for a code given', () => {
    expect(numToMoneyStr(1500.6, 'JPY')).toBe('1,501')
    setBaseCurrency('JPY')
    expect(numToMoneyStr(1500.4)).toBe('1,500')
    expect(numToMoneyStr(12.34, 'USD')).toBe('12.34')
  })

  it('shows "0" rather than "0.00" as the empty field', () => {
    expect(zeroAmount('JPY')).toBe('0')
    expect(zeroAmount('KRW')).toBe('0')
    expect(zeroAmount('PHP')).toBe('0.00')
    setBaseCurrency('JPY')
    expect(zeroAmount()).toBe('0')
  })
})
