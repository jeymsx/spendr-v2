import { describe, it, expect } from 'vitest'
import { rowKey, duplicateGroups, planDedupe, DEDUPE_KEYS } from './dedupe'

/**
 * The rule that decides what gets deleted.
 *
 * Every assertion here is really the same question asked twice: does it catch
 * the copies, and does it leave alone two things that merely look alike. The
 * second half matters more. A duplicate this misses stays on screen and can
 * be removed by hand; a real debt it merges is gone, and nothing in the app
 * would ever say so.
 */

/** @param {any} over */
const debt = (over = {}) => ({
  id: 1, contact: 'Robina', name: null, amount: 527, amountPaid: 527,
  type: 'owed_to_me', notes: null, dueDate: null,
  createdAt: '2026-06-08T06:54:46.368Z', ...over,
})

describe('rowKey', () => {
  it('reads null, undefined and empty as the same absence', () => {
    const a = rowKey({ notes: null }, ['notes'])
    const b = rowKey({ notes: '' }, ['notes'])
    const c = rowKey({}, ['notes'])
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  /* One client stores 527, another 527.0000001 after a round trip. */
  it('compares money at two decimals', () => {
    expect(rowKey({ amount: 527 }, ['amount']))
      .toBe(rowKey({ amount: 527.000000001 }, ['amount']))
  })

  it('does not confuse a number with the string of it', () => {
    expect(rowKey({ amount: 527 }, ['amount'])).toBe(rowKey({ amount: '527' }, ['amount']))
  })
})

describe('duplicateGroups', () => {
  it('says nothing when every row is its own', () => {
    expect(duplicateGroups([debt(), debt({ id: 2, amount: 100 })], DEDUPE_KEYS.debts)).toEqual([])
  })

  it('finds the copies and nominates one survivor', () => {
    const rows = [debt({ id: 5 }), debt({ id: 6 }), debt({ id: 21 }), debt({ id: 30 })]
    const [g] = duplicateGroups(rows, DEDUPE_KEYS.debts)
    expect(g.keep.id).toBe(5)
    expect(g.drop.map(d => d.id)).toEqual([6, 21, 30])
  })

  /** The stamped row is the one the server already knows about. */
  it('keeps a stamped copy over a lower unstamped id', () => {
    const rows = [debt({ id: 5 }), debt({ id: 21, syncId: 'abc' })]
    const [g] = duplicateGroups(rows, DEDUPE_KEYS.debts)
    expect(g.keep.id).toBe(21)
    expect(g.drop.map(d => d.id)).toEqual([5])
  })

  it('is stable: the same rows in a different order pick the same survivor', () => {
    const a = duplicateGroups([debt({ id: 5 }), debt({ id: 6 })], DEDUPE_KEYS.debts)
    const b = duplicateGroups([debt({ id: 6 }), debt({ id: 5 })], DEDUPE_KEYS.debts)
    expect(a[0].keep.id).toBe(b[0].keep.id)
  })

  // ── The half that protects real data ──────────────────────────────────

  /** Two ₱57 rides owed by the same person on different days. */
  it('keeps two identical amounts recorded at different times apart', () => {
    const rows = [
      debt({ id: 1, amount: 57, amountPaid: 0, createdAt: '2026-06-01T00:00:00.000Z' }),
      debt({ id: 2, amount: 57, amountPaid: 0, createdAt: '2026-06-08T00:00:00.000Z' }),
    ]
    expect(duplicateGroups(rows, DEDUPE_KEYS.debts)).toEqual([])
  })

  /** One has been part paid, so somebody settled against that row. */
  it('keeps a copy whose payment has moved', () => {
    const rows = [debt({ id: 1 }), debt({ id: 2, amountPaid: 200 })]
    expect(duplicateGroups(rows, DEDUPE_KEYS.debts)).toEqual([])
  })

  it('keeps the two directions apart', () => {
    const rows = [debt({ id: 1 }), debt({ id: 2, type: 'i_owe' })]
    expect(duplicateGroups(rows, DEDUPE_KEYS.debts)).toEqual([])
  })

  it('keeps two people with the same figure apart', () => {
    const rows = [debt({ id: 1 }), debt({ id: 2, contact: 'Gelo' })]
    expect(duplicateGroups(rows, DEDUPE_KEYS.debts)).toEqual([])
  })

  it('keeps a note that differs', () => {
    const rows = [debt({ id: 1 }), debt({ id: 2, notes: 'Sukiya' })]
    expect(duplicateGroups(rows, DEDUPE_KEYS.debts)).toEqual([])
  })

  /** iCloud at 599 and iCloud at 699 is a price change, not a duplicate. */
  it('keeps a bill whose amount changed apart from the old one', () => {
    const rows = [
      { id: 1, name: 'iCloud', amount: 599, frequency: 'monthly', nextDate: '2026-10-05', active: true },
      { id: 4, name: 'iCloud', amount: 699, frequency: 'monthly', nextDate: '2026-10-05', active: true },
    ]
    expect(duplicateGroups(rows, DEDUPE_KEYS.recurring)).toEqual([])
  })

  it('does collapse a bill that is the same in every respect', () => {
    const bill = { name: 'Spotify', amount: 229, frequency: 'monthly', nextDate: '2026-10-01', active: true }
    const [g] = duplicateGroups(
      [{ id: 2, ...bill }, { id: 5, ...bill }, { id: 9, ...bill }], DEDUPE_KEYS.recurring)
    expect(g.drop).toHaveLength(2)
  })
})

describe('planDedupe', () => {
  /** The numbers the confirmation screen shows come from here, and the same
   *  call performs the repair - so what is promised is what happens. */
  it('counts each table, and the whole job', () => {
    const bill = { name: 'Spotify', amount: 229, frequency: 'monthly', nextDate: '2026-10-01', active: true }
    const plan = planDedupe({
      debts: [debt({ id: 5 }), debt({ id: 6 }), debt({ id: 21 })],
      recurring: [{ id: 2, ...bill }, { id: 5, ...bill }],
      templates: [{ id: 1, name: 'Grab', type: 'expense', amount: 180 }],
    })
    expect(plan.debts).toMatchObject({ rows: 3, real: 1, removes: 2 })
    expect(plan.recurring).toMatchObject({ rows: 2, real: 1, removes: 1 })
    expect(plan.templates).toMatchObject({ rows: 1, real: 1, removes: 0 })
    expect(plan.total).toBe(3)
  })

  it('comes to zero on a database with nothing wrong', () => {
    const plan = planDedupe({ debts: [debt()], recurring: [], templates: [] })
    expect(plan.total).toBe(0)
  })

  it('survives being handed nothing at all', () => {
    expect(planDedupe({}).total).toBe(0)
    expect(planDedupe(/** @type {any} */ (undefined)).total).toBe(0)
  })
})
