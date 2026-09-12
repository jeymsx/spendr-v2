import { describe, it, expect } from 'vitest'
import { creditCardBills, statementDueDate, daysToDue } from './creditBills'

/** @param {Record<string, any>} [over] @returns {any} */
const card = (over = {}) => ({
  name: 'Card', type: 'credit', creditLimit: 50000,
  cutoffDate: 15, dueDate: 5, minimumPayment: 500, ...over,
})
/** @param {number} m @param {number} d @param {number} amount */
const charge = (m, d, amount) =>
  ({ type: 'expense', account: 'Card', amount, date: new Date(2026, m - 1, d, 12).toISOString() })
/** @param {number} m @param {number} d @param {number} amount */
const pay = (m, d, amount) =>
  ({ type: 'transfer', fromAccount: 'BPI', toAccount: 'Card', amount, date: new Date(2026, m - 1, d, 12).toISOString() })
/** @param {number} m @param {number} d */
const at = (m, d) => new Date(2026, m - 1, d, 10)

describe('statementDueDate', () => {
  it('falls in the month after the cycle closes', () => {
    // Cycle closing 14 Sep, due on the 5th -> 5 Oct.
    const due = statementDueDate(new Date(2026, 8, 14), 5)
    expect(due.getMonth()).toBe(9)
    expect(due.getDate()).toBe(5)
  })

  /** A card due on the 31st still has to land somewhere in February. */
  it('clamps a day the month does not have', () => {
    const due = statementDueDate(new Date(2026, 0, 14), 31)
    expect(due.getMonth()).toBe(1)
    expect(due.getDate()).toBe(28)
  })

  it('is null when the card has no due day set', () => {
    expect(statementDueDate(new Date(2026, 8, 14), undefined)).toBeNull()
    expect(statementDueDate(new Date(2026, 8, 14), 0)).toBeNull()
  })

  /**
   * It must be allowed to return a date in the past. nextDueDate() always
   * answers with a future occurrence, which would make an overdue card look
   * punctual - the whole reason this is a separate function.
   */
  it('returns a past date once the due date has gone', () => {
    const due = statementDueDate(new Date(2025, 0, 14), 5)
    expect(due.getTime()).toBeLessThan(Date.now())
  })
})

describe('daysToDue', () => {
  it('counts forward, and negative once passed', () => {
    expect(daysToDue(new Date(2026, 8, 20), at(9, 13))).toBe(7)
    expect(daysToDue(new Date(2026, 8, 13), at(9, 13))).toBe(0)
    expect(daysToDue(new Date(2026, 8, 10), at(9, 13))).toBe(-3)
  })

  it('is null without a date', () => {
    expect(daysToDue(null, at(9, 13))).toBeNull()
  })
})

describe('creditCardBills', () => {
  it('shows nothing for a card that owes nothing', () => {
    expect(creditCardBills({ accounts: [card()], transactions: [], today: at(9, 20) })).toEqual([])
  })

  it('shows nothing once the statement is settled', () => {
    const txs = [charge(8, 20, 3000), pay(9, 20, 3000)]
    expect(creditCardBills({ accounts: [card()], transactions: txs, today: at(9, 21) })).toEqual([])
  })

  it('bills the closed statement, with its due date', () => {
    const txs = [charge(8, 20, 3000)]
    const [b] = creditCardBills({ accounts: [card()], transactions: txs, today: at(9, 20) })
    expect(b.kind).toBe('card')
    expect(b.name).toBe('Card')
    expect(b.amount).toBe(3000)
    expect(b.minimumDue).toBe(500)
    expect(new Date(b.dueDate).getDate()).toBe(5)
  })

  /**
   * The amount due is the CLOSED statement, not everything the card holds.
   * Charges made since the cutoff are on next month's bill, and asking for
   * them now would be asking for money the issuer has not billed.
   */
  it('does not ask for charges made since the cutoff', () => {
    const txs = [charge(8, 20, 3000), charge(9, 25, 4000)]
    const [b] = creditCardBills({ accounts: [card()], transactions: txs, today: at(9, 26) })
    expect(b.amount).toBe(3000)
    expect(b.totalBalance).toBe(7000)
  })

  it('bills only the shortfall after a part payment', () => {
    const txs = [charge(8, 20, 3000), pay(9, 20, 1000)]
    const [b] = creditCardBills({ accounts: [card()], transactions: txs, today: at(9, 21) })
    expect(b.amount).toBe(2000)
  })

  it('caps the minimum at what is actually still owed', () => {
    const txs = [charge(8, 20, 300)]
    const [b] = creditCardBills({ accounts: [card()], transactions: txs, today: at(9, 20) })
    // The card's stored minimum is 500; a 300-peso statement cannot want more.
    expect(b.minimumDue).toBe(300)
  })

  it('flags a statement past its due date', () => {
    const txs = [charge(8, 20, 3000)]
    const [b] = creditCardBills({ accounts: [card()], transactions: txs, today: at(10, 12) })
    expect(b.overdue).toBe(true)
    expect(b.daysUntil).toBeLessThan(0)
  })

  it('is not overdue before the date arrives', () => {
    const txs = [charge(8, 20, 3000)]
    const [b] = creditCardBills({ accounts: [card()], transactions: txs, today: at(9, 20) })
    expect(b.overdue).toBe(false)
  })

  it('ignores accounts that are not credit cards', () => {
    const accts = [{ name: 'BPI', type: 'bank', balance: 5000 }]
    expect(creditCardBills({ accounts: accts, transactions: [], today: at(9, 20) })).toEqual([])
  })

  it('orders by urgency, and puts a card with no due day last', () => {
    const accounts = [
      card({ name: 'Later',  dueDate: 28 }),
      card({ name: 'Undated', dueDate: null }),
      card({ name: 'Sooner', dueDate: 2 }),
    ]
    const txs = ['Later', 'Undated', 'Sooner'].map(n =>
      ({ type: 'expense', account: n, amount: 1000, date: new Date(2026, 7, 20, 12).toISOString() }))
    const names = creditCardBills({ accounts, transactions: txs, today: at(9, 20) }).map(b => b.name)
    expect(names).toEqual(['Sooner', 'Later', 'Undated'])
  })
})
