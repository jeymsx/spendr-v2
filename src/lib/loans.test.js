import { describe, expect, it } from 'vitest'
import { dueOn, loanStatus, monthsToClear, solveMonthlyRate, splitPayment, upcomingLoanPayments } from './loans'

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
