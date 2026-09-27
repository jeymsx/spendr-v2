import { describe, it, expect, vi } from 'vitest'

vi.mock('../../db/db', () => ({ default: {}, dbReady: Promise.resolve() }))
const { monthEnds } = await import('./netWorth')

/**
 * Net worth at the end of each month, worked back from today's figure - so
 * the list under the chart and the wallet on Home agree.
 */

const NOW = new Date(2026, 8, 27, 12)
const at = (/** @type {number} */ m, /** @type {number} */ d) => new Date(2026, m - 1, d, 10).toISOString()
const face = (/** @type {Record<string, any>} */ t) => t.amount
const tx = (/** @type {string} */ type, /** @type {number} */ m, /** @type {number} */ d, /** @type {number} */ amount) => ({ type, amount, date: at(m, d) })

describe('monthEnds', () => {
  const txs = [
    tx('inflow', 9, 5, 3000), tx('expense', 9, 10, 1000),
    tx('expense', 8, 20, 500), tx('inflow', 8, 3, 2000),
    tx('inflow', 7, 15, 1000),
    // Money moving between your own accounts is not money made or lost.
    { type: 'transfer', amount: 4000, date: at(8, 12) },
  ]

  it('undoes each month from today back, newest first', () => {
    expect(monthEnds({ txs, current: 10000, now: NOW, priceOf: face })).toEqual([
      { key: '2026-09', value: 10000, change: 2000 },
      { key: '2026-08', value: 8000, change: 1500 },
      { key: '2026-07', value: 6500, change: 1000 },
    ])
  })

  it('stops at the month the ledger starts', () => {
    expect(monthEnds({ txs, current: 10000, now: NOW, priceOf: face, months: 12 })).toHaveLength(3)
  })

  it('takes back a charge dated after today: it is in the figure, not yet in the month', () => {
    const scheduled = [...txs, tx('expense', 10, 3, 700)]
    expect(monthEnds({ txs: scheduled, current: 9300, now: NOW, priceOf: face })[0]).toEqual({ key: '2026-09', value: 10000, change: 2000 })
  })

  it('a row on the 1st at midnight belongs to the month it starts', () => {
    const edge = [tx('inflow', 8, 25, 100), { type: 'inflow', amount: 50, date: new Date(2026, 8, 1).toISOString() }]
    const [sep, aug] = monthEnds({ txs: edge, current: 1000, now: NOW, priceOf: face })
    expect(sep.change).toBe(50)
    expect(aug.value).toBe(950)
  })

  it('has nothing to say about a ledger with nothing in it', () => {
    expect(monthEnds({ txs: [], current: 5000, now: NOW, priceOf: face })).toEqual([])
  })
})
