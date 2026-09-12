import { describe, it, expect } from 'vitest'
import {
  parseInstallmentLabel, isInstallmentRow, findInstallmentGroup,
} from './installments'

/**
 * Installment plans, which are recognised rather than looked up.
 *
 * There is no plan table: a plan is N ordinary transactions that happen to
 * share a stamp, or - for rows written before that stamp existed - a "(n/N)"
 * suffix plus the same card, term and amount. Deleting a plan means deleting
 * a group the code has to reconstruct, so a grouping bug either orphans rows
 * or takes somebody else's transaction with it.
 *
 * That is worth testing and had none.
 */

describe('parseInstallmentLabel', () => {
  it('reads the suffix the generator writes', () => {
    expect(parseInstallmentLabel('Laptop (2/6)')).toEqual({ base: 'Laptop', index: 2, total: 6 })
  })

  it('keeps a multi-word base intact', () => {
    expect(parseInstallmentLabel('New MacBook Air (1/12)'))
      .toEqual({ base: 'New MacBook Air', index: 1, total: 12 })
  })

  it('is null on an ordinary description', () => {
    expect(parseInstallmentLabel('Groceries')).toBeNull()
    expect(parseInstallmentLabel('')).toBeNull()
    expect(parseInstallmentLabel(undefined)).toBeNull()
  })

  /**
   * A one-of-one is not a plan, and an index past the term is a typo rather
   * than an instalment. Both would otherwise pull unrelated rows into a group.
   */
  it('refuses a single-part "plan" and an out-of-range index', () => {
    expect(parseInstallmentLabel('Thing (1/1)')).toBeNull()
    expect(parseInstallmentLabel('Thing (7/6)')).toBeNull()
    expect(parseInstallmentLabel('Thing (0/6)')).toBeNull()
  })

  it('needs the suffix at the end, not in the middle', () => {
    expect(parseInstallmentLabel('Laptop (2/6) refund')).toBeNull()
  })
})

describe('isInstallmentRow', () => {
  it('is true on a stamped row', () => {
    expect(isInstallmentRow({ installmentId: 'plan-1', description: 'Anything' })).toBe(true)
  })

  it('is true on an unstamped row with the suffix', () => {
    expect(isInstallmentRow({ description: 'Laptop (2/6)' })).toBe(true)
  })

  it('is false on an ordinary row', () => {
    expect(isInstallmentRow({ description: 'Groceries' })).toBe(false)
    expect(isInstallmentRow(undefined)).toBe(false)
  })
})

describe('findInstallmentGroup', () => {
  const plan = [
    { id: 1, installmentId: 'p1', description: 'Laptop (1/3)', date: '2026-03-01', amount: 5000, type: 'expense', account: 'Maya Credit' },
    { id: 2, installmentId: 'p1', description: 'Laptop (2/3)', date: '2026-01-01', amount: 5000, type: 'expense', account: 'Maya Credit' },
    { id: 3, installmentId: 'p1', description: 'Laptop (3/3)', date: '2026-02-01', amount: 5000, type: 'expense', account: 'Maya Credit' },
  ]
  const other = { id: 9, description: 'Groceries', date: '2026-01-15', amount: 900, type: 'expense', account: 'Cash' }

  it('finds the whole plan by its stamp, oldest first', () => {
    const group = findInstallmentGroup(plan[0], [...plan, other])
    expect(group.map(t => t.id)).toEqual([2, 3, 1])
  })

  it('returns just the row when it is not part of a plan', () => {
    expect(findInstallmentGroup(other, [...plan, other])).toEqual([other])
  })

  it('returns an empty array for nothing at all', () => {
    expect(findInstallmentGroup(null, plan)).toEqual([])
  })

  describe('the suffix fallback, for rows written before the stamp existed', () => {
    const legacy = [
      { id: 1, description: 'Sofa (1/3)', date: '2026-01-01', amount: 4000, type: 'expense', account: 'BPI' },
      { id: 2, description: 'Sofa (2/3)', date: '2026-02-01', amount: 4000, type: 'expense', account: 'BPI' },
      { id: 3, description: 'Sofa (3/3)', date: '2026-03-01', amount: 4000, type: 'expense', account: 'BPI' },
    ]

    it('groups them on base, term, account and amount', () => {
      expect(findInstallmentGroup(legacy[0], legacy).map(t => t.id)).toEqual([1, 2, 3])
    })

    it('will not cross to another card', () => {
      const onAnotherCard = { ...legacy[1], id: 4, account: 'Maya Credit' }
      const group = findInstallmentGroup(legacy[0], [...legacy, onAnotherCard])
      expect(group.map(t => t.id)).not.toContain(4)
    })

    it('will not cross a different amount', () => {
      const differentAmount = { ...legacy[1], id: 5, amount: 9999 }
      const group = findInstallmentGroup(legacy[0], [...legacy, differentAmount])
      expect(group.map(t => t.id)).not.toContain(5)
    })

    it('will not cross a different term', () => {
      const sixParter = { ...legacy[1], id: 6, description: 'Sofa (2/6)' }
      const group = findInstallmentGroup(legacy[0], [...legacy, sixParter])
      expect(group.map(t => t.id)).not.toContain(6)
    })

    /**
     * A stamped row is never swept into a suffix-matched group. Mixing the two
     * would let a new plan absorb an old one that happened to share a name.
     */
    it('ignores stamped rows entirely', () => {
      const stamped = { ...legacy[1], id: 7, installmentId: 'p2' }
      const group = findInstallmentGroup(legacy[0], [...legacy, stamped])
      expect(group.map(t => t.id)).not.toContain(7)
    })
  })
})
