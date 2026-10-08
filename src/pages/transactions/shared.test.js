import { describe, it, expect, afterEach, vi } from 'vitest'

/**
 * Grouping, which is the third face of the same bug.
 *
 * A row was keyed into a day bucket by `tx.date.slice(0, 10)` - the UTC date
 * again - so a transaction at 07:55 in Manila filed under yesterday while one
 * logged an hour later, whose UTC date happened to agree, filed under today.
 * Two rows from the same morning, a day apart, and the heading said so.
 */
describe('grouping a day, from the reader s side', () => {
  it('files a morning transaction under the day it happened locally', async () => {
    const { groupByDate } = await import('./shared')

    /* 07:55 local, whatever local is here - built from local parts so the
       test states the property rather than an offset. */
    const morning = new Date(2026, 8, 14, 7, 55, 0).toISOString()
    const evening = new Date(2026, 8, 14, 19, 30, 0).toISOString()

    const groups = groupByDate([
      { id: 1, date: morning }, { id: 2, date: evening },
    ])

    // Same calendar day for a human, so one bucket.
    expect(groups).toHaveLength(1)
    expect(groups[0].date).toBe('2026-09-14')
    expect(groups[0].txs).toHaveLength(2)
  })

  it('still separates genuinely different days', async () => {
    const { groupByDate } = await import('./shared')
    const groups = groupByDate([
      { id: 1, date: new Date(2026, 8, 14, 9, 0, 0).toISOString() },
      { id: 2, date: new Date(2026, 8, 13, 9, 0, 0).toISOString() },
    ])
    expect(groups.map(g => g.date)).toEqual(['2026-09-14', '2026-09-13'])
  })

  it('keeps a row with no date rather than dropping it', async () => {
    const { groupByDate } = await import('./shared')
    const groups = groupByDate([{ id: 1, date: null }])
    expect(groups[0].date).toBe('unknown')
  })
})

/**
 * Which rows the tile in a list can refile with one tap: money that came or
 * went, filed by you - not a transfer, a refund, or a row the app wrote.
 */
describe('canRecategorize', () => {
  it('takes an expense and an inflow', async () => {
    const { canRecategorize } = await import('./shared')
    expect(canRecategorize({ type: 'expense', category: 'Food' })).toBe(true)
    expect(canRecategorize({ type: 'inflow', category: 'Salary' })).toBe(true)
  })

  it('leaves alone what has no category of its own to change', async () => {
    const { canRecategorize } = await import('./shared')
    expect(canRecategorize({ type: 'transfer' })).toBe(false)
    expect(canRecategorize({ type: 'expense', category: 'Food', refundOf: 'buy-1', amount: -50 })).toBe(false)
    expect(canRecategorize({ type: 'inflow', category: 'Debt Collection', settles: [{ id: 1 }] })).toBe(false)
    expect(canRecategorize({ type: 'expense', category: 'Transfer Fee' })).toBe(false)
    expect(canRecategorize({ type: 'expense', category: 'Food', description: 'Balance adjustment' })).toBe(false)
  })
})

/**
 * "This week" begins where the calendar's week begins: on Monday.
 *
 * The filter counted from Sunday while CalendarView starts its weeks on
 * Monday, so on a Sunday the filter held one day and the calendar held seven.
 * Dates are built from local parts, so the tests state the property rather
 * than an offset.
 */
describe('inDateRange, this week', () => {
  /** @param {number} y @param {number} m @param {number} d @param {number} [h] */
  const at = (y, m, d, h = 12) => ({ date: new Date(y, m, d, h, 0, 0).toISOString() })

  afterEach(() => { vi.useRealTimers() })

  /** @param {number} y @param {number} m @param {number} d */
  function today(y, m, d) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(y, m, d, 15, 30, 0))
  }

  it('starts on Monday, on a day in the middle of the week', async () => {
    const { inDateRange } = await import('./shared')
    today(2026, 9, 7) // Wednesday
    expect(inDateRange(at(2026, 9, 5, 0), 'week')).toBe(true) // Monday, first minute
    expect(inDateRange(at(2026, 9, 4, 23), 'week')).toBe(false) // Sunday, last hour
    expect(inDateRange(at(2026, 9, 7), 'week')).toBe(true)
  })

  it('still holds the whole week on a Sunday', async () => {
    const { inDateRange } = await import('./shared')
    today(2026, 9, 11) // Sunday, the last day of the week
    expect(inDateRange(at(2026, 9, 5), 'week')).toBe(true) // that week's Monday
    expect(inDateRange(at(2026, 9, 4), 'week')).toBe(false) // the Sunday before
  })

  it('holds only today on a Monday', async () => {
    const { inDateRange } = await import('./shared')
    today(2026, 9, 12) // Monday
    expect(inDateRange(at(2026, 9, 12, 8), 'week')).toBe(true)
    expect(inDateRange(at(2026, 9, 11, 20), 'week')).toBe(false) // yesterday, Sunday
  })

  it('crosses a month boundary', async () => {
    const { inDateRange } = await import('./shared')
    today(2026, 10, 1) // Sunday 1 November: its week began on Monday 26 October
    expect(inDateRange(at(2026, 9, 26), 'week')).toBe(true)
    expect(inDateRange(at(2026, 9, 25), 'week')).toBe(false)
  })
})
