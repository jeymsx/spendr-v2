import { describe, it, expect } from 'vitest'
import { niceAxis } from './Charts'

/** The side of the net worth chart: round steps, with room above and below. */
describe('niceAxis', () => {
  it('rounds a lopsided range to even steps', () => {
    // What the first draft labelled 105K, 77K, 37K, -3.2K.
    expect(niceAxis(-3200, 104000)).toEqual({ floor: -50000, ceil: 150000, ticks: [-50000, 0, 50000, 100000, 150000] })
  })

  it('keeps a small movement on a large balance readable', () => {
    // An P8,000 move on P120,000 still fills half the chart, on 5K steps.
    const { ticks } = niceAxis(118000, 126000)
    expect(ticks).toEqual([115000, 120000, 125000, 130000])
  })

  it('never lets the line touch the top or the bottom', () => {
    const { floor, ceil } = niceAxis(0, 90000)
    expect(floor).toBeLessThan(0)
    expect(ceil).toBeGreaterThan(90000)
  })

  it('copes with a flat line', () => {
    const { ticks } = niceAxis(5000, 5000)
    expect(ticks.length).toBeGreaterThanOrEqual(3)
    expect(ticks.every(t => Number.isFinite(t))).toBe(true)
  })
})
