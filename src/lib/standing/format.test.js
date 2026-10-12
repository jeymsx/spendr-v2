import { describe, it, expect, afterEach } from 'vitest'
import { moneyK } from './format'
import { setBaseCurrency } from '../money'

/**
 * The note's short amount drops a bare ".0" from the shared compact form. Its
 * pattern listed K, M and B but not T, so a trillion read "₱1.0T" beside a
 * "₱2M" in the same sentence.
 */

afterEach(() => { setBaseCurrency('PHP') })

describe('moneyK', () => {
  it('drops a bare .0 at every tier, T included', () => {
    expect(moneyK(5000)).toBe('₱5K')
    expect(moneyK(2_000_000)).toBe('₱2M')
    expect(moneyK(3_000_000_000)).toBe('₱3B')
    expect(moneyK(1_000_000_000_000)).toBe('₱1T')
  })

  it('keeps a tenth that is there, and is always a magnitude', () => {
    expect(moneyK(47_600)).toBe('₱47.6K')
    expect(moneyK(-1_500_000_000_000)).toBe('₱1.5T')
  })

  it("writes the currency it is given, or the ledger's", () => {
    expect(moneyK(2_000_000, 'USD')).toBe('$2M')
    setBaseCurrency('EUR')
    expect(moneyK(1_000_000_000_000)).toBe('€1T')
  })
})
