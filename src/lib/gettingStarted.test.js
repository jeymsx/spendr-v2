import { describe, it, expect } from 'vitest'
import { STEPS, stepsFrom, progressOf } from './gettingStarted'
import { HELP_ARTICLES } from './help.js'

const none = { accounts: 1, spent: false, earned: false, moved: false, budgeted: false, bills: false }
const all = { accounts: 3, spent: true, earned: true, moved: true, budgeted: true, bills: true }
const state = { since: '2026-10-08T00:00:00.000Z' }

describe('stepsFrom', () => {
  it('a new ledger, with only Cash in it, has done nothing yet', () => {
    expect(stepsFrom(none).filter(s => s.done)).toEqual([])
  })

  it('counts an account only beside Cash', () => {
    expect(stepsFrom(none).find(s => s.id === 'account')?.done).toBe(false)
    expect(stepsFrom({ ...none, accounts: 2 }).find(s => s.id === 'account')?.done).toBe(true)
  })

  it('sends a transfer to adding an account first, while there is nothing to move between', () => {
    const t = stepsFrom(none).find(s => s.id === 'transfer')
    expect(t?.blocked).toBe('Add a second account first.')
    expect(t?.to).toBe('/accounts/new')
    const ready = stepsFrom({ ...none, accounts: 2 }).find(s => s.id === 'transfer')
    expect(ready?.blocked).toBeNull()
    expect(ready?.to).toBe('/transfer')
  })

  it('a transfer that was made is done, however many accounts there are now', () => {
    const t = stepsFrom({ ...none, moved: true }).find(s => s.id === 'transfer')
    expect(t?.done).toBe(true)
    expect(t?.blocked).toBeNull()
  })

  it('ticks each step from its own fact', () => {
    const pairs = /** @type {const} */ ([['spent', 'expense'], ['earned', 'income'], ['moved', 'transfer'], ['budgeted', 'budget'], ['bills', 'bill']])
    for (const [fact, id] of pairs) {
      const steps = stepsFrom({ ...none, [fact]: true })
      expect(steps.filter(s => s.done).map(s => s.id), fact).toEqual([id])
    }
  })

  it('points every step at a help article that exists', () => {
    for (const s of STEPS) expect(HELP_ARTICLES.some(a => a.id === s.help), s.help).toBe(true)
  })
})

describe('progressOf', () => {
  it('is off without a list, and off once hidden', () => {
    expect(progressOf(null, stepsFrom(none)).on).toBe(false)
    expect(progressOf({ ...state, hidden: true }, stepsFrom(none)).on).toBe(false)
    expect(progressOf(state, stepsFrom(none)).on).toBe(true)
  })

  it('counts, and offers the first step not done', () => {
    const p = progressOf(state, stepsFrom({ ...none, accounts: 2, spent: true }))
    expect(p.doneCount).toBe(2)
    expect(p.total).toBe(6)
    expect(p.complete).toBe(false)
    expect(p.next?.id).toBe('income')
  })

  it('is complete when all six are done, and has no next', () => {
    const p = progressOf(state, stepsFrom(all))
    expect(p.complete).toBe(true)
    expect(p.next).toBeNull()
  })

  it('is not complete before it has been counted', () => {
    expect(progressOf(state, null).complete).toBe(false)
  })
})
