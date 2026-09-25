import { describe, it, expect } from 'vitest'
import { buildReminders, reminderDigest, stableKey, MAX_REMINDERS } from './reminders'

/**
 * What the phone uploads for the server to send.
 *
 * Every date here is local time, the way the app stores and compares them,
 * and "now" is fixed: 25 September 2026, 8am - an hour before the day's
 * reminders go off.
 */

const NOW = new Date(2026, 8, 25, 8, 0, 0)
/** @param {number} m @param {number} d @param {number} [h] */
const at = (m, d, h = 12) => new Date(2026, m - 1, d, h).toISOString()
/** @param {string} iso */
const local = (iso) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Closes on the 4th (cutoff day 5), due the 25th - the same-month case.
const CARD = {
  id: 7, syncId: 'aaaa-1111', name: 'BPI Credit', type: 'credit', currency: 'PHP',
  cutoffDate: 5, dueDate: 25, creditLimit: 50000,
}

describe('card payments', () => {
  it('reminds on the day, and three days before the next statement', () => {
    const txs = [{ type: 'expense', account: 'BPI Credit', amount: 3000, date: at(8, 20) }]
    const list = buildReminders({ accounts: [CARD], transactions: txs, now: NOW })
    const card = list.filter(r => r.tag.startsWith('card:'))

    // The closed statement is due today at 9 - still ahead of 8am.
    expect(card[0]).toMatchObject({
      tag: 'card:aaaa-1111:2026-09-25:due',
      title: 'BPI Credit payment due today',
      url: '/accounts?open=BPI%20Credit',
    })
    expect(local(card[0].fireAt)).toBe('9/25 9:00')
    expect(card[0].body).toContain('3,000.00')
    expect(card[0].body).toContain('left to pay')

    /* Its three-day warning was on the 22nd, which has passed, so it is not
       scheduled. The unpaid balance carries into October's statement, due
       Oct 25 - that one gets both, without a figure, since it has not closed. */
    const tags = card.map(r => r.tag)
    expect(tags).not.toContain('card:aaaa-1111:2026-09-25:early')
    expect(tags).toContain('card:aaaa-1111:2026-10-25:early')
    expect(tags).toContain('card:aaaa-1111:2026-10-25:due')
    const oct = card.find(r => r.tag.endsWith('10-25:early'))
    expect(local(oct.fireAt)).toBe('10/22 9:00')
    expect(oct.body).toBe('Your statement is due Oct 25. Check it for the amount.')
  })

  it('says nothing for a card with nothing owing', () => {
    const txs = [
      { type: 'expense', account: 'BPI Credit', amount: 3000, date: at(8, 20) },
      { type: 'transfer', fromAccount: 'BPI', toAccount: 'BPI Credit', amount: 3000, date: at(9, 10) },
    ]
    expect(buildReminders({ accounts: [CARD], transactions: txs, now: NOW })).toEqual([])
  })

  it('says nothing for a card with no due day', () => {
    const txs = [{ type: 'expense', account: 'BPI Credit', amount: 3000, date: at(8, 20) }]
    expect(buildReminders({ accounts: [{ ...CARD, dueDate: null }], transactions: txs, now: NOW })).toEqual([])
  })

  /* Found end to end: a charge in the running cycle, paid off before the
     cutoff. The payment is a credit against the statement that has not
     closed yet, so there is nothing left to remind about. */
  it('says nothing once the running cycle has been paid ahead', () => {
    const txs = [
      { type: 'expense', account: 'BPI Credit', amount: 3000, date: at(9, 12) },
      { type: 'transfer', fromAccount: 'BPI', toAccount: 'BPI Credit', amount: 3000, date: at(9, 20) },
    ]
    expect(buildReminders({ accounts: [CARD], transactions: txs, now: NOW })).toEqual([])
  })

  it('still reminds when the running cycle is only partly paid ahead', () => {
    const txs = [
      { type: 'expense', account: 'BPI Credit', amount: 3000, date: at(9, 12) },
      { type: 'transfer', fromAccount: 'BPI', toAccount: 'BPI Credit', amount: 1000, date: at(9, 20) },
    ]
    const tags = buildReminders({ accounts: [CARD], transactions: txs, now: NOW }).map(r => r.tag)
    expect(tags).toEqual(['card:aaaa-1111:2026-10-25:early', 'card:aaaa-1111:2026-10-25:due'])
  })

  it('reminds about a new statement even when the last one was paid', () => {
    const txs = [
      { type: 'expense', account: 'BPI Credit', amount: 3000, date: at(8, 20) },
      { type: 'transfer', fromAccount: 'BPI', toAccount: 'BPI Credit', amount: 3000, date: at(9, 10) },
      { type: 'expense', account: 'BPI Credit', amount: 450, date: at(9, 12) },
    ]
    const tags = buildReminders({ accounts: [CARD], transactions: txs, now: NOW }).map(r => r.tag)
    expect(tags).toEqual(['card:aaaa-1111:2026-10-25:early', 'card:aaaa-1111:2026-10-25:due'])
  })
})

describe('bills', () => {
  const NETFLIX = {
    id: 3, syncId: 'bbbb-2222', name: 'Netflix', amount: 549, account: 'BPI',
    frequency: 'monthly', nextDate: '2026-09-28', active: true,
  }

  it('reminds on the day each one is due, inside the horizon', () => {
    const list = buildReminders({ recurring: [NETFLIX], now: NOW })
    expect(list.map(r => r.tag)).toEqual([
      'bill:bbbb-2222:2026-09-28',
      'bill:bbbb-2222:2026-10-28',
    ])
    expect(list[0]).toMatchObject({ title: 'Netflix is due today', url: '/recurring' })
    expect(list[0].body).toMatch(/549\.00 from BPI$/)
    expect(local(list[0].fireAt)).toBe('9/28 9:00')
  })

  it('skips a paused bill', () => {
    expect(buildReminders({ recurring: [{ ...NETFLIX, active: false }], now: NOW })).toEqual([])
  })

  it('does not remind about a day that has already gone by', () => {
    const list = buildReminders({ recurring: [{ ...NETFLIX, nextDate: '2026-09-24' }], now: NOW })
    expect(list.map(r => r.tag)).toEqual(['bill:bbbb-2222:2026-10-24'])
  })

  it('caps a ledger full of daily bills', () => {
    const daily = Array.from({ length: 3 }, (_, i) => ({
      ...NETFLIX, id: i, syncId: `d-${i}`, name: `Daily ${i}`, frequency: 'daily', nextDate: '2026-09-26',
    }))
    expect(buildReminders({ recurring: daily, now: NOW })).toHaveLength(MAX_REMINDERS)
  })

  it('stops on a frequency it cannot step', () => {
    const list = buildReminders({ recurring: [{ ...NETFLIX, frequency: 'whenever' }], now: NOW })
    expect(list.map(r => r.tag)).toEqual(['bill:bbbb-2222:2026-09-28'])
  })
})

describe('tags and digests', () => {
  it('keeps a free-text name out of a tag', () => {
    expect(stableKey({ name: 'Mom, "the" card (old)' })).toMatch(/^n[0-9a-f]+$/)
    expect(stableKey({ syncId: 'ABCD-12' })).toBe('abcd-12')
  })

  it('gives the same list the same digest, and a changed one another', () => {
    const a = buildReminders({ recurring: [{ name: 'Rent', amount: 9000, frequency: 'monthly', nextDate: '2026-10-01' }], now: NOW })
    const b = buildReminders({ recurring: [{ name: 'Rent', amount: 9000, frequency: 'monthly', nextDate: '2026-10-01' }], now: NOW })
    const c = buildReminders({ recurring: [{ name: 'Rent', amount: 9500, frequency: 'monthly', nextDate: '2026-10-01' }], now: NOW })
    expect(reminderDigest(a)).toBe(reminderDigest(b))
    expect(reminderDigest(a)).not.toBe(reminderDigest(c))
  })
})
