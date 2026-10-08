import { describe, it, expect } from 'vitest'
import { creditCardBills, statementDueDate, statementFor, daysToDue, upcomingDueDate } from './creditBills'
import { getCreditStatus } from '../utils/creditCycle'

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

describe('statementFor', () => {
  /** @param {Date|null} d */
  const ymd = (d) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null)
  /* SPayLater's shape: a cycle from the 26th to the 25th, due on the 5th. */
  const spay = { cutoffDate: 26, dueDate: 5 }

  it('puts a purchase on the statement running that day, due after it closes', () => {
    const s = statementFor(spay, new Date(2026, 8, 10, 12))
    expect(ymd(s.cycleStart)).toEqual([2026, 8, 26])
    expect(ymd(s.cycleEnd)).toEqual([2026, 9, 25])
    expect(ymd(s.due)).toEqual([2026, 10, 5])
  })

  /* The mistake the form's wording invited: the due date typed as the first
     payment. It is billed a statement later, and says so. */
  it('bills a payment dated on the due day a statement later', () => {
    const s = statementFor(spay, new Date(2026, 9, 5, 12))
    expect(ymd(s.cycleStart)).toEqual([2026, 9, 26])
    expect(ymd(s.due)).toEqual([2026, 11, 5])
  })

  it('starts the next statement on the cutoff day itself', () => {
    expect(ymd(statementFor(spay, new Date(2026, 8, 25, 23)).due)).toEqual([2026, 10, 5])
    expect(ymd(statementFor(spay, new Date(2026, 8, 26, 0, 5)).due)).toEqual([2026, 11, 5])
  })

  it('is due the same month when the due day comes after the close', () => {
    const s = statementFor({ cutoffDate: 6, dueDate: 25 }, new Date(2026, 8, 10, 12))
    expect(ymd(s.cycleEnd)).toEqual([2026, 10, 5])
    expect(ymd(s.due)).toEqual([2026, 10, 25])
  })

  it('reads days that arrive as text, as they do from sync', () => {
    expect(ymd(statementFor({ cutoffDate: '26', dueDate: '5' }, new Date(2026, 8, 10, 12)).due)).toEqual([2026, 10, 5])
  })

  it('bills by the Statement day when there is no cutoff day', () => {
    // Statement day 25 closes the cycle on the 25th: the same one as SPayLater's cutoff of 26.
    const s = statementFor({ statementDate: 25, dueDate: 5 }, new Date(2026, 8, 10, 12))
    expect(ymd(s.cycleStart)).toEqual([2026, 8, 26])
    expect(ymd(s.cycleEnd)).toEqual([2026, 9, 25])
    expect(ymd(s.due)).toEqual([2026, 10, 5])
  })

  it('bills by calendar month without a cutoff, and names no due date without a due day', () => {
    const s = statementFor({}, new Date(2026, 8, 10, 12))
    expect(ymd(s.cycleStart)).toEqual([2026, 9, 1])
    expect(ymd(s.cycleEnd)).toEqual([2026, 9, 30])
    expect(s.due).toBeNull()
  })
})

describe('statementDueDate', () => {
  /** @param {Date|null} d */
  const ymd = (d) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null)

  it('is next month when the due day comes before the closing day', () => {
    // Closes 14 Sep, due the 5th -> 5 Oct.
    expect(ymd(statementDueDate(new Date(2026, 8, 14), 5))).toEqual([2026, 10, 5])
  })

  /* THE bug. It always went to the following month, so this read 25 Oct - a
     month later than the card is really due, which is the direction that
     gets a card paid late. */
  it('is the SAME month when the due day comes after the closing day', () => {
    expect(ymd(statementDueDate(new Date(2026, 8, 5), 25))).toEqual([2026, 9, 25])
  })

  /* This test used to assert Feb 28 for a cycle closing 14 Jan with a due day
     of 31 - pinning the off-by-a-month as correct while claiming to test
     clamping. That card is due 31 Jan. The case below clamps for real. */
  it('is the same month for a late due day, not the one after', () => {
    expect(ymd(statementDueDate(new Date(2026, 0, 14), 31))).toEqual([2026, 1, 31])
  })

  /** A card due on the 31st still has to land somewhere in February. */
  it('clamps a day the month does not have', () => {
    // Closes 31 Jan, due the 30th: 30 is not after 31, so February - which
    // has no 30th.
    expect(ymd(statementDueDate(new Date(2026, 0, 31), 30))).toEqual([2026, 2, 28])
    // And in a leap year, the 29th.
    expect(ymd(statementDueDate(new Date(2028, 0, 31), 30))).toEqual([2028, 2, 29])
  })

  it('compares the clamped day, so it never lands on the closing day', () => {
    // Closes 28 Feb, due the 30th. Clamped into February that is the 28th -
    // the day it closed - so it has to be March.
    expect(ymd(statementDueDate(new Date(2026, 1, 28), 30))).toEqual([2026, 3, 30])
  })

  it('is next month when due on the same day it closes', () => {
    expect(ymd(statementDueDate(new Date(2026, 8, 20), 20))).toEqual([2026, 10, 20])
  })

  it('crosses the year', () => {
    expect(ymd(statementDueDate(new Date(2026, 11, 20), 10))).toEqual([2027, 1, 10])
  })

  it('is the last moment of the day, so a same-day payment is on time', () => {
    const due = statementDueDate(new Date(2026, 8, 5), 25)
    expect([due?.getHours(), due?.getMinutes()]).toEqual([23, 59])
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

describe('upcomingDueDate', () => {
  /** @param {Date|null} d */
  const ymd = (d) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null)
  const same = card({ cutoffDate: 5, dueDate: 25 })

  /* The case that was wrong: owing money on the due date itself. The next
     time the 25th comes round is October, and that is what the card said. */
  it('is the closed statement date while it still owes, even on the day', () => {
    const s = getCreditStatus(same, [charge(8, 20, 3000)], at(9, 25))
    expect(ymd(upcomingDueDate(s, 25))).toEqual([2026, 9, 25])
  })

  it('stays on that date once it has passed, because that payment is late', () => {
    const s = getCreditStatus(same, [charge(8, 20, 3000)], at(9, 28))
    expect(ymd(upcomingDueDate(s, 25))).toEqual([2026, 9, 25])
  })

  it('moves to the running statement once the closed one is paid', () => {
    const s = getCreditStatus(same, [charge(8, 20, 3000), pay(9, 10, 3000)], at(9, 25))
    expect(ymd(upcomingDueDate(s, 25))).toEqual([2026, 10, 25])
  })

  it('is nothing without a due day', () => {
    expect(upcomingDueDate(getCreditStatus(same, [], at(9, 25)), null)).toBeNull()
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
    /* All three close on the 15th. This fixture used to call the card due on
       the 28th "Later" and the one due on the 2nd "Sooner" - true only under
       the old rule, which pushed BOTH into October. The 28th card is really
       due 28 Sep, before the 2nd card's 2 Oct; the test was pinning the bug.
       These dates are the real order: 25 Sep, then 5 Oct. */
    const accounts = [
      card({ name: 'Later',  dueDate: 5 }),
      card({ name: 'Undated', dueDate: null }),
      card({ name: 'Sooner', dueDate: 25 }),
    ]
    const txs = ['Later', 'Undated', 'Sooner'].map(n =>
      ({ type: 'expense', account: n, amount: 1000, date: new Date(2026, 7, 20, 12).toISOString() }))
    const names = creditCardBills({ accounts, transactions: txs, today: at(9, 20) }).map(b => b.name)
    expect(names).toEqual(['Sooner', 'Later', 'Undated'])
  })
})
