import { describe, expect, it } from 'vitest'
import { investmentStatus, valueRow, valuedAgo } from './investments'

const NOW = new Date(2026, 8, 28, 12)
const mp2 = { name: 'MP2', type: 'investment', balance: 52340, investedStart: 40000 }

describe('an investment, valued by hand', () => {
  it('adds money moved in to what went in before, and takes off what came out', () => {
    const txs = [
      { type: 'transfer', fromAccount: 'BPI', toAccount: 'MP2', amount: 10000, date: new Date(2026, 6, 1).toISOString() },
      { type: 'transfer', fromAccount: 'MP2', toAccount: 'BPI', amount: 500, date: new Date(2026, 7, 1).toISOString() },
    ]
    const s = investmentStatus(mp2, txs, NOW)
    expect(s.paidIn).toBe(49500)
    expect(s.gain).toBe(2840)
    expect(s.gainPct).toBeCloseTo(2840 / 49500, 6)
    expect(s.contributions).toBe(1)
  })

  it('dates the figure from its latest value row, or the day it was confirmed', () => {
    const txs = [
      { type: 'inflow', account: 'MP2', amount: 1200, adjust: 'value', date: new Date(2026, 7, 1).toISOString() },
    ]
    expect(investmentStatus(mp2, txs, NOW).ageDays).toBe(58)
    expect(investmentStatus(mp2, txs, NOW).stale).toBe(true)
    const confirmed = { ...mp2, valuedAt: new Date(2026, 8, 25).toISOString() }
    expect(investmentStatus(confirmed, txs, NOW).ageDays).toBe(3)
    expect(investmentStatus(confirmed, txs, NOW).stale).toBe(false)
  })

  it('says it has never been valued, rather than pretending', () => {
    const s = investmentStatus({ ...mp2, investedStart: 0 }, [], NOW)
    expect(s.valued).toBe(false)
    expect(s.ageDays).toBeNull()
    expect(valuedAgo(null)).toBe('Not updated yet')
  })

  it('writes a new value as the difference, and nothing when it has not moved', () => {
    expect(valueRow({ account: 'MP2', current: 50000, value: 52340, dateIso: 'x' }))
      .toMatchObject({ type: 'inflow', amount: 2340, adjust: 'value' })
    expect(valueRow({ account: 'MP2', current: 50000, value: 48000, dateIso: 'x' }))
      .toMatchObject({ type: 'expense', amount: 2000, adjust: 'value' })
    expect(valueRow({ account: 'MP2', current: 50000, value: 50000, dateIso: 'x' })).toBeNull()
  })

  it('says how old a figure is in a few words', () => {
    expect(valuedAgo(new Date(2026, 8, 28, 8), NOW)).toBe('Updated today')
    expect(valuedAgo(new Date(2026, 8, 27), NOW)).toBe('Updated yesterday')
    expect(valuedAgo(new Date(2026, 8, 24), NOW)).toBe('Updated 4 days ago')
    expect(valuedAgo(new Date(2026, 7, 3), NOW)).toBe('As of Aug 3')
  })
})

/**
 * Runs `fn` with the process in another time zone, then puts it back. Node
 * re-reads TZ when it is assigned, and a daylight-saving change is the only
 * thing that makes two local midnights something other than 24 hours apart.
 *
 * @param {string} tz
 * @param {() => void} fn
 */
function inZone(tz, fn) {
  // The logic layer is type-checked without Node's typings, which is where `process` comes from.
  const env = /** @type {any} */ (globalThis).process.env
  const before = env.TZ
  env.TZ = tz
  try { fn() } finally {
    if (before === undefined) delete env.TZ
    else env.TZ = before
  }
}

describe('how old a figure is, across a daylight-saving change', () => {
  /** Sydney springs forward on Sun Oct 4 2026, so that day has 23 hours. */
  it('calls the day before "yesterday" when the clocks went forward in between', () => {
    inZone('Australia/Sydney', () => {
      // Oct 4 00:00 to Oct 5 00:00 is 23 hours: it used to floor to zero days.
      expect(valuedAgo(new Date(2026, 9, 4, 8), new Date(2026, 9, 5, 9))).toBe('Updated yesterday')
    })
  })

  it('counts two days as two when the span between the midnights is 47 hours', () => {
    inZone('Australia/Sydney', () => {
      const from = new Date(2026, 9, 3)
      const now = new Date(2026, 9, 5, 12)
      expect(valuedAgo(from, now)).toBe('Updated 2 days ago')
      const s = investmentStatus({ ...mp2, valuedAt: from.toISOString() }, [], now)
      expect(s.ageDays).toBe(2)
    })
  })

  it('says 6 days ago, not 5, for a week that lost an hour', () => {
    inZone('Australia/Sydney', () => {
      expect(valuedAgo(new Date(2026, 8, 29, 18), new Date(2026, 9, 5, 9))).toBe('Updated 6 days ago')
    })
  })

  it('holds the same way west of UTC, and the other way round when the clocks go back', () => {
    // Los Angeles springs forward on Sun Mar 8 2026.
    inZone('America/Los_Angeles', () => {
      expect(valuedAgo(new Date(2026, 2, 8, 8), new Date(2026, 2, 9, 9))).toBe('Updated yesterday')
      expect(valuedAgo(new Date(2026, 2, 7), new Date(2026, 2, 9, 12))).toBe('Updated 2 days ago')
    })
    // Sydney falls back on Sun Apr 5 2026: that day has 25 hours.
    inZone('Australia/Sydney', () => {
      expect(valuedAgo(new Date(2026, 3, 4, 8), new Date(2026, 3, 5, 9))).toBe('Updated yesterday')
      expect(valuedAgo(new Date(2026, 3, 5, 0, 30), new Date(2026, 3, 5, 23))).toBe('Updated today')
    })
  })
})
