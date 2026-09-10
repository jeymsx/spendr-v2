import { describe, it, expect } from 'vitest'
import { allocateGoals, monthsUntil, pace } from './goals'

/**
 * The goal allocator is the one piece of real arithmetic in the app that has
 * no UI to check it against: progress is DERIVED from account balances rather
 * than stored, so a bug here silently misreports how much you have saved.
 *
 * The invariant that matters most is the last test in the first block: the
 * allocator must never claim more money than actually exists.
 */

const acct = (name, balance, type = 'savings', sort_order = 0) =>
  ({ id: name, name, balance, type, sort_order })
const goal = (name, target, accounts, priority = 0) =>
  ({ id: name, name, target, accounts, priority })

describe('allocateGoals', () => {
  it('funds a goal from its linked account', () => {
    const r = allocateGoals({
      goals: [goal('Emergency', 10000, ['BPI'])],
      accounts: [acct('BPI', 30000)],
    })
    expect(r.active[0].saved).toBe(10000)
    expect(r.active[0].complete).toBe(true)
  })

  it('caps a goal at its target, leaving the rest unassigned', () => {
    const r = allocateGoals({
      goals: [goal('Small', 5000, ['BPI'])],
      accounts: [acct('BPI', 30000)],
    })
    expect(r.active[0].saved).toBe(5000)
    expect(r.totals.unassigned).toBe(25000)
  })

  it('pays goals in priority order when they share one account', () => {
    const r = allocateGoals({
      goals: [
        goal('First',  8000, ['BPI'], 0),
        goal('Second', 8000, ['BPI'], 1),
      ],
      accounts: [acct('BPI', 10000)],
    })
    const first  = r.active.find(g => g.name === 'First')
    const second = r.active.find(g => g.name === 'Second')
    expect(first.saved).toBe(8000)
    expect(second.saved).toBe(2000)          // only what was left
    expect(second.complete).toBe(false)
  })

  it('draws from several accounts for one goal', () => {
    const r = allocateGoals({
      goals: [goal('Trip', 12000, ['GCash', 'BPI'])],
      accounts: [acct('GCash', 5000, 'ewallet', 0), acct('BPI', 20000, 'savings', 1)],
    })
    expect(r.active[0].saved).toBe(12000)
  })

  it('ignores accounts a goal is not linked to', () => {
    const r = allocateGoals({
      goals: [goal('Trip', 9000, ['GCash'])],
      accounts: [acct('GCash', 1000, 'ewallet'), acct('BPI', 50000)],
    })
    expect(r.active[0].saved).toBe(1000)
    expect(r.active[0].remaining).toBe(8000)
  })

  it('treats a negative balance as zero rather than as debt', () => {
    const r = allocateGoals({
      goals: [goal('Trip', 5000, ['GCash'])],
      accounts: [acct('GCash', -2000, 'ewallet')],
    })
    expect(r.active[0].saved).toBe(0)
  })

  it('reports 0% for a goal with no target, not 100%', () => {
    const r = allocateGoals({
      goals: [goal('Vague', 0, ['BPI'])],
      accounts: [acct('BPI', 10000)],
    })
    expect(r.active[0].pct).toBe(0)
    expect(r.active[0].complete).toBe(false)
  })

  it('never allocates more than the accounts actually hold', () => {
    const accounts = [acct('GCash', 4771, 'ewallet', 0), acct('BPI', 42000, 'savings', 1)]
    const r = allocateGoals({
      goals: [
        goal('Emergency', 30000, ['GCash', 'BPI'], 0),
        goal('Laptop',    60000, ['BPI'],          1),
        goal('Japan',     80000, ['GCash'],        2),
      ],
      accounts,
    })
    const pot = accounts.reduce((s, a) => s + a.balance, 0)
    const claimed = r.active.reduce((s, g) => s + g.saved, 0)
    expect(claimed).toBeLessThanOrEqual(pot)
    expect(claimed + r.totals.unassigned).toBeCloseTo(pot, 6)
  })

  it('survives empty input', () => {
    const r = allocateGoals({})
    expect(r.active).toEqual([])
    expect(r.totals.saved).toBe(0)
  })
})

describe('pace', () => {
  it('is null without a target date', () => {
    expect(pace({ target: 1000, saved: 0 }, new Date('2026-01-01'))).toBeNull()
  })

  it('splits what is left across the months remaining', () => {
    const p = pace(
      { target: 12000, saved: 0, targetDate: '2026-07-01' },
      new Date('2026-01-01'),
    )
    expect(p.months).toBe(6)
    expect(p.perMonth).toBeCloseTo(2000, 6)
    expect(p.done).toBe(false)
  })

  it('flags a past date rather than dividing by zero', () => {
    const p = pace(
      { target: 5000, saved: 1000, targetDate: '2025-01-01' },
      new Date('2026-01-01'),
    )
    expect(p.overdue).toBe(true)
    expect(p.perMonth).toBe(4000)
  })

  it('says done when the target is met, whatever the date', () => {
    const p = pace(
      { target: 5000, saved: 5000, targetDate: '2025-01-01' },
      new Date('2026-01-01'),
    )
    expect(p.done).toBe(true)
    expect(p.perMonth).toBe(0)
  })
})

describe('monthsUntil', () => {
  it('counts part of the current month as savable', () => {
    // The 20th is still ahead of the 1st, so January itself counts.
    expect(monthsUntil('2026-03-20', new Date('2026-01-01'))).toBe(2)
  })

  it('drops the month when the day has already passed', () => {
    expect(monthsUntil('2026-03-05', new Date('2026-01-20'))).toBe(1)
  })

  it('is null without a date', () => {
    expect(monthsUntil(null, new Date('2026-01-01'))).toBeNull()
  })
})
