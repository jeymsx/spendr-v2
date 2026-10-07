import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { grainFor, grainTitle, trendRows, trendSeries } from './trendData'
import { trendAxis } from './Charts'

const DAYS = [
  { day: 1, label: 'Oct 1', expense: 100, income: 0 },
  { day: 2, label: 'Oct 2', expense: 0, income: 500 },
  { day: 3, label: 'Oct 3', expense: 40, income: 0 },
  { day: 4, label: 'Oct 4', expense: 0, income: 0 },
]
const MONTHS = [
  { label: 'Aug', income: 900, expense: 400 },
  { label: 'Sep', income: 300, expense: 700 },
]
const none = { expenses: [], inflows: [], start: '' }

describe('grainFor', () => {
  it('is a day up to 1M and a month beyond when it is left to auto', () => {
    expect(['7d', '1m'].map(r => grainFor(r, 'auto'))).toEqual(['day', 'day'])
    expect(['3m', '6m', 'all'].map(r => grainFor(r, 'auto'))).toEqual(['month', 'month', 'month'])
  })

  it('gives a range the grain that was asked for when it can be cut that way', () => {
    expect(grainFor('3m', 'day')).toBe('day')
    expect(grainFor('6m', 'week')).toBe('week')
    expect(grainFor('1m', 'week')).toBe('week')
    expect(grainFor('all', 'week')).toBe('week')
  })

  it('gives the nearest it can when it cannot, so changing range never leaves nothing to draw', () => {
    expect(grainFor('7d', 'week')).toBe('day')
    expect(grainFor('7d', 'month')).toBe('day')
    expect(grainFor('1m', 'month')).toBe('week')
    expect(grainFor('all', 'day')).toBe('week')
  })

  it('reads anything unknown as auto', () => {
    expect(grainFor('3m', 'decade')).toBe('month')
  })
})

describe('trendSeries', () => {
  it('gives every range all three series, day by day', () => {
    const rows = trendRows({ range: '1m', grain: 'auto', daily: DAYS, lived: DAYS, multiBarData: [], ...none })
    const t = trendSeries(rows)
    expect(Object.keys(t)).toEqual(['expenses', 'income', 'netflow'])
    expect(t.expenses.map(p => p.value)).toEqual([100, 0, 40, 0])
    expect(t.income.map(p => p.value)).toEqual([0, 500, 0, 0])
    expect(t.netflow.map(p => p.value)).toEqual([-100, 500, -40, 0])
    expect(t.expenses[0]).toEqual({ tick: '1', label: 'Oct 1', value: 100 })
  })

  it('gives the longer ranges the same three, month by month', () => {
    const t = trendSeries(trendRows({ range: '3m', grain: 'auto', daily: [], lived: [], multiBarData: MONTHS, ...none }))
    expect(t.expenses.map(p => p.value)).toEqual([400, 700])
    expect(t.income.map(p => p.value)).toEqual([900, 300])
    expect(t.netflow.map(p => p.value)).toEqual([500, -400])
    expect(t.netflow[1]).toEqual({ tick: 'Sep', label: 'Sep', value: -400 })
  })

  it('leaves the days of a running month that have not happened empty, not at nought', () => {
    const rows = trendRows({ range: '1m', grain: 'auto', daily: DAYS, lived: DAYS.slice(0, 2), multiBarData: [], ...none })
    for (const s of Object.values(trendSeries(rows))) expect(s.map(p => p.value == null)).toEqual([false, false, true, true])
  })
})

describe('trendRows by week', () => {
  const month = Array.from({ length: 31 }, (_, i) => ({ day: i + 1, label: `Oct ${i + 1}`, expense: 10, income: i === 0 ? 1000 : 0 }))

  it('cuts a month into weeks of seven from the 1st, the last one short', () => {
    const rows = trendRows({ range: '1m', grain: 'week', daily: month, lived: month, multiBarData: [], ...none })
    expect(rows.map(r => r.tick)).toEqual(['1', '8', '15', '22', '29'])
    expect(rows.map(r => r.expense)).toEqual([70, 70, 70, 70, 30])
    expect(rows[0].income).toBe(1000)
    expect(rows[0].label).toBe('Oct 1 – Oct 7')
    expect(rows[4].label).toBe('Oct 29 – Oct 31')
  })

  it('leaves a week with no day lived yet empty, and counts one with some', () => {
    const rows = trendRows({ range: '1m', grain: 'week', daily: month, lived: month.slice(0, 9), multiBarData: [], ...none })
    expect(rows.map(r => r.happened)).toEqual([true, true, false, false, false])
  })

  it('does not cut a week of days any coarser than a day', () => {
    const week = month.slice(0, 7)
    expect(trendRows({ range: '7d', grain: 'week', daily: week, lived: week, multiBarData: [], ...none })).toHaveLength(7)
  })
})

describe('trendRows over the longer ranges, by day or week', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 7, 15, 0, 0)) })
  afterEach(() => { vi.useRealTimers() })

  const at = (/** @type {number} */ y, /** @type {number} */ m, /** @type {number} */ d) => new Date(y, m, d, 12).toISOString()
  const expenses = [
    { date: at(2026, 7, 1), amount: 100 }, { date: at(2026, 7, 1), amount: 50 },
    { date: at(2026, 9, 7), amount: 25 },
  ]
  const inflows = [{ date: at(2026, 7, 3), amount: 900 }]
  const base = { range: '3m', daily: [], lived: [], multiBarData: MONTHS, expenses, inflows, start: new Date(2026, 7, 1).toISOString() }

  it('has a point for every day from the start of the period to today, summing each', () => {
    const rows = trendRows({ ...base, grain: 'day' })
    expect(rows).toHaveLength(31 + 30 + 7)
    expect(rows[0]).toMatchObject({ tick: 'Aug 1', label: 'Sat, Aug 1', expense: 150, income: 0 })
    expect(rows[2]).toMatchObject({ short: 'Aug 3', income: 900 })
    expect(rows.at(-1)).toMatchObject({ short: 'Oct 7', expense: 25 })
    expect(rows.every(r => r.happened)).toBe(true)
  })

  it('cuts those days into weeks of seven from the first, the last one short', () => {
    const rows = trendRows({ ...base, grain: 'week' })
    expect(rows).toHaveLength(10)
    expect(rows[0]).toMatchObject({ tick: 'Aug 1', label: 'Aug 1 – Aug 7', expense: 150, income: 900 })
    expect(rows.at(-1)?.label).toBe('Oct 3 – Oct 7')
    expect(rows.reduce((s, r) => s + r.expense, 0)).toBe(175)
  })

  it('keeps the months, when that is what is asked for', () => {
    expect(trendRows({ ...base, grain: 'month' }).map(r => r.tick)).toEqual(['Aug', 'Sep'])
  })

  it('starts All at the first thing in the ledger, and says which year once it runs past one', () => {
    const old = [{ date: at(2024, 2, 4), amount: 10 }]
    const rows = trendRows({ ...base, range: 'all', grain: 'week', expenses: old, inflows: [], start: '2000-01-01' })
    expect(rows[0].short).toBe('Mar 4')
    expect(rows[0].tick).toBe('Mar ’24')
    expect(rows.length).toBeGreaterThan(100)
  })

  it('has nothing to draw for All when there is nothing in it', () => {
    expect(trendRows({ ...base, range: 'all', grain: 'week', expenses: [], inflows: [], start: '2000-01-01' })).toEqual([])
  })
})

describe('grainTitle', () => {
  it('names the cut', () => {
    expect(grainTitle('day', '1m', [])).toBe('Day by day')
    expect(grainTitle('week', '3m', [])).toBe('Week by week')
    expect(grainTitle('month', '3m', MONTHS)).toBe('Month by month')
    expect(grainTitle('month', 'all', [{ label: '2025' }])).toBe('Year by year')
  })
})

describe('trendAxis', () => {
  it('starts at zero for a series that never went below it', () => {
    const { floor, ceil, ticks } = trendAxis([0, 40, 90])
    expect(floor).toBe(0)
    expect(ceil).toBeGreaterThan(90)
    expect(ticks[0]).toBe(0)
    expect(ticks.every(t => t >= 0)).toBe(true)
  })

  it('goes under zero for a net that did', () => {
    const { floor, ceil, ticks } = trendAxis([-300, 500])
    expect(floor).toBeLessThan(-300)
    expect(ceil).toBeGreaterThan(500)
    expect(ticks).toContain(0)
  })

  it('stops at zero for a series that never came above it', () => {
    const { floor, ceil, ticks } = trendAxis([-90, -10])
    expect(floor).toBeLessThan(-90)
    expect(ceil).toBe(0)
    expect(ticks.every(t => t <= 0)).toBe(true)
  })

  it('copes with nothing at all', () => {
    const { ticks } = trendAxis([])
    expect(ticks.every(t => Number.isFinite(t))).toBe(true)
    expect(ticks.length).toBeGreaterThanOrEqual(2)
  })
})
