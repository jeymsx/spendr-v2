import { describe, expect, it } from 'vitest'
import { buildNetWorthTrend, debtsNetAt, netWorthMoves } from './trend'

const face = (/** @type {any} */ t) => t.amount ?? 0
const d = (/** @type {number} */ day) => new Date(2026, 8, day, 12).toISOString()
const sum = (/** @type {Array<{delta: number}>} */ m) => m.reduce((s, x) => s + x.delta, 0)

describe('net worth movements with debts counted', () => {
  it('moves on the day you borrow, and holds still when you pay it back', () => {
    const debt = { id: 1, syncId: 'd1', type: 'i_owe', amount: 1000, amountPaid: 400, createdAt: d(1) }
    const payment = { type: 'expense', account: 'BPI', amount: 400, category: 'Debt Payment', date: d(5),
      settles: [{ syncId: 'd1', id: 1, delta: 400 }] }
    const moves = netWorthMoves({ txs: [payment], debts: [debt], includeDebts: true, priceOf: face })
    // Opening the debt is -1,000; the payment is -400 + 400 settled = 0.
    expect(moves).toEqual([{ t: Date.parse(d(1)), delta: -1000 }])
  })

  it('without debts counted, the repayment is spending as it always was', () => {
    const payment = { type: 'expense', account: 'BPI', amount: 400, category: 'Debt Payment', date: d(5) }
    expect(sum(netWorthMoves({ txs: [payment], debts: [], includeDebts: false, priceOf: face }))).toBe(-400)
  })

  it('an overpayment moves only by what went past the debt, which the credit it opens cancels', () => {
    const debt = { id: 1, syncId: 'd1', type: 'i_owe', amount: 1000, amountPaid: 1000, createdAt: d(1) }
    const credit = { id: 2, syncId: 'd2', type: 'owed_to_me', amount: 500, amountPaid: 0, createdAt: d(6) }
    const pay = { type: 'expense', account: 'BPI', amount: 1500, category: 'Debt Payment', date: d(6),
      settles: [{ syncId: 'd1', id: 1, delta: 1000 }] }
    const moves = netWorthMoves({ txs: [pay], debts: [debt, credit], includeDebts: true, priceOf: face })
    // -1000 at borrowing; on the 6th: -1500 + 1000 settled, and +500 credit = 0.
    expect(sum(moves.filter(m => m.t >= Date.parse(d(6))))).toBe(0)
    expect(sum(moves)).toBe(-1000)
  })

  it('a payment made when nothing was owed settles nothing', () => {
    const credit = { id: 2, syncId: 'd2', type: 'owed_to_me', amount: 500, amountPaid: 0, createdAt: d(6) }
    const pay = { type: 'expense', account: 'BPI', amount: 500, category: 'Debt Payment', date: d(6), settles: /** @type {any[]} */ ([]) }
    expect(sum(netWorthMoves({ txs: [pay], debts: [credit], includeDebts: true, priceOf: face }))).toBe(0)
  })

  it('a shared bill is only your share, and the friend paying you back holds it still', () => {
    const dinner = { type: 'expense', account: 'BPI', amount: 3000, category: 'Food', date: d(2), txId: 'dinner' }
    const recv = { id: 3, syncId: 'd3', type: 'owed_to_me', amount: 2000, amountPaid: 2000, createdAt: d(2) }
    const back = { type: 'expense', account: 'BPI', amount: -2000, refundOf: 'dinner', date: d(9),
      settles: [{ syncId: 'd3', id: 3, delta: 2000 }] }
    const moves = netWorthMoves({ txs: [dinner, back], debts: [recv], includeDebts: true, priceOf: face })
    expect(sum(moves)).toBe(-1000)
    expect(sum(moves.filter(m => m.t >= Date.parse(d(9))))).toBe(0)
  })

  it('works out what people owed you at an earlier moment', () => {
    const lent = { id: 1, syncId: 'a', type: 'owed_to_me', amount: 1000, amountPaid: 1000, createdAt: d(1) }
    const back = { type: 'inflow', account: 'BPI', amount: 1000, category: 'Debt Collection', date: d(20) }
    expect(debtsNetAt({ debts: [lent], txs: [back], at: Date.parse(d(10)), priceOf: face })).toBe(1000)
    expect(debtsNetAt({ debts: [lent], txs: [back], at: Date.parse(d(25)), priceOf: face })).toBe(0)
  })

  it('draws the line so today stays anchored and the past does not shift by what is owed', () => {
    const debt = { id: 1, syncId: 'd1', type: 'i_owe', amount: 1000, amountPaid: 0, createdAt: d(15) }
    const range = { span: 30 * 864e5, points: 31 }
    const now = Date.parse(d(28))
    const line = buildNetWorthTrend({ txs: [], debts: [debt], includeDebts: true, current: 9000, range, priceOf: face, now })
    expect(line.at(-1).value).toBe(9000)
    expect(line[0].value).toBe(10000)
  })
})
