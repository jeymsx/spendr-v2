import { describe, expect, it } from 'vitest'
import { billFormQuery, spotBills } from './billSpots'

const NOW = new Date(2026, 8, 29, 12)   // Tue Sep 29, 2026
const face = (/** @type {any} */ t) => t.amount ?? 0
/** @param {number} m @param {number} d */
const on = (m, d) => new Date(2026, m, d, 10).toISOString()
/**
 * One row a month, April to September.
 * @param {string} description @param {(m: number) => number} amount @param {(m: number) => number} day
 * @param {Record<string, any>} [over]
 */
const monthly = (description, amount, day, over = {}) => [3, 4, 5, 6, 7, 8].map(m => ({
  type: 'expense', category: 'Bills', account: 'GCash', description, amount: amount(m), date: on(m, day(m)), ...over,
}))
const spot = (/** @type {any[]} */ transactions, over = {}) =>
  spotBills({ transactions, recurring: [], now: NOW, priceOf: face, ...over })

describe('bills the ledger already shows', () => {
  it('spots a subscription that costs the same around the same day', () => {
    const [s] = spot(monthly('Netflix', () => 549, m => (m === 6 ? 21 : 20)))
    expect(s.name).toBe('Netflix')
    expect(s.amount).toBe(549)
    expect(s.day).toBe(20)
    expect(s.label).toBe('Monthly, around the 20th')
    expect(s.category).toBe('Bills')
    expect(s.account).toBe('GCash')
    expect(s.next?.getMonth()).toBe(9)   // October: September's is paid
  })

  it('spots a utility that swings a little with the month', () => {
    const [s] = spot(monthly('Meralco', m => [2400, 2750, 2210, 2980, 2600, 2450][m - 3], () => 12))
    expect(s.name).toBe('Meralco')
  })

  it('spots a bill whose name starts like a month', () => {
    // "may" was read as the month and taken out, leaving nothing to group by.
    const [s] = spot(monthly('Maynilad', m => [480, 510, 495, 530, 500, 520][m - 3], () => 10))
    expect(s?.name).toBe('Maynilad')
  })

  it('does not take a habit for a bill: no rhythm, or amounts all over the place', () => {
    const lunches = Array.from({ length: 40 }, (_, i) => ({
      type: 'expense', category: 'Food', description: 'Jollibee', amount: 180, date: new Date(2026, 5, 1 + i * 3, 12).toISOString(),
    }))
    const groceries = monthly('Groceries', m => [900, 4800, 1500, 6200, 700, 3900][m - 3], () => 1)
    expect(spot([...lunches, ...groceries])).toHaveLength(0)
  })

  it('leaves out what Recurring has, what it posted, and what you said is not a bill', () => {
    const netflix = monthly('Netflix', () => 549, () => 20)
    expect(spot(netflix, { recurring: [{ name: 'Netflix Premium', amount: 549 }] })).toHaveLength(0)
    expect(spot(monthly('Netflix', () => 549, () => 20, { recurringSyncId: 'r1' }))).toHaveLength(0)
    expect(spot(netflix, { dismissed: ['netflix'] })).toHaveLength(0)
  })

  it('needs three months to believe it', () => {
    expect(spot(monthly('Spotify', () => 149, () => 3).slice(-2))).toHaveLength(0)
  })

  it('fills in the Recurring form', () => {
    const [s] = spot(monthly('Netflix', () => 549, () => 20))
    const q = new URLSearchParams(billFormQuery(s, d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`))
    expect(Object.fromEntries(q)).toEqual({
      type: 'expense', name: 'Netflix', amount: '549', frequency: 'monthly', category: 'Bills', account: 'GCash', next: '2026-10-20',
    })
  })
})
