import { describe, it, expect } from 'vitest'
import { creditStatements } from './creditStatements'
import { getCreditStatus } from '../utils/creditCycle'

/**
 * A card's statements, one by one: what each asked for, what paid it, and
 * whether anything was left. The page that lists them is the only place an
 * old statement can still be read, so a statement that says "Paid" must have
 * been paid.
 */

/** @param {Record<string, any>} [over] @returns {any} */
const card = (over = {}) => ({
  name: 'Card', type: 'credit', creditLimit: 50000,
  cutoffDate: 15, dueDate: 5, minimumPayment: 500, ...over,
})
/** @param {number} m @param {number} d @param {number} amount @param {number} [y] */
const charge = (m, d, amount, y = 2026) =>
  ({ type: 'expense', account: 'Card', amount, date: new Date(y, m - 1, d, 12).toISOString() })
/** @param {number} m @param {number} d @param {number} amount @param {number} [y] */
const pay = (m, d, amount, y = 2026) =>
  ({ type: 'transfer', fromAccount: 'BPI', toAccount: 'Card', amount, date: new Date(y, m - 1, d, 12).toISOString() })
/** @param {number} m @param {number} d */
const at = (m, d) => new Date(2026, m - 1, d, 10)
/** @param {Date|null} d */
const ymd = (d) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null)

describe('creditStatements', () => {
  it('lists each closed statement, newest first, with the payment that settled it', () => {
    const txs = [
      charge(7, 20, 1000), charge(8, 1, 500),   // Jul 15 - Aug 14
      pay(8, 20, 1500),
      charge(8, 20, 300),                       // Aug 15 - Sep 14
      pay(9, 25, 300),
    ]
    const [aug, jul, ...rest] = creditStatements(card(), txs, at(9, 30))
    expect(rest).toHaveLength(0)

    expect(ymd(aug.cycleStart)).toEqual([2026, 8, 15])
    expect(ymd(aug.cycleEnd)).toEqual([2026, 9, 14])
    expect(ymd(aug.due)).toEqual([2026, 10, 5])
    expect(aug).toMatchObject({ total: 300, balance: 300, paid: 300, remaining: 0, status: 'paid', latest: true })
    expect(ymd(aug.paidOn)).toEqual([2026, 9, 25])
    expect(aug.charges).toHaveLength(1)
    expect(aug.payments).toHaveLength(1)

    expect(jul).toMatchObject({ total: 1500, balance: 1500, paid: 1500, remaining: 0, status: 'paid', latest: false })
    expect(ymd(jul.paidOn)).toEqual([2026, 8, 20])
    // Newest first inside a statement too.
    expect(jul.charges.map(t => t.amount)).toEqual([500, 1000])
  })

  it('carries what a statement left unpaid onto the next one', () => {
    const txs = [charge(7, 20, 1000), pay(8, 20, 600), charge(8, 25, 200)]
    const [aug, jul] = creditStatements(card(), txs, at(9, 30))
    expect(jul).toMatchObject({ balance: 1000, paid: 600, remaining: 400, status: 'carried' })
    expect(aug).toMatchObject({ total: 200, carriedIn: 400, balance: 600, paid: 0, remaining: 600, status: 'due' })
  })

  it('says a statement is overdue once its due date has passed', () => {
    const txs = [charge(8, 20, 900)]
    // Oct 10: still inside the Sep 15 - Oct 14 cycle, so Aug 15 - Sep 14 is the newest closed one.
    const [aug] = creditStatements(card(), txs, at(10, 10))
    expect(ymd(aug.due)).toEqual([2026, 10, 5])
    expect(aug.status).toBe('overdue')
    expect(creditStatements(card(), txs, at(10, 4))[0].status).toBe('due')
  })

  it('skips the months nothing happened in', () => {
    const txs = [charge(1, 20, 400), pay(2, 20, 400), charge(7, 20, 250), pay(8, 20, 250)]
    const list = creditStatements(card(), txs, at(9, 30))
    expect(list.map(s => ymd(s.cycleEnd))).toEqual([[2026, 8, 14], [2026, 2, 14]])
    expect(list.map(s => s.status)).toEqual(['paid', 'paid'])
  })

  it('keeps a statement for a month with no charges while money is still owed', () => {
    const txs = [charge(7, 20, 250)]
    const list = creditStatements(card(), txs, at(9, 30))
    expect(list.map(s => ymd(s.cycleEnd))).toEqual([[2026, 9, 14], [2026, 8, 14]])
    expect(list.map(s => s.status)).toEqual(['due', 'carried'])
    expect(list[0]).toMatchObject({ total: 0, carriedIn: 250, balance: 250 })
  })

  it('keeps an overpayment as a credit that the next statement spends first', () => {
    const txs = [charge(7, 20, 1000), pay(8, 20, 1500), charge(8, 25, 300)]
    const [aug, jul] = creditStatements(card(), txs, at(9, 30))
    expect(jul).toMatchObject({ paid: 1500, remaining: -500, status: 'paid' })
    // Charged 300, and the card already held 500 of yours: nothing was asked for.
    expect(aug).toMatchObject({ total: 300, carriedIn: -500, balance: -200, status: 'none' })
  })

  it('does not list a month for a credit just sitting on the card', () => {
    const txs = [charge(5, 20, 1000), pay(6, 20, 1500)]
    const list = creditStatements(card(), txs, at(9, 30))
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ remaining: -500, status: 'paid' })
  })

  it('bills by calendar month without a cutoff day', () => {
    const txs = [charge(8, 10, 700), pay(9, 5, 700)]
    const [aug] = creditStatements(card({ cutoffDate: null, dueDate: 25 }), txs, at(9, 10))
    expect(ymd(aug.cycleStart)).toEqual([2026, 8, 1])
    expect(ymd(aug.cycleEnd)).toEqual([2026, 8, 31])
    expect(aug.status).toBe('paid')
  })

  /* A card typed with only a Statement day closes on it: statement day 14 is a
     cutoff of 15 (cutoffDayOf), so the history closes the very cycles
     getCreditStatus does - not calendar months, as it did with the bare field. */
  it('bills by the Statement day when the card has no cutoff day', () => {
    const txs = [charge(7, 20, 1000), pay(8, 20, 1000), charge(8, 20, 300), pay(9, 25, 300)]
    const stmtOnly = card({ cutoffDate: null, statementDate: 14 })
    const list = creditStatements(stmtOnly, txs, at(9, 30))
    expect(list).toEqual(creditStatements(card(), txs, at(9, 30)))
    expect(ymd(list[0].cycleStart)).toEqual([2026, 8, 15])
    expect(ymd(list[0].cycleEnd)).toEqual([2026, 9, 14])
    expect(ymd(list[0].cycleEnd)).toEqual(ymd(getCreditStatus(stmtOnly, txs, at(9, 30)).cycleEnd))
    // A cutoff day, when there is one, still wins over it.
    const both = creditStatements(card({ cutoffDate: 15, statementDate: 20 }), txs, at(9, 30))
    expect(ymd(both[0].cycleEnd)).toEqual([2026, 9, 14])
  })

  it('counts cash taken from the card as a charge and a refund onto it as a payment', () => {
    const advance = { type: 'transfer', fromAccount: 'Card', toAccount: 'Cash', amount: 2000, date: new Date(2026, 6, 20, 12).toISOString() }
    const refund = { type: 'inflow', account: 'Card', amount: 500, date: new Date(2026, 7, 18, 12).toISOString() }
    const [jul] = creditStatements(card(), [advance, refund, pay(8, 20, 1500)], at(8, 30))
    expect(jul).toMatchObject({ total: 2000, paid: 2000, remaining: 0, status: 'paid' })
  })

  it('reads a payment in another currency by what reached the card', () => {
    const fx = { ...pay(8, 20, 30), toAmount: 1680 }
    const [jul] = creditStatements(card(), [charge(7, 20, 1680), fx], at(8, 30))
    expect(jul).toMatchObject({ paid: 1680, status: 'paid' })
  })

  it('has nothing to say about a card never used, or another card', () => {
    expect(creditStatements(card(), [], at(9, 30))).toEqual([])
    expect(creditStatements(card({ name: 'Other' }), [charge(8, 20, 100)], at(9, 30))).toEqual([])
    expect(creditStatements(null, [charge(8, 20, 100)], at(9, 30))).toEqual([])
  })

  it('leaves out charges not billed yet', () => {
    // A plan's later months, written up front, are on no closed statement.
    const txs = [charge(8, 20, 100), charge(9, 20, 100), charge(10, 20, 100), charge(11, 20, 100)]
    const list = creditStatements(card(), txs, at(9, 30))
    expect(list).toHaveLength(1)
    expect(list[0].total).toBe(100)
  })

  /* The card's own page leads with getCreditStatus's figure and links to
     this list; the two must never disagree about the newest statement. */
  it('agrees with getCreditStatus about what the newest statement still wants', () => {
    const txs = [
      charge(3, 2, 1200), charge(3, 20, 800), pay(4, 1, 500), charge(4, 16, 90),
      pay(4, 30, 1500), charge(5, 9, 3000), pay(6, 3, 2000), charge(6, 20, 45),
      pay(7, 8, 900), charge(7, 30, 610), charge(8, 3, 77), pay(8, 30, 100),
      charge(9, 1, 400), charge(9, 20, 1200),
    ]
    for (const [m, d] of [[5, 1], [6, 10], [7, 20], [8, 16], [9, 14], [9, 16], [10, 3], [10, 20]]) {
      const today = at(m, d)
      const [newest] = creditStatements(card(), txs, today)
      const status = getCreditStatus(card(), txs, today)
      expect(Math.max(0, newest.remaining)).toBeCloseTo(status.stmtOutstanding, 6)
      expect(ymd(newest.cycleEnd)).toEqual(ymd(status.cycleEnd))
    }
  })
})
