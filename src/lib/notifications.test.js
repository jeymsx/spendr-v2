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
    const feed = collectNotifications({ badges: [{ key: 'debt-cleared', earnedAt: at(9, 22) }, { key: 'nope', earnedAt: at(9, 22) }], now: NOW })
    expect(feed).toHaveLength(1)
    expect(feed[0]).toMatchObject({ id: 'badge:debt-cleared', kind: 'badge', title: 'New badge: Debt Cleared', url: '/achievements?tab=badges' })
    expect(feed[0].quiet).toBeUndefined()
  })

  /* Seven Days is a level on the logging track now, under its old key - so
     it keeps its old id, and a feed that already recorded it does not show
     it again as news. */
  it('announces a milestone as one, under the id it always had', () => {
    const feed = collectNotifications({ badges: [{ key: 'seven-days', earnedAt: at(9, 22) }], now: NOW })
    expect(feed[0]).toMatchObject({ id: 'badge:seven-days', kind: 'milestone', title: 'Milestone: 7-Day Streak', url: '/achievements?tab=milestones' })
  })

  it('announces a challenge won, and not one missed', () => {
    const challenges = [
      { key: 'no-spend-weekend', status: 'won', finishedAt: at(9, 21), syncId: 'a' },
      { key: 'log-seven', status: 'lost', finishedAt: at(9, 21), syncId: 'b' },
    ]
    const feed = collectNotifications({ challenges, now: NOW })
    expect(feed).toHaveLength(1)
    expect(feed[0]).toMatchObject({ id: 'challenge:a', kind: 'challenge', title: 'Challenge won: No-Spend Weekend' })
  })

  it('keeps a badge that was already true quiet', () => {
    const feed = collectNotifications({ badges: [{ key: 'seven-days', earnedAt: at(9, 22), silent: true }], now: NOW })
    expect(feed[0]).toMatchObject({ id: 'badge:seven-days', quiet: true })
  })

  /* The first run of achievements against months of history writes every
     level at once. One quiet entry per track, not a screenful. */
  it('lists only the highest of the levels a track reached quietly', () => {
    const quiet = (/** @type {string} */ key) => ({ key, earnedAt: at(9, 22), silent: true })
    const badges = [
      quiet('logging-3'), quiet('seven-days'), quiet('logging-14'),
      quiet('first-peso'), quiet('entries-50'),
      quiet('limits-set'),
      { key: 'century', earnedAt: at(9, 24) },
    ]
    const ids = collectNotifications({ badges, now: NOW }).map(f => f.id).sort()
    expect(ids).toEqual(['badge:century', 'badge:entries-50', 'badge:limits-set', 'badge:logging-14'])
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

describe('income, loans, investments and the forecast', () => {
  it('never says a salary is due or late', () => {
    const pay = { name: 'Salary', syncId: 'pay-1', type: 'inflow', amount: 25000, account: 'BPI', frequency: 'semimonthly', active: true }
    expect(collectNotifications({ recurring: [{ ...pay, nextDate: '2026-09-25' }], now: NOW })).toEqual([])
    expect(collectNotifications({ recurring: [{ ...pay, nextDate: '2026-09-15' }], now: NOW })).toEqual([])
  })

  const LOAN = { id: 7, name: 'Car Loan', type: 'loan', syncId: 'loan-1', balance: -100000, minimumPayment: 5000, dueDate: 28, interestRate: 1 }
  const loansIn = (/** @type {any[]} */ feed) => feed.filter(f => f.kind === 'loan-due')

  it('says a loan payment is coming three days before, with what to pay', () => {
    const feed = loansIn(collectNotifications({ accounts: [LOAN], now: NOW }))
    expect(feed.map(f => [f.id, f.title, f.body, f.url])).toEqual([
      ['loan:loan-1:2026-09-28:early', 'Car Loan due in 3 days', '₱5,000.00 to pay', '/accounts/7'],
    ])
  })

  it('says it on the day, and only that', () => {
    const feed = loansIn(collectNotifications({ accounts: [LOAN], now: new Date(2026, 8, 28, 10) }))
    expect(feed.map(f => f.id)).toEqual(['loan:loan-1:2026-09-28:due'])
  })

  /* August's was paid, so Spendr knows this loan is being paid through it -
     a loan it has never seen a payment for is never opened as overdue. */
  it('says it is overdue the day after, while it still is', () => {
    const aug = { type: 'transfer', fromAccount: 'BPI', toAccount: 'Car Loan', amount: 4000, date: at(8, 27) }
    const feed = loansIn(collectNotifications({ accounts: [LOAN], transactions: [aug], now: new Date(2026, 8, 29, 10) }))
    expect(feed.map(f => [f.id, f.title, f.body])).toEqual([
      ['loan:loan-1:2026-09-28:overdue', 'Car Loan is overdue', '₱5,000.00 left to pay'],
    ])
  })

  it('goes quiet once this month is paid', () => {
    const paid = { type: 'transfer', fromAccount: 'BPI', toAccount: 'Car Loan', amount: 4000, date: at(9, 20) }
    expect(loansIn(collectNotifications({ accounts: [LOAN], transactions: [paid], now: NOW }))).toEqual([])
  })

  it('says nothing about a loan that is paid off', () => {
    expect(loansIn(collectNotifications({ accounts: [{ ...LOAN, balance: 0 }], now: NOW }))).toEqual([])
  })

  const MP2 = { id: 5, name: 'MP2', type: 'investment', syncId: 'inv-1', balance: 52000 }

  it('asks for a new value once the last one is old, dated the day it turned old', () => {
    const feed = collectNotifications({ accounts: [{ ...MP2, valuedAt: at(8, 1) }], now: NOW })
    expect(feed).toHaveLength(1)
    expect(feed[0]).toMatchObject({
      id: 'invest:inv-1:2026-08-01', kind: 'investment-stale',
      title: 'Time to update MP2', body: 'Its value is from Aug 1.', url: '/accounts/5',
    })
    // Aug 1 plus 46 days, at 9.
    expect(new Date(feed[0].at)).toEqual(new Date(2026, 8, 16, 9))
  })

  it('says nothing while the value is recent', () => {
    expect(collectNotifications({ accounts: [{ ...MP2, valuedAt: at(9, 1) }], now: NOW })).toEqual([])
  })

  /* A fresh value makes a fresh id, so the old nudge does not linger as
     unread and the next one, 46 days on, is news again. */
  it('keys the nudge on the latest value', () => {
    const row = { type: 'inflow', account: 'MP2', amount: 500, adjust: 'value', description: 'Value update', date: at(9, 24) }
    const feed = collectNotifications({ accounts: [{ ...MP2, valuedAt: at(8, 1) }], transactions: [row], now: NOW })
    expect(feed.filter(f => f.kind === 'investment-stale')).toEqual([])
  })

  const day = (/** @type {number} */ m, /** @type {number} */ d) => ({ date: new Date(2026, m - 1, d), iso: '', balance: 0 })

  it('warns once a month that money runs short, and says when', () => {
    const feed = collectNotifications({ forecast: /** @type {any} */ ({ firstNegative: day(10, 3), firstBelowFloor: day(9, 30) }), now: NOW })
    expect(feed.map(f => [f.id, f.kind, f.title, f.url])).toEqual([
      ['forecast:short:2026-09', 'forecast-short', 'Money could run short on Oct 3', '/insights/forecast'],
    ])
    expect(new Date(feed[0].at)).toEqual(new Date(2026, 8, 25, 9))
  })

  it('warns about the floor when the money itself holds', () => {
    const feed = collectNotifications({ forecast: /** @type {any} */ ({ firstNegative: null, firstBelowFloor: day(10, 9) }), now: NOW })
    expect(feed.map(f => [f.id, f.title])).toEqual([['forecast:floor:2026-09', 'Below your floor on Oct 9']])
  })

  it('says nothing when the next 30 days are fine', () => {
    expect(collectNotifications({ forecast: /** @type {any} */ ({ firstNegative: null, firstBelowFloor: null }), now: NOW })).toEqual([])
  })

  it('dates a warning worked out before 9 to now, not to later today', () => {
    const early = new Date(2026, 8, 25, 7)
    const feed = collectNotifications({ forecast: /** @type {any} */ ({ firstNegative: day(10, 3), firstBelowFloor: null }), now: early })
    expect(new Date(feed[0].at)).toEqual(early)
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

describe('backups', () => {
  /** @param {number} n */
  const entries = (n) => Array.from({ length: n }, (_, i) => ({
    type: 'expense', category: 'Food', account: 'Cash', amount: 100,
    date: new Date(2026, 7, 1 + i, 12).toISOString(),
  }))
  const backups = (/** @type {any} */ lastBackup, over = {}) =>
    collectNotifications({ transactions: entries(20), lastBackup, now: NOW, ...over }).filter(n => n.kind === 'backup-stale')

  it('asks for one when the last backup is two weeks old', () => {
    const [n] = backups(new Date(2026, 8, 5, 10).toISOString())
    expect(n.title).toBe('Time for a backup')
    expect(n.body).toBe('Your last one was Sep 5.')
    expect(n.url).toBe('/settings/backup')
  })

  it('stays quiet about a backup that is recent', () => {
    expect(backups(new Date(2026, 8, 20, 10).toISOString())).toHaveLength(0)
  })

  it('asks once a month when there has never been one', () => {
    const [n] = backups(null)
    expect(n.body).toBe('You have not saved one yet.')
    expect(n.id).toBe('backup:never:2026-09')
    // Dated when it is said, so it is news rather than filed under the 1st.
    expect(n.at).toBe(NOW.toISOString())
  })

  it('gives the year of a backup from another year', () => {
    const [n] = backups(new Date(2025, 7, 25, 10).toISOString())
    expect(n.body).toBe('Your last one was Aug 25, 2025.')
  })

  it('says nothing for a ledger too small to back up, or when the caller has no date to give', () => {
    expect(collectNotifications({ transactions: entries(3), lastBackup: null, now: NOW }).some(n => n.kind === 'backup-stale')).toBe(false)
    expect(collectNotifications({ transactions: entries(20), now: NOW }).some(n => n.kind === 'backup-stale')).toBe(false)
  })
})
