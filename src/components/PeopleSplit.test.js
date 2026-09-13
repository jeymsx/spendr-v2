import { describe, it, expect } from 'vitest'
import { resolveSplitValue, EMPTY_SPLIT } from './PeopleSplit'

/**
 * The bridge between what was TYPED into the people editor and the
 * receivables that come out of it.
 *
 * splitModes.test.js already covers the arithmetic of each mode. What is
 * tested here is the part above it: who ends up owing, how much, and - since
 * a purchase can be filed under several categories - which part of it their
 * share is against.
 */

const person = (name, over = {}) => ({ name, value: '', included: true, ...over })

describe('resolveSplitValue', () => {
  it('is null when nobody is sharing, so no split and an empty split are one case', () => {
    expect(resolveSplitValue(EMPTY_SPLIT, 1000)).toBeNull()
    expect(resolveSplitValue(null, 1000)).toBeNull()
  })

  it('splits equally between you and them by default', () => {
    const r = resolveSplitValue({ ...EMPTY_SPLIT, people: [person('Gelo')] }, 1000)
    expect(r.owed).toEqual([{ name: 'Gelo', amount: 500, category: null }])
    expect(r.yours).toBe(500)
  })

  it('drops anyone owing nothing, because a zero share is not a debt', () => {
    const r = resolveSplitValue({
      mode: 'exact',
      you: { included: true, value: '1000' },
      people: [person('Gelo', { value: '0' })],
    }, 1000)
    expect(r.owed).toEqual([])
  })

  it('drops an unnamed person rather than opening a debt against nobody', () => {
    const r = resolveSplitValue({ ...EMPTY_SPLIT, people: [person('  ')] }, 1000)
    expect(r.owed).toEqual([])
  })

  /**
   * The whole point of pinning. A purchase filed under two categories used to
   * send every share against whichever leg was written first, so repaying
   * refunded a category the money never came from.
   */
  describe('which category a share is for', () => {
    it('is null when nobody pinned one, which means the whole purchase', () => {
      const r = resolveSplitValue({ ...EMPTY_SPLIT, people: [person('Gelo')] }, 1000)
      expect(r.owed[0].category).toBeNull()
    })

    it('carries the category through when one is chosen', () => {
      const r = resolveSplitValue({
        ...EMPTY_SPLIT, people: [person('Gelo', { category: 'Groceries' })],
      }, 1000)
      expect(r.owed[0].category).toBe('Groceries')
    })

    it('lets two people be on two different categories', () => {
      const r = resolveSplitValue({
        ...EMPTY_SPLIT,
        people: [
          person('Gelo', { category: 'Groceries' }),
          person('Mika', { category: 'Household' }),
        ],
      }, 900)
      expect(r.owed.map(p => [p.name, p.category, p.amount])).toEqual([
        ['Gelo', 'Groceries', 300],
        ['Mika', 'Household', 300],
      ])
    })

    /** An empty string is the "whole purchase" option, not a category named "". */
    it('treats the empty choice as unpinned', () => {
      const r = resolveSplitValue({
        ...EMPTY_SPLIT, people: [person('Gelo', { category: '' })],
      }, 1000)
      expect(r.owed[0].category).toBeNull()
    })

    /** Pinning says nothing about the amount - the mode still owns that. */
    it('does not change what anybody owes', () => {
      const plain  = resolveSplitValue({ ...EMPTY_SPLIT, people: [person('Gelo')] }, 1000)
      const pinned = resolveSplitValue({
        ...EMPTY_SPLIT, people: [person('Gelo', { category: 'Groceries' })],
      }, 1000)
      expect(pinned.owed[0].amount).toBe(plain.owed[0].amount)
    })
  })
})
