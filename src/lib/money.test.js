import { describe, it, expect } from 'vitest'
import { fmt, fmtCompact } from './money'

/**
 * These pin the twenty-one formatters this module replaced.
 *
 * The risk in unifying hand-copied code is that one copy was subtly different
 * and nobody notices until a screen shows the wrong thing. The bodies were
 * compared before the deletion; this is what keeps them from drifting apart
 * again, and it is deliberately specific about the characters - the sign is a
 * MINUS, not a hyphen, and that distinction is invisible in a diff.
 */

describe('fmt', () => {
  it('always shows two decimals', () => {
    expect(fmt(1200)).toBe('₱1,200.00')
    expect(fmt(0.5)).toBe('₱0.50')
    expect(fmt(1200.456)).toBe('₱1,200.46')
  })

  it('groups thousands', () => {
    expect(fmt(1234567.89)).toBe('₱1,234,567.89')
  })

  it('puts the sign before the peso, as a real minus', () => {
    expect(fmt(-340.5)).toBe('−₱340.50')
    // U+2212, not U+002D. A hyphen is narrower and sits lower, which breaks
    // the alignment of a tabular column.
    expect(fmt(-1).charCodeAt(0)).toBe(0x2212)
  })

  it('treats null, undefined and NaN-free zero alike', () => {
    expect(fmt(0)).toBe('₱0.00')
    expect(fmt(undefined)).toBe('₱0.00')
    expect(fmt(null)).toBe('₱0.00')
  })

  it('does not sign a negative zero', () => {
    // -0 < 0 is false, so this takes the positive branch - which is right:
    // "−₱0.00" reads as a debt of nothing.
    expect(fmt(-0)).toBe('₱0.00')
  })
})

describe('fmtCompact', () => {
  it('falls through to the full figure below a thousand', () => {
    expect(fmtCompact(999.99)).toBe('₱999.99')
    expect(fmtCompact(0)).toBe('₱0.00')
  })

  it('switches to K at a thousand, with one decimal', () => {
    expect(fmtCompact(1000)).toBe('₱1.0K')
    expect(fmtCompact(1234)).toBe('₱1.2K')
    expect(fmtCompact(999_999)).toBe('₱1000.0K')
  })

  it('switches to M at a million', () => {
    expect(fmtCompact(1_000_000)).toBe('₱1.0M')
    expect(fmtCompact(2_450_000)).toBe('₱2.5M')
  })

  it('signs the magnitude, not the abbreviation', () => {
    expect(fmtCompact(-1234)).toBe('−₱1.2K')
    expect(fmtCompact(-2_450_000)).toBe('−₱2.5M')
    expect(fmtCompact(-999)).toBe('−₱999.00')
  })

  /**
   * toFixed, with the float64 quirk left in.
   *
   * ₱1,950 abbreviates to ₱1.9K, not ₱2.0K, because 1.95 has no exact binary
   * representation - it is stored as 1.94999999999999995559, which rounds
   * down. ₱1,250 does have one, so it rounds half-up to ₱1.3K.
   *
   * Pinned rather than fixed. This is what all seven copies did before they
   * were unified, it is off by fifty pesos on a figure that is abbreviated
   * precisely because the exact value does not matter there, and "correcting"
   * it would change what a dozen screens read today.
   */
  it('abbreviates the way toFixed does, quirk included', () => {
    expect(fmtCompact(1950)).toBe('₱1.9K')
    expect(fmtCompact(1951)).toBe('₱2.0K')
    expect(fmtCompact(1949)).toBe('₱1.9K')
    expect(fmtCompact(1250)).toBe('₱1.3K')
  })
})
