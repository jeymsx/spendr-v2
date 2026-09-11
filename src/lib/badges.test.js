/**
 * What each badge is willing to call earned.
 *
 * These are not "does it return a Set" tests. Each one pins a line that was
 * drawn deliberately and that a future edit could quietly move: that a month
 * still running cannot be judged, that restraint needs something to have been
 * spent, that a streak counts days rather than transactions.
 */
import { describe, it, expect } from 'vitest'
import { evaluateBadges, longestDayStreak, liquidTotal, BADGES } from './badges'

const TODAY = new Date('2026-06-15T10:00:00')

const tx = (date, type, amount, category) => ({ date, type, amount, category })

function earned(over = {}) {
  return evaluateBadges({ today: TODAY, ...over })
}

describe('the set itself', () => {
  it('is ten badges with unique keys', () => {
    expect(BADGES).toHaveLength(10)
    expect(new Set(BADGES.map(b => b.key)).size).toBe(10)
  })

  it('gives every badge both a blurb and a way to get it', () => {
    // The detail sheet shows `how` when locked and `blurb` when earned, so a
    // badge missing either renders an empty paragraph on one of its states.
    for (const b of BADGES) {
      expect(b.blurb, b.key).toBeTruthy()
      expect(b.how, b.key).toBeTruthy()
      expect(b.tone, b.key).toBeTruthy()
      expect(b.glyph, b.key).toBeTruthy()
    }
  })

  it('earns nothing from an empty app', () => {
    expect(earned().size).toBe(0)
  })

  it('survives a badge that throws rather than losing the other nine', () => {
    // Every test is wrapped. A malformed row must not empty the page.
    const out = earned({ accounts: [{ get type() { throw new Error('boom') } }] })
    expect(out).toBeInstanceOf(Set)
  })
})

describe('longestDayStreak', () => {
  it('counts days, not transactions', () => {
    // Five coffees on one day is one day. The badge is about showing up.
    const same = Array.from({ length: 5 }, () => tx('2026-06-01', 'expense', 100))
    expect(longestDayStreak(same)).toBe(1)
  })

  it('breaks on a gap and keeps the longest run, not the last', () => {
    const days = ['06-01', '06-02', '06-03', '06-04', '06-05', '06-06', '06-07', '06-09']
      .map(d => tx(`2026-${d}`, 'expense', 10))
    expect(longestDayStreak(days)).toBe(7)
  })

  it('is zero with nothing logged', () => {
    expect(longestDayStreak([])).toBe(0)
  })
})

describe('seven-days', () => {
  it('needs seven in a row, not seven in a week', () => {
    const six = ['06-01', '06-02', '06-03', '06-04', '06-05', '06-06']
      .map(d => tx(`2026-${d}`, 'expense', 10))
    expect(earned({ transactions: six }).has('seven-days')).toBe(false)

    const seven = [...six, tx('2026-06-07', 'expense', 10)]
    expect(earned({ transactions: seven }).has('seven-days')).toBe(true)
  })
})

describe('green-month', () => {
  const green = [tx('2026-05-01', 'inflow', 50000), tx('2026-05-09', 'expense', 20000)]

  it('takes a finished month where inflow beat expenses', () => {
    expect(earned({ transactions: green }).has('green-month')).toBe(true)
  })

  it('will not judge the month still running', () => {
    // Awarded on the 15th because rent has not come out yet, it would be a
    // badge that lies for two weeks and then has to be taken back.
    const thisMonth = [tx('2026-06-01', 'inflow', 50000), tx('2026-06-09', 'expense', 20000)]
    expect(earned({ transactions: thisMonth }).has('green-month')).toBe(false)
  })

  it('ignores a month with income and no spending', () => {
    // That is a month with no data in it, not a month you did well in.
    const idle = [tx('2026-05-01', 'inflow', 50000)]
    expect(earned({ transactions: idle }).has('green-month')).toBe(false)
  })

  it('does not count a transfer as income', () => {
    const moved = [tx('2026-05-01', 'transfer', 50000), tx('2026-05-09', 'expense', 200)]
    expect(earned({ transactions: moved }).has('green-month')).toBe(false)
  })
})

describe('under-budget', () => {
  const limits = [
    { name: 'Food', budget: 8000, type: 'expense' },
    { name: 'Transpo', budget: 3000, type: 'expense' },
  ]

  it('takes a finished month inside every limit', () => {
    const spent = [tx('2026-05-02', 'expense', 5000, 'Food'), tx('2026-05-03', 'expense', 1200, 'Transpo')]
    expect(earned({ transactions: spent, categories: limits }).has('under-budget')).toBe(true)
  })

  it('fails the month if any one limit was passed', () => {
    const spent = [tx('2026-05-02', 'expense', 5000, 'Food'), tx('2026-05-03', 'expense', 3200, 'Transpo')]
    expect(earned({ transactions: spent, categories: limits }).has('under-budget')).toBe(false)
  })

  it('needs two limits, so one limit on something never bought is not restraint', () => {
    const one = [{ name: 'Food', budget: 8000, type: 'expense' }]
    const spent = [tx('2026-05-02', 'expense', 100, 'Food')]
    expect(earned({ transactions: spent, categories: one }).has('under-budget')).toBe(false)
  })

  it('ignores a month with no expenses at all', () => {
    const idle = [tx('2026-05-02', 'inflow', 40000)]
    expect(earned({ transactions: idle, categories: limits }).has('under-budget')).toBe(false)
  })

  it('takes any qualifying past month, not only the most recent', () => {
    const good = [tx('2026-01-02', 'expense', 100, 'Food')]
    const bad = [tx('2026-05-02', 'expense', 99000, 'Food')]
    expect(earned({ transactions: [...good, ...bad], categories: limits }).has('under-budget')).toBe(true)
  })
})

describe('debt-cleared', () => {
  it('needs the debt fully paid', () => {
    const part = [{ amount: 1000, amountPaid: 999 }]
    expect(earned({ debts: part }).has('debt-cleared')).toBe(false)
    const full = [{ amount: 1000, amountPaid: 1000 }]
    expect(earned({ debts: full }).has('debt-cleared')).toBe(true)
  })

  it('does not count a debt that was zero to begin with', () => {
    expect(earned({ debts: [{ amount: 0, amountPaid: 0 }] }).has('debt-cleared')).toBe(false)
  })
})

describe('liquidTotal and six-figures', () => {
  it('leaves credit out, because a credit line is not money you hold', () => {
    const accounts = [
      { name: 'BPI', type: 'bank', balance: 60000 },
      { name: 'Maya Credit', type: 'credit', balance: 50000 },
    ]
    expect(liquidTotal(accounts)).toBe(60000)
    expect(earned({ accounts }).has('six-figures')).toBe(false)
  })

  it('crosses at exactly 100,000', () => {
    const accounts = [{ name: 'BPI', type: 'bank', balance: 100000 }]
    expect(earned({ accounts }).has('six-figures')).toBe(true)
  })
})

describe('diversified', () => {
  it('counts kinds, not accounts', () => {
    const four = ['cash', 'bank', 'bank', 'bank'].map((type, i) => ({ name: `A${i}`, type, balance: 0 }))
    expect(earned({ accounts: four }).has('diversified')).toBe(false)

    const kinds = ['cash', 'bank', 'ewallet', 'savings'].map((type, i) => ({ name: `A${i}`, type, balance: 0 }))
    expect(earned({ accounts: kinds }).has('diversified')).toBe(true)
  })
})

describe('on-autopilot', () => {
  it('counts active bills only', () => {
    const paused = [{ active: true }, { active: true }, { active: false }]
    expect(earned({ recurring: paused }).has('on-autopilot')).toBe(false)
    expect(earned({ recurring: [...paused, { active: true }] }).has('on-autopilot')).toBe(true)
  })
})

describe('goal-funded', () => {
  it('reads the same allocator the goals page draws', () => {
    const accounts = [{ name: 'BPI', type: 'bank', balance: 50000 }]
    const under = [{ id: 1, name: 'Laptop', target: 80000, accounts: ['BPI'], priority: 1 }]
    expect(earned({ accounts, goals: under }).has('goal-funded')).toBe(false)

    const over = [{ id: 1, name: 'Laptop', target: 40000, accounts: ['BPI'], priority: 1 }]
    expect(earned({ accounts, goals: over }).has('goal-funded')).toBe(true)
  })

  it('does not count a goal funded only by a credit balance', () => {
    // isFundable excludes credit, so the goal has nothing behind it.
    const accounts = [{ name: 'Maya Credit', type: 'credit', balance: 90000 }]
    const goals = [{ id: 1, name: 'Trip', target: 10000, accounts: ['Maya Credit'], priority: 1 }]
    expect(earned({ accounts, goals }).has('goal-funded')).toBe(false)
  })
})

describe('first-peso and century', () => {
  it('opens on the first transaction and turns over at a hundred', () => {
    const one = [tx('2026-06-01', 'expense', 10)]
    const out = earned({ transactions: one })
    expect(out.has('first-peso')).toBe(true)
    expect(out.has('century')).toBe(false)

    const hundred = Array.from({ length: 100 }, () => tx('2026-06-01', 'expense', 10))
    expect(earned({ transactions: hundred }).has('century')).toBe(true)
  })
})
