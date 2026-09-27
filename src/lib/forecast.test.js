import { describe, expect, it } from 'vitest'
import { buildForecast, everydaySpend } from './forecast'

const NOW = new Date(2026, 8, 10, 12)   // Thu Sep 10, 2026
const face = (/** @type {any} */ t) => t.amount ?? 0
const bank = { id: 1, name: 'BPI', type: 'bank', balance: 20000, currency: 'PHP' }
const iso = (/** @type {number} */ m, /** @type {number} */ d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** @param {Record<string, any>} [over] */
const run = (over = {}) => buildForecast({
  accounts: [bank], transactions: [], recurring: [], debts: [], base: 'PHP', rates: null,
  horizonDays: 30, now: NOW, priceOf: face, ...over,
})

describe('the forecast walk', () => {
  it('starts from net liquid: cash and banks less what cards owe', () => {
    const card = { id: 2, name: 'Card', type: 'credit', balance: 0, cutoffDate: 25, dueDate: 10, currency: 'PHP' }
    const charge = { type: 'expense', account: 'Card', amount: 3000, date: new Date(2026, 8, 5).toISOString() }
    const mp2 = { id: 3, name: 'MP2', type: 'investment', balance: 90000, currency: 'PHP' }
    const f = run({ accounts: [bank, card, mp2], transactions: [charge] })
    expect(f.start).toBe(17000)
  })

  it('lays out bills and income, and finds the tightest day by day', () => {
    const recurring = [
      { id: 1, name: 'Rent', amount: 15000, frequency: 'monthly', nextDate: iso(9, 12), active: true, account: 'BPI' },
      { id: 2, name: 'Salary', type: 'inflow', amount: 25000, frequency: 'semimonthly', nextDate: iso(9, 15), active: true, account: 'BPI' },
    ]
    const f = run({ recurring })
    expect(f.days[0].balance).toBe(20000)
    expect(f.lowest.balance).toBe(5000)
    expect(f.lowest.iso).toBe(iso(9, 12))
    // Paid on the 15th and the 30th; October's rent falls after the 30 days.
    const pays = f.events.filter(e => e.kind === 'income').map(e => e.date.getDate())
    expect(pays).toEqual([15, 30])
    expect(f.days.at(-1).balance).toBe(20000 - 15000 + 25000 + 25000)
  })

  it('safe to spend is the low point before payday, less the floor', () => {
    const recurring = [
      { id: 1, name: 'Rent', amount: 15000, frequency: 'monthly', nextDate: iso(9, 12), active: true, account: 'BPI' },
      { id: 2, name: 'Salary', type: 'inflow', amount: 25000, frequency: 'semimonthly', nextDate: iso(9, 15), active: true, account: 'BPI' },
    ]
    expect(run({ recurring }).safeToSpend).toBe(5000)
    expect(run({ recurring, floor: 2000 }).safeToSpend).toBe(3000)
    expect(run({ recurring }).safeUntil.getDate()).toBe(15)
  })

  it('names the first day below the floor, and the first below zero', () => {
    const recurring = [
      { id: 1, name: 'Tuition', amount: 26000, frequency: 'yearly', nextDate: iso(9, 20), active: true, account: 'BPI' },
    ]
    const f = run({ recurring, floor: 5000 })
    expect(f.firstNegative.iso).toBe(iso(9, 20))
    expect(f.firstBelowFloor.iso).toBe(iso(9, 20))
  })

  it('puts an unposted bill on today, and does not count pay that was never marked', () => {
    const recurring = [
      { id: 1, name: 'Internet', amount: 1500, frequency: 'monthly', nextDate: iso(9, 1), active: true, account: 'BPI' },
      { id: 2, name: 'Salary', type: 'inflow', amount: 25000, frequency: 'monthly', nextDate: iso(9, 5), active: true, account: 'BPI' },
    ]
    const f = run({ recurring })
    const late = f.events.filter(e => e.overdue)
    expect(late.map(e => [e.name, e.counted])).toEqual([['Internet', true], ['Salary', false]])
    expect(f.days[0].balance).toBe(18500)
    // The next internet bill is October's, not a second September one.
    expect(f.events.filter(e => e.name === 'Internet').map(e => e.date.getMonth())).toEqual([8, 9])
  })

  it('lists a card\'s due date without taking it out twice', () => {
    const card = { id: 2, name: 'Card', type: 'credit', balance: 0, cutoffDate: 25, dueDate: 15, currency: 'PHP' }
    const charge = { type: 'expense', account: 'Card', amount: 3000, date: new Date(2026, 7, 20).toISOString() }
    const f = run({ accounts: [bank, card], transactions: [charge] })
    const due = f.events.find(e => e.kind === 'card')
    expect(due).toMatchObject({ counted: false, amount: 3000 })
    expect(f.days.at(-1).balance).toBe(17000)
  })

  it('takes a loan\'s monthly payment on its due day', () => {
    const loan = { id: 4, name: 'Car Loan', type: 'loan', balance: -100000, minimumPayment: 8884.88, interestRate: 1, dueDate: 15, currency: 'PHP' }
    const f = run({ accounts: [bank, loan] })
    const pay = f.events.filter(e => e.kind === 'loan')
    expect(pay.map(e => e.date.getDate())).toEqual([15])
    expect(f.days.at(-1).balance).toBe(round(20000 - 8884.88))
  })

  it('counts a dated debt you owe, not one owed to you', () => {
    const debts = [
      { id: 1, name: 'Gelo', type: 'i_owe', amount: 2000, amountPaid: 500, dueDate: iso(9, 18) },
      { id: 2, name: 'Ana', type: 'owed_to_me', amount: 5000, amountPaid: 0, dueDate: iso(9, 18) },
    ]
    const f = run({ debts })
    expect(f.events.map(e => [e.name, e.amount])).toEqual([['Gelo', 1500]])
  })
})

describe('everyday spending', () => {
  /** A week's spending of `amt`, on the Monday `weeksAgo` weeks back. */
  const weekOf = (/** @type {number} */ weeksAgo, /** @type {number} */ amt, more = {}) => ({
    type: 'expense', account: 'BPI', amount: amt,
    date: new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - weeksAgo * 7 - 1).toISOString(), ...more,
  })

  it('is the median week of the last twelve, per day', () => {
    const txs = [700, 700, 700, 14000, 700, 700].map((a, i) => weekOf(i + 1, a))
    // The laptop week does not move the median.
    expect(everydaySpend(txs, NOW, face)).toBe(100)
  })

  it('leaves out bills, installments, settlements, loan interest and corrections', () => {
    const txs = [
      ...[700, 700, 700, 700].map((a, i) => weekOf(i + 1, a)),
      weekOf(1, 9000, { recurringId: 3 }),
      weekOf(2, 9000, { installmentId: 'x' }),
      weekOf(2, 9000, { category: 'Debt Payment' }),
      weekOf(3, 9000, { category: 'Loan interest' }),
      weekOf(3, 9000, { description: 'Balance adjustment' }),
    ]
    expect(everydaySpend(txs, NOW, face)).toBe(100)
  })

  it('says nothing until there are three weeks of history', () => {
    expect(everydaySpend([weekOf(1, 700)], NOW, face)).toBeNull()
  })
})

function round(/** @type {number} */ n) { return Math.round(n * 100) / 100 }

/* Found in review: safe to spend looked for payday only as far as the chart
   did, so Home (30 days) and the Forecast page on 3M disagreed about today. */
describe('safe to spend does not depend on the range shown', () => {
  it('finds a payday 40 days out on every range, and says the same figure', () => {
    const recurring = [
      { id: 1, name: 'Rent', amount: 15000, frequency: 'monthly', nextDate: iso(10, 5), active: true, account: 'BPI' },
      { id: 2, name: 'Bonus pay', type: 'inflow', amount: 30000, frequency: 'quarterly', nextDate: iso(10, 20), active: true, account: 'BPI' },
    ]
    const month = run({ recurring, horizonDays: 30 })
    const quarter = run({ recurring, horizonDays: 90 })
    expect(month.safeUntil?.getDate()).toBe(20)
    expect(quarter.safeUntil?.getDate()).toBe(20)
    expect(month.safeToSpend).toBe(quarter.safeToSpend)
    expect(month.safeToSpend).toBe(5000)
    // What is drawn still stops at the range: 31 days, and nothing after them.
    expect(month.days).toHaveLength(31)
    expect(month.events.every(e => e.date <= month.days.at(-1).date)).toBe(true)
  })
})
