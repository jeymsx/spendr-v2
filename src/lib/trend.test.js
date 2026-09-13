import { describe, it, expect } from 'vitest'
import {
  buildSpendTrend, SPEND_TREND_RANGES, TREND_RANGES, DAY_MS,
  spendSpan, spendBaseline, BASELINE_MIN_DAYS, BASELINE_MIN_ROWS,
} from './trend'

/** A fixed "now" so nothing here depends on when it runs. */
const NOW = new Date(2026, 8, 13, 12, 0, 0).getTime()
/** @param {number} daysAgo @param {number} amount */
const spend = (daysAgo, amount) =>
  ({ type: 'expense', category: 'Food', amount, date: new Date(NOW - daysAgo * DAY_MS).toISOString() })

const RANGE_1M = /** @type {any} */ (TREND_RANGES.find(r => r.key === '1m'))
const RANGE_ALL = /** @type {any} */ (TREND_RANGES.find(r => r.key === 'all'))

/** @param {Array<{t: number, value: number, day: string, usual?: number}>} arr */
const last = (arr) => arr[arr.length - 1]

describe('SPEND_TREND_RANGES', () => {
  /**
   * Nobody asks what they spent on groceries in the last hour. A chip that is
   * always a flat zero teaches you to distrust the ones beside it.
   */
  it('drops the hour and the day, and keeps the rest', () => {
    expect(SPEND_TREND_RANGES.map(r => r.key)).toEqual(['7d', '1m', '3m', '6m', '1y', 'all'])
  })

  it('is derived from the balance chart, not retyped', () => {
    for (const r of SPEND_TREND_RANGES) {
      expect(TREND_RANGES).toContain(r)
    }
  })
})

describe('buildSpendTrend', () => {
  it('returns one point per sample the range asks for', () => {
    const out = buildSpendTrend({ txs: [spend(3, 100)], range: RANGE_1M, now: NOW })
    expect(out).toHaveLength(RANGE_1M.points)
  })

  /**
   * The promise the page makes: the figure printed beside the range title is
   * the line's right-hand end. If these two ever disagree, both are useless.
   */
  it('ends at the total spent inside the window', () => {
    const txs = [spend(1, 100), spend(10, 250), spend(20, 50)]
    const out = buildSpendTrend({ txs, range: RANGE_1M, now: NOW })
    expect(last(out).value).toBe(400)
  })

  /** Cumulative from zero, not a running total of all time. */
  it('starts at zero however much was spent before the window', () => {
    const txs = [spend(200, 9999), spend(2, 100)]
    const out = buildSpendTrend({ txs, range: RANGE_1M, now: NOW })
    expect(out[0].value).toBe(0)
    expect(last(out).value).toBe(100)
  })

  it('never goes down', () => {
    const txs = [spend(1, 100), spend(5, 200), spend(12, 300), spend(25, 400)]
    const out = buildSpendTrend({ txs, range: RANGE_1M, now: NOW })
    for (let i = 1; i < out.length; i++) {
      expect(out[i].value).toBeGreaterThanOrEqual(out[i - 1].value)
    }
  })

  /**
   * Same rule as every other spend surface. An installment plan books each
   * month's charge the day you buy, and counting next December's in this
   * month's total would report money spent that has not been.
   */
  it('ignores anything dated ahead of now', () => {
    const future = { type: 'expense', category: 'Food', amount: 5000,
      date: new Date(NOW + 30 * DAY_MS).toISOString() }
    const out = buildSpendTrend({ txs: [spend(1, 100), future], range: RANGE_1M, now: NOW })
    expect(last(out).value).toBe(100)
  })

  it('ignores a row with an unreadable date', () => {
    const bad = { type: 'expense', category: 'Food', amount: 500, date: 'not a date' }
    const out = buildSpendTrend({ txs: [spend(1, 100), bad], range: RANGE_1M, now: NOW })
    expect(last(out).value).toBe(100)
  })

  it('is a flat zero when nothing was spent', () => {
    const out = buildSpendTrend({ txs: [], range: RANGE_1M, now: NOW })
    expect(out.every(p => p.value === 0)).toBe(true)
  })

  /**
   * ALL spans back to the first charge PLUS one sample step, so the oldest
   * spend is visible arriving rather than already inside the first point.
   * Without the padding "all time" hides the thing it exists to show.
   */
  it('leaves room before the oldest charge on ALL', () => {
    const out = buildSpendTrend({ txs: [spend(100, 700), spend(1, 300)], range: RANGE_ALL, now: NOW })
    expect(out[0].value).toBe(0)
    expect(last(out).value).toBe(1000)
  })

  it('does not collapse ALL to a few hours for a brand-new category', () => {
    const out = buildSpendTrend({ txs: [spend(0, 100)], range: RANGE_ALL, now: NOW })
    expect(last(out).t - out[0].t).toBeGreaterThanOrEqual(7 * DAY_MS)
  })

  it('labels every point', () => {
    const out = buildSpendTrend({ txs: [spend(3, 100)], range: RANGE_1M, now: NOW })
    expect(out.every(p => typeof p.day === 'string' && p.day.length > 0)).toBe(true)
  })

  /** An inflow category runs through the same arithmetic; only the word on it
   *  differs, and that is the page's business rather than this function's. */
  it('adds whatever it is given, inflow rows included', () => {
    const income = { type: 'inflow', category: 'Salary', amount: 40000,
      date: new Date(NOW - DAY_MS).toISOString() }
    const out = buildSpendTrend({ txs: [income], range: RANGE_1M, now: NOW })
    expect(last(out).value).toBe(40000)
  })

  describe('the dashed reference line', () => {
    it('is absent unless a rate is given', () => {
      const out = buildSpendTrend({ txs: [spend(1, 100)], range: RANGE_1M, now: NOW })
      expect(out.every(p => p.usual === undefined)).toBe(true)
    })

    /** A constant daily rate is a straight line on a cumulative chart - that
     *  is the whole reason the comparison reads at a glance. */
    it('rises in a straight line from zero at the given rate', () => {
      const out = buildSpendTrend({
        txs: [spend(1, 100)], range: RANGE_1M, now: NOW, usualPerDay: 100,
      })
      expect(out[0].usual).toBe(0)
      expect(last(out).usual).toBeCloseTo(3000, 6)   // 100/day over 30 days
      // Evenly spaced: every step is the same size.
      const steps = out.slice(1).map((p, i) => p.usual - out[i].usual)
      for (const s of steps) expect(s).toBeCloseTo(steps[0], 6)
    })
  })
})

describe('spendSpan', () => {
  it('is the range span for a fixed range', () => {
    expect(spendSpan({ txs: [spend(3, 100)], range: RANGE_1M, now: NOW })).toBe(30 * DAY_MS)
  })

  it('reaches past the oldest row on ALL, and never under a week', () => {
    expect(spendSpan({ txs: [spend(100, 100)], range: RANGE_ALL, now: NOW }))
      .toBeGreaterThan(100 * DAY_MS)
    expect(spendSpan({ txs: [spend(0, 100)], range: RANGE_ALL, now: NOW }))
      .toBeGreaterThanOrEqual(7 * DAY_MS)
  })
})

describe('spendBaseline', () => {
  const SPAN = 30 * DAY_MS
  /** Enough history to clear both bars, at a known ₱100/day. */
  const priorHistory = () => [
    spend(60, 1000), spend(50, 1000), spend(40, 1000), spend(31, 1000),
  ]

  /**
   * The baseline exists to answer "is this window unusual". One that included
   * the window would be a bar the window had already moved: a bad month would
   * raise its own baseline and then look normal against it.
   */
  it('ignores everything inside the window it is a reference for', () => {
    const inside = [spend(1, 99999), spend(5, 99999)]
    const a = spendBaseline({ txs: priorHistory(), span: SPAN, now: NOW })
    const b = spendBaseline({ txs: [...priorHistory(), ...inside], span: SPAN, now: NOW })
    expect(b?.dailyRate).toBe(a?.dailyRate)
  })

  it('averages the prior history over the days it covers', () => {
    // 4,000 spent between 60 and 31 days ago; the window starts at day 30, so
    // the history it measures runs 60 -> 30 days ago, which is 30 days.
    const b = spendBaseline({ txs: priorHistory(), span: SPAN, now: NOW })
    expect(b?.days).toBeCloseTo(30, 6)
    expect(b?.total).toBe(4000)
    expect(b?.dailyRate).toBeCloseTo(4000 / 30, 6)
  })

  it('is null when there is no history before the window', () => {
    expect(spendBaseline({ txs: [spend(2, 500)], span: SPAN, now: NOW })).toBeNull()
  })

  /**
   * A rate off two rows or a few days is noise wearing a dashed line, and a
   * reference the reader trusts and should not is worse than none.
   */
  it('is null on too few rows', () => {
    const thin = Array.from({ length: BASELINE_MIN_ROWS - 1 },
      (_, i) => spend(60 + i, 1000))
    expect(spendBaseline({ txs: thin, span: SPAN, now: NOW })).toBeNull()
  })

  it('is null on too short a history, however many rows', () => {
    // Ten rows, all inside the few days before the window opens.
    const bunched = Array.from({ length: 10 }, (_, i) => spend(31 + i * 0.2, 100))
    const b = spendBaseline({ txs: bunched, span: SPAN, now: NOW })
    expect(b).toBeNull()
  })

  it('accepts a history exactly at the bar', () => {
    const rows = [
      spend(30 + BASELINE_MIN_DAYS, 300),
      spend(30 + BASELINE_MIN_DAYS / 2, 300),
      spend(30.5, 300),
    ]
    expect(spendBaseline({ txs: rows, span: SPAN, now: NOW })).not.toBeNull()
  })

  /**
   * ALL has no baseline by construction: when the window is the whole
   * history, there is nothing left outside it to compare against.
   */
  it('is null when the window covers everything', () => {
    const txs = priorHistory()
    const span = spendSpan({ txs, range: RANGE_ALL, now: NOW })
    expect(spendBaseline({ txs, span, now: NOW })).toBeNull()
  })
})
