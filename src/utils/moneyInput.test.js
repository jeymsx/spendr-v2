import { describe, it, expect, vi } from 'vitest'
import { parseMoney, numToMoneyStr, moneyChangeHandler } from './moneyInput'

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
   * A REAL BUG, pinned rather than fixed.
   *
   * A second decimal point escapes the two-decimal cap: "12.34.56" becomes
   * "12.3456", and that is what parseMoney hands the ledger - a sub-centavo
   * amount from a field that is supposed to refuse one.
   *
   * The cause is one stale variable. `parts` is computed once from the raw
   * value, and the branch that joins the extra points away does not recompute
   * it, so the next line still sees `parts.length === 3` and its
   * `parts.length === 2` guard never fires:
   *
   *     const parts = v.split('.')                                   // 3 parts
   *     if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('')
   *     if (parts.length === 2 && parts[1].length > 2) ...           // skipped
   *
   * Left alone because fixing it changes what the field accepts, which is a
   * behaviour change to every amount in the app and not mine to make
   * unattended. One line - re-split `v` after the join - and this test flips
   * to expecting '12.34'.
   */
  it('lets a SECOND decimal point past the two-decimal cap', () => {
    expect(typed('12.34.56')).toBe('12.3456')
    expect(typed('1.2.3.4')).toBe('1.234')
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
