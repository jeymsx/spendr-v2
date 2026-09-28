import { describe, it, expect } from 'vitest'
import { NUDGE_DAYS, NUDGE_TIMES, nudgeLabel, nudgeReminders, parseNudge } from './nudge'
import { buildReminders, MAX_REMINDERS } from './reminders'

/* 2026-09-25, 08:00 local - the same fixed morning reminders.test.js uses. */
const NOW = new Date(2026, 8, 25, 8, 0, 0)
/** A transaction dated at local noon on the given day of September 2026. */
const tx = (/** @type {number} */ day, extra = {}) => ({
  txId: `t${day}`, type: 'expense', amount: 100, category: 'Food',
  date: new Date(2026, 8, day, 12, 0, 0).toISOString(), ...extra,
})

describe('parseNudge', () => {
  it('reads a quarter-hour time', () => {
    expect(parseNudge('20:00')).toEqual({ h: 20, m: 0 })
    expect(parseNudge('07:45')).toEqual({ h: 7, m: 45 })
  })

  it('reads off, never-set and anything off the quarter as no check-in', () => {
    for (const v of ['off', null, undefined, '', '20:10', '24:00', '8:00', 20]) {
      expect(parseNudge(v)).toBeNull()
    }
  })
})

describe('the picker', () => {
  it('offers every quarter hour of the day, and only those', () => {
    expect(NUDGE_TIMES).toHaveLength(96)
    expect(NUDGE_TIMES[0]).toBe('00:00')
    expect(NUDGE_TIMES[81]).toBe('20:15')
    expect(NUDGE_TIMES.every(t => parseNudge(t))).toBe(true)
  })

  it('says the time the way a person reads it', () => {
    expect(nudgeLabel('20:00')).toBe('8:00 PM')
    expect(nudgeLabel('07:30')).toBe('7:30 AM')
  })
})

describe('nudgeReminders', () => {
  it('schedules one a day for two weeks, at the chosen time', () => {
    const list = nudgeReminders({ nudge: '20:00', now: NOW })
    expect(list).toHaveLength(NUDGE_DAYS)
    expect(list[0].tag).toBe('nudge:2026-09-25')
    expect(new Date(list[0].fireAt).getHours()).toBe(20)
    expect(list.at(-1)?.tag).toBe('nudge:2026-10-08')
    expect(list.every(r => r.url === '/?log=quick')).toBe(true)
  })

  it('is nothing while it is off', () => {
    expect(nudgeReminders({ nudge: 'off', now: NOW })).toEqual([])
    expect(nudgeReminders({ nudge: null, now: NOW })).toEqual([])
  })

  it("leaves today's out once today has something logged", () => {
    const list = nudgeReminders({ nudge: '20:00', transactions: [tx(25)], now: NOW })
    expect(list[0].tag).toBe('nudge:2026-09-26')
    expect(list).toHaveLength(NUDGE_DAYS - 1)
  })

  it('does not count yesterday, or a row dated ahead, as today logged', () => {
    const list = nudgeReminders({ nudge: '20:00', transactions: [tx(24), tx(30)], now: NOW })
    expect(list[0].tag).toBe('nudge:2026-09-25')
  })

  it("drops today's once its time has passed", () => {
    const evening = new Date(2026, 8, 25, 21, 0, 0)
    expect(nudgeReminders({ nudge: '20:00', now: evening })[0].tag).toBe('nudge:2026-09-26')
  })

  it('names each day by its date alone, so a new time moves the same row', () => {
    const a = nudgeReminders({ nudge: '20:00', now: NOW }).map(r => r.tag)
    const b = nudgeReminders({ nudge: '21:30', now: NOW }).map(r => r.tag)
    expect(b).toEqual(a)
  })
})

describe('check-ins in the reminder list', () => {
  it('rides alongside bills without taking a bill’s place in the cap', () => {
    const daily = { id: 1, name: 'Parking', amount: 50, frequency: 'daily', nextDate: '2026-09-25', category: 'Transpo' }
    const without = buildReminders({ recurring: [daily], now: NOW })
    const withNudge = buildReminders({ recurring: [daily], nudge: '20:00', now: NOW })
    const bills = (/** @type {import('./reminders').Reminder[]} */ l) => l.filter(r => !r.tag.startsWith('nudge:'))
    expect(bills(withNudge)).toEqual(bills(without))
    expect(withNudge.filter(r => r.tag.startsWith('nudge:'))).toHaveLength(NUDGE_DAYS)
    expect(bills(without).length).toBeLessThanOrEqual(MAX_REMINDERS)
  })
})
