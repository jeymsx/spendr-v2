import { describe, it, expect } from 'vitest'
import {
  parseInstallmentLabel, isInstallmentRow, findInstallmentGroup,
  spendingRows, foldPlans, planFactor, storedRow,
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

/**
 * A plan as one purchase: spent in full the day it is bought, listed once.
 * The rows stay the card's - one a month - and these read them that way.
 */
describe('a plan as one purchase', () => {
  const phone = [
    { id: 1, installmentId: 'ph', description: 'Phone (1/3)', date: '2026-01-10T08:00:00.000Z', amount: 3000, type: 'expense', category: 'Gadgets', account: 'BPI Credit' },
    { id: 2, installmentId: 'ph', description: 'Phone (2/3)', date: '2026-02-10T08:00:00.000Z', amount: 3000, type: 'expense', category: 'Gadgets', account: 'BPI Credit' },
    { id: 3, installmentId: 'ph', description: 'Phone (3/3)', date: '2099-03-10T08:00:00.000Z', amount: 3000, type: 'expense', category: 'Gadgets', account: 'BPI Credit' },
  ]
  const lunch = { id: 9, description: 'Lunch', date: '2026-02-10T04:00:00.000Z', amount: 180, type: 'expense', category: 'Food', account: 'Cash' }
  const all = [...phone, lunch]

  it('spends the whole price on the purchase date, and nothing after', () => {
    const rows = spendingRows(all)
    expect(rows.map(t => t.id)).toEqual([1, 9])
    expect(rows[0].amount).toBe(9000)
    expect(rows[0].date).toBe(phone[0].date)
    expect(/** @type {any} */ (rows[0]).planOf).toBe(phone[0])
    // The stored rows are untouched.
    expect(phone[0].amount).toBe(3000)
  })

  it('scales a converted amount with it', () => {
    const usd = phone.map(t => ({ ...t, baseAmount: 165000, baseCurrency: 'PHP', amount: 3000 }))
    expect(spendingRows(usd)[0].baseAmount).toBe(495000)
  })

  it('hands back the same array when there is no plan in it', () => {
    const plain = [lunch]
    expect(spendingRows(plain)).toBe(plain)
  })

  it('reads a window of dates by its labels: the month bought spends it all', () => {
    expect(spendingRows([phone[0], { ...lunch }], { complete: false })[0].amount).toBe(9000)
    // A later month holds only a later payment: nothing spent on the plan there.
    const feb = [phone[1], lunch]
    expect(spendingRows(feb, { complete: false }).map(t => t.id)).toEqual([9])
  })

  it('sums the rows themselves when one month was changed by hand', () => {
    const edited = phone.map((t, i) => (i === 2 ? { ...t, amount: 2500 } : t))
    expect(spendingRows(edited)[0].amount).toBe(8500)
  })

  it('lists the plan once, as its purchase, with its term and what is billed', () => {
    const rows = foldPlans(all)
    expect(rows.map(t => t.id)).toEqual([1, 9])
    expect(rows[0].plan).toMatchObject({ lead: true, count: 3, each: 3000, total: 9000, billed: 2, name: 'Phone' })
    expect(rows[0].amount).toBe(3000)
    expect(planFactor(rows[0])).toBe(3)
    expect(planFactor(lunch)).toBe(1)
  })

  it('reads a filtered list against every row', () => {
    const rows = foldPlans([phone[0]], all)
    expect(rows[0].plan.total).toBe(9000)
    // A filter that left only a later payment shows nothing of the plan.
    expect(foldPlans([phone[1], lunch], all).map(t => t.id)).toEqual([9])
  })

  it('finds the purchase by date when its label was edited away', () => {
    const renamed = phone.map((t, i) => (i === 0 ? { ...t, description: 'My phone' } : t))
    const rows = spendingRows(renamed)
    expect(rows.map(t => t.id)).toEqual([1])
    expect(rows[0].amount).toBe(9000)
  })

  it('keeps two identical old plans on one card apart', () => {
    const legacy = [1, 2].flatMap(n => [1, 2].map(i => ({
      id: n * 10 + i, description: `Sofa (${i}/2)`, date: `2026-0${n}-0${i}T00:00:00.000Z`, amount: 4000, type: 'expense', account: 'BPI',
    })))
    const rows = spendingRows(legacy)
    expect(rows.map(t => t.amount)).toEqual([8000, 8000])
  })

  it('counts the whole term from a pool cut short at today', () => {
    const posted = phone.slice(0, 2)
    expect(spendingRows(posted)[0].amount).toBe(9000)
  })

  it('leaves a row it already made whole as it is', () => {
    const once = spendingRows(all)
    expect(spendingRows(once)).toBe(once)
    expect(spendingRows(once, { complete: false })[0].amount).toBe(9000)
  })

  it('gives a sheet the stored row, never the drawn one', () => {
    const copy = spendingRows(all)[0]
    expect(storedRow(copy)).toBe(phone[0])
    const folded = foldPlans(all)[0]
    expect(storedRow(folded)).toEqual(phone[0])
    expect('plan' in storedRow(folded)).toBe(false)
    expect(storedRow(lunch)).toBe(lunch)
  })
})
