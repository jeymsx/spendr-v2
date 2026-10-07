import { describe, it, expect } from 'vitest'
import { gatherFacts } from './gather'
import { composeNote, noteText } from './compose'
import { quietRunOf, weekdayPatternOf } from './facts'

/** Local noon on a day, as the ledger stores it. */
const at = (/** @type {number} */ y, /** @type {number} */ m, /** @type {number} */ d) => new Date(y, m - 1, d, 12).toISOString()

const NOW = new Date(2026, 9, 7, 19, 40)

const accounts = [
  { name: 'Cash', type: 'cash', balance: 2350 },
  { name: 'BPI', type: 'bank', balance: 38400 },
  { name: 'Maya Savings', type: 'savings', balance: 52000 },
  { name: 'Pag-IBIG MP2', type: 'investment', balance: 52340 },
  { name: 'BPI Credit', type: 'credit', balance: 0, creditLimit: 40000, cutoffDay: 20, dueDay: 15 },
]

const categories = [
  { name: 'Rent', type: 'expense', budget: 12000 },
  { name: 'Shopping', type: 'expense', budget: 4000 },
  { name: 'Food', type: 'expense', budget: 7500 },
  { name: 'Entertainment', type: 'expense', budget: 0 },
  { name: 'Salary', type: 'inflow', budget: 0 },
]

/** @type {Array<Record<string, any>>} */
const txs = [
  // Earlier history, so there is a "last month" and a ledger to speak of.
  ...Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, type: 'expense', amount: 1000, category: 'Food', account: 'BPI', date: at(2026, 9, 1 + i), description: 'Lunch' })),
  { id: 200, type: 'expense', amount: 12000, category: 'Rent', account: 'BPI', date: at(2026, 9, 5), description: 'Rent' },
  { id: 201, type: 'inflow', amount: 24000, category: 'Salary', account: 'BPI', date: at(2026, 9, 15), description: 'Salary' },
  // October, up to the 7th.
  { id: 1, type: 'expense', amount: 12000, category: 'Rent', account: 'BPI', date: at(2026, 10, 5), description: 'Rent' },
  { id: 2, type: 'expense', amount: 2700, category: 'Shopping', account: 'BPI Credit', date: at(2026, 10, 6), description: 'Decathlon' },
  { id: 3, type: 'expense', amount: 470, category: 'Food', account: 'Cash', date: at(2026, 10, 6), description: 'Salon' },
  { id: 4, type: 'expense', amount: 240, category: 'Food', account: 'GCash', date: at(2026, 10, 4), description: 'Yellow Cab' },
  { id: 5, type: 'inflow', amount: 8000, category: 'Salary', account: 'BPI', date: at(2026, 10, 1), description: 'Side gig' },
  // Not spending: a transfer, and a balance correction.
  { id: 6, type: 'transfer', amount: 5000, category: 'Transfer', account: 'BPI', date: at(2026, 10, 3), description: 'To savings' },
  { id: 7, type: 'expense', amount: 999, category: 'Others', account: 'BPI', date: at(2026, 10, 3), description: 'Balance correction', adjust: true },
  // Committed, not spent: dated after today.
  { id: 8, type: 'expense', amount: 3000, category: 'Shopping', account: 'BPI Credit', date: at(2026, 10, 20), description: 'Later' },
]

const forecast = {
  safeToSpend: 84313,
  safeUntil: new Date(2026, 9, 15),
  start: 92262,
  floor: 0,
  firstNegative: /** @type {{date: Date}|null} */ (null),
  firstBelowFloor: /** @type {{date: Date}|null} */ (null),
  events: [
    { name: 'Globe Postpaid', amount: 999, sign: -1, kind: 'bill', date: new Date(2026, 9, 12), account: 'GCash', overdue: false },
    { name: 'Salary', amount: 24000, sign: 1, kind: 'income', date: new Date(2026, 9, 15), account: 'BPI', overdue: false },
    { name: 'BPI Credit', amount: 4608, sign: -1, kind: 'card', date: new Date(2026, 9, 15), account: 'BPI Credit', overdue: false },
  ],
}

const base = { now: NOW, name: ' James ', base: 'PHP', txs, accounts, categories, forecast, worthChange: -13280 }

describe('gatherFacts: what happened', () => {
  const f = gatherFacts(base)

  it('reads the month as the app does: posted spending, no transfers, no corrections, nothing from the future', () => {
    expect(f.month.spent).toBe(12000 + 2700 + 470 + 240)
    expect(f.month.earned).toBe(8000)
    expect(f.month.day).toBe(7)
    expect(f.month.days).toBe(31)
  })

  it('knows what today and yesterday cost, and the last seven days', () => {
    expect(f.month.spentToday).toBe(0)
    expect(f.month.spentYesterday).toBe(2700 + 470)
    expect(f.month.last7).toHaveLength(7)
    expect(f.month.last7.at(-1)).toBe(0)
    expect(f.month.last7.at(-2)).toBe(3170)
  })

  it('compares with the same days last month, and keeps last month whole', () => {
    // September 1-7: seven lunches of 1000, and the rent on the 5th.
    expect(f.month.prevSpent).toBe(7000 + 12000)
    expect(f.last.label).toBe('September')
    expect(f.last.spent).toBe(12000 + 12000)
  })

  it('finds the biggest day, the biggest purchase that is not a bill, and where it went', () => {
    expect(f.month.biggestDay).toEqual({ label: 'Oct 5', amount: 12000 })
    expect(f.month.biggestBuy).toEqual({ name: 'Decathlon', amount: 2700, category: 'Shopping' })
    expect(f.month.byCategory[0]).toEqual({ name: 'Rent', value: 12000 })
  })

  it('counts a quiet run from today back', () => {
    expect(f.month.quietRun).toBe(1)
  })

  it('names the person, trimmed, and the currency', () => {
    expect(f.name).toBe('James')
    expect(f.currency).toBe('PHP')
    expect(f.txCount).toBe(txs.length)
  })
})

describe('gatherFacts: what is planned and what it is worth', () => {
  const f = gatherFacts(base)

  it('reads the budget from the categories that have a limit', () => {
    expect(f.budget?.total).toBe(23500)
    expect(f.budget?.rows.map(r => [r.name, r.budget, r.spent])).toEqual([['Rent', 12000, 12000], ['Shopping', 4000, 2700], ['Food', 7500, 710]])
  })

  it('takes the bills, the pay and the safe figure from the forecast', () => {
    expect(f.plan?.safe).toBe(84313)
    expect(f.plan?.payDate).toEqual(new Date(2026, 9, 15))
    expect(f.plan?.payName).toBe('Salary')
    expect(f.plan?.payAmount).toBe(24000)
    expect(f.plan?.bills.map(b => [b.name, b.amount, b.kind])).toEqual([['Globe Postpaid', 999, 'bill'], ['BPI Credit', 4608, 'card']])
    expect(f.plan?.liquid).toBe(92262)
  })

  it('has no plan until the forecast is ready', () => {
    expect(gatherFacts({ ...base, forecast: null }).plan).toBeNull()
  })

  it('adds up the net worth the way the wallet does', () => {
    expect(f.worth?.spending).toBe(2350)
    expect(f.worth?.savings).toBe(38400 + 52000)
    expect(f.worth?.invested).toBe(52340)
    expect(f.worth?.changeMonth).toBe(-13280)
  })

  it('has no budget when no category has a limit', () => {
    expect(gatherFacts({ ...base, categories: categories.map(c => ({ ...c, budget: 0 })) }).budget).toBeNull()
  })

  it('writes a clean note from a real ledger', () => {
    const note = composeNote(gatherFacts(base))
    expect(note.title).toBe('Hi, James.')
    expect(noteText(note)).toMatch(/spent today|Nothing/)
  })
})

describe('gatherFacts: a ledger with no history', () => {
  it('has no last month and no yesterday to compare with', () => {
    const f = gatherFacts({ ...base, txs: txs.filter(t => String(t.date).startsWith('2026-10')) })
    expect(f.month.prevSpent).toBeNull()
    expect(f.last).toEqual({ spent: null, earned: null, label: null })
  })

  it('copes with nothing at all', () => {
    const f = gatherFacts({ now: NOW, base: 'PHP', txs: [], accounts: [], categories: [] })
    expect(f.txCount).toBe(0)
    expect(f.month.spent).toBe(0)
    expect(f.budget).toBeNull()
    expect(f.goal).toBeNull()
    expect(composeNote(f).level.id).toBe('fresh')
  })
})

describe('quietRunOf', () => {
  const days = [{ iso: '2026-10-03', amount: 50 }, { iso: '2026-10-04', amount: 0 }]

  it('counts the days since anything was spent, today included', () => {
    expect(quietRunOf(days, new Date(2026, 9, 7))).toBe(4)
  })

  it('is nothing when today has spending', () => {
    expect(quietRunOf([{ iso: '2026-10-07', amount: 10 }], new Date(2026, 9, 7))).toBe(0)
  })

  it('cannot reach back before the ledger began', () => {
    expect(quietRunOf([], new Date(2026, 9, 7), '2026-10-05')).toBe(3)
  })
})

describe('weekdayPatternOf', () => {
  /** Twelve weeks of spending: 1000 on every day but Wednesdays, which cost 100. */
  /** @type {Array<{iso: string, amount: number}>} */
  const history = []
  for (let i = 1; i <= 84; i++) {
    const d = new Date(2026, 9, 7 - i)
    history.push({ iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, amount: d.getDay() === 3 ? 100 : 1000 })
  }

  it('says when a weekday is usually quiet', () => {
    expect(weekdayPatternOf(history, new Date(2026, 9, 7), '2026-06-01')).toEqual({ name: 'Wednesdays', rank: 'quiet' })
  })

  it('says nothing for an ordinary day', () => {
    expect(weekdayPatternOf(history, new Date(2026, 9, 8), '2026-06-01')?.rank).toBeNull()
  })

  it('says nothing from fewer than six weeks of history', () => {
    expect(weekdayPatternOf(history, new Date(2026, 9, 7), '2026-09-20')).toBeNull()
    expect(weekdayPatternOf(history, new Date(2026, 9, 7), null)).toBeNull()
  })
})
