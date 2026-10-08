import { describe, it, expect } from 'vitest'
import { dupWhen } from './dupWhen'

/**
 * "Possible duplicate" named the day the form is dated, not the day it was
 * opened: a back-dated entry was told the twin "already exists today".
 */
describe('dupWhen', () => {
  const now = new Date(2026, 9, 8, 15, 0, 0) // Thu 8 Oct 2026, local

  it('says today only for today', () => {
    expect(dupWhen('2026-10-08', now)).toBe('today')
  })

  it('names the day for a back-dated entry', () => {
    expect(dupWhen('2026-10-03', now)).toBe('on Oct 3')
    // Yesterday is a date, not "today": the old copy said today for both.
    expect(dupWhen('2026-10-07', now)).toBe('on Oct 7')
  })

  it('adds the year when it is not this one', () => {
    expect(dupWhen('2025-12-31', now)).toBe('on Dec 31, 2025')
  })

  it('judges "today" on the reader s clock, not UTC', () => {
    // Just after local midnight: the UTC date can still be yesterday.
    const earlyMorning = new Date(2026, 9, 8, 0, 20, 0)
    expect(dupWhen('2026-10-08', earlyMorning)).toBe('today')
    expect(dupWhen('2026-10-07', earlyMorning)).toBe('on Oct 7')
  })

  it('says nothing when there is no day to name', () => {
    expect(dupWhen(undefined, now)).toBe('')
    expect(dupWhen('', now)).toBe('')
    expect(dupWhen('not a date', now)).toBe('')
  })
})
