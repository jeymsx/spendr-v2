import { describe, expect, it } from 'vitest'
import {
  LOAN_INTEREST, dueOn, loanPairOf, loanStatus, matchInstallments, monthsToClear, rateLabel,
  solveMonthlyRate, splitPayment, upcomingLoanPayments,
} from './loans'

describe('the rate a lender never told you', () => {
  it('finds the monthly rate that clears the loan in the months left', () => {
    // 100,000 at 1% a month over 12 months is a payment of about 8,884.88.
    const r = solveMonthlyRate(100000, 8884.88, 12)
    expect(r).toBeCloseTo(0.01, 5)
  })

  it('is zero when the payments clear it with no interest at all', () => {
    expect(solveMonthlyRate(12000, 1000, 12)).toBe(0)
    expect(solveMonthlyRate(12000, 900, 12)).toBe(0)
    expect(solveMonthlyRate(0, 1000, 12)).toBe(0)
  })

  it('counts the payments left, and says never when the payment only covers interest', () => {
    expect(monthsToClear(100000, 8884.88, 0.01)).toBe(12)
    expect(monthsToClear(12000, 1000, 0)).toBe(12)
    expect(monthsToClear(100000, 1000, 0.01)).toBe(Infinity)
    expect(monthsToClear(0, 1000, 0.01)).toBe(0)
  })

  /* Found in the new-loan form: 24 months typed, the rate solved and kept to
     four places, and the line under it said "About 25 payments left". */
  it('gives back the months typed, through a rate rounded for storage', () => {
    const pct = Math.round(solveMonthlyRate(30000, 1500, 24) * 100 * 10000) / 10000
    expect(monthsToClear(30000, 1500, pct / 100)).toBe(24)
  })

  it('shows a rate to two places at most', () => {
    expect(rateLabel(1.5131)).toBe('1.51')
    expect(rateLabel('0.9')).toBe('0.9')
    expect(rateLabel(2)).toBe('2')
  })
})

describe('splitting a payment', () => {
  it('takes the month\'s interest first and the rest off the principal', () => {
    expect(splitPayment(100000, 8884.88, 1)).toEqual({ interest: 1000, principal: 7884.88 })
  })

  it('never takes more principal than is owed', () => {
    expect(splitPayment(500, 8000, 1)).toEqual({ interest: 5, principal: 500 })
  })

  it('is all interest when the payment does not cover it', () => {
    expect(splitPayment(100000, 600, 1)).toEqual({ interest: 600, principal: 0 })
  })
})

describe('due dates', () => {
  it('lands a loan due on the 31st on the last day of a short month', () => {
    expect(dueOn(2027, 1, 31).getDate()).toBe(28)
    expect(dueOn(2026, 8, 31).getDate()).toBe(30)
  })
})

describe('a loan, as its page reads it', () => {
  const loan = { name: 'Car Loan', type: 'loan', balance: -100000, minimumPayment: 8884.88, interestRate: 1, dueDate: 15 }
  const NOW = new Date(2026, 8, 10, 12)   // Sep 10

  it('owes the balance, and the next payment is this month', () => {
    const s = loanStatus(loan, [], NOW)
    expect(s.owed).toBe(100000)
    expect(s.nextDue.getMonth()).toBe(8)
    expect(s.nextDue.getDate()).toBe(15)
    expect(s.monthsLeft).toBe(12)
    expect(s.next).toMatchObject({ amount: 8884.88, interest: 1000, principal: 7884.88 })
  })

  it('moves the next payment on once this one is paid, even early', () => {
    const paid = [{ type: 'transfer', fromAccount: 'BPI', toAccount: 'Car Loan', amount: 7884.88, date: new Date(2026, 8, 5).toISOString() }]
    const s = loanStatus({ ...loan, balance: -92115.12 }, paid, NOW)
    expect(s.paidThisCycle).toBe(true)
    expect(s.nextDue.getMonth()).toBe(9)
    expect(s.paidIn).toBe(7884.88)
  })

  it('does not count the previous due date\'s own payment for the next one', () => {
    const paid = [{ type: 'transfer', fromAccount: 'BPI', toAccount: 'Car Loan', amount: 7884.88, date: new Date(2026, 7, 15, 9).toISOString() }]
    const s = loanStatus(loan, paid, NOW)
    expect(s.paidThisCycle).toBe(false)
    expect(s.nextDue.getMonth()).toBe(8)
  })

  it('lays out the payments to come, ending when the loan does', () => {
    const until = new Date(2028, 0, 1)
    const list = upcomingLoanPayments(loan, [], NOW, until)
    expect(list).toHaveLength(12)
    expect(list[0].amount).toBe(8884.88)
    expect(list.at(-1).amount).toBeLessThanOrEqual(8884.88 + 0.01)
  })
})

/**
 * Found in review: any payment after the last due date counted as paying the
 * next one, so a late payment read as next month paid early - and a missed
 * one vanished once its date passed.
 */
describe('matching payments to installments', () => {
  const d = (/** @type {number} */ m, /** @type {number} */ day) => new Date(2026, m - 1, day, 12)
  const ymd = (/** @type {Date} */ x) => `${x.getMonth() + 1}/${x.getDate()}`

  it('settles the month a late payment was late for, and still asks for the next', () => {
    // Paid Aug 14 for Aug 15; September's paid on the 17th, two days late.
    const s = matchInstallments(15, [d(8, 14), d(9, 17)], d(9, 20))
    expect(ymd(s.nextDue)).toBe('10/15')
    expect(s.overdue).toBe(false)
    expect(s.paidThisCycle).toBe(false)
    expect(s.interestDue).toBe(true)
  })

  it('keeps a missed installment open, overdue, until it is paid', () => {
    const s = matchInstallments(15, [d(8, 14)], d(9, 20))
    expect(ymd(s.nextDue)).toBe('9/15')
    expect(s.overdue).toBe(true)
  })

  it('counts a second payment in the same month as extra, not next month early', () => {
    const s = matchInstallments(15, [d(8, 14), d(9, 10), d(9, 12)], d(9, 13))
    expect(ymd(s.nextDue)).toBe('10/15')
    expect(s.paidThisCycle).toBe(true)
    // Another payment now would be extra too, so it carries no interest.
    expect(s.interestDue).toBe(false)
  })

  it('pays on the due date itself for that date, not the next', () => {
    const s = matchInstallments(15, [d(8, 15)], d(8, 20))
    expect(ymd(s.nextDue)).toBe('9/15')
    expect(s.paidThisCycle).toBe(false)
  })

  it('never opens a loan it has seen no payment for with a missed month', () => {
    const s = matchInstallments(15, [], d(9, 20))
    expect(ymd(s.nextDue)).toBe('10/15')
    expect(s.overdue).toBe(false)
  })

  it('catches up two late months with two payments', () => {
    const s = matchInstallments(15, [d(7, 14), d(9, 25), d(9, 26)], d(9, 27))
    expect(ymd(s.nextDue)).toBe('10/15')
    expect(s.overdue).toBe(false)
  })
})

describe('a missed installment, through the page and the forecast', () => {
  const loan = { name: 'Car Loan', type: 'loan', balance: -100000, minimumPayment: 8884.88, interestRate: 1, dueDate: 15 }
  const aug = [{ type: 'transfer', fromAccount: 'BPI', toAccount: 'Car Loan', amount: 7884.88, date: new Date(2026, 7, 14).toISOString() }]
  const NOW = new Date(2026, 8, 20, 12)   // Sep 20: September's was not paid

  it('says the loan is overdue on its page', () => {
    const s = loanStatus(loan, aug, NOW)
    expect(s.overdue).toBe(true)
    expect(s.nextDue.getDate()).toBe(15)
    expect(s.nextDue.getMonth()).toBe(8)
  })

  it('lists the missed one once, overdue, then carries on from next month', () => {
    const list = upcomingLoanPayments(loan, aug, NOW, new Date(2026, 10, 30))
    expect(list.map(p => [p.date.getMonth() + 1, p.date.getDate(), p.overdue])).toEqual([
      [9, 15, true], [10, 15, false], [11, 15, false],
    ])
  })
})

/**
 * Found in review: deleting "Loan payment" from Transactions left its
 * interest behind, still counted as spending and still out of the account.
 */
describe('the two rows of one loan payment', () => {
  const at = '2026-09-28T02:00:00.000Z'
  const principal = { id: 1, type: 'transfer', amount: 9070, fromAccount: 'BPI', toAccount: 'Car Loan', description: 'Loan payment · Car Loan', date: at }
  const interest = { id: 2, type: 'expense', amount: 3780, account: 'BPI', category: LOAN_INTEREST, description: 'Interest · Car Loan', date: at }
  const lunch = { id: 3, type: 'expense', amount: 200, account: 'BPI', category: 'Food', description: 'Lunch', date: at }

  it('finds each half from the other', () => {
    const all = [principal, interest, lunch]
    expect(loanPairOf(principal, all)).toBe(interest)
    expect(loanPairOf(interest, all)).toBe(principal)
  })

  it('ties only rows written together, from the same account', () => {
    const later = { ...interest, id: 4, date: '2026-10-28T02:00:00.000Z' }
    const otherAccount = { ...interest, id: 5, account: 'GCash' }
    expect(loanPairOf(principal, [principal, later, otherAccount])).toBeNull()
  })

  it('leaves every other row alone', () => {
    expect(loanPairOf(lunch, [principal, interest, lunch])).toBeNull()
    const plainTransfer = { ...principal, id: 6, description: 'Top up' }
    expect(loanPairOf(plainTransfer, [plainTransfer, interest])).toBeNull()
  })
})
