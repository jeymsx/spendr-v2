import { describe, it, expect } from 'vitest'
import { budgetCrossings, collectNotifications, dayHeading, groupByDay, timeOf } from './notifications'

/**
 * The notifications list, worked out from the ledger. Local dates throughout,
 * "now" 25 September 2026 at 2pm.
 */

const NOW = new Date(2026, 8, 25, 14)
/** @param {number} m @param {number} d @param {number} [h] */
const at = (m, d, h = 12) => new Date(2026, m - 1, d, h).toISOString()
const plain = (/** @type {any} */ t) => t.amount ?? 0

/** The card events alone - an August charge also earns an August recap. @param {any[]} feed */
const cardsIn = (feed) => feed.filter(f => f.id.startsWith('card:'))

const CARD = { name: 'BPI Credit', type: 'credit', syncId: 'card-1', cutoffDate: 5, dueDate: 25, creditLimit: 50000, currency: 'PHP' }
const CHARGE = { type: 'expense', account: 'BPI Credit', amount: 3000, date: at(8, 20) }

describe('cards', () => {
  it('says a card is due - the latest word on it, not its whole history', () => {
    // On the due date: "due today", not "due in 3 days" as well.
    const feed = cardsIn(collectNotifications({ accounts: [CARD], transactions: [CHARGE], now: NOW }))
    expect(feed.map(f => [f.id, f.title, f.body])).toEqual([
      ['card:card-1:2026-09-25:due', 'BPI Credit due today', '₱3,000.00 to pay'],
    ])
    expect(feed[0]).toMatchObject({ kind: 'card-due', url: '/accounts?open=BPI%20Credit' })
  })

  it('says three days before, before the day comes', () => {
    const ids = cardsIn(collectNotifications({ accounts: [CARD], transactions: [CHARGE], now: new Date(2026, 8, 23, 10) })).map(f => f.id)
    expect(ids).toEqual(['card:card-1:2026-09-25:early'])
  })

  it('says it is overdue the day after, if it still is', () => {
    const feed = cardsIn(collectNotifications({ accounts: [CARD], transactions: [CHARGE], now: new Date(2026, 8, 27, 10) }))
    expect(feed).toHaveLength(1)
    expect(feed[0]).toMatchObject({ kind: 'card-overdue', title: 'BPI Credit is overdue', body: '₱3,000.00 left to pay' })
  })

  it('does not bring up a card that has been paid', () => {
    const paid = { type: 'transfer', fromAccount: 'BPI', toAccount: 'BPI Credit', amount: 3000, date: at(9, 12) }
    expect(cardsIn(collectNotifications({ accounts: [CARD], transactions: [CHARGE, paid], now: NOW }))).toEqual([])
  })

  /* The push list is built from every row, scheduled ones included, so a
     payment set for later silences the lock screen. The list must agree. */
  it('counts a payment already scheduled, as the push reminders do', () => {
    const scheduled = { type: 'transfer', fromAccount: 'BPI', toAccount: 'BPI Credit', amount: 3000, date: at(9, 25, 20) }
    expect(cardsIn(collectNotifications({ accounts: [CARD], transactions: [CHARGE, scheduled], now: NOW }))).toEqual([])
  })

  it('keeps an event to after its time has come', () => {
    const ids = cardsIn(collectNotifications({ accounts: [CARD], transactions: [CHARGE], now: new Date(2026, 8, 25, 8) })).map(f => f.id)
    expect(ids).toEqual(['card:card-1:2026-09-25:early'])
  })
})

describe('bills', () => {
  const BILL = { name: 'Netflix', syncId: 'bill-1', amount: 549, account: 'BPI', frequency: 'monthly', active: true }

  it('says a bill is due on the day', () => {
    const feed = collectNotifications({ recurring: [{ ...BILL, nextDate: '2026-09-25' }], now: NOW })
    expect(feed).toHaveLength(1)
    expect(feed[0]).toMatchObject({ kind: 'bill-due', title: 'Netflix due today', body: '₱549.00 from BPI', url: '/recurring' })
  })

  it('says it is overdue while it is still not posted - and only that', () => {
    const feed = collectNotifications({ recurring: [{ ...BILL, nextDate: '2026-09-20' }], now: NOW })
    expect(feed.map(f => f.kind)).toEqual(['bill-overdue'])
    expect(feed[0].body).toBe("Due Sep 20. Post it once it's paid.")
  })

  it('ignores a paused bill', () => {
    expect(collectNotifications({ recurring: [{ ...BILL, nextDate: '2026-09-25', active: false }], now: NOW })).toEqual([])
  })
})

describe('budget alerts', () => {
  const FOOD = { name: 'Food', type: 'expense', syncId: 'cat-food', budget: 5000 }
  const food = (/** @type {number} */ d, /** @type {number} */ amount, /** @type {number} */ m = 9) =>
    ({ type: 'expense', category: 'Food', amount, date: at(m, d) })
  const crossings = (/** @type {any[]} */ txs, more = {}) =>
    budgetCrossings({ categories: [FOOD], transactions: txs, months: ['2026-09'], priceOf: plain, ...more })

  it('marks the moment a category reached 80%', () => {
    const events = crossings([food(2, 2000), food(10, 2100), food(14, 600)])
    expect(events.map(e => [e.kind, e.at, e.title, e.body])).toEqual([
      ['budget-warn', at(9, 10), 'Food budget 80% used', '₱900.00 left of ₱5,000.00'],
    ])
  })

  it('once it is over, says that and not the 80% before it', () => {
    const events = crossings([food(2, 2000), food(10, 2100), food(14, 600), food(20, 900)])
    expect(events.map(e => [e.kind, e.at, e.title, e.body])).toEqual([
      ['budget-over', at(9, 20), 'Over your Food budget', '₱600.00 over ₱5,000.00'],
    ])
  })

  it('has one purchase that goes straight past the limit say so once', () => {
    const events = crossings([food(3, 6000)])
    expect(events.map(e => e.kind)).toEqual(['budget-over'])
  })

  it('counts exactly 80% as reaching it, and exactly 100% as not over', () => {
    expect(crossings([food(3, 4000), food(4, 1000)]).map(e => e.kind)).toEqual(['budget-warn'])
  })

  it('lets a refund walk the total back before the line', () => {
    expect(crossings([food(2, 3500), food(3, -1000), food(5, 1400)])).toEqual([])
  })

  it('uses the months it is asked about, and skips categories with no limit', () => {
    const txs = [food(2, 4500), { type: 'expense', category: 'Fun', amount: 99999, date: at(9, 2) }]
    const cats = [FOOD, { name: 'Fun', type: 'expense', budget: 0 }]
    expect(budgetCrossings({ categories: cats, transactions: txs, months: ['2026-08'], priceOf: plain })).toEqual([])
    expect(budgetCrossings({ categories: cats, transactions: txs, months: ['2026-08', '2026-09'], priceOf: plain })).toHaveLength(1)
  })

  /* Rollover can carry an overspend big enough to leave nothing: the Budget
     page shows the category over at the first peso, so the alert agrees. */
  it('is over at the first peso when rollover has left nothing', () => {
    const rolls = { ...FOOD, rollover: true, rolloverFrom: '2026-08' }
    const events = crossings([food(20, 11000, 8), food(3, 150)], { categories: [rolls] })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'budget-over', at: at(9, 3), body: "Nothing left after last month's overspend" })
  })
})

describe('badges, the recap and this release', () => {
  it('announces a badge when it was earned', () => {
    const feed = collectNotifications({ badges: [{ key: 'seven-days', earnedAt: at(9, 22) }, { key: 'nope', earnedAt: at(9, 22) }], now: NOW })
    expect(feed).toHaveLength(1)
    expect(feed[0]).toMatchObject({ id: 'badge:seven-days', title: 'New badge: Seven Days', url: '/badges' })
    expect(feed[0].quiet).toBeUndefined()
  })

  it('keeps a badge that was already true quiet', () => {
    const feed = collectNotifications({ badges: [{ key: 'seven-days', earnedAt: at(9, 22), silent: true }], now: NOW })
    expect(feed[0]).toMatchObject({ id: 'badge:seven-days', quiet: true })
  })

  it('offers last month\'s recap from 9 on the 1st', () => {
    const txs = [{ type: 'expense', category: 'Food', amount: 100, date: at(9, 3) }]
    const oct1 = new Date(2026, 9, 1, 9, 30)
    const recap = collectNotifications({ transactions: txs, now: oct1 }).find(f => f.kind === 'recap')
    expect(recap).toMatchObject({ id: 'recap:2026-09', title: 'Your September recap is ready', url: '/recap/2026-09' })
    const early = new Date(2026, 9, 1, 8)
    expect(collectNotifications({ transactions: txs, now: early }).find(f => f.kind === 'recap')).toBeUndefined()
  })

  it('names December by its month in January, as the push does', () => {
    const txs = [{ type: 'expense', category: 'Food', amount: 100, date: new Date(2026, 11, 3).toISOString() }]
    const recap = collectNotifications({ transactions: txs, now: new Date(2027, 0, 1, 10) }).find(f => f.kind === 'recap')
    expect(recap?.title).toBe('Your December recap is ready')
  })

  it('has no recap for a month with nothing in it', () => {
    expect(collectNotifications({ transactions: [], now: new Date(2026, 9, 1, 10) })).toEqual([])
  })

  it('announces a new version, dated when the device first had it', () => {
    const feed = collectNotifications({ whatsNew: { version: '0.5.0', headline: 'Your month, in a recap', at: at(9, 20, 9) }, now: NOW })
    expect(feed[0]).toMatchObject({ id: 'whats-new:0.5.0', kind: 'whats-new', at: at(9, 20, 9), title: "What's new in Spendr 0.5.0", url: null })
    expect(collectNotifications({ whatsNew: null, now: NOW })).toEqual([])
  })

  it('leaves out anything older than the window', () => {
    const feed = collectNotifications({ badges: [{ key: 'seven-days', earnedAt: at(7, 1) }], now: NOW })
    expect(feed).toEqual([])
  })
})

describe('the list', () => {
  it('heads each day the way people say it', () => {
    expect(dayHeading(new Date(2026, 8, 25, 9), NOW)).toBe('Today')
    expect(dayHeading(new Date(2026, 8, 24, 23), NOW)).toBe('Yesterday')
    expect(dayHeading(new Date(2026, 8, 21, 9), NOW)).toBe('Monday')
    expect(dayHeading(new Date(2026, 8, 12, 9), NOW)).toBe('Sep 12')
    expect(dayHeading(new Date(2025, 11, 30, 9), NOW)).toBe('Dec 30, 2025')
  })

  it('groups newest first', () => {
    const items = [{ at: at(9, 24, 9) }, { at: at(9, 25, 9) }, { at: at(9, 25, 13) }]
    const groups = groupByDay(items, NOW)
    expect(groups.map(g => [g.heading, g.items.length])).toEqual([['Today', 2], ['Yesterday', 1]])
    expect(groups[0].items[0].at).toBe(at(9, 25, 13))
    expect(timeOf(at(9, 25, 13))).toBe('1:00 PM')
  })
})
