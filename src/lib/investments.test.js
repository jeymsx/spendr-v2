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
