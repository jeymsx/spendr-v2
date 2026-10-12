// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AmountRangeFilter } from './AmountRange'
import { setBaseCurrency } from '../../lib/money'

/**
 * The two ends of the amount filter's slider, as text.
 *
 * They had their own compact formatter, which stopped at M ("₱1500.0M" for a
 * billion and a half) and wrote a lowercase k the rest of the app does not.
 * They now go through fmtCompact, with a bare ".0" dropped because a slider's
 * end is approximate anyway.
 */

beforeAll(() => {
  // Radix's slider measures its thumbs; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
})

afterEach(() => { cleanup(); setBaseCurrency('PHP') })

const txs = [100, 900, 4000, 12000].map((amount, id) => ({ id, amount }))

/** @param {number|null} amountMin @param {number|null} amountMax */
const show = (amountMin, amountMax) => render(
  <AmountRangeFilter allTxs={txs} amountMin={amountMin} amountMax={amountMax}
    onAmountMin={() => {}} onAmountMax={() => {}} />)

describe('the amount range labels', () => {
  it('write K the way every other figure does, without a bare .0', () => {
    show(1500, 5000)
    expect(screen.getByText('₱1.5K')).toBeTruthy()
    expect(screen.getByText('₱5K+')).toBeTruthy()
  })

  it('go past M, to B and T', () => {
    show(2_000_000, 2_500_000_000)
    expect(screen.getByText('₱2M')).toBeTruthy()
    expect(screen.getByText('₱2.5B+')).toBeTruthy()
    cleanup()
    show(null, 1_000_000_000_000)
    expect(screen.getByText('₱1T+')).toBeTruthy()
  })

  it('stay whole below a thousand, and say Any with no handle moved', () => {
    show(500, null)
    expect(screen.getByText('₱500')).toBeTruthy()
    expect(screen.getByText('Any')).toBeTruthy()
  })

  it("carry the ledger's mark, not the peso", () => {
    setBaseCurrency('USD')
    show(250, 7500)
    expect(screen.getByText('$250')).toBeTruthy()
    expect(screen.getByText('$7.5K+')).toBeTruthy()
  })
})
