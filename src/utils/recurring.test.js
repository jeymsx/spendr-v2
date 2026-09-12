import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  advanceNextDate, toMonthlyAmount, parseDateLocal, daysUntil,
  dueStatus, billingLine, FREQ_LABEL, FREQ_OPTIONS, FREQ_ORDER,
} from './recurring'

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
      expect(f.step?.unit).toMatch(/^(day|month)$/)
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
