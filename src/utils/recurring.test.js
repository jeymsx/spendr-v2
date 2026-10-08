import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  advanceNextDate, toMonthlyAmount, parseDateLocal, daysUntil,
  dueStatus, billingLine, FREQ_LABEL, FREQ_OPTIONS, FREQ_ORDER,
  snapToCutoff, incomeLine, ordinal, dueDayOf, monthsAfter, stepsByMonth,
} from './recurring'

describe('twice a month, on the payroll cut-offs', () => {
  it('goes from the 15th to the last day, and from the last day to the next 15th', () => {
    expect(advanceNextDate('2026-09-15', 'semimonthly')).toBe('2026-09-30')
    expect(advanceNextDate('2026-09-30', 'semimonthly')).toBe('2026-10-15')
    expect(advanceNextDate('2027-02-15', 'semimonthly')).toBe('2027-02-28')
    expect(advanceNextDate('2026-12-31', 'semimonthly')).toBe('2027-01-15')
  })

  it('brings a date on neither cut-off onto the next one', () => {
    expect(advanceNextDate('2026-09-10', 'semimonthly')).toBe('2026-09-15')
    expect(advanceNextDate('2026-09-20', 'semimonthly')).toBe('2026-09-30')
  })

  it('starts a new one on the first cut-off on or after the day picked', () => {
    expect(snapToCutoff('2026-09-03')).toBe('2026-09-15')
    expect(snapToCutoff('2026-09-15')).toBe('2026-09-15')
    expect(snapToCutoff('2026-09-16')).toBe('2026-09-30')
    expect(snapToCutoff('2027-02-20')).toBe('2027-02-28')
  })

  it('counts as two a month', () => {
    expect(toMonthlyAmount(25000, 'semimonthly')).toBe(50000)
    expect(FREQ_LABEL.semimonthly).toBe('Twice a month')
  })

  it('writes days as ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 15, 21, 22, 23, 31].map(ordinal))
      .toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '15th', '21st', '22nd', '23rd', '31st'])
  })
})

describe('the income line', () => {
  it('says when pay arrives, and that a passed date is waiting to be marked', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-10T12:00:00'))
    expect(incomeLine('2026-09-10')).toMatch(/^Arrives today/)
    expect(incomeLine('2026-09-11')).toMatch(/^Arrives tomorrow/)
    expect(incomeLine('2026-09-05')).toMatch(/not marked yet$/)
    vi.useRealTimers()
  })
})

/**
 * Date arithmetic, which is where this app is most likely to be quietly wrong.
 *
 * advanceNextDate has two overflow traps that a naive setMonth walks straight
 * into, and both are tested: Jan 31 + 1 month must not become Mar 2, and Feb
 * 29 + 1 year must not become Mar 1.
 *
 * Everything that reads "today" is tested against a frozen clock, because a
 * suite that passes in September and fails on the 29th of February is worse
 * than no suite.
 */

afterEach(() => vi.useRealTimers())
/** @param {string} iso */
const freeze = (iso) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)) }

describe('advanceNextDate', () => {
  it('steps a day, a week and a year', () => {
    expect(advanceNextDate('2026-03-10', 'daily')).toBe('2026-03-11')
    expect(advanceNextDate('2026-03-10', 'weekly')).toBe('2026-03-17')
    expect(advanceNextDate('2026-03-10', 'yearly')).toBe('2027-03-10')
  })

  it('clamps Jan 31 to the end of February rather than overflowing into March', () => {
    expect(advanceNextDate('2026-01-31', 'monthly')).toBe('2026-02-28')
  })

  it('clamps into a leap February', () => {
    expect(advanceNextDate('2028-01-31', 'monthly')).toBe('2028-02-29')
  })

  it('clamps Feb 29 when the next year is not a leap year', () => {
    expect(advanceNextDate('2028-02-29', 'yearly')).toBe('2029-02-28')
  })

  it('keeps a mid-month date exactly one month on', () => {
    expect(advanceNextDate('2026-09-10', 'monthly')).toBe('2026-10-10')
  })
})

describe('toMonthlyAmount', () => {
  it('leaves a monthly amount alone', () => {
    expect(toMonthlyAmount(549, 'monthly')).toBe(549)
  })

  it('spreads a yearly amount over twelve months', () => {
    expect(toMonthlyAmount(1200, 'yearly')).toBe(100)
  })

  it('uses 52/12 for weekly rather than 4', () => {
    // 4 would understate a weekly bill by about 8% a year.
    expect(toMonthlyAmount(100, 'weekly')).toBeCloseTo(433.33, 2)
  })

  it('uses the average month length for daily', () => {
    expect(toMonthlyAmount(10, 'daily')).toBeCloseTo(304.4, 5)
  })

  it('treats a missing amount as zero', () => {
    expect(toMonthlyAmount(undefined, 'monthly')).toBe(0)
  })
})

describe('parseDateLocal', () => {
  it('reads a YYYY-MM-DD string as a local date, not UTC', () => {
    const d = parseDateLocal('2026-09-10')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8)      // zero-based
    expect(d.getDate()).toBe(10)      // would slip to the 9th if parsed as UTC
  })

  it('tolerates a full ISO timestamp', () => {
    expect(parseDateLocal('2026-09-10T05:00:00.000Z').getDate()).toBe(10)
  })

  it('returns null for junk', () => {
    expect(parseDateLocal('')).toBeNull()
    expect(parseDateLocal(null)).toBeNull()
    expect(parseDateLocal('not-a-date')).toBeNull()
  })
})

describe('daysUntil and dueStatus', () => {
  it('counts forwards and backwards from today', () => {
    freeze('2026-09-10T13:00:00')
    expect(daysUntil('2026-09-10')).toBe(0)
    expect(daysUntil('2026-09-11')).toBe(1)
    expect(daysUntil('2026-09-01')).toBe(-9)
  })

  it('ignores the time of day', () => {
    // 23:59 and 00:01 on the same date must agree, or a bill flips to
    // "overdue" over dinner.
    freeze('2026-09-10T23:59:00')
    const late = daysUntil('2026-09-12')
    freeze('2026-09-10T00:01:00')
    expect(daysUntil('2026-09-12')).toBe(late)
  })

  it('tones a due date by urgency', () => {
    freeze('2026-09-10T09:00:00')
    expect(dueStatus('2026-09-01').tone).toBe('late')
    expect(dueStatus('2026-09-10').tone).toBe('late')
    expect(dueStatus('2026-09-11').tone).toBe('soon')
    expect(dueStatus('2026-09-16').tone).toBe('soon')
    expect(dueStatus('2026-09-22').tone).toBe('calm')
    expect(dueStatus(null)).toBeNull()
  })

  it('words the overdue case with a day count', () => {
    freeze('2026-09-10T09:00:00')
    expect(dueStatus('2026-09-01').label).toBe('9d overdue')
    expect(dueStatus('2026-09-11').label).toBe('Tomorrow')
  })
})

describe('billingLine', () => {
  it('says tomorrow, today and overdue in words', () => {
    freeze('2026-09-10T09:00:00')
    expect(billingLine('2026-09-11')).toMatch(/^Next billing tomorrow/)
    expect(billingLine('2026-09-10')).toMatch(/^Billing today/)
    expect(billingLine('2026-09-01')).toMatch(/^Overdue since/)
  })

  it('drops the relative wording once it stops being useful', () => {
    freeze('2026-09-10T09:00:00')
    // Past a week out, "in 23 days" is arithmetic the date already answers.
    expect(billingLine('2026-10-03')).toBe('Next billing Oct 3, 2026')
  })

  it('handles no date', () => {
    expect(billingLine(null)).toBe('No date set')
  })
})

describe('FREQ_LABEL', () => {
  it('covers every frequency the db can hold', () => {
    for (const f of ['daily', 'weekly', 'monthly', 'yearly']) {
      expect(FREQ_LABEL[f]).toBeTruthy()
    }
  })
})

/**
 * The middle terms - every 2 weeks, quarterly, every 6 months.
 *
 * They were missing, so a quarterly subscription had to be entered as monthly
 * and its cost was overstated threefold in "Monthly cost". These pin the two
 * things a new frequency can silently half-implement: advancing the date, and
 * normalising the amount.
 */
describe('the frequencies added later', () => {
  it('advances a fortnight by 14 days, not half a month', () => {
    expect(advanceNextDate('2026-09-08', 'fortnightly')).toBe('2026-09-22')
  })

  it('advances a quarter by three months', () => {
    expect(advanceNextDate('2026-09-08', 'quarterly')).toBe('2026-12-08')
  })

  it('advances six months across a year boundary', () => {
    expect(advanceNextDate('2026-09-08', 'semiannual')).toBe('2027-03-08')
  })

  it('clamps a month-end quarterly rather than overflowing', () => {
    // Nov 31 does not exist. The naive setMonth lands on Dec 1.
    expect(advanceNextDate('2026-08-31', 'quarterly')).toBe('2026-11-30')
  })

  it('normalises each one to a monthly figure', () => {
    expect(toMonthlyAmount(300, 'quarterly')).toBeCloseTo(100, 6)
    expect(toMonthlyAmount(600, 'semiannual')).toBeCloseTo(100, 6)
    expect(toMonthlyAmount(100, 'fortnightly')).toBeCloseTo(100 * 26 / 12, 6)
  })

  it('leaves the four original frequencies exactly as they were', () => {
    expect(toMonthlyAmount(120, 'monthly')).toBe(120)
    expect(toMonthlyAmount(1200, 'yearly')).toBe(100)
    expect(toMonthlyAmount(100, 'weekly')).toBeCloseTo(100 * 52 / 12, 6)
    expect(toMonthlyAmount(10, 'daily')).toBeCloseTo(304.4, 6)
  })
})

describe('the frequency table is the single source', () => {
  it('gives every option a step and a monthly factor', () => {
    // The failure this stops: a frequency with a label and no arithmetic,
    // which renders as a chip and then never advances.
    for (const f of FREQ_OPTIONS) {
      expect(f.step?.unit).toMatch(/^(day|month|semimonth)$/)
      expect(f.step.n).toBeGreaterThan(0)
      expect(typeof f.perMonth).toBe('number')
      expect(f.perMonth).toBeGreaterThan(0)
    }
  })

  it('orders every option exactly once', () => {
    expect([...FREQ_ORDER].sort()).toEqual(FREQ_OPTIONS.map(f => f.value).sort())
  })

  it('returns a local calendar day, not a UTC-shifted one', () => {
    // In UTC+8 a local midnight converted through toISOString lands on the
    // previous day, which walked every bill backwards one day per advance.
    expect(advanceNextDate('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(advanceNextDate('2026-03-01', 'daily')).toBe('2026-03-02')
  })
})

/**
 * A bill due on the 29th to the 31st used to drift to the 28th and stay there:
 * stepping from the already-clamped date said "the 28th" for every month after
 * the first February. A row now keeps `dueDay`, and each step clamps from that.
 */
describe('advanceNextDate - a due day that short months clamp', () => {
  /** Step `n` times, each from the last result. @param {string} from @param {string} freq @param {number|null} anchor @param {number} n */
  const walk = (from, freq, anchor, n) => {
    const out = []
    let d = from
    for (let i = 0; i < n; i++) { d = advanceNextDate(d, freq, anchor); out.push(d) }
    return out
  }

  it('runs a Jan 31 monthly bill through the year: Feb 28, Mar 31, Apr 30 and on', () => {
    expect(walk('2026-01-31', 'monthly', 31, 12)).toEqual([
      '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31',
      '2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31',
    ])
  })

  it('goes back to the 31st after February instead of staying on the 28th', () => {
    expect(advanceNextDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31')
    // Without the anchor it is the old behaviour, which is no worse than before.
    expect(advanceNextDate('2026-02-28', 'monthly')).toBe('2026-03-28')
    expect(advanceNextDate('2026-02-28', 'monthly', null)).toBe('2026-03-28')
  })

  it('keeps a bill that starts on Mar 31 on the 31st or the last day of each month', () => {
    expect(walk('2026-03-31', 'monthly', 31, 6)).toEqual([
      '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30',
    ])
  })

  it('keeps the 30th through a leap February too', () => {
    expect(walk('2028-01-30', 'monthly', 30, 3)).toEqual(['2028-02-29', '2028-03-30', '2028-04-30'])
  })

  it('steps a quarterly bill from Nov 30 without losing the 30th', () => {
    expect(walk('2026-11-30', 'quarterly', 30, 4)).toEqual([
      '2027-02-28', '2027-05-30', '2027-08-30', '2027-11-30',
    ])
  })

  it('brings a quarterly bill on the 31st back to the 31st', () => {
    expect(walk('2026-08-31', 'quarterly', 31, 4)).toEqual([
      '2026-11-30', '2027-02-28', '2027-05-31', '2027-08-31',
    ])
  })

  it('steps a Feb 29 yearly bill: Feb 28 in the three years between, Feb 29 again in the leap one', () => {
    expect(walk('2028-02-29', 'yearly', 29, 4)).toEqual([
      '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29',
    ])
  })

  it('does the same every six months', () => {
    expect(walk('2026-08-31', 'semiannual', 31, 3)).toEqual(['2027-02-28', '2027-08-31', '2028-02-29'])
  })

  /**
   * The anchor is trusted only while the date agrees with it. A date moved to
   * another day without the anchor following - an edit that predates it, a
   * sync from a device that does not know about it - steps from itself.
   */
  it('ignores an anchor the date has moved off', () => {
    expect(advanceNextDate('2026-03-15', 'monthly', 31)).toBe('2026-04-15')
    expect(advanceNextDate('2026-03-31', 'monthly', 15)).toBe('2026-04-30')
  })

  it('treats an anchor that is not a day of the month as none', () => {
    for (const bad of [0, 32, -1, NaN, undefined, null, 'x']) {
      expect(advanceNextDate('2026-02-28', 'monthly', /** @type {any} */ (bad))).toBe('2026-03-28')
    }
  })

  it('leaves the frequencies that do not step by months alone', () => {
    expect(advanceNextDate('2026-03-10', 'weekly', 31)).toBe('2026-03-17')
    expect(advanceNextDate('2026-09-15', 'semimonthly', 31)).toBe('2026-09-30')
  })
})

describe('dueDayOf, stepsByMonth and monthsAfter', () => {
  it('reads the day of the month off a date', () => {
    expect(dueDayOf('2026-01-31')).toBe(31)
    expect(dueDayOf('2026-09-05')).toBe(5)
    expect(dueDayOf('')).toBeNull()
    expect(dueDayOf('nope')).toBeNull()
  })

  it('keeps the day already on record while the date agrees with it', () => {
    expect(dueDayOf('2026-02-28', 31)).toBe(31)
    expect(dueDayOf('2026-02-27', 31)).toBe(27)
    expect(dueDayOf('2026-04-30', 31)).toBe(31)
  })

  it('knows which frequencies have a day of the month to protect', () => {
    expect(['monthly', 'quarterly', 'semiannual', 'yearly'].every(stepsByMonth)).toBe(true)
    expect(['daily', 'weekly', 'fortnightly', 'semimonthly', 'bogus'].some(stepsByMonth)).toBe(false)
  })

  it('counts installment dates from the first one, not from the last', () => {
    // Bought on the 31st: Feb 28, then back to Mar 31 - not Mar 28.
    expect(monthsAfter('2026-01-31', 1)).toBe('2026-02-28')
    expect(monthsAfter('2026-01-31', 2)).toBe('2026-03-31')
    expect(monthsAfter('2026-01-31', 3)).toBe('2026-04-30')
    expect(monthsAfter('2026-01-31', 12)).toBe('2027-01-31')
    expect(monthsAfter('2026-09-10', 0)).toBe('2026-09-10')
    expect(monthsAfter('2026-09-10', 3)).toBe('2026-12-10')
  })
})
