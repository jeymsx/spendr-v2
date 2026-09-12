import { describe, it, expect } from 'vitest'
import { getCycleRange, getNextCycleRange, getCreditStatus, nextDueDate } from './creditCycle'

/* Local dates throughout: the cycle boundaries are built with `new Date(y, m, d)`,
   so comparing them against UTC strings is how you get an off-by-one. */
/** @param {number} y @param {number} m @param {number} d @param {number} [h] */
const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h, 0)
/** @param {Date} date */
const ymd = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
/** @param {{cycleStart: Date, cycleEnd: Date}} r */
const span = (r) => `${ymd(r.cycleStart)} .. ${ymd(r.cycleEnd)}`
/** @param {{cycleStart: Date, cycleEnd: Date}} r */
const days = (r) => Math.round((r.cycleEnd.getTime() - r.cycleStart.getTime()) / 86400000)

describe('getCycleRange — a cutoff day is set', () => {
  it('after the cutoff, the closed cycle is last month to this one', () => {
    // cutoff 15, today May 21 -> Apr 15 .. May 14, per the docstring
    expect(span(getCycleRange(15, at(2026, 5, 21)))).toBe('2026-04-15 .. 2026-05-14')
  })

  it('before the cutoff, the closed cycle is a month earlier again', () => {
    expect(span(getCycleRange(15, at(2026, 5, 10)))).toBe('2026-03-15 .. 2026-04-14')
  })

  it('on the cutoff day itself, the new cycle has started', () => {
    expect(span(getCycleRange(15, at(2026, 5, 15)))).toBe('2026-04-15 .. 2026-05-14')
  })

  it('crosses the new year', () => {
    expect(span(getCycleRange(15, at(2026, 1, 20)))).toBe('2025-12-15 .. 2026-01-14')
    expect(span(getCycleRange(15, at(2026, 1, 5)))).toBe('2025-11-15 .. 2025-12-14')
  })

  it('clamps a cutoff day the month does not have', () => {
    // 31 in February: the cycle can only start on the 28th.
    expect(span(getCycleRange(31, at(2026, 3, 1)))).toBe('2026-01-31 .. 2026-02-27')
  })

  it('ends at the last moment of the day, so a late charge still counts', () => {
    const { cycleEnd } = getCycleRange(15, at(2026, 5, 21))
    expect(cycleEnd.getHours()).toBe(23)
    expect(cycleEnd.getMinutes()).toBe(59)
  })
})

describe('getNextCycleRange — a cutoff day is set', () => {
  it('picks up the day after the closed cycle ends', () => {
    expect(span(getNextCycleRange(15, at(2026, 5, 21)))).toBe('2026-05-15 .. 2026-06-14')
  })

  it('is contiguous with the closed cycle, never overlapping it', () => {
    for (let m = 1; m <= 12; m++) {
      const ref = at(2026, m, 11)
      const closed = getCycleRange(15, ref)
      const open = getNextCycleRange(15, ref)
      expect(open.cycleStart.getTime()).toBeGreaterThan(closed.cycleEnd.getTime())
      expect(open.cycleStart.getTime() - closed.cycleEnd.getTime()).toBeLessThan(1000) // back to back
    }
  })
})

describe('no cutoff day — bills by calendar month', () => {
  it('the closed cycle is LAST month, because this one has not closed', () => {
    expect(span(getCycleRange(null, at(2026, 9, 11)))).toBe('2026-08-01 .. 2026-08-31')
  })

  it('the open cycle is the month we are in', () => {
    expect(span(getNextCycleRange(null, at(2026, 9, 11)))).toBe('2026-09-01 .. 2026-09-30')
  })

  it('crosses the new year backwards', () => {
    expect(span(getCycleRange(null, at(2026, 1, 11)))).toBe('2025-12-01 .. 2025-12-31')
    expect(span(getNextCycleRange(null, at(2026, 1, 11)))).toBe('2026-01-01 .. 2026-01-31')
  })

  it('handles February', () => {
    expect(span(getCycleRange(null, at(2026, 3, 5)))).toBe('2026-02-01 .. 2026-02-28')
    expect(span(getNextCycleRange(null, at(2027, 3, 5)))).toBe('2027-03-01 .. 2027-03-31')
  })

  it('is never longer than a month, in any month of the year', () => {
    // Regression: the open cycle used to start next month and end on a day
    // number borrowed from the month before it, producing 56-62 day windows.
    for (let m = 1; m <= 12; m++) {
      const open = getNextCycleRange(null, at(2026, m, 11))
      expect(days(open)).toBeLessThanOrEqual(31)
      expect(open.cycleStart.getMonth()).toBe(m - 1)
      expect(open.cycleEnd.getMonth()).toBe(m - 1)
    }
  })

  it('leaves no month unbilled between the closed and open cycles', () => {
    for (let m = 1; m <= 12; m++) {
      const ref = at(2026, m, 11)
      const closed = getCycleRange(null, ref)
      const open = getNextCycleRange(null, ref)
      expect(open.cycleStart.getTime() - closed.cycleEnd.getTime()).toBeLessThan(1000)
    }
  })
})

describe('getCreditStatus — an installment plan', () => {
  // Three monthly amortisations written up front, the way the app records a
  // plan: one charge per month, each on the purchase's day of month.
  const acct = { name: 'SPayLater', type: 'credit', creditLimit: 10000, cutoffDate: 15 }
  const plan = [
    { type: 'expense', account: 'SPayLater', date: new Date(2026, 7, 28, 21, 37).toISOString(), amount: 2500 },
    { type: 'expense', account: 'SPayLater', date: new Date(2026, 8, 28, 21, 37).toISOString(), amount: 2500 },
    { type: 'expense', account: 'SPayLater', date: new Date(2026, 9, 28, 21, 37).toISOString(), amount: 2500 },
  ]
  const s = getCreditStatus(acct, plan, at(2026, 9, 11))

  it('bills exactly one month on the next statement', () => {
    expect(s.nextStatementTotal).toBe(2500)
    expect(s.nextStatementCharges).toHaveLength(1)
  })

  it('holds the rest back for later bills rather than hiding them', () => {
    expect(s.laterTotal).toBe(5000)
    expect(s.laterCharges).toHaveLength(2)
  })

  it('locks the whole plan against the limit today', () => {
    expect(s.currentBalance).toBe(7500)
    expect(s.availableCredit).toBe(2500)
  })

  it('keeps nextTotal as the sum of the two halves', () => {
    expect(s.nextTotal).toBe(s.nextStatementTotal + s.laterTotal)
  })

  it('counts nothing on the statement that already closed', () => {
    expect(s.thisTotal).toBe(0)
  })

  it('does not lose a charge when the account has no cutoff day', () => {
    // Regression: with no cutoff the closed cycle was the CURRENT month, so
    // August's amortisation fell before cycleStart and was written off as
    // settled - the card reported 5000 outstanding against a 7500 plan.
    const noCutoff = getCreditStatus({ ...acct, cutoffDate: null }, plan, at(2026, 9, 11))
    expect(noCutoff.currentBalance).toBe(7500)
    expect(noCutoff.availableCredit).toBe(2500)
  })

  it('splits the plan across bills the same way with no cutoff day', () => {
    const noCutoff = getCreditStatus({ ...acct, cutoffDate: null }, plan, at(2026, 9, 11))
    expect(noCutoff.thisTotal).toBe(2500)          // August's, now closed
    expect(noCutoff.nextStatementTotal).toBe(2500) // September's, accumulating
    expect(noCutoff.laterTotal).toBe(2500)         // October's
  })
})

describe('getCreditStatus — payments', () => {
  const acct = { name: 'Card', type: 'credit', creditLimit: 50000, cutoffDate: 15 }
  /** @param {number} m @param {number} d @param {number} amount */
  const charge = (m, d, amount) =>
    ({ type: 'expense', account: 'Card', date: new Date(2026, m - 1, d, 12).toISOString(), amount })
  /** @param {number} m @param {number} d @param {number} amount */
  const payment = (m, d, amount) =>
    ({ type: 'transfer', fromAccount: 'Cash', toAccount: 'Card', date: new Date(2026, m - 1, d, 12).toISOString(), amount })

  it('a payment after the cutoff settles the closed statement', () => {
    const s = getCreditStatus(acct, [charge(4, 20, 3000), payment(5, 20, 3000)], at(2026, 5, 21))
    expect(s.thisTotal).toBe(3000)
    expect(s.totalPayments).toBe(3000)
    expect(s.stmtPaid).toBe(true)
    expect(s.currentBalance).toBe(0)
  })

  /**
   * Rewritten when the balance learned to carry.
   *
   * This used to assert that a payment made before the cutoff was worth
   * NOTHING - totalPayments 0, still ₱3,000 owed - on the reasoning that the
   * money had gone to the previous statement. The reasoning is sound and the
   * fixture did not support it: there was no previous statement in it, so the
   * old code simply threw a ₱3,000 payment away and reported ₱3,000 owed by
   * someone who had just handed over ₱3,000.
   *
   * So the fixture gets the earlier bill its comment assumed, and the
   * assertion becomes the thing actually worth protecting: a payment settles
   * exactly one statement's worth of debt and is not double-counted against a
   * later one.
   */
  it('a payment before the cutoff settles the earlier statement, not this one', () => {
    const txs = [
      charge(3, 20, 3000),   // billed on the Mar 15 - Apr 14 statement
      payment(5, 10, 3000),  // paid before the May 15 cutoff: settles that one
      charge(4, 20, 3000),   // billed on the Apr 15 - May 14 statement
    ]
    const s = getCreditStatus(acct, txs, at(2026, 5, 21))
    expect(s.thisTotal).toBe(3000)        // this statement asked for 3,000
    expect(s.billedTotal).toBe(6000)      // 6,000 has been billed in total
    expect(s.paidTotal).toBe(3000)        // and 3,000 of it paid
    expect(s.stmtPaid).toBe(false)        // so this statement is still open
    expect(s.currentBalance).toBe(3000)
  })

  /**
   * The bug the carried balance exists for.
   *
   * A statement you never pay used to VANISH at the next cutoff: its charges
   * fell outside the new cycle window, so the card reported nothing owed and
   * handed back the full credit limit.
   */
  it('an unpaid statement survives the next cutoff, and the one after', () => {
    const txs = [charge(4, 20, 10000)]
    for (const [m, d] of [[5, 21], [6, 21], [7, 21]]) {
      const s = getCreditStatus(acct, txs, at(2026, m, d))
      expect(s.currentBalance).toBe(10000)
      expect(s.availableCredit).toBe(40000)
    }
  })

  it('a shortfall survives too, rather than being forgiven at the cutoff', () => {
    const txs = [charge(4, 20, 10000), payment(5, 20, 3000)]
    expect(getCreditStatus(acct, txs, at(2026, 5, 21)).currentBalance).toBe(7000)
    expect(getCreditStatus(acct, txs, at(2026, 6, 21)).currentBalance).toBe(7000)
  })

  /**
   * An overpayment is a credit sitting on the card. It has to survive into the
   * next cycle and offset new charges - throwing it away would bill you twice
   * for money the bank is already holding.
   */
  it('carries an overpayment forward as a credit', () => {
    const over = [charge(4, 20, 1000), payment(5, 20, 5000)]
    const s1 = getCreditStatus(acct, over, at(2026, 5, 21))
    expect(s1.carried).toBe(-4000)        // the card owes you
    expect(s1.currentBalance).toBe(0)     // never shown as a negative debt

    const s2 = getCreditStatus(acct, [...over, charge(5, 25, 2000)], at(2026, 6, 21))
    expect(s2.currentBalance).toBe(0)     // 4,000 credit absorbs 2,000 of charges
    expect(s2.carried).toBe(-2000)
  })

  it('a part payment leaves the remainder outstanding', () => {
    const s = getCreditStatus(acct, [charge(4, 20, 3000), payment(5, 20, 1000)], at(2026, 5, 21))
    expect(s.stmtPaid).toBe(false)
    expect(s.currentBalance).toBe(2000)
  })

  it('an inflow straight onto the card counts as a payment', () => {
    const refund = { type: 'inflow', account: 'Card', date: new Date(2026, 4, 20, 12).toISOString(), amount: 3000 }
    const s = getCreditStatus(acct, [charge(4, 20, 3000), refund], at(2026, 5, 21))
    expect(s.stmtPaid).toBe(true)
  })

  it('ignores other accounts entirely', () => {
    const other = { type: 'expense', account: 'GCash', date: new Date(2026, 3, 20, 12).toISOString(), amount: 9999 }
    const s = getCreditStatus(acct, [charge(4, 20, 3000), other], at(2026, 5, 21))
    expect(s.thisTotal).toBe(3000)
  })

  it('survives an empty ledger', () => {
    const s = getCreditStatus(acct, [], at(2026, 5, 21))
    expect(s.thisTotal).toBe(0)
    expect(s.currentBalance).toBe(0)
    expect(s.availableCredit).toBe(50000)
  })
})

describe('getCreditStatus - a statement that billed nothing', () => {
  const acct = { name: 'Card', type: 'credit', creditLimit: 50000, cutoffDate: 15, minimumPayment: 200 }
  /** @param {number} m @param {number} d @param {number} amount */
  const charge = (m, d, amount) =>
    ({ type: 'expense', account: 'Card', date: new Date(2026, m - 1, d, 12).toISOString(), amount })

  // Nothing inside Apr 15 - May 14; the charge lands on the cycle after.
  const noBill = getCreditStatus(acct, [charge(5, 20, 2500)], at(2026, 5, 21))

  it('is not "paid" - nobody asked for anything', () => {
    expect(noBill.thisTotal).toBe(0)
    expect(noBill.hasStatement).toBe(false)
    expect(noBill.stmtPaid).toBe(false)
  })

  it('asks for no minimum', () => {
    expect(noBill.minimumDue).toBe(0)
  })

  it('still locks the charge against the limit', () => {
    // The guard that matters: separating "billed" from "settled" must not
    // move a single peso of the balance.
    expect(noBill.currentBalance).toBe(2500)
    expect(noBill.availableCredit).toBe(47500)
  })

  it('an empty ledger is not a paid statement either', () => {
    const empty = getCreditStatus(acct, [], at(2026, 5, 21))
    expect(empty.hasStatement).toBe(false)
    expect(empty.stmtPaid).toBe(false)
    expect(empty.minimumDue).toBe(0)
    expect(empty.currentBalance).toBe(0)
  })
})

describe('getCreditStatus - minimumDue', () => {
  const acct = { name: 'Card', type: 'credit', creditLimit: 50000, cutoffDate: 15, minimumPayment: 200 }
  /** @param {number} m @param {number} d @param {number} amount */
  const charge = (m, d, amount) =>
    ({ type: 'expense', account: 'Card', date: new Date(2026, m - 1, d, 12).toISOString(), amount })
  /** @param {number} m @param {number} d @param {number} amount */
  const payment = (m, d, amount) =>
    ({ type: 'transfer', fromAccount: 'Cash', toAccount: 'Card', date: new Date(2026, m - 1, d, 12).toISOString(), amount })
  /** @param {any[]} txs */
  const on = (txs) => getCreditStatus(acct, txs, at(2026, 5, 21))

  it('is the account minimum while the statement is unpaid', () => {
    expect(on([charge(4, 20, 3000)]).minimumDue).toBe(200)
  })

  it('drops to nothing once the statement is settled', () => {
    expect(on([charge(4, 20, 3000), payment(5, 20, 3000)]).minimumDue).toBe(0)
  })

  it('shrinks to what is left when a part payment covers most of it', () => {
    // 100 still owed, so asking for the full 200 minimum would overstate it.
    expect(on([charge(4, 20, 3000), payment(5, 20, 2900)]).minimumDue).toBe(100)
  })

  it('is the full minimum when a part payment leaves more than it', () => {
    expect(on([charge(4, 20, 3000), payment(5, 20, 1000)]).minimumDue).toBe(200)
  })

  it('never exceeds a statement smaller than the minimum', () => {
    expect(on([charge(4, 20, 150)]).minimumDue).toBe(150)
  })

  it('is zero when the account has no minimum set', () => {
    const noMin = getCreditStatus({ ...acct, minimumPayment: null }, [charge(4, 20, 3000)], at(2026, 5, 21))
    expect(noMin.minimumDue).toBe(0)
  })

  it('tracks stmtOutstanding, which is what it is capped by', () => {
    expect(on([charge(4, 20, 3000), payment(5, 20, 1000)]).stmtOutstanding).toBe(2000)
    expect(on([charge(4, 20, 3000), payment(5, 20, 5000)]).stmtOutstanding).toBe(0)
  })
})

describe('nextDueDate', () => {
  it('rolls to next month once the day has passed', () => {
    expect(ymd(nextDueDate(10, at(2026, 5, 21)))).toBe('2026-06-10')
  })

  it('treats today as passed', () => {
    expect(ymd(nextDueDate(21, at(2026, 5, 21)))).toBe('2026-06-21')
  })

  it('returns null for a day that is not a day', () => {
    expect(nextDueDate(0)).toBeNull()
    expect(nextDueDate(32)).toBeNull()
    expect(nextDueDate(null)).toBeNull()
  })
})
