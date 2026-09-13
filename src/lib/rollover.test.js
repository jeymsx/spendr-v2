import { describe, it, expect } from 'vitest'
import {
  monthKey, prevMonth, rollsOver, spendByMonth, carryInto, effectiveLimit, sweepable,
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
      (c.name === 'Groceries' ? { ...c, rollover: true } : c))
    expect(sweepable({ categories: rolling, txs, month: '2026-08' }).total).toBe(0)
  })

  it('skips a category with no limit, which is not under anything', () => {
    const { rows } = sweepable({
      categories, txs: [...txs, spend('2026-08', 10, 'Others')], month: '2026-08',
    })
    expect(rows.some(r => r.name === 'Others')).toBe(false)
  })

  it('says nothing for a month where everything was spent', () => {
    const all = [spend('2026-08', 5000, 'Groceries'), spend('2026-08', 2000, 'Transpo'),
                 spend('2026-08', 1000, 'Bills')]
    expect(sweepable({ categories, txs: all, month: '2026-08' })).toEqual({ rows: [], total: 0 })
  })
})
