import { describe, it, expect } from 'vitest'
import {
  isRefund, isSplit, amountDisplay, netOf, refundedAmount,
  refundableAmount, splitGroup, splitTotal,
} from './txMoney'

/**
 * The semantics every screen reads refunds and splits through.
 *
 * The decision worth guarding is that a refund is an EXPENSE with a negative
 * amount. That is what lets 45 existing sum-by-category call sites stay right
 * without being told refunds exist - so the tests that matter most here are
 * the ones proving the sign convention holds, and that display never shows a
 * double negative.
 */

const purchase = { txId: 'a', type: 'expense', amount: 2400, category: 'Groceries', account: 'Card' }

/** @param {number} amount @param {string} [of] */
const refund = (amount, of = 'a') => ({
  txId: `r-${amount}`, type: 'expense', amount: -amount, refundOf: of,
  category: 'Groceries', account: 'Card',
})

describe('isRefund', () => {
  it('recognises one by its link, and by its sign alone', () => {
    expect(isRefund(refund(500))).toBe(true)
    // No refundOf - a bare negative expense, which an import could produce.
    expect(isRefund({ type: 'expense', amount: -20 })).toBe(true)
  })

  it('leaves ordinary rows alone', () => {
    expect(isRefund(purchase)).toBe(false)
    expect(isRefund({ type: 'inflow', amount: 500 })).toBe(false)
    expect(isRefund({ type: 'transfer', amount: 500 })).toBe(false)
    expect(isRefund(null)).toBe(false)
  })
})

describe('amountDisplay', () => {
  /**
   * The whole reason display is centralised. A refund is stored at -500, and
   * the expense branch renders `−{amount}` - which without this would print
   * "−₱-500.00" on four different screens.
   */
  it('shows a refund as a positive gain, never a double negative', () => {
    const d = amountDisplay(refund(500))
    expect(d.sign).toBe('+')
    expect(d.magnitude).toBe(500)
    expect(d.tone).toBe('refund')
  })

  it('keeps the ordinary signs', () => {
    expect(amountDisplay(purchase).sign).toBe('−')
    expect(amountDisplay({ type: 'inflow', amount: 100 }).sign).toBe('+')
    expect(amountDisplay({ type: 'transfer', amount: 100 }).sign).toBe('')
  })

  /** An account page shows one side of a transfer, so the sign is relative. */
  it('signs a transfer by the side being looked at', () => {
    const t = { type: 'transfer', amount: 100, fromAccount: 'Wallet', toAccount: 'Card' }
    expect(amountDisplay(t, { account: 'Wallet' }).sign).toBe('−')
    expect(amountDisplay(t, { account: 'Card' }).sign).toBe('+')
    expect(amountDisplay(t).sign).toBe('')
  })
})

describe('netOf', () => {
  it('is the full amount when nothing came back', () => {
    expect(netOf(purchase, [purchase])).toBe(2400)
  })

  it('nets a partial refund', () => {
    expect(netOf(purchase, [purchase, refund(500)])).toBe(1900)
  })

  it('nets two partials together', () => {
    expect(netOf(purchase, [purchase, refund(500), refund(400)])).toBe(1500)
  })

  it('ignores refunds belonging to a different purchase', () => {
    expect(netOf(purchase, [purchase, refund(500, 'somewhere-else')])).toBe(2400)
  })

  /** Rows predating txId cannot be refunded, and must not match every refund. */
  it('returns the amount for a row with no txId rather than matching on undefined', () => {
    const old = { type: 'expense', amount: 300 }
    expect(netOf(old, [old, { type: 'expense', amount: -50, refundOf: undefined }])).toBe(300)
  })
})

describe('refundedAmount and refundableAmount', () => {
  it('report what came back and what is left', () => {
    const all = [purchase, refund(500)]
    expect(refundedAmount(purchase, all)).toBe(500)
    expect(refundableAmount(purchase, all)).toBe(1900)
  })

  /**
   * An over-refund is storable - a shop can hand back more than you paid, and
   * more usefully, two people can settle a shared bill generously. The honest
   * response is to stop offering more, not to offer a negative allowance.
   */
  it('clamps the remaining allowance at zero rather than going negative', () => {
    const all = [purchase, refund(3000)]
    expect(netOf(purchase, all)).toBe(-600)
    expect(refundableAmount(purchase, all)).toBe(0)
  })
})

describe('splits', () => {
  const a = { txId: 'x1', splitId: 's', type: 'expense', amount: 2400, category: 'Groceries', date: '2026-09-01T02:00:00Z' }
  const b = { txId: 'x2', splitId: 's', type: 'expense', amount: 800, category: 'Household', date: '2026-09-01T02:00:00Z' }
  const other = { txId: 'x3', type: 'expense', amount: 99, date: '2026-09-02T02:00:00Z' }

  it('groups the legs and leaves everything else out', () => {
    expect(splitGroup(a, [a, b, other]).map(t => t.txId)).toEqual(['x1', 'x2'])
    expect(splitTotal(a, [a, b, other])).toBe(3200)
  })

  it('treats an ordinary row as a group of one, so callers need no branch', () => {
    expect(splitGroup(other, [a, b, other])).toEqual([other])
    expect(splitTotal(other, [a, b, other])).toBe(99)
    expect(isSplit(other)).toBe(false)
  })
})
