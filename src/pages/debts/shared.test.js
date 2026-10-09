import { describe, expect, it, afterEach, vi } from 'vitest'
import { daysToDue, getDueStatus, fmtDueDate } from './shared'

/**
 * A debt's due date is a calendar day, kept as 'YYYY-MM-DD'. Read as a Date
 * that is UTC midnight, which is the evening before in any zone west of UTC:
 * a debt due Nov 1 showed overdue on Nov 1. These pin it to the day typed.
 *
 * Node re-reads TZ when it is assigned, so each case runs in a chosen zone.
 */

const before = process.env.TZ
afterEach(() => {
  vi.useRealTimers()
  if (before === undefined) delete process.env.TZ
  else process.env.TZ = before
})

/**
 * @param {string} tz
 * @param {[number, number, number, number]} localNow  year, month (0-11), day, hour
 */
function at(tz, [y, m, d, h]) {
  process.env.TZ = tz
  vi.useFakeTimers()
  vi.setSystemTime(new Date(y, m, d, h))
}

describe('a due date is the day that was typed', () => {
  it('is not overdue on its due day, west of UTC', () => {
    // New York is UTC-5 here, and the clocks went back at 2am the same morning.
    at('America/New_York', [2026, 10, 1, 9])
    expect(daysToDue('2026-11-01')).toBe(0)
    expect(getDueStatus('2026-11-01', false)).toBe('soon')
  })

  it('is overdue the day after, and due tomorrow the day before', () => {
    at('America/New_York', [2026, 10, 1, 9])
    expect(daysToDue('2026-10-31')).toBe(-1)
    expect(getDueStatus('2026-10-31', false)).toBe('overdue')
    expect(daysToDue('2026-11-02')).toBe(1)
  })

  it('counts the same on the far west side of the zone map', () => {
    at('Pacific/Honolulu', [2026, 10, 1, 23])
    expect(daysToDue('2026-11-01')).toBe(0)
    expect(getDueStatus('2026-11-01', false)).toBe('soon')
  })

  it('is unchanged east of UTC', () => {
    at('Asia/Manila', [2026, 10, 1, 9])
    expect(daysToDue('2026-11-01')).toBe(0)
    expect(daysToDue('2026-11-08')).toBe(7)
    at('Pacific/Auckland', [2026, 10, 1, 0])
    expect(daysToDue('2026-11-01')).toBe(0)
    expect(getDueStatus('2026-10-31', false)).toBe('overdue')
  })

  it('stays whole days across a daylight-saving change', () => {
    at('Australia/Sydney', [2026, 9, 3, 9])
    // Oct 4 has 23 hours in Sydney.
    expect(daysToDue('2026-10-05')).toBe(2)
  })

  it('says the day that was typed, not the one before', () => {
    process.env.TZ = 'America/New_York'
    expect(fmtDueDate('2026-11-01')).toBe('Nov 1, 2026')
    process.env.TZ = 'Pacific/Honolulu'
    expect(fmtDueDate('2026-11-01')).toBe('Nov 1, 2026')
  })

  it('has nothing to say about a missing or unreadable date', () => {
    expect(fmtDueDate(null)).toBeNull()
    expect(fmtDueDate('')).toBeNull()
    expect(fmtDueDate('not a date')).toBeNull()
    expect(daysToDue(null)).toBeNull()
    expect(daysToDue('not a date')).toBeNull()
    expect(getDueStatus('not a date', false)).toBe('none')
    expect(getDueStatus('2026-11-01', true)).toBe('none')
  })
})
