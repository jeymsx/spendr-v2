import { describe, it, expect } from 'vitest'
import { metricsOf } from './metrics'
import { BUDGET_NEAR_AT } from '../budgetLevels'

/**
 * What the note's metrics say is "close to full" is the app's one near-the-limit
 * line (lib/budgetLevels.js), not a number of its own: the note had its own 0.75
 * and named a category close that the meter, the bell and Home called calm.
 */

/** @param {Array<{name: string, budget: number, spent: number}>} rows */
const factsWith = (rows) => /** @type {any} */ ({
  now: new Date(2026, 8, 25, 12),
  month: { day: 25, days: 30, spent: 0, earned: 0, spentToday: 0 },
  budget: { total: rows.reduce((t, r) => t + r.budget, 0), rows: rows.map(r => ({ ...r, fixed: false })) },
})

describe('closeCat', () => {
  it('starts where the app\'s near-the-limit line does', () => {
    const justUnder = factsWith([{ name: 'Food', budget: 1000, spent: 1000 * BUDGET_NEAR_AT - 10 }])
    expect(metricsOf(justUnder).closeCat).toBeNull()

    const atIt = factsWith([{ name: 'Food', budget: 1000, spent: 1000 * BUDGET_NEAR_AT }])
    expect(metricsOf(atIt).closeCat?.name).toBe('Food')
  })

  it('does not call 77% close, which the old 75% line did', () => {
    expect(metricsOf(factsWith([{ name: 'Food', budget: 1000, spent: 770 }])).closeCat).toBeNull()
  })

  it('leaves a category that is over, or exactly at its limit, to fullCats', () => {
    const m = metricsOf(factsWith([{ name: 'Rent', budget: 1000, spent: 1000 }, { name: 'Food', budget: 1000, spent: 1200 }]))
    expect(m.closeCat).toBeNull()
    expect(m.fullCats.map(c => c.name)).toEqual(['Food'])
  })

  it('counts only categories with a limit', () => {
    const m = metricsOf(factsWith([{ name: 'Food', budget: 1000, spent: 900 }, { name: 'Fun', budget: 0, spent: 500 }]))
    expect(m.budgetTotal).toBe(1000)
    expect(m.closeCat?.name).toBe('Food')
  })
})
