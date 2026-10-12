import { describe, it, expect, afterEach } from 'vitest'
import { tick } from './charts'
import { setBaseCurrency } from '../../lib/money'

/**
 * The desktop charts' y-axis figure. It drops a bare ".0" from the shared
 * compact form, and its pattern listed K, M and B but not T - so the one
 * axis that reached a trillion read "₱1.0T" under a "₱500B".
 */

afterEach(() => { setBaseCurrency('PHP') })

describe('the desktop chart tick', () => {
  it('drops a bare .0 at every tier, T included', () => {
    expect(tick(5000)).toBe('₱5K')
    expect(tick(2_000_000)).toBe('₱2M')
    expect(tick(500_000_000_000)).toBe('₱500B')
    expect(tick(1_000_000_000_000)).toBe('₱1T')
  })

  it('keeps a tenth that is there, and the minus', () => {
    expect(tick(2_500)).toBe('₱2.5K')
    expect(tick(-1_500_000)).toBe('−₱1.5M')
  })

  it('is the full figure, without .00, below a thousand', () => {
    expect(tick(0)).toBe('₱0')
    expect(tick(750)).toBe('₱750')
  })

  it("carries the ledger's mark", () => {
    setBaseCurrency('USD')
    expect(tick(1_000_000_000_000)).toBe('$1T')
  })
})
