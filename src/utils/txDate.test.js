import { describe, it, expect } from 'vitest'
import { isoToDateInput, dateInputToIso } from './txDate'

/**
 * The two clocks.
 *
 * A transaction is stored in UTC and shown in local time, and the edit form
 * used to read it with `iso.slice(0, 10)` - the UTC date. East of Greenwich
 * those disagree for the last hours of the local day, which is how a salary
 * displayed as the 14th offered the 13th for editing, and then vanished when
 * that was corrected.
 *
 * These run in whatever timezone the machine is in, so they are written
 * against the LOCAL reading of a timestamp rather than against a fixed
 * offset. That is the property that has to hold everywhere, and it is the one
 * the old code broke.
 */
describe('isoToDateInput', () => {
  it('gives the date the reader would see, not the UTC one', () => {
    const iso = '2026-09-13T23:55:16.000Z'
    const local = new Date(iso)
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
    expect(isoToDateInput(iso)).toBe(expected)
  })

  /* The regression, stated as a rule rather than as an offset: whatever the
     field shows must be the day a human reading the row would name. */
  it('agrees with toLocaleDateString about which day it is', () => {
    for (const iso of [
      '2026-01-01T00:00:00.000Z',
      '2026-06-15T12:00:00.000Z',
      '2026-09-13T23:55:16.000Z',
      '2026-12-31T16:30:00.000Z',
    ]) {
      const day = Number(isoToDateInput(iso).slice(8, 10))
      expect(day).toBe(new Date(iso).getDate())
    }
  })

  it('is empty for nothing, and for nonsense', () => {
    expect(isoToDateInput(null)).toBe('')
    expect(isoToDateInput('')).toBe('')
    expect(isoToDateInput('not a date')).toBe('')
  })
})

describe('dateInputToIso', () => {
  /** A fixed "now" so the clamp is deterministic. */
  const now = new Date(2026, 8, 14, 10, 0, 0)   // 14 Sep 2026, 10:00 local

  it('round-trips: what the field shows comes back as the same day', () => {
    const iso = '2026-09-13T23:55:16.000Z'
    const shown = isoToDateInput(iso)
    const back = dateInputToIso(shown, iso, now)
    expect(isoToDateInput(back)).toBe(shown)
  })

  it('keeps the time of day, so a day of entries does not reshuffle', () => {
    const iso = new Date(2026, 8, 10, 14, 30, 0).toISOString()
    const out = new Date(dateInputToIso('2026-09-11', iso, now))
    expect(out.getHours()).toBe(14)
    expect(out.getMinutes()).toBe(30)
    expect(out.getDate()).toBe(11)
  })

  /**
   * The second half of the bug. A row at 23:55 moved onto today would land
   * later today, and anything past the end of today is hidden as scheduled -
   * so correcting the date made it disappear a second time.
   */
  it('never lands in the future, however late the original was', () => {
    const late = new Date(2026, 8, 13, 23, 55, 0).toISOString()
    const out = new Date(dateInputToIso('2026-09-14', late, now))
    expect(out.getTime()).toBeLessThanOrEqual(now.getTime())
  })

  it('leaves a past date exactly where it was put', () => {
    const iso = new Date(2026, 8, 1, 9, 0, 0).toISOString()
    const out = new Date(dateInputToIso('2026-08-20', iso, now))
    expect(out.getDate()).toBe(20)
    expect(out.getMonth()).toBe(7)
    expect(out.getHours()).toBe(9)
  })

  it('falls back to now when the row has no timestamp to borrow from', () => {
    const out = new Date(dateInputToIso('2026-09-12', null, now))
    expect(out.getDate()).toBe(12)
    expect(out.getHours()).toBe(10)
  })

  it('keeps the original when the field is empty or malformed', () => {
    const iso = '2026-09-13T23:55:16.000Z'
    expect(dateInputToIso('', iso, now)).toBe(iso)
    expect(dateInputToIso('rubbish', iso, now)).toBe(iso)
  })
})
