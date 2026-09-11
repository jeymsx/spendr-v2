import { describe, it, expect } from 'vitest'
import { getCycleRange, getNextCycleRange, getCreditStatus, nextDueDate } from './creditCycle'

/* Local dates throughout: the cycle boundaries are built with `new Date(y, m, d)`,
   so comparing them against UTC strings is how you get an off-by-one. */
const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h, 0)
const ymd = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const span = (r) => `${ymd(r.cycleStart)} .. ${ymd(r.cycleEnd)}`
const days = (r) => Math.round((r.cycleEnd - r.cycleStart) / 86400000)

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
      expect(open.cycleStart - closed.cycleEnd).toBeLessThan(1000) // back to back
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
      expect(open.cycleStart - closed.cycleEnd).toBeLessThan(1000)
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
  const charge = (m, d, amount) =>
    ({ type: 'expense', account: 'Card', date: new Date(2026, m - 1, d, 12).toISOString(), amount })
  const payment = (m, d, amount) =>
    ({ type: 'transfer', fromAccount: 'Cash', toAccount: 'Card', date: new Date(2026, m - 1, d, 12).toISOString(), amount })

  it('a payment after the cutoff settles the closed statement', () => {
    const s = getCreditStatus(acct, [charge(4, 20, 3000), payment(5, 20, 3000)], at(2026, 5, 21))
    expect(s.thisTotal).toBe(3000)
    expect(s.totalPayments).toBe(3000)
    expect(s.stmtPaid).toBe(true)
    expect(s.currentBalance).toBe(0)
  })

  it('a payment BEFORE the cutoff was settling the previous statement', () => {
    // Paid on May 10, cutoff 15: that money went to the Mar 15 - Apr 14 bill,
    // so it must not be credited against Apr 15 - May 14.
    const s = getCreditStatus(acct, [charge(4, 20, 3000), payment(5, 10, 3000)], at(2026, 5, 21))
    expect(s.totalPayments).toBe(0)
    expect(s.stmtPaid).toBe(false)
    expect(s.currentBalance).toBe(3000)
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
