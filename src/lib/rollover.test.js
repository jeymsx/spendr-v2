import { describe, it, expect } from 'vitest'
import {
  monthKey, prevMonth, rollsOver, spendByMonth, carryInto, effectiveLimit, sweepable,
  keptLeftover, startsForGlobalOn, startForLimit, planLimitSave, sweepOutcome, sweptKey,
} from './rollover'

/** @param {string} month @param {number} amount @param {string} [category] */
const spend = (month, amount, category = 'Groceries') => ({
  type: 'expense', category, amount, date: `${month}-15T08:00:00+08:00`,
})

describe('month keys', () => {
  it('formats and steps back, including across a year', () => {
    expect(monthKey(new Date('2026-09-13T00:00:00+08:00'))).toBe('2026-09')
    expect(prevMonth('2026-09')).toBe('2026-08')
    expect(prevMonth('2026-01')).toBe('2025-12')
  })
})

describe('rollsOver', () => {
  /** "Everything except rent" has to be expressible, so an explicit no wins. */
  it('lets a category override the global in both directions', () => {
    expect(rollsOver({ rollover: true }, false)).toBe(true)
    expect(rollsOver({ rollover: false }, true)).toBe(false)
  })

  it('falls back to the global when the category has no opinion', () => {
    expect(rollsOver({}, true)).toBe(true)
    expect(rollsOver({}, false)).toBe(false)
    expect(rollsOver({ rollover: null }, true)).toBe(true)
  })
})

describe('spendByMonth', () => {
  it('buckets by month and ignores other categories', () => {
    const txs = [spend('2026-08', 100), spend('2026-08', 50), spend('2026-09', 70),
                 spend('2026-08', 999, 'Transpo')]
    expect(spendByMonth(txs, 'Groceries')).toEqual({ '2026-08': 150, '2026-09': 70 })
  })

  /**
   * Refunds are negative expenses, so they subtract with no special case.
   * This is the whole reason they are stored that way rather than as a type.
   */
  it('nets a refund out of the month it lands in', () => {
    const txs = [spend('2026-08', 1000), { ...spend('2026-08', -300), refundOf: 'x' }]
    expect(spendByMonth(txs, 'Groceries')['2026-08']).toBe(700)
  })
})

describe('carryInto', () => {
  const base = { limit: 5000, from: '2026-07', month: '2026-09' }

  it('carries an underspend forward', () => {
    // July spent 4,000 (+1,000), August 3,000 (+2,000).
    const spendMap = { '2026-07': 4000, '2026-08': 3000 }
    expect(carryInto({ ...base, spend: spendMap })).toBe(3000)
  })

  /**
   * The half people want to leave out. Without it the limit only ever grows,
   * and a budget that only grows is not a budget.
   */
  it('carries an overspend forward too', () => {
    const spendMap = { '2026-07': 7000, '2026-08': 3000 }
    expect(carryInto({ ...base, spend: spendMap })).toBe(0)   // -2000 +2000
  })

  it('can end up negative overall', () => {
    expect(carryInto({ ...base, spend: { '2026-07': 9000, '2026-08': 6000 } })).toBe(-5000)
  })

  /** A month with nothing spent is a full month's worth carried. */
  it('counts a silent month at the full limit', () => {
    expect(carryInto({ ...base, spend: {} })).toBe(10000)
  })

  /**
   * Turning rollover on in September must not credit January onward. The
   * start date is what stops a four-figure windfall appearing from nowhere.
   */
  it('starts at `from` and never reaches behind it', () => {
    const spendMap = { '2026-01': 0, '2026-07': 4000, '2026-08': 3000 }
    expect(carryInto({ ...base, spend: spendMap })).toBe(3000)
    expect(carryInto({ ...base, from: '2026-09', spend: spendMap })).toBe(0)
  })

  it('is zero without a limit to measure against', () => {
    expect(carryInto({ ...base, limit: 0, spend: { '2026-08': 10 } })).toBe(0)
  })
})

describe('effectiveLimit', () => {
  const txs = [spend('2026-08', 3000)]

  it('leaves a non-rolling category exactly as it was', () => {
    const r = effectiveLimit({ cat: { name: 'Groceries', budget: 5000 }, txs, month: '2026-09' })
    expect(r).toEqual({ limit: 5000, carry: 0, effective: 5000 })
  })

  it('adds the carry when the category rolls', () => {
    const cat = { name: 'Groceries', budget: 5000, rollover: true, rolloverFrom: '2026-08' }
    const r = effectiveLimit({ cat, txs, month: '2026-09' })
    expect(r.carry).toBe(2000)
    expect(r.effective).toBe(7000)
  })

  /**
   * A carried overspend can exceed the limit. The meter has no way to draw
   * below empty, and "you may spend -1,000" is not a sentence.
   */
  it('clamps a wiped-out limit at zero rather than going negative', () => {
    const cat = { name: 'Groceries', budget: 5000, rollover: true, rolloverFrom: '2026-08' }
    const r = effectiveLimit({ cat, txs: [spend('2026-08', 12000)], month: '2026-09' })
    expect(r.carry).toBe(-7000)
    expect(r.effective).toBe(0)
  })

  it('honours the global default for an undecided category', () => {
    const cat = { name: 'Groceries', budget: 5000, rolloverFrom: '2026-08' }
    expect(effectiveLimit({ cat, txs, month: '2026-09' }).effective).toBe(5000)
    expect(effectiveLimit({ cat, txs, month: '2026-09', globalDefault: true }).effective).toBe(7000)
  })
})

describe('sweepable', () => {
  const categories = [
    { name: 'Groceries', budget: 5000 },
    { name: 'Transpo',   budget: 2000 },
    { name: 'Bills',     budget: 1000 },
    { name: 'Others',    budget: 0 },
  ]
  const txs = [spend('2026-08', 3000, 'Groceries'),
               spend('2026-08', 2500, 'Transpo'),
               spend('2026-08', 1000, 'Bills')]

  it('reports only what came in under, biggest first', () => {
    const { rows, total } = sweepable({ categories, txs, month: '2026-08' })
    expect(rows.map(r => r.name)).toEqual(['Groceries'])
    expect(rows[0].left).toBe(2000)
    expect(total).toBe(2000)
  })

  /** A rolling category already kept its leftover; sweeping would move it twice. */
  it('skips a category that rolls over', () => {
    const rolling = categories.map(c =>
      (c.name === 'Groceries' ? { ...c, rollover: true, rolloverFrom: '2026-01' } : c))
    expect(sweepable({ categories: rolling, txs, month: '2026-08' }).total).toBe(0)
  })

  /** The global switch on: every undecided category with a start has kept it. */
  it('skips categories that roll through the global switch', () => {
    const started = categories.map(c => ({ ...c, rolloverFrom: '2026-01' }))
    expect(sweepable({ categories: started, txs, month: '2026-08', globalDefault: true }).total).toBe(0)
    // ...and with the switch off the same categories are offered again.
    expect(sweepable({ categories: started, txs, month: '2026-08', globalDefault: false }).total).toBe(2000)
  })

  /**
   * The carry into September counts August only when it starts in August or
   * before. One that began in September kept nothing, and one with no start
   * kept nothing either - so the money is still loose, and is still offered.
   */
  it('still offers a category that rolls but did not carry that month', () => {
    const fresh = categories.map(c =>
      (c.name === 'Groceries' ? { ...c, rollover: true, rolloverFrom: '2026-09' } : c))
    expect(sweepable({ categories: fresh, txs, month: '2026-08' }).total).toBe(2000)
    const unstamped = categories.map(c =>
      (c.name === 'Groceries' ? { ...c, rollover: true } : c))
    expect(sweepable({ categories: unstamped, txs, month: '2026-08' }).total).toBe(2000)
  })

  it('skips an inflow category that holds a stray budget', () => {
    const withSalary = [...categories, { name: 'Salary', type: 'inflow', budget: 50000 }]
    const { rows } = sweepable({ categories: withSalary, txs, month: '2026-08' })
    expect(rows.map(r => r.name)).toEqual(['Groceries'])
  })

  it('skips a category with no limit, which is not under anything', () => {
    const { rows } = sweepable({
      categories, txs: [...txs, spend('2026-08', 10, 'Others')], month: '2026-08',
    })
    expect(rows.some(r => r.name === 'Others')).toBe(false)
  })

  /** Limits set today over an empty month are not money saved. */
  it('says nothing for a month with no spending logged', () => {
    expect(sweepable({ categories, txs: [], month: '2026-08' })).toEqual({ rows: [], total: 0 })
    // Spending in other months only.
    expect(sweepable({ categories, txs: [spend('2026-07', 100), spend('2026-09', 100)], month: '2026-08' }))
      .toEqual({ rows: [], total: 0 })
  })

  it('counts a month spent in, even where it was all outside the limits', () => {
    const { total } = sweepable({ categories, txs: [spend('2026-08', 10, 'Others')], month: '2026-08' })
    expect(total).toBe(8000)
  })

  it('says nothing for a month where everything was spent', () => {
    const all = [spend('2026-08', 5000, 'Groceries'), spend('2026-08', 2000, 'Transpo'),
                 spend('2026-08', 1000, 'Bills')]
    expect(sweepable({ categories, txs: all, month: '2026-08' })).toEqual({ rows: [], total: 0 })
  })
})

/** An installment plan is spent in full the month it was bought (utils/installments). */
describe('an installment plan in a budget', () => {
  const plan = Array.from({ length: 12 }, (_, i) => ({
    type: 'expense', category: 'Gadgets', amount: 3000, installmentId: 'ph',
    description: `Phone (${i + 1}/12)`, date: `2026-${String(1 + i).padStart(2, '0')}-10T08:00:00+08:00`,
  }))

  it('counts the whole price the month bought, and nothing in the months after', () => {
    const by = spendByMonth(plan, 'Gadgets')
    expect(by['2026-01']).toBe(36000)
    expect(by['2026-02']).toBeUndefined()
    expect(by['2026-06']).toBeUndefined()
  })

  it('is not a month spent in for the sweep when only a payment fell in it', () => {
    const cats = [{ name: 'Gadgets', budget: 5000 }]
    expect(sweepable({ categories: cats, txs: plan, month: '2026-03' }).total).toBe(0)
  })
})

describe('keptLeftover', () => {
  it('needs the category to roll AND to have started by that month', () => {
    expect(keptLeftover({ rolloverFrom: '2026-08' }, true, '2026-08')).toBe(true)
    expect(keptLeftover({ rolloverFrom: '2026-07' }, true, '2026-08')).toBe(true)
    expect(keptLeftover({ rolloverFrom: '2026-09' }, true, '2026-08')).toBe(false)
    expect(keptLeftover({}, true, '2026-08')).toBe(false)
    expect(keptLeftover({ rolloverFrom: '2026-01' }, false, '2026-08')).toBe(false)
    expect(keptLeftover({ rolloverFrom: '2026-01', rollover: false }, true, '2026-08')).toBe(false)
  })
})

/**
 * The switch. It used to write the flag and nothing else, so a category with
 * no start month carried nothing and the switch did nothing. These are the
 * rules the screens now follow; rolloverSettings.test.js runs them against a
 * database.
 */
describe('the global switch', () => {
  const groceries = { id: 1, name: 'Groceries', type: 'expense', budget: 5000 }

  it('does nothing for a category with no start - the bug', () => {
    const txs = [spend('2026-09', 3000)]
    const r = effectiveLimit({ cat: groceries, txs, month: '2026-10', globalDefault: true })
    expect(r).toEqual({ limit: 5000, carry: 0, effective: 5000 })
  })

  it('carries once the start is stamped', () => {
    const [stamp] = startsForGlobalOn([groceries], '2026-09')
    const cat = { ...groceries, rolloverFrom: stamp.rolloverFrom }
    const r = effectiveLimit({ cat, txs: [spend('2026-09', 3000)], month: '2026-10', globalDefault: true })
    expect(r).toEqual({ limit: 5000, carry: 2000, effective: 7000 })
  })

  it('stamps every expense category without a start, the month it is turned on', () => {
    const cats = [
      groceries,
      { id: 2, name: 'Transpo', type: 'expense', budget: 0 },
      { id: 3, name: 'Old', type: 'expense', budget: 100, rolloverFrom: '2026-02' },
      { id: 4, name: 'Rent', type: 'expense', budget: 100, rollover: false },
      { id: 5, name: 'Salary', type: 'inflow', budget: 0 },
      { name: 'No id', type: 'expense', budget: 100 },
    ]
    expect(startsForGlobalOn(cats, '2026-10')).toEqual([
      { id: 1, rolloverFrom: '2026-10' },
      { id: 2, rolloverFrom: '2026-10' },
    ])
  })

  it('has nothing to stamp when there are no categories', () => {
    expect(startsForGlobalOn([], '2026-10')).toEqual([])
    expect(startsForGlobalOn(undefined, '2026-10')).toEqual([])
  })
})

describe('startForLimit', () => {
  const month = '2026-10'

  it('starts the carry when a rolling category is given a limit it did not have', () => {
    // Stamped by the switch while it had no limit; the limit arrives in October.
    expect(startForLimit({ cat: { budget: 0, rolloverFrom: '2026-03' }, budget: 4000, rolls: true, month })).toBe(month)
    expect(startForLimit({ cat: undefined, budget: 4000, rolls: true, month })).toBe(month)
  })

  it('heals a rolling category that has a limit and never had a start', () => {
    expect(startForLimit({ cat: { budget: 4000 }, budget: 4000, rolls: true, month })).toBe(month)
  })

  it('keeps a start that stands when the limit was already there', () => {
    expect(startForLimit({ cat: { budget: 4000, rolloverFrom: '2026-03' }, budget: 6000, rolls: true, month })).toBeUndefined()
  })

  it('writes nothing for a category that does not roll or has no limit', () => {
    expect(startForLimit({ cat: { budget: 0 }, budget: 4000, rolls: false, month })).toBeUndefined()
    expect(startForLimit({ cat: { budget: 4000 }, budget: 0, rolls: true, month })).toBeUndefined()
  })
})

describe('planLimitSave', () => {
  const month = '2026-10'
  const cat = (/** @type {number} */ id, /** @type {Record<string, any>} */ over = {}) =>
    ({ id, name: `Cat ${id}`, type: 'expense', budget: 0, ...over })

  it('writes a changed limit and nothing for a limit left as it was', () => {
    const plan = planLimitSave({
      categories: [cat(1, { budget: 1000 }), cat(2, { budget: 500 })],
      budgets: { 1: 1500, 2: 500 }, carry: {}, globalDefault: false, month,
    })
    expect(plan).toEqual([{ id: 1, patch: { budget: 1500 } }])
  })

  it('leaves the categories nobody touched out of the plan', () => {
    const plan = planLimitSave({
      categories: [cat(1, { budget: 1000 }), cat(2, { budget: 500 })],
      budgets: { 1: 1500 }, carry: {}, globalDefault: true, month,
    })
    expect(plan.map(p => p.id)).toEqual([1])
  })

  /** The button, with the switch off: opt in, and start now. */
  it('opts a category in explicitly and stamps the start', () => {
    const plan = planLimitSave({
      categories: [cat(1, { budget: 1000 })], budgets: {}, carry: { 1: true }, globalDefault: false, month,
    })
    expect(plan).toEqual([{ id: 1, patch: { rollover: true, rolloverFrom: month } }])
  })

  /** Switching it back on keeps the old date: it must not reach back any further. */
  it('keeps the old start when a category is opted in again', () => {
    const plan = planLimitSave({
      categories: [cat(1, { budget: 1000, rollover: false, rolloverFrom: '2026-06' })],
      budgets: {}, carry: { 1: true }, globalDefault: false, month,
    })
    expect(plan).toEqual([{ id: 1, patch: { rollover: true } }])
  })

  /** The button, with the switch ON: it used to be unable to write at all. */
  it('opts a category out against a global that is on, explicitly', () => {
    const plan = planLimitSave({
      categories: [cat(1, { budget: 1000, rolloverFrom: '2026-10' })],
      budgets: {}, carry: { 1: false }, globalDefault: true, month,
    })
    expect(plan).toEqual([{ id: 1, patch: { rollover: false } }])
  })

  it('opts a category back in against a global that is on, when it was held out', () => {
    const plan = planLimitSave({
      categories: [cat(1, { budget: 1000, rollover: false })],
      budgets: {}, carry: { 1: true }, globalDefault: true, month,
    })
    expect(plan).toEqual([{ id: 1, patch: { rollover: true, rolloverFrom: month } }])
  })

  /** Tapping the button and tapping it back is not a change. */
  it('writes nothing when the button ends where it began', () => {
    const plan = planLimitSave({
      categories: [cat(1, { budget: 1000, rolloverFrom: '2026-10' })],
      budgets: {}, carry: { 1: true }, globalDefault: true, month,
    })
    expect(plan).toEqual([])
  })

  /** The category created, or restored, with the switch already on. */
  it('starts the carry for a rolling category that is given its first limit', () => {
    const plan = planLimitSave({
      categories: [cat(1)], budgets: { 1: 3000 }, carry: {}, globalDefault: true, month,
    })
    expect(plan).toEqual([{ id: 1, patch: { budget: 3000, rolloverFrom: month } }])
  })

  it('does not stamp a category that does not roll, or one left with no limit', () => {
    expect(planLimitSave({
      categories: [cat(1)], budgets: { 1: 3000 }, carry: {}, globalDefault: false, month,
    })).toEqual([{ id: 1, patch: { budget: 3000 } }])
    expect(planLimitSave({
      categories: [cat(1, { budget: 3000 })], budgets: { 1: 0 }, carry: { 1: true }, globalDefault: false, month,
    })).toEqual([{ id: 1, patch: { budget: 0, rollover: true } }])
  })

  /** ids reach the editor as numbers and its state as object keys, i.e. strings. */
  it('matches a category by its id whether the key is a string or a number', () => {
    const plan = planLimitSave({
      categories: [cat(7, { budget: 100 })], budgets: { '7': 200 }, carry: {}, globalDefault: false, month,
    })
    expect(plan).toEqual([{ id: 7, patch: { budget: 200 } }])
  })
})

describe('what became of last month, once it was swept', () => {
  it('keys the stamp by the month it is about', () => {
    expect(sweptKey('2026-09')).toBe('swept-2026-09')
  })

  it('tells moved from dismissed, and open from both', () => {
    expect(sweepOutcome('moved')).toBe('moved')
    expect(sweepOutcome('dismissed')).toBe('dismissed')
    expect(sweepOutcome(undefined)).toBeNull()
    expect(sweepOutcome(null)).toBeNull()
    expect(sweepOutcome(false)).toBeNull()
  })

  /**
   * Moving and dismissing both used to write `true`. Reading it as moved is
   * the reading that cannot offer the same money twice.
   */
  it('reads the old stamp, `true`, as moved', () => {
    expect(sweepOutcome(true)).toBe('moved')
  })
})
