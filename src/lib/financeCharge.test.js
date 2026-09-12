import { describe, it, expect } from 'vitest'
import {
  estimateFinanceCharge, financeChargeRow, financeChargeLogged,
  FINANCE_CHARGE_CATEGORY,
} from './financeCharge'

const card = (over = {}) => ({ name: 'Card', type: 'credit', interestRate: 3, lateFee: 500, ...over })

describe('estimateFinanceCharge', () => {
  it('charges nothing before the due date has passed', () => {
    const e = estimateFinanceCharge({ account: card(), outstanding: 10000, minimumDue: 500, daysLate: -3 })
    expect(e.isLate).toBe(false)
    expect(e.total).toBe(0)
  })

  it('charges nothing when the statement is settled, however late', () => {
    const e = estimateFinanceCharge({ account: card(), outstanding: 0, minimumDue: 0, daysLate: 30 })
    expect(e.isLate).toBe(false)
    expect(e.total).toBe(0)
  })

  it('applies the monthly rate to what is still owed', () => {
    const e = estimateFinanceCharge({ account: card(), outstanding: 10000, minimumDue: 500, daysLate: 5 })
    expect(e.interest).toBe(300)   // 3% of 10,000
    expect(e.lateFee).toBe(500)
    expect(e.total).toBe(800)
  })

  /**
   * No PH issuer charges a ₱500 late fee against a ₱300 minimum - the fee is
   * punishing you for missing that minimum, so it cannot exceed it.
   */
  it('caps the late fee at the minimum it is punishing', () => {
    const e = estimateFinanceCharge({ account: card(), outstanding: 300, minimumDue: 300, daysLate: 5 })
    expect(e.lateFee).toBe(300)
  })

  it('applies the rate once, not compounded per month late', () => {
    const a = estimateFinanceCharge({ account: card(), outstanding: 10000, minimumDue: 500, daysLate: 5 })
    const b = estimateFinanceCharge({ account: card(), outstanding: 10000, minimumDue: 500, daysLate: 95 })
    expect(a.interest).toBe(b.interest)
  })

  /**
   * A card with no rate and no fee configured cannot be estimated for. Saying
   * so is the point - a confident ₱0.00 would read as "no interest due".
   */
  it('reports that it cannot estimate when the card carries neither figure', () => {
    const e = estimateFinanceCharge({ account: card({ interestRate: 0, lateFee: 0 }), outstanding: 10000, minimumDue: 500, daysLate: 5 })
    expect(e.canEstimate).toBe(false)
    expect(e.total).toBe(0)
    expect(e.isLate).toBe(true)   // still late, just not quantifiable
  })

  it('estimates from a rate alone, or a fee alone', () => {
    const rateOnly = estimateFinanceCharge({ account: card({ lateFee: 0 }), outstanding: 10000, minimumDue: 500, daysLate: 5 })
    expect(rateOnly.total).toBe(300)
    const feeOnly = estimateFinanceCharge({ account: card({ interestRate: 0 }), outstanding: 10000, minimumDue: 500, daysLate: 5 })
    expect(feeOnly.total).toBe(500)
  })

  it('rounds to centavos', () => {
    const e = estimateFinanceCharge({ account: card({ interestRate: 3.5, lateFee: 0 }), outstanding: 1234.56, minimumDue: 100, daysLate: 1 })
    expect(e.interest).toBe(43.21)
  })

  it('treats a missing daysLate as not late', () => {
    const e = estimateFinanceCharge({ account: card(), outstanding: 10000, minimumDue: 500, daysLate: null })
    expect(e.isLate).toBe(false)
  })
})

describe('financeChargeRow', () => {
  const now = new Date('2026-09-13T10:00:00Z')

  it('is an ordinary expense on the card, which is what the bank posts', () => {
    const r = financeChargeRow({ accountName: 'Maya Credit', amount: 800, now })
    expect(r.type).toBe('expense')
    expect(r.account).toBe('Maya Credit')
    expect(r.amount).toBe(800)
    expect(r.category).toBe(FINANCE_CHARGE_CATEGORY)
  })

  /**
   * Dated now, not back-dated to the due date. The bank posts it when it posts
   * it, and back-dating would drop it into a statement that has already closed
   * - where it would raise a balance you may have just paid.
   */
  it('is dated now rather than back-dated into a closed statement', () => {
    const r = financeChargeRow({ accountName: 'Card', amount: 100, now })
    expect(r.date).toBe(now.toISOString())
  })

  it('takes a description, and has a sensible default', () => {
    expect(financeChargeRow({ accountName: 'Card', amount: 1, now }).description).toBe('Finance charge')
    expect(financeChargeRow({ accountName: 'Card', amount: 1, description: 'Late fee', now }).description).toBe('Late fee')
  })

  it('rounds the amount it writes', () => {
    expect(financeChargeRow({ accountName: 'Card', amount: 43.2149, now }).amount).toBe(43.21)
  })
})

describe('financeChargeLogged', () => {
  const due = new Date(2026, 8, 5)
  /** @param {Date} d @param {Record<string, any>} [over] */
  const chargeOn = (d, over = {}) => ({
    type: 'expense', account: 'Card', category: FINANCE_CHARGE_CATEGORY,
    amount: 635, date: d.toISOString(), ...over,
  })

  /**
   * The bug this exists for: logging a charge raises the outstanding balance,
   * which keeps the statement late and makes the next estimate LARGER. Four
   * taps wrote four charges, each bigger than the last.
   */
  it('is true once one has been logged since the due date', () => {
    const txs = [chargeOn(new Date(2026, 8, 13))]
    expect(financeChargeLogged({ transactions: txs, accountName: 'Card', since: due })).toBe(true)
  })

  it('is false before anything has been logged', () => {
    expect(financeChargeLogged({ transactions: [], accountName: 'Card', since: due })).toBe(false)
  })

  it('ignores one logged for an EARLIER statement', () => {
    const txs = [chargeOn(new Date(2026, 7, 13))]
    expect(financeChargeLogged({ transactions: txs, accountName: 'Card', since: due })).toBe(false)
  })

  it('ignores one on another card', () => {
    const txs = [chargeOn(new Date(2026, 8, 13), { account: 'Other' })]
    expect(financeChargeLogged({ transactions: txs, accountName: 'Card', since: due })).toBe(false)
  })

  it('ignores an ordinary purchase, however recent', () => {
    const txs = [chargeOn(new Date(2026, 8, 13), { category: 'Food' })]
    expect(financeChargeLogged({ transactions: txs, accountName: 'Card', since: due })).toBe(false)
  })

  /** No due date means no statement period to scope the question to. */
  it('is false when there is no due date to measure from', () => {
    const txs = [chargeOn(new Date(2026, 8, 13))]
    expect(financeChargeLogged({ transactions: txs, accountName: 'Card', since: null })).toBe(false)
  })
})
