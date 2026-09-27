import { describe, it, expect } from 'vitest'
import { titleOf, achievementFileName, earnedDate } from './achievementPicture'
import { ACHIEVEMENTS } from '../../lib/achievements'
import { CHALLENGES } from '../../lib/challenges'

describe('titleOf', () => {
  it('puts the closer on its own line after a name that needs one', () => {
    expect(titleOf({ name: '7-Day Streak', kind: 'milestone' })).toEqual({ name: '7-Day Streak', closer: 'Reached.' })
    expect(titleOf({ name: 'No-Spend Day', kind: 'challenge' })).toEqual({ name: 'No-Spend Day', closer: 'Complete.' })
    expect(titleOf({ name: 'Year One', kind: 'badge' })).toEqual({ name: 'Year One', closer: 'Earned.' })
  })

  it('lets a name that already says what happened stand alone', () => {
    expect(titleOf({ name: '3 Challenges Won', kind: 'milestone' })).toEqual({ name: '3 Challenges Won.', closer: '' })
    expect(titleOf({ name: '100K Held', kind: 'milestone' })).toEqual({ name: '100K Held.', closer: '' })
    expect(titleOf({ name: 'Debt Free', kind: 'badge' })).toEqual({ name: 'Debt Free.', closer: '' })
    expect(titleOf({ name: 'Goal Funded', kind: 'milestone' })).toEqual({ name: 'Goal Funded.', closer: '' })
  })

  it('never says what happened twice, for anything the app can award', () => {
    const all = [
      ...ACHIEVEMENTS.map(a => ({ name: a.name, kind: a.kind })),
      ...CHALLENGES.map(c => ({ name: c.name, kind: /** @type {'challenge'} */ ('challenge') })),
    ]
    for (const item of all) {
      const t = titleOf(item)
      const full = `${t.name} ${t.closer}`.trim()
      expect(full, item.name).toMatch(/[^.]\.$/)
      expect(full, item.name).not.toMatch(/\b(won|held|funded|set|cleared|free)\s+(reached|earned|complete)\.$/i)
    }
  })
})

describe('the saved file', () => {
  it('is named for what it is', () => {
    expect(achievementFileName({ kind: 'milestone', key: 'seven-days' })).toBe('spendr-milestone-seven-days.png')
  })

  it('dates it, or leaves the date out when there is none', () => {
    expect(earnedDate('2026-09-26T12:00:00')).toMatch(/2026/)
    expect(earnedDate(null)).toBe('')
    expect(earnedDate('nonsense')).toBe('')
  })
})
