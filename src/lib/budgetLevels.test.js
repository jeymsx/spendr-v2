import { describe, it, expect } from 'vitest'
import {
  BUDGET_NEAR_AT, BUDGET_OVER_AT, BUDGET_NEAR_PCT, BUDGET_OVER_PCT,
  levelOfPct, budgetLevel, canHaveBudget, isBudgeted,
} from './budgetLevels'
import { budgetTone } from '../components/BudgetMeter'

describe('the two thresholds', () => {
  /** The bell's 80% is the number the other surfaces were moved to. */
  it('are 80% for near and 100% for over, in both of the units they are used in', () => {
    expect(BUDGET_NEAR_AT).toBe(0.8)
    expect(BUDGET_OVER_AT).toBe(1)
    expect(BUDGET_NEAR_PCT).toBe(80)
    expect(BUDGET_OVER_PCT).toBe(100)
  })
})

describe('levelOfPct', () => {
  it('is ok below 80, near from 80 up to and including the limit, over past it', () => {
    expect(levelOfPct(0)).toBe('ok')
    expect(levelOfPct(79.9)).toBe('ok')
    expect(levelOfPct(80)).toBe('near')
    expect(levelOfPct(84)).toBe('near')
    expect(levelOfPct(100)).toBe('near')
    expect(levelOfPct(100.1)).toBe('over')
  })

  /** The old amber started at 75; a category at 78% is not "near" any more. */
  it('does not call 75 or 78 near', () => {
    expect(levelOfPct(75)).toBe('ok')
    expect(levelOfPct(78)).toBe('ok')
  })
})

describe('budgetLevel', () => {
  it('reads the amount against the limit with the same cut-offs', () => {
    expect(budgetLevel(0, 1000)).toBe('ok')
    expect(budgetLevel(799, 1000)).toBe('ok')
    expect(budgetLevel(800, 1000)).toBe('near')
    expect(budgetLevel(850, 1000)).toBe('near')
    expect(budgetLevel(1000, 1000)).toBe('near')
    expect(budgetLevel(1000.01, 1000)).toBe('over')
  })

  /** Hitting the limit exactly is all of it used, not more than all of it. */
  it('does not call a sum that lands a hair over the limit over', () => {
    expect(budgetLevel(1000.0000000001, 1000)).toBe('near')
  })

  /** What a carried overspend does to a limit: lib/rollover clamps it at zero. */
  it('calls any spending against a limit of nothing over, and no spending ok', () => {
    expect(budgetLevel(1, 0)).toBe('over')
    expect(budgetLevel(0, 0)).toBe('ok')
  })

  it('agrees with the meter, which is what the phone draws', () => {
    for (const [spent, limit] of [[0, 1000], [700, 1000], [800, 1000], [900, 1000], [1000, 1000], [1200, 1000]]) {
      const tone = budgetTone((spent / limit) * 100).key
      const want = { ok: 'ok', warn: 'near', over: 'over' }[tone]
      expect(budgetLevel(spent, limit), `${spent}/${limit}`).toBe(want)
    }
  })
})

describe('canHaveBudget and isBudgeted', () => {
  it('lets an expense category carry a limit', () => {
    expect(canHaveBudget({ type: 'expense' })).toBe(true)
    expect(isBudgeted({ type: 'expense', budget: 500 })).toBe(true)
  })

  /** A row from before types existed has none, and is an expense. */
  it('reads a category with no type as an expense', () => {
    expect(isBudgeted({ budget: 500 })).toBe(true)
  })

  /** The bug: an inflow category given a "Monthly budget" counted in every total. */
  it('never counts an inflow category, whatever budget it holds', () => {
    expect(canHaveBudget({ type: 'inflow' })).toBe(false)
    expect(isBudgeted({ type: 'inflow', budget: 50000 })).toBe(false)
    expect(isBudgeted({ type: 'transfer', budget: 50000 })).toBe(false)
  })

  it('needs a limit above zero', () => {
    expect(isBudgeted({ type: 'expense', budget: 0 })).toBe(false)
    expect(isBudgeted({ type: 'expense' })).toBe(false)
    expect(isBudgeted(null)).toBe(false)
    expect(isBudgeted(undefined)).toBe(false)
  })

  it('filters a list the way every total does', () => {
    const cats = [
      { name: 'Food', type: 'expense', budget: 8000 },
      { name: 'Salary', type: 'inflow', budget: 90000 },
      { name: 'Fun', type: 'expense', budget: 0 },
    ]
    expect(cats.filter(isBudgeted).map(c => c.name)).toEqual(['Food'])
  })
})
