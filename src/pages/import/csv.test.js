import { describe, it, expect, vi } from 'vitest'

// csv.js reaches Dexie for one constant; there is no IndexedDB in a node test.
vi.mock('../../db/db', () => ({ default: {}, UNSYNCED: 0 }))

const { normalizeDate } = await import('./csv')

describe('dates from an imported file', () => {
  it('leaves an instant this app wrote exactly as it is', () => {
    expect(normalizeDate('2026-09-30T04:12:00.000Z')).toBe('2026-09-30T04:12:00.000Z')
  })

  it('puts an instant with its own offset on the UTC clock the app keeps', () => {
    expect(normalizeDate('2026-09-30T20:00:00+08:00')).toBe('2026-09-30T12:00:00.000Z')
  })

  it('reads a bare day as that local day, whatever the timezone', () => {
    const iso = normalizeDate('2026-09-30')
    const d = new Date(iso)
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 9, 30])
  })

  it('leaves anything that is not a real date as it came', () => {
    expect(normalizeDate('2026-02-30')).toBe('2026-02-30')
    expect(normalizeDate('last tuesday')).toBe('last tuesday')
    expect(normalizeDate('')).toBe('')
    expect(normalizeDate(undefined)).toBe('')
  })
})
