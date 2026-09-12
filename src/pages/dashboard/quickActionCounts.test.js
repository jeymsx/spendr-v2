import { describe, it, expect } from 'vitest'
import { quickActionCounts, DUE_SOON_DAYS } from './shared'

/**
 * The badges on the home screen's quick actions.
 *
 * The reported bug: a debt due TOMORROW showed no dot. The counter used
 * `date <= today`, so the badge meant "late" while `dueStatus()` and the
 * Debts page were both already warning in amber a week out - the dot arrived
 * on the morning something was due, which is the day it helps least.
 *
 * It counts a seven-day window now, matching what the rest of the app calls
 * "soon". These tests pin both ends of that window, because the whole failure
 * was an off-by-one at its edge.
 *
 * `today` is injected, so none of this depends on when it runs - the original
 * bug was only caught because the clock rolled past midnight between two
 * snapshot runs and the dot appeared on its own.
 */

const TODAY = new Date('2026-09-13T10:00:00')
/**
 * n days from TODAY, as a local YYYY-MM-DD.
 *
 * Formatted by hand rather than through toISOString, which was this helper's
 * own first bug: in UTC+8 a LOCAL midnight converts to the previous day in
 * UTC, so day(8) produced day 7's string and the window looked one wider than
 * it is. badges.js carries the same warning over its own ymd().
 *
 * @param {number} n
 */
const day = (n) => {
  const d = new Date(TODAY)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  const p = (/** @type {number} */ v) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const owed = (dueDate) => ({ amount: 1000, amountPaid: 0, dueDate })
const bill = (nextDate) => ({ active: true, nextDate })

const count = (over) => quickActionCounts({ today: TODAY, ...over })

describe('the seven-day window', () => {
  it('is seven days', () => {
    expect(DUE_SOON_DAYS).toBe(7)
  })

  it('counts a debt due TOMORROW - the reported bug', () => {
    expect(count({ debts: [owed(day(1))] }).debts).toBe(1)
  })

  it('counts one due today, and one already overdue', () => {
    expect(count({ debts: [owed(day(0))] }).debts).toBe(1)
    expect(count({ debts: [owed(day(-30))] }).debts).toBe(1)
  })

  it('counts the last day of the window and not the first day past it', () => {
    expect(count({ debts: [owed(day(7))] }).debts).toBe(1)
    expect(count({ debts: [owed(day(8))] }).debts).toBe(0)
  })

  it('applies the same window to bills', () => {
    expect(count({ recurring: [bill(day(1))] }).bills).toBe(1)
    expect(count({ recurring: [bill(day(7))] }).bills).toBe(1)
    expect(count({ recurring: [bill(day(8))] }).bills).toBe(0)
  })
})

describe('what does not count', () => {
  it('ignores a paused bill however overdue it is', () => {
    expect(count({ recurring: [{ active: false, nextDate: day(-5) }] }).bills).toBe(0)
  })

  it('ignores a debt that is already settled', () => {
    expect(count({ debts: [{ amount: 1000, amountPaid: 1000, dueDate: day(0) }] }).debts).toBe(0)
  })

  it('counts a partly-paid debt, because something is still owed', () => {
    expect(count({ debts: [{ amount: 1000, amountPaid: 400, dueDate: day(0) }] }).debts).toBe(1)
  })

  it('ignores a debt or bill with no due date at all', () => {
    expect(count({ debts: [owed(null)], recurring: [bill(undefined)] }))
      .toEqual({ bills: 0, debts: 0, goals: 0 })
  })

  it('ignores an unparseable date rather than counting or throwing', () => {
    expect(count({ debts: [owed('not-a-date')] }).debts).toBe(0)
  })
})

describe('goals', () => {
  it('counts a goal its balances have already funded', () => {
    const out = count({
      goals: [{ id: 1, name: 'Emergency', target: 10000, accounts: ['BPI'], priority: 100 }],
      accounts: [{ id: 1, name: 'BPI', type: 'savings', balance: 30000 }],
    })
    expect(out.goals).toBe(1)
  })

  it('does not count one still short of its target', () => {
    const out = count({
      goals: [{ id: 1, name: 'Emergency', target: 10000, accounts: ['BPI'], priority: 100 }],
      accounts: [{ id: 1, name: 'BPI', type: 'savings', balance: 500 }],
    })
    expect(out.goals).toBe(0)
  })

  it('does not count an archived one', () => {
    const out = count({
      goals: [{ id: 1, name: 'Old', target: 10, accounts: ['BPI'], archivedAt: '2026-01-01' }],
      accounts: [{ id: 1, name: 'BPI', type: 'savings', balance: 30000 }],
    })
    expect(out.goals).toBe(0)
  })
})

describe('defaults', () => {
  it('is all zeroes with nothing at all', () => {
    expect(quickActionCounts()).toEqual({ bills: 0, debts: 0, goals: 0 })
  })
})
