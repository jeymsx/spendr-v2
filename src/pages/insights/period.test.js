// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  changeOf, monthOfPeriod, periodName, periodPhrase, periodWindow, previousWindow,
  resetInsights, setInsights, useInsightsState, usePeriod,
} from './period'

/**
 * What Insights is looking at, and what it compares with. The dates are all
 * local midnights, the way the ledger's date index is asked.
 */

const NOW = new Date(2026, 8, 27, 12) // Sunday 27 September 2026, midday
const local = (/** @type {number} */ y, /** @type {number} */ m, /** @type {number} */ d) => new Date(y, m, d).toISOString()

describe('periodWindow', () => {
  it('1M this month: to the end of it, 27 of 30 days lived', () => {
    const w = periodWindow({ range: '1m', month: null }, NOW)
    expect(w).toMatchObject({ start: local(2026, 8, 1), end: local(2026, 9, 1), year: 2026, month: 8, days: 30, elapsed: 27, running: true })
  })

  it('1M on a past month: all of it', () => {
    const w = periodWindow({ range: '1m', month: '2026-08' }, NOW)
    expect(w).toMatchObject({ start: local(2026, 7, 1), end: local(2026, 8, 1), days: 31, elapsed: 31, running: false })
  })

  it('a month from the future is this month', () => {
    expect(monthOfPeriod({ range: '1m', month: '2026-10' }, NOW)).toBe('2026-09')
    expect(monthOfPeriod({ range: '1m', month: 'nonsense' }, NOW)).toBe('2026-09')
  })

  it('7D: today and the six days before it', () => {
    expect(periodWindow({ range: '7d', month: null }, NOW)).toMatchObject({ start: local(2026, 8, 21), end: local(2026, 8, 28), days: 7 })
  })

  it('3M and 6M: whole months, ending with this one', () => {
    expect(periodWindow({ range: '3m', month: null }, NOW)).toMatchObject({ start: local(2026, 6, 1), end: local(2026, 9, 1) })
    expect(periodWindow({ range: '6m', month: null }, NOW)).toMatchObject({ start: local(2026, 3, 1), end: local(2026, 9, 1) })
  })
})

describe('previousWindow', () => {
  it('a running month is measured against the same days of the one before', () => {
    expect(previousWindow({ range: '1m', month: null }, NOW)).toEqual({ start: local(2026, 7, 1), end: local(2026, 7, 28), label: 'Aug 1–27' })
  })

  it('on the 31st, against all of a 30-day month', () => {
    const w = previousWindow({ range: '1m', month: null }, new Date(2026, 9, 31, 9))
    expect(w).toEqual({ start: local(2026, 8, 1), end: local(2026, 9, 1), label: 'Sep' })
  })

  it('in March, against all of February however short', () => {
    expect(previousWindow({ range: '1m', month: null }, new Date(2027, 2, 30, 9))?.label).toBe('Feb')
  })

  it('a past month against the whole month before it', () => {
    expect(previousWindow({ range: '1m', month: '2026-08' }, NOW)).toEqual({ start: local(2026, 6, 1), end: local(2026, 7, 1), label: 'Jul' })
  })

  it('a week against the one before, briefly named', () => {
    expect(previousWindow({ range: '7d', month: null }, NOW)).toEqual({ start: local(2026, 8, 14), end: local(2026, 8, 21), label: 'last week' })
  })

  it('the longer ranges have nothing to compare with', () => {
    expect(previousWindow({ range: '3m', month: null }, NOW)).toBe(null)
    expect(previousWindow({ range: 'all', month: null }, NOW)).toBe(null)
  })
})

describe('changeOf', () => {
  it('is whole, unsigned, and says which way', () => {
    expect(changeOf(80, 100)).toEqual({ pct: 20, up: false, same: false })
    expect(changeOf(125, 100)).toEqual({ pct: 25, up: true, same: false })
  })

  it('under half a percent is the same', () => {
    expect(changeOf(100.2, 100)?.same).toBe(true)
  })

  it('has nothing to say against nothing', () => {
    expect(changeOf(100, 0)).toBe(null)
    expect(changeOf(100, -5)).toBe(null)
  })

  it('stops at 999', () => {
    expect(changeOf(50000, 1)?.pct).toBe(999)
  })
})

describe('the period in words', () => {
  it('names the month, and the year when it is not this one', () => {
    expect(periodName({ range: '1m', month: null }, NOW)).toBe('September')
    expect(periodName({ range: '1m', month: '2025-12' }, NOW)).toBe('December 2025')
    expect(periodName({ range: '7d', month: null }, NOW)).toBe('the last 7 days')
  })

  it('reads after "No expenses"', () => {
    expect(periodPhrase({ range: '1m', month: null }, NOW)).toBe('this month')
    expect(periodPhrase({ range: '1m', month: '2026-08' }, NOW)).toBe('in August')
    expect(periodPhrase({ range: '6m', month: null }, NOW)).toBe('in the last 6 months')
    expect(periodPhrase({ range: 'all', month: null }, NOW)).toBe('yet')
  })
})

describe('the shared period', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    resetInsights()
  })
  afterEach(() => { vi.useRealTimers() })

  it('starts on this month, at 1M', () => {
    const { result } = renderHook(() => usePeriod())
    expect(result.current.period).toEqual({ range: '1m', month: null })
  })

  it('a month picked on one page is the month on every other', () => {
    const a = renderHook(() => usePeriod())
    const b = renderHook(() => usePeriod())
    act(() => a.result.current.setMonth('2026-08'))
    expect(b.result.current.period.month).toBe('2026-08')
  })

  it('this month, or later, is kept as "this month"', () => {
    const { result } = renderHook(() => usePeriod())
    act(() => result.current.setMonth('2026-09'))
    expect(result.current.period.month).toBe(null)
    act(() => result.current.setMonth('2027-01'))
    expect(result.current.period.month).toBe(null)
  })

  it('another range forgets the month, so 1M comes back on this one', () => {
    const { result } = renderHook(() => usePeriod())
    act(() => result.current.setMonth('2026-07'))
    act(() => result.current.setRange('3m'))
    expect(result.current.period).toEqual({ range: '3m', month: null })
    act(() => result.current.setRange('1m'))
    expect(result.current.period).toEqual({ range: '1m', month: null })
  })

  it('is kept for the session', () => {
    act(() => setInsights({ range: '6m', net: '1y' }))
    expect(JSON.parse(sessionStorage.getItem('spendr-insights') ?? '{}')).toMatchObject({ range: '6m', net: '1y' })
  })

  it('a quiet write is kept without re-rendering anyone', () => {
    let renders = 0
    renderHook(() => { renders++; return useInsightsState() })
    const before = renders
    act(() => setInsights({ scroll: 480 }, true))
    expect(renders).toBe(before)
    expect(JSON.parse(sessionStorage.getItem('spendr-insights') ?? '{}').scroll).toBe(480)
  })
})
