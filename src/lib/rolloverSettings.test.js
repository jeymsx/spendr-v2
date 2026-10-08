import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * The "Carry budgets over" switch, end to end against a small in-memory
 * stand-in for the two tables it touches.
 *
 * What it guards is the bug the switch shipped with: it wrote the flag and
 * nothing else, so a category with no start month - every category, unless
 * its own button had been pressed - carried nothing, and the switch did
 * nothing at all.
 */

/** @param {Map<number, any>} rows */
function fakeTable(rows) {
  return {
    toArray: async () => [...rows.values()].map(r => ({ ...r })),
    update: async (/** @type {number} */ id, /** @type {any} */ mods) => {
      if (!rows.has(id)) return 0
      rows.set(id, { ...rows.get(id), ...mods })
      return 1
    },
  }
}
const cats = new Map()
const meta = new Map()
vi.mock('../db/db', () => ({
  default: {
    categories: fakeTable(cats),
    meta: {
      put: async (/** @type {any} */ row) => { meta.set(row.key, row) },
    },
    transaction: async (/** @type {any} */ _mode, /** @type {any} */ _tables, /** @type {() => Promise<any>} */ fn) => fn(),
  },
}))

const { setBudgetRollover } = await import('./rolloverSettings')
const { effectiveLimit } = await import('./rollover')

const NOW = new Date(2026, 9, 8, 10)   // 8 October 2026

/** @param {number} id @param {Record<string, any>} over */
const cat = (id, over = {}) => ({ id, name: `Cat ${id}`, type: 'expense', budget: 5000, ...over })

beforeEach(() => {
  cats.clear()
  meta.clear()
})

describe('turning the switch on', () => {
  it('writes the flag', async () => {
    await setBudgetRollover(true, NOW)
    expect(meta.get('budgetRollover')).toMatchObject({ key: 'budgetRollover', value: true })
  })

  /** The fix. Without a start month a rolling category carries nothing. */
  it('stamps the current month on every expense category that has no start', async () => {
    cats.set(1, cat(1))
    cats.set(2, cat(2, { budget: 0 }))
    await setBudgetRollover(true, NOW)
    expect(cats.get(1).rolloverFrom).toBe('2026-10')
    expect(cats.get(2).rolloverFrom).toBe('2026-10')
  })

  it('leaves a start that is already there, so off and on again does not reach back', async () => {
    cats.set(1, cat(1, { rolloverFrom: '2026-03' }))
    await setBudgetRollover(true, NOW)
    expect(cats.get(1).rolloverFrom).toBe('2026-03')
  })

  it('leaves a category that was set not to roll, and inflow categories, alone', async () => {
    cats.set(1, cat(1, { rollover: false }))
    cats.set(2, cat(2, { type: 'inflow', budget: 0 }))
    await setBudgetRollover(true, NOW)
    expect(cats.get(1).rolloverFrom).toBeUndefined()
    expect(cats.get(2).rolloverFrom).toBeUndefined()
  })

  it('makes the switch do something: the next month starts with a carried limit', async () => {
    cats.set(1, cat(1, { name: 'Groceries' }))
    await setBudgetRollover(true, NOW)
    const stamped = cats.get(1)
    const spend = (/** @type {string} */ m, /** @type {number} */ amount) => ({
      type: 'expense', category: 'Groceries', amount, date: `${m}-15T08:00:00+08:00`,
    })
    // October under by 2,000: November opens with 7,000.
    const r = effectiveLimit({ cat: stamped, txs: [spend('2026-10', 3000)], month: '2026-11', globalDefault: true })
    expect(r).toMatchObject({ carry: 2000, effective: 7000 })
    // The same category before the fix: no start, so nothing carried.
    const before = effectiveLimit({ cat: cat(1, { name: 'Groceries' }), txs: [spend('2026-10', 3000)], month: '2026-11', globalDefault: true })
    expect(before.carry).toBe(0)
  })
})

describe('turning the switch off', () => {
  it('writes the flag and touches no category', async () => {
    cats.set(1, cat(1))
    await setBudgetRollover(false, NOW)
    expect(meta.get('budgetRollover')).toMatchObject({ value: false })
    expect(cats.get(1).rolloverFrom).toBeUndefined()
  })
})
