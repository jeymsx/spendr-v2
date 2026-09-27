import { describe, it, expect } from 'vitest'
import { addMonths, buildRecap, daysInMonth, monthLabel, recapMonths } from './recap'
import {
  budgetsCopy, daysCopy, heroAmount, heroFormatFor, keptCopy, netWorthCopy, percent, recapSlides,
  personalityOf, signedAmount, spentComparison, spentCopy, summaryHero, summaryTiles, weeksOf, wrappedOnHome, wrappedTitle,
} from './recapCopy'

/**
 * The monthly recap's figures.
 *
 * Every date here is LOCAL (this machine runs at UTC+8, like Manila), built
 * with new Date(y, m, d, h) and stored as the ISO string the app stores.
 * "now" is 3 October 2026, so September is the complete month being
 * recapped and August the one it is compared with.
 */

const NOW = new Date(2026, 9, 3, 10)
/** @param {number} m 1-12 @param {number} d @param {number} [h] */
const at = (m, d, h = 12) => new Date(2026, m - 1, d, h).toISOString()

let n = 0
/** @param {Record<string, any>} r */
const tx = (r) => ({ txId: `t${n++}`, ...r })
/** @param {number} m @param {number} d @param {number} amount @param {string} [category] @param {Record<string, any>} [more] */
const spend = (m, d, amount, category = 'Food', more = {}) =>
  tx({ type: 'expense', amount, category, account: 'BPI', date: at(m, d), ...more })
/** @param {number} m @param {number} d @param {number} amount @param {string} [category] */
const earn = (m, d, amount, category = 'Salary') =>
  tx({ type: 'inflow', amount, category, account: 'BPI', date: at(m, d) })

/** Plain values: the rows' own amounts, one currency. */
const valueOf = (/** @type {any} */ t) => t.amount ?? 0
/** @param {any[]} transactions @param {Record<string, any>} [more] */
const recap = (transactions, more = {}) =>
  buildRecap({ month: '2026-09', transactions, now: NOW, priceOf: valueOf, ...more })

// A ledger with some history, so September is not a first month.
const HISTORY = [spend(7, 10, 500), earn(7, 15, 30000)]

describe('month arithmetic', () => {
  it('steps and sizes months', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(monthLabel('2026-09', NOW)).toBe('September')
    expect(monthLabel('2025-12', NOW)).toBe('December 2025')
  })

  it('offers only complete months that have something in them, newest first', () => {
    const rows = [spend(8, 2, 100), spend(9, 2, 100), spend(10, 1, 100), tx({ type: 'transfer', amount: 9, date: at(6, 1) })]
    expect(recapMonths(rows, NOW)).toEqual(['2026-09', '2026-08'])
  })
})

describe('what came in and went out', () => {
  const rows = [
    ...HISTORY,
    spend(9, 3, 1200, 'Food'),
    spend(9, 5, 4500, 'Bills'),
    spend(9, 21, 800, 'Food'),
    earn(9, 15, 42000),
    // Not spending: moving money between your own accounts.
    tx({ type: 'transfer', amount: 10000, fromAccount: 'BPI', toAccount: 'Card', date: at(9, 20) }),
    // Not September.
    spend(8, 31, 999), spend(10, 2, 999),
  ]
  const r = recap(rows)

  it('totals the month', () => {
    expect(r.spent).toBe(6500)
    expect(r.income).toBe(42000)
    expect(r.net).toBe(35500)
    expect(r.purchaseCount).toBe(3)
    expect(r.savingsRate).toBeCloseTo(35500 / 42000)
  })

  it('ranks where it went, with shares of the whole', () => {
    expect(r.categories.map(c => [c.name, c.amount])).toEqual([['Bills', 4500], ['Food', 2000]])
    expect(r.categories.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1)
  })

  it('adds up day by day to the same total', () => {
    expect(r.daily).toHaveLength(30)
    expect(r.daily.reduce((s, d) => s + d.amount, 0)).toBeCloseTo(r.spent)
    expect(r.busiestDay).toEqual({ day: 5, amount: 4500 })
    expect(r.noSpendDays).toBe(27)
  })
})

describe('the edge of the month is the LOCAL midnight', () => {
  /* 5am on 1 October in Manila is 21:00 on 30 September in UTC. It belongs to
     October - the app used to file it under September by its UTC string.
     (Only a machine east of UTC+5 sees the two disagree; the answer is the
     same in every timezone, which is the point.) */
  it('puts a row by the local calendar, not the UTC one', () => {
    const rows = [...HISTORY, spend(9, 30, 100, 'Food'), tx({ type: 'expense', amount: 700, category: 'Food', date: new Date(2026, 9, 1, 5).toISOString() })]
    expect(recap(rows).spent).toBe(100)
  })

  it('keeps a row from 00:30 on the 1st in its own month', () => {
    const rows = [...HISTORY, tx({ type: 'expense', amount: 250, category: 'Food', date: new Date(2026, 8, 1, 0, 30).toISOString() })]
    expect(recap(rows).spent).toBe(250)
    expect(recap(rows).daily[0].amount).toBe(250)
  })
})

describe('refunds, splits and scheduled rows', () => {
  it('takes a refund off the total and off what it refunded', () => {
    const buy = spend(9, 4, 6000, 'Shopping', { description: 'Shoes' })
    const other = spend(9, 6, 2000, 'Food', { description: 'Groceries' })
    const back = spend(9, 9, -6000, 'Shopping', { refundOf: buy.txId })
    const r = recap([...HISTORY, buy, other, back])
    expect(r.spent).toBe(2000)
    // Fully refunded: it is not the biggest purchase any more, and not a category.
    expect(r.biggest).toMatchObject({ description: 'Groceries', amount: 2000 })
    expect(r.categories.map(c => c.name)).toEqual(['Food'])
  })

  it('counts a partly refunded purchase at what it really cost', () => {
    const buy = spend(9, 4, 6000, 'Shopping', { description: 'Jacket' })
    const back = spend(9, 9, -2500, 'Shopping', { refundOf: buy.txId })
    expect(recap([...HISTORY, buy, back]).biggest).toMatchObject({ description: 'Jacket', amount: 3500 })
  })

  it('treats a split purchase as the one purchase it was', () => {
    const legs = [
      spend(9, 8, 2000, 'Food', { description: 'SM', splitId: 's1' }),
      spend(9, 8, 1500, 'Home', { description: 'SM', splitId: 's1' }),
      spend(9, 10, 3000, 'Bills', { description: 'Meralco' }),
    ]
    expect(recap([...HISTORY, ...legs]).biggest).toMatchObject({ description: 'SM', amount: 3500 })
  })

  it('leaves out rows scheduled after today', () => {
    const later = tx({ type: 'expense', amount: 5000, category: 'Gadgets', date: at(10, 20) })
    const r = buildRecap({ month: '2026-10', transactions: [...HISTORY, spend(10, 1, 100), later], now: NOW, priceOf: valueOf })
    expect(r.spent).toBe(100)
  })
})

describe('a first month', () => {
  // Started using the app on the 20th.
  const rows = [spend(9, 20, 300), spend(9, 22, 200), earn(9, 25, 10000)]
  const r = recap(rows)

  it('knows it is one', () => {
    expect(r.firstMonth).toBe(true)
    expect(spentComparison(r)).toBe('Your first month with Spendr')
  })

  it('counts days from the first entry, not from the 1st', () => {
    expect(r.trackedDays).toBe(11)
    // 20th to 30th is 11 days; spending on two of them.
    expect(r.noSpendDays).toBe(9)
    expect(r.avgPerDay).toBeCloseTo(500 / 11, 2)
  })
})

describe('against last month', () => {
  it('says how much less, or more', () => {
    const r = recap([...HISTORY, spend(8, 10, 1000), spend(9, 10, 880)])
    expect(r.spentChange).toMatchObject({ pct: 12, direction: 'less' })
    expect(spentComparison(r)).toBe('12% less than August')
    const more = recap([...HISTORY, spend(8, 10, 1000), spend(9, 10, 1080)])
    expect(spentComparison(more)).toBe('8% more than August')
  })

  it('calls a small swing "about the same"', () => {
    const r = recap([...HISTORY, spend(8, 10, 1000), spend(9, 10, 1020)])
    expect(spentComparison(r)).toBe('About the same as August')
  })

  it('says nothing when there is nothing fair to compare with', () => {
    // History in July, nothing in August.
    const r = recap([...HISTORY, spend(9, 10, 500)])
    expect(r.spentChange).toBeNull()
    expect(spentComparison(r)).toBeNull()
  })
})

describe('what was kept', () => {
  it('shows what was left, as a share of what came in', () => {
    const r = recap([...HISTORY, earn(9, 15, 40000), spend(9, 2, 30000)])
    expect(keptCopy(r, 'PHP')).toEqual({ label: 'You kept', value: 10000, tone: 'good', line: '25% of the ₱40,000 that came in' })
  })

  it('is gentle about a month that spent more than came in', () => {
    const r = recap([...HISTORY, earn(9, 15, 10000), spend(9, 2, 12500)])
    expect(keptCopy(r, 'PHP')).toMatchObject({ label: 'You spent more than came in', value: 2500, tone: 'soft' })
  })

  it('has no "kept" slide in a month with no income logged', () => {
    const r = recap([...HISTORY, spend(9, 2, 500)])
    expect(r.savingsRate).toBeNull()
    expect(recapSlides(r)).not.toContain('kept')
  })
})

describe('the rest of the story', () => {
  it('finds the place you kept going back to', () => {
    const rows = [
      ...HISTORY,
      ...[1, 4, 9, 16].map(d => spend(9, d, 180, 'Food', { description: 'Jollibee' })),
      spend(9, 20, 175, 'Food', { description: ' jollibee ' }),
      ...[2, 3, 5].map(d => spend(9, d, 900, 'Food', { description: 'Grab' })),
      // Written by the app, not somewhere you went.
      ...[6, 7, 8, 11].map(d => spend(9, d, 15, 'Transfer Fee', { description: 'Transfer fee' })),
    ]
    expect(recap(rows).goTo).toEqual({ label: 'Jollibee', count: 5, amount: 895, icon: null })
  })

  it('needs three visits to call it a habit', () => {
    const rows = [...HISTORY, spend(9, 1, 100, 'Food', { description: 'Cafe' }), spend(9, 2, 100, 'Food', { description: 'Cafe' })]
    expect(recap(rows).goTo).toBeNull()
  })

  it('scores budgets against the limit for the month', () => {
    const categories = [
      { name: 'Food', type: 'expense', budget: 3000 },
      { name: 'Bills', type: 'expense', budget: 4000 },
      { name: 'Fun', type: 'expense', budget: 0 },
    ]
    const r = recap([...HISTORY, spend(9, 2, 3500, 'Food'), spend(9, 3, 3900, 'Bills')], { categories })
    expect(r.budgets).toMatchObject({ tracked: 2, under: 1 })
    expect(r.budgets.rows[0]).toMatchObject({ name: 'Food', over: true, spent: 3500, limit: 3000 })
    expect(budgetsCopy(r)).toEqual({ value: '1 of 2', line: 'budgets stayed on track.' })
  })

  it('walks net worth back across the month', () => {
    // Today 100,000. Since September: +5,000 in, -1,000 out, in October.
    const rows = [...HISTORY, earn(9, 15, 20000), spend(9, 20, 8000), earn(10, 1, 5000), spend(10, 2, 1000)]
    const r = recap(rows, { netWorthNow: 100000 })
    expect(r.netWorth.end).toBe(96000)
    expect(r.netWorth.start).toBe(84000)
    expect(r.netWorth.change).toBe(12000)
    expect(r.netWorth.series).toHaveLength(30)
    expect(r.netWorth.series[13].value).toBe(84000) // the 14th, before the salary
    expect(r.netWorth.series[14].value).toBe(104000) // the 15th, after it
  })

  it('lists the badges earned in the month', () => {
    const badges = [{ key: 'seven-days', earnedAt: at(9, 30) }, { key: 'first-peso', earnedAt: at(7, 10) }, { key: 'gone', earnedAt: at(9, 2) }]
    expect(recap([...HISTORY, spend(9, 2, 10)], { badges }).badges).toEqual([{ key: 'seven-days', name: '7-Day Streak' }])
  })

  /* Green Month judges a finished month, so it is awarded on the first look
     after that month ends - 1 October for September - and belongs to
     September, not to the October it was stamped in. */
  it('files a badge that judges a month under the month it judged', () => {
    const badges = [{ key: 'green-month', earnedAt: at(10, 1, 8) }, { key: 'under-budget', earnedAt: at(9, 3) }]
    const r = recap([...HISTORY, spend(9, 2, 10)], { badges })
    expect(r.badges).toEqual([{ key: 'green-month', name: 'Green Month' }])
    const aug = buildRecap({ month: '2026-08', transactions: [...HISTORY, spend(8, 2, 10)], badges, now: NOW, priceOf: valueOf })
    expect(aug.badges).toEqual([{ key: 'under-budget', name: 'Under Budget' }])
  })

  it('prices every row in the ledger currency', () => {
    const usd = tx({ type: 'expense', amount: 40, category: 'Travel', currency: 'USD', baseAmount: 2320, baseCurrency: 'PHP', date: at(9, 12) })
    const r = buildRecap({ month: '2026-09', transactions: [...HISTORY, usd, spend(9, 13, 80)], now: NOW })
    expect(r.spent).toBe(2400)
  })
})

describe('the slides', () => {
  it('always opens and closes, and only says what it has', () => {
    const quiet = recap([...HISTORY, earn(9, 15, 5000)])
    expect(recapSlides(quiet)).toEqual(['intro', 'kept', 'personality', 'summary'])
    const full = recap([...HISTORY, earn(9, 15, 5000), spend(9, 2, 100)], { netWorthNow: 50000 })
    expect(recapSlides(full)).toEqual(['intro', 'spent', 'kept', 'categories', 'days', 'biggest', 'networth', 'personality', 'summary'])
  })

  it('formats headline figures for the size they are drawn at', () => {
    expect(heroAmount(1234.5, 'PHP')).toBe('₱1,234.50')
    expect(heroAmount(128450.25, 'PHP')).toBe('₱128,450')
    expect(signedAmount(-12000, 'PHP')).toBe('−₱12,000')
    expect(signedAmount(250, 'PHP')).toBe('+₱250.00')
  })

  it('words no-spend days', () => {
    const days = (/** @type {number} */ n) => daysCopy(/** @type {any} */ ({ noSpendDays: n })).noSpend
    expect(days(0)).toBe('Something every day')
    expect(days(1)).toBe('1 no-spend day')
    expect(days(9)).toBe('9 no-spend days')
  })
})

describe('a month where refunds outweighed spending', () => {
  // Shoes bought in August, returned in September; one lunch in September.
  const shoes = spend(8, 20, 6000, 'Shopping', { description: 'Shoes' })
  const rows = [
    ...HISTORY, shoes,
    spend(9, 10, 1000, 'Food', { description: 'Lunch' }),
    spend(9, 12, -6000, 'Shopping', { refundOf: shoes.txId, description: 'Refund: Shoes' }),
    earn(9, 15, 40000),
  ]
  const r = recap(rows)

  it('keeps the true net figure, and says what came back instead', () => {
    expect(r.spent).toBe(-5000)
    expect(r.purchases).toBe(1000)
    expect(r.refunded).toBe(6000)
    expect(spentCopy(r, 'PHP')).toMatchObject({
      label: 'Came back in refunds', value: 6000, tone: 'good', refunds: true,
      line: 'More than the ₱1,000.00 you spent',
    })
    expect(summaryHero(r, 'PHP')).toEqual({ label: 'Came back in refunds', value: '₱6,000.00', line: null })
  })

  it('compares with nothing, averages nothing below zero, and explains the kept figure', () => {
    expect(r.spentChange).toBeNull()
    expect(r.avgPerDay).toBe(0)
    expect(r.savingsRate).toBeGreaterThan(1)
    expect(keptCopy(r, 'PHP')).toMatchObject({ value: 45000, line: 'More than came in, thanks to refunds' })
  })

  it('offers a month that had only a refund in it', () => {
    const only = recap([...HISTORY, shoes, spend(9, 12, -6000, 'Shopping', { refundOf: shoes.txId })])
    expect(recapSlides(only)).toContain('spent')
    expect(spentCopy(only, 'PHP').line).toBe('From purchases in earlier months')
    expect(recapSlides(only)).not.toContain('days')
  })
})

describe('what counts as a purchase', () => {
  it('counts a split once, and leaves out refunds and the rows the app writes', () => {
    const buy = spend(9, 3, 900, 'Food', { description: 'Market' })
    const rows = [
      ...HISTORY, buy,
      spend(9, 4, 2000, 'Home', { description: 'SM', splitId: 's1' }),
      spend(9, 4, 1500, 'Health', { description: 'SM', splitId: 's1' }),
      spend(9, 5, -300, 'Food', { refundOf: buy.txId }),
      spend(9, 6, 15, 'Transfer Fee', { description: 'Transfer fee' }),
      spend(9, 7, 8000, 'Others', { description: 'Balance adjustment' }),
      spend(9, 8, 5000, 'Debt Payment', { description: 'Paid to Gelo' }),
      spend(9, 9, 700, 'Food', { description: 'Paid to Ana', settles: [{ id: 1, delta: 700 }] }),
    ]
    const r = recap(rows)
    expect(r.purchaseCount).toBe(2)
    expect(r.biggest).toMatchObject({ description: 'SM', amount: 3500 })
    /* The balance correction is NOT spending (lib/flows.js): it moved the
       balance to match reality, and counting it made a month you spent
       nothing extra in look 8,000 heavier. */
    expect(r.spent).toBe(900 + 3500 - 300 + 15 + 5000 + 700)
  })

  it('leaves corrections and investment value changes out of spent and income', () => {
    const rows = [
      ...HISTORY,
      spend(9, 3, 900, 'Food', { description: 'Market' }),
      spend(9, 7, 4000, 'Investment', { description: 'Value update', adjust: 'value' }),
      spend(9, 8, 2500, 'Income', { type: 'inflow', description: 'Balance adjustment', adjust: 'correction' }),
    ]
    const r = recap(rows)
    expect(r.spent).toBe(900)
    expect(r.income).toBe(0)
  })

  it('names a split nobody described by what it was split into', () => {
    const rows = [
      ...HISTORY,
      spend(9, 4, 4000, 'Groceries', { description: 'Groceries', splitId: 's2' }),
      spend(9, 4, 2500, 'Home', { description: 'Home', splitId: 's2' }),
    ]
    expect(recap(rows).biggest).toMatchObject({ description: 'Groceries + Home', amount: 6500 })
  })

  it('never makes a go-to of a debt, a fee, or a split without a name', () => {
    const rows = [
      ...HISTORY,
      ...[2, 9, 16].map(d => spend(9, d, 5000, 'Debt Payment', { description: 'Paid to Gelo' })),
      ...[3, 10, 17].map(d => spend(9, d, 15, 'Transfer Fee', { description: 'Transfer fee' })),
      ...[4, 11, 18].flatMap(d => [
        spend(9, d, 800, 'Groceries', { description: 'Groceries', splitId: `g${d}` }),
        spend(9, d, 400, 'Home', { description: 'Home', splitId: `g${d}` }),
      ]),
    ]
    expect(recap(rows).goTo).toBeNull()
  })

  it('counts a described split once as a visit, at what all of it cost', () => {
    const rows = [
      ...HISTORY,
      ...[4, 11, 18].flatMap(d => [
        spend(9, d, 800, 'Groceries', { description: 'SM Supermarket', splitId: `m${d}` }),
        spend(9, d, 400, 'Home', { description: 'SM Supermarket', splitId: `m${d}` }),
      ]),
    ]
    expect(recap(rows).goTo).toEqual({ label: 'SM Supermarket', count: 3, amount: 3600, icon: null })
  })

  it('does not count a visit that was refunded in full', () => {
    const visits = [1, 8, 15].map(d => spend(9, d, 180, 'Food', { description: 'Jollibee' }))
    const back = spend(9, 16, -180, 'Food', { refundOf: visits[2].txId })
    expect(recap([...HISTORY, ...visits, back]).goTo).toBeNull()
    const partly = spend(9, 16, -80, 'Food', { refundOf: visits[2].txId })
    expect(recap([...HISTORY, ...visits, partly]).goTo).toEqual({ label: 'Jollibee', count: 3, amount: 460, icon: null })
  })

  it('takes off only the refunds made within the month', () => {
    const shoes = spend(9, 20, 6000, 'Shopping', { description: 'Shoes' })
    const later = spend(10, 2, -6000, 'Shopping', { refundOf: shoes.txId })
    const r = recap([...HISTORY, shoes, spend(9, 21, 2000, 'Food', { description: 'Groceries' }), later])
    expect(r.biggest).toMatchObject({ description: 'Shoes', amount: 6000 })
    expect(r.categories[0]).toMatchObject({ name: 'Shopping', amount: 6000 })
  })
})

describe('days, averages and first months', () => {
  it('calls a day whose purchase was returned the same day a no-spend day', () => {
    const buy = spend(9, 5, 500, 'Food', { description: 'Cake' })
    const r = recap([...HISTORY, buy, spend(9, 5, -500, 'Food', { refundOf: buy.txId }), spend(9, 6, 100)])
    expect(r.daily[4].amount).toBe(0)
    expect(r.noSpendDays).toBe(29)
  })

  it('starts a first month at the first purchase, not a salary written back to the 1st', () => {
    const r = recap([earn(9, 1, 30000), spend(9, 20, 300), spend(9, 22, 200)])
    expect(r.firstMonth).toBe(true)
    expect(r.trackedDays).toBe(11)
    expect(r.noSpendDays).toBe(9)
  })

  it('is not fooled out of a first month by a row with no date', () => {
    const r = recap([tx({ type: 'expense', amount: 5, category: 'Food', date: '' }), spend(9, 20, 300)])
    expect(r.firstMonth).toBe(true)
    expect(r.trackedDays).toBe(11)
  })

  it('does not measure a first full month against the few days before it', () => {
    // Started on 25 August.
    const r = recap([spend(8, 25, 3000), spend(9, 10, 25000)])
    expect(r.prev.partial).toBe(true)
    expect(r.spentChange).toBeNull()
    expect(spentComparison(r)).toBe('Your first full month with Spendr')
  })
})

describe('the words for a change', () => {
  it('puts a huge rise as a multiple, not a percentage nobody can picture', () => {
    const r = recap([...HISTORY, spend(8, 10, 100), spend(9, 10, 1200)])
    expect(spentComparison(r)).toBe('12× what you spent in August')
    const huge = recap([...HISTORY, spend(8, 10, 1), spend(9, 10, 10000)])
    expect(spentComparison(huge)).toBe('10,000× what you spent in August')
  })

  it('never says 100% less while something was spent', () => {
    const r = recap([...HISTORY, spend(8, 10, 10000), spend(9, 10, 40)])
    expect(spentComparison(r)).toBe('99% less than August')
  })

  it('reads shares the way people do', () => {
    expect(percent(0)).toBe('0%')
    expect(percent(0.0015)).toBe('<1%')
    expect(percent(0.25)).toBe('25%')
    expect(percent(0.996)).toBe('99%')
    expect(percent(1)).toBe('100%')
  })

  it('counts up in the format it ends in', () => {
    expect(heroFormatFor(12500, 'PHP')(9999.87)).toBe('₱10,000')
    expect(heroFormatFor(250, 'PHP')(12.3)).toBe('₱12.30')
  })
})

describe('budgets and net worth, said plainly', () => {
  const categories = [
    { name: 'Food', type: 'expense', budget: 3000 },
    { name: 'Shopping', type: 'expense', budget: 3000 },
  ]

  it('says "Both", and shows a category that refunds took below nothing as nothing spent', () => {
    const shoes = spend(8, 20, 1000, 'Shopping', { description: 'Shoes' })
    const r = recap([...HISTORY, shoes, spend(9, 3, 500, 'Food'), spend(9, 5, -1000, 'Shopping', { refundOf: shoes.txId })], { categories })
    expect(budgetsCopy(r)).toEqual({ value: 'Both', line: 'budgets stayed on track.' })
    expect(r.budgets.rows.find(x => x.name === 'Shopping')).toMatchObject({ spent: 0, over: false })
  })

  it('has no budgets slide for a month with nothing bought', () => {
    const r = recap([...HISTORY, earn(9, 15, 5000)], { categories })
    expect(recapSlides(r)).not.toContain('budgets')
  })

  it('takes rows written ahead off today\'s figure before walking back', () => {
    // A card installment dated November is already in today's net worth.
    const rows = [...HISTORY, earn(9, 15, 50000), tx({ type: 'expense', amount: 10000, category: 'Gadgets', date: at(11, 2) })]
    const r = recap(rows, { netWorthNow: 40000 })
    expect(r.netWorth.end).toBe(50000)
    expect(r.netWorth.start).toBe(0)
  })

  it('heads the net worth slide with where it ended, not the change the kept slide already gave', () => {
    const r = recap([...HISTORY, earn(9, 15, 20000), spend(9, 20, 8000)], { netWorthNow: 96000 })
    expect(netWorthCopy(r, 'PHP')).toEqual({ label: 'Net worth on Sep 30', line: 'Up ₱12,000 since Sep 1', tone: 'good' })
  })

  it('sums up in tiles that are not the same figure twice, most telling first', () => {
    const r = recap([...HISTORY, earn(9, 15, 20000), spend(9, 20, 8000, 'Food')], { netWorthNow: 96000 })
    expect(summaryTiles(r, 'PHP').map(x => x.label)).toEqual(['Came in', 'Kept', 'Top category', 'Purchases', 'No-spend days', 'Busiest day'])
    expect(summaryTiles(r, 'PHP')[1]).toMatchObject({ emoji: '🐷', value: '₱12,000', tone: 'good' })
  })

  it('never has more than six tiles', () => {
    const badges = [{ key: 'seven-days', earnedAt: at(9, 30) }]
    const r = recap([...HISTORY, earn(9, 15, 20000), spend(9, 20, 8000, 'Food')], { badges })
    expect(summaryTiles(r, 'PHP')).toHaveLength(6)
  })
})

describe('the emoji each thing is drawn with', () => {
  const categories = [
    { name: 'Food', type: 'expense', icon: '🍔', color: '#FFB347', budget: 5000 },
    { name: 'Bills', type: 'expense', icon: '🧾', color: '#FF6B6B' },
  ]

  it("carries each category's own emoji to the slides that draw it", () => {
    const rows = [
      ...HISTORY,
      ...[1, 8, 15].map(d => spend(9, d, 180, 'Food', { description: 'Jollibee' })),
      spend(9, 5, 4500, 'Bills', { description: 'Meralco' }),
    ]
    const r = recap(rows, { categories })
    expect(r.categories.map(c => [c.name, c.icon])).toEqual([['Bills', '🧾'], ['Food', '🍔']])
    expect(r.biggest).toMatchObject({ description: 'Meralco', icon: '🧾' })
    expect(r.goTo).toMatchObject({ label: 'Jollibee', icon: '🍔' })
    expect(r.budgets.rows[0]).toMatchObject({ name: 'Food', icon: '🍔' })
  })

  it('has none for a category nobody gave one', () => {
    expect(recap([...HISTORY, spend(9, 2, 100, 'Mystery')]).categories[0].icon).toBeNull()
  })
})

describe('Wrapped, by name and by date', () => {
  it('is called by its month', () => {
    expect(wrappedTitle('2026-08')).toBe('August Wrapped')
  })

  it('leads on Home for the first three days of a month, then moves to Insights', () => {
    expect(wrappedOnHome(new Date(2026, 9, 1, 9))).toBe(true)
    expect(wrappedOnHome(new Date(2026, 9, 3, 23, 59))).toBe(true)
    expect(wrappedOnHome(new Date(2026, 9, 4, 0, 1))).toBe(false)
  })
})

describe('the receipt, a week at a time', () => {
  it('splits the month into weeks that add up to what was spent', () => {
    const r = recap([...HISTORY, spend(9, 2, 1000), spend(9, 9, 250), spend(9, 30, 400)])
    const weeks = weeksOf(r)
    expect(weeks.map(w => w.label)).toEqual(['Sep 1–7', 'Sep 8–14', 'Sep 15–21', 'Sep 22–28', 'Sep 29–30'])
    expect(weeks.reduce((s, w) => s + w.amount, 0)).toBeCloseTo(r.spent, 2)
  })

  it('leaves off the weeks before a first month began', () => {
    const r = recap([spend(9, 20, 500)])
    expect(weeksOf(r).map(w => w.label)).toEqual(['Sep 15–21', 'Sep 22–28', 'Sep 29–30'])
  })
})

describe('the money personality', () => {
  const coffee = (/** @type {number} */ d) => spend(9, d, 180, 'Coffee', { description: 'Kape Tayo' })

  it('calls a month that kept a third or more of what came in a Saver', () => {
    const r = recap([...HISTORY, earn(9, 15, 20000), spend(9, 5, 4000), spend(9, 18, 4000)])
    expect(personalityOf(r)).toMatchObject({ key: 'saver', name: 'The Saver', art: 'pig-face', line: 'You kept 60% of what came in.' })
  })

  it('calls a month of going back to the same place a Regular, with the place in its line', () => {
    const r = recap([...HISTORY, ...[1, 3, 5, 8, 10, 12, 15, 17, 19].map(coffee)])
    expect(personalityOf(r)).toMatchObject({ key: 'regular', name: 'The Regular', line: '9 visits to Kape Tayo.' })
  })

  it('calls a month inside every budget a Planner', () => {
    const categories = [
      { name: 'Food', type: 'expense', budget: 5000 },
      { name: 'Bills', type: 'expense', budget: 5000 },
    ]
    const r = recap([...HISTORY, earn(9, 15, 7000), spend(9, 4, 3000), spend(9, 9, 2500, 'Bills'), spend(9, 20, 1000)], { categories })
    expect(personalityOf(r).key).toBe('planner')
  })

  it('is kind about a month that ran over: a Fresh Start', () => {
    const r = recap([...HISTORY, earn(9, 15, 5000), ...[2, 6, 11, 16, 21, 26].map(d => spend(9, d, 1500))])
    expect(personalityOf(r)).toMatchObject({ key: 'fresh', name: 'The Fresh Start' })
  })

  it('calls a first month a New Arrival rather than judging a few days', () => {
    const r = recap([spend(9, 24, 450)])
    expect(personalityOf(r)).toMatchObject({ key: 'new', name: 'The New Arrival' })
  })

  it('has a fallback for a month with nothing striking', () => {
    const days = [1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28]
    const r = recap([...HISTORY, earn(9, 15, 10000), ...days.map(d => spend(9, d, 300, d % 2 ? 'Home' : 'Bills', { description: `Shop ${d}` }))])
    expect(personalityOf(r).key).toBe('allrounder')
  })

  it('backs it with up to three facts, never the one its own line already says', () => {
    const r = recap([...HISTORY, earn(9, 15, 20000), spend(9, 5, 4000), spend(9, 18, 4000)])
    const p = personalityOf(r)
    expect(p.traits.length).toBeGreaterThan(0)
    expect(p.traits.length).toBeLessThanOrEqual(3)
    expect(p.traits.map(t => t.text).join(' ')).not.toMatch(/Kept/)
  })

  it('is always the same for the same month', () => {
    const txs = [...HISTORY, ...[1, 3, 5, 8, 10, 12, 15, 17, 19].map(coffee)]
    expect(personalityOf(recap(txs))).toEqual(personalityOf(recap(txs)))
  })
})

describe('a picture with the amounts hidden', () => {
  const r = recap([...HISTORY, earn(9, 15, 20000), spend(9, 20, 8000, 'Food')])

  it('keeps every tile, and no tile holds a sum of money', () => {
    const tiles = summaryTiles(r, 'PHP', { hideAmounts: true })
    expect(tiles.map(t => t.label)).toEqual(['Kept', 'Top category', 'Purchases', 'No-spend days', 'Busiest day'])
    expect(tiles.map(t => t.value).join(' ')).not.toMatch(/₱/)
    expect(tiles[0]).toMatchObject({ value: '60%', tone: 'good' })
  })

  it('leads with what was kept, as a share', () => {
    expect(summaryHero(r, 'PHP', { hideAmounts: true })).toEqual({ label: 'Kept', value: '60%', line: 'of what came in' })
  })

  it('says an overspent month as how far over, not by how much', () => {
    const over = recap([...HISTORY, earn(9, 15, 4000), spend(9, 20, 5000, 'Food')])
    expect(summaryTiles(over, 'PHP', { hideAmounts: true })[0]).toMatchObject({ label: 'Overspent', value: '25% over' })
    expect(summaryHero(over, 'PHP', { hideAmounts: true })).toMatchObject({ label: 'Spent', value: '125%' })
  })
})
