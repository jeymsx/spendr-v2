/**
 * What each badge is willing to call earned.
 *
 * These are not "does it return a Set" tests. Each one pins a line that was
 * drawn deliberately and that a future edit could quietly move: that a month
 * still running cannot be judged, that restraint needs something to have been
 * spent, that a streak counts days rather than transactions, that a run of
 * months means ADJACENT months.
 */
import { describe, it, expect } from 'vitest'
import { evaluateBadges, longestDayStreak, liquidTotal, BADGES } from './badges'

const TODAY = new Date('2026-06-15T10:00:00')

/** @param {string} date @param {string} type @param {number} [amount] @param {string} [category] */
const tx = (date, type, amount, category) => ({ date, type, amount, category })

/** @param {Record<string, any>} [over] */
function earned(over = {}) {
  return evaluateBadges({ today: TODAY, ...over })
}

/** Day `i` after a start date, as YYYY-MM-DD. */
/** @param {string} start */
function dayFrom(start) {
  return (/** @type {number} */ i) => {
    const d = new Date(start + 'T00:00:00')
    d.setDate(d.getDate() + i)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return d.getFullYear() + '-' + m + '-' + dd
  }
}

describe('the set itself', () => {
  it('is twenty badges with unique keys', () => {
    expect(BADGES).toHaveLength(20)
    expect(new Set(BADGES.map(b => b.key)).size).toBe(20)
  })

  it('gives every badge a distinct glyph, so no two read as the same thing', () => {
    // Twenty hexagons of similar colour are told apart by the mark and only by
    // the mark. Two badges sharing one is two badges nobody can tell apart.
    const glyphs = BADGES.map(b => b.glyph)
    expect(new Set(glyphs).size).toBe(glyphs.length)
  })

  it('gives every badge both a blurb and a way to get it', () => {
    // The detail card shows `how` when locked and `blurb` when earned, so a
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

  it('never awards a tier without the step below it', () => {
    // The pairs are meant to read as progress. A ledger that earns Thirty Days
    // but not Seven Days would make the grid nonsense, so the harder test has
    // to imply the easier one by construction.
    const pairs = [
      ['seven-days', 'thirty-days'],
      ['century', 'five-hundred'],
      ['green-month', 'steady-three'],
      ['under-budget', 'budget-master'],
      ['debt-cleared', 'debt-free'],
      ['goal-funded', 'three-goals'],
      ['six-figures', 'seven-figures'],
    ]
    const day = dayFrom('2025-01-01')
    const out = earned({
      transactions: Array.from({ length: 500 }, (_, i) => tx(day(i), 'expense', 10, 'Food')),
      accounts: [{ name: 'BPI', type: 'bank', balance: 2000000 }],
      debts: [{ amount: 10, amountPaid: 10 }, { amount: 20, amountPaid: 20 }],
      goals: [1, 2, 3].map(id => ({ id, name: 'G' + id, target: 100, accounts: ['BPI'], priority: id })),
    })
    for (const [easy, hard] of pairs) {
      if (out.has(hard)) expect(out.has(easy), hard + ' without ' + easy).toBe(true)
    }
  })

  it('survives a badge that throws rather than losing the other nineteen', () => {
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
      .map(d => tx('2026-' + d, 'expense', 10))
    expect(longestDayStreak(days)).toBe(7)
  })

  it('is zero with nothing logged', () => {
    expect(longestDayStreak([])).toBe(0)
  })
})

describe('seven-days', () => {
  it('needs seven in a row, not seven in a week', () => {
    const six = ['06-01', '06-02', '06-03', '06-04', '06-05', '06-06']
      .map(d => tx('2026-' + d, 'expense', 10))
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
    const four = ['cash', 'bank', 'bank', 'bank'].map((type, i) => ({ name: 'A' + i, type, balance: 0 }))
    expect(earned({ accounts: four }).has('diversified')).toBe(false)

    const kinds = ['cash', 'bank', 'ewallet', 'savings'].map((type, i) => ({ name: 'A' + i, type, balance: 0 }))
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

// ── The second ten ───────────────────────────────────────────────────────────

describe('thirty-days', () => {
  const day = dayFrom('2026-01-01')

  it('needs a run of thirty, not thirty entries', () => {
    const spread = Array.from({ length: 30 }, (_, i) => tx(day(i * 2), 'expense', 10))
    expect(earned({ transactions: spread }).has('thirty-days')).toBe(false)
    const run = Array.from({ length: 30 }, (_, i) => tx(day(i), 'expense', 10))
    expect(earned({ transactions: run }).has('thirty-days')).toBe(true)
  })
})

describe('year-one', () => {
  it('measures the span, not the volume', () => {
    // A thousand entries in a fortnight is not a year of records.
    const day = dayFrom('2026-01-01')
    const dense = Array.from({ length: 400 }, (_, i) => tx(day(i % 14), 'expense', 10))
    expect(earned({ transactions: dense }).has('year-one')).toBe(false)

    const sparse = [tx('2025-01-01', 'expense', 10), tx('2026-01-02', 'expense', 10)]
    expect(earned({ transactions: sparse }).has('year-one')).toBe(true)
  })

  it('needs two dated entries before there is a span at all', () => {
    expect(earned({ transactions: [tx('2025-01-01', 'expense', 10)] }).has('year-one')).toBe(false)
  })
})

describe('steady-three', () => {
  const green = (/** @type {string} */ m) => [tx('2026-' + m + '-02', 'inflow', 900), tx('2026-' + m + '-03', 'expense', 100)]

  it('needs adjacent months, not any three good ones', () => {
    const gappy = [...green('01'), ...green('03'), ...green('05')]
    expect(earned({ transactions: gappy }).has('steady-three')).toBe(false)
    const run = [...green('01'), ...green('02'), ...green('03')]
    expect(earned({ transactions: run }).has('steady-three')).toBe(true)
  })

  it('finds a run that is not at the start of the data', () => {
    const bad = [tx('2026-01-02', 'expense', 900), tx('2026-01-03', 'inflow', 100)]
    const run = [...bad, ...green('02'), ...green('03'), ...green('04')]
    expect(earned({ transactions: run }).has('steady-three')).toBe(true)
  })
})

describe('budget-master', () => {
  const limits = [
    { name: 'Food', budget: 8000, type: 'expense' },
    { name: 'Transpo', budget: 3000, type: 'expense' },
  ]
  const good = (/** @type {string} */ m) => [tx('2026-' + m + '-02', 'expense', 100, 'Food')]
  const bad = (/** @type {string} */ m) => [tx('2026-' + m + '-02', 'expense', 90000, 'Food')]

  it('needs three adjacent months inside every limit', () => {
    const broken = [...good('01'), ...bad('02'), ...good('03'), ...good('04')]
    expect(earned({ transactions: broken, categories: limits }).has('budget-master')).toBe(false)
    const run = [...good('01'), ...good('02'), ...good('03')]
    expect(earned({ transactions: run, categories: limits }).has('budget-master')).toBe(true)
  })

  it('still needs two limits set', () => {
    const one = [{ name: 'Food', budget: 8000, type: 'expense' }]
    const run = [...good('01'), ...good('02'), ...good('03')]
    expect(earned({ transactions: run, categories: one }).has('budget-master')).toBe(false)
  })
})

describe('no-spend-week', () => {
  it('wants a gap BETWEEN spending, not silence at the end', () => {
    // A week with no expenses is indistinguishable from a week you did not
    // open the app. Only a gap bracketed by real spending is restraint.
    const trailing = [tx('2026-01-01', 'expense', 100)]
    expect(earned({ transactions: trailing }).has('no-spend-week')).toBe(false)

    const bracketed = [tx('2026-01-01', 'expense', 100), tx('2026-01-10', 'expense', 100)]
    expect(earned({ transactions: bracketed }).has('no-spend-week')).toBe(true)
  })

  it('needs a clear seven days, so six is not enough', () => {
    const tight = [tx('2026-01-01', 'expense', 100), tx('2026-01-07', 'expense', 100)]
    expect(earned({ transactions: tight }).has('no-spend-week')).toBe(false)
  })

  it('ignores inflows in the gap - only spending breaks it', () => {
    const paid = [
      tx('2026-01-01', 'expense', 100),
      tx('2026-01-05', 'inflow', 5000),
      tx('2026-01-10', 'expense', 100),
    ]
    expect(earned({ transactions: paid }).has('no-spend-week')).toBe(true)
  })
})

describe('rainy-day', () => {
  const spend = [tx('2026-01-05', 'expense', 10000), tx('2026-02-05', 'expense', 10000)]

  it('measures savings against YOUR spending', () => {
    const thin = [{ name: 'BPI', type: 'savings', balance: 20000 }]
    expect(earned({ transactions: spend, accounts: thin }).has('rainy-day')).toBe(false)
    const full = [{ name: 'BPI', type: 'savings', balance: 30000 }]
    expect(earned({ transactions: spend, accounts: full }).has('rainy-day')).toBe(true)
  })

  it('ignores money that is not in savings', () => {
    const current = [{ name: 'BPI', type: 'bank', balance: 500000 }]
    expect(earned({ transactions: spend, accounts: current }).has('rainy-day')).toBe(false)
  })

  it('needs two months before it will average anything', () => {
    const one = [tx('2026-01-05', 'expense', 1000)]
    const acct = [{ name: 'BPI', type: 'savings', balance: 500000 }]
    expect(earned({ transactions: one, accounts: acct }).has('rainy-day')).toBe(false)
  })
})

describe('debt-free', () => {
  it('needs two debts and all of them settled', () => {
    // Owing nothing because you never recorded a debt is not the achievement.
    expect(earned({ debts: [] }).has('debt-free')).toBe(false)
    expect(earned({ debts: [{ amount: 10, amountPaid: 10 }] }).has('debt-free')).toBe(false)

    const partial = [{ amount: 10, amountPaid: 10 }, { amount: 20, amountPaid: 5 }]
    expect(earned({ debts: partial }).has('debt-free')).toBe(false)

    const all = [{ amount: 10, amountPaid: 10 }, { amount: 20, amountPaid: 20 }]
    expect(earned({ debts: all }).has('debt-free')).toBe(true)
  })
})

describe('three-goals', () => {
  const goals = [1, 2, 3].map(id => ({ id, name: 'G' + id, target: 100, accounts: ['BPI'], priority: id }))

  it('counts funded goals, not goals', () => {
    const accounts = [{ name: 'BPI', type: 'bank', balance: 300 }]
    expect(earned({ accounts, goals }).has('three-goals')).toBe(true)

    // 150 funds the first and part of the second - the waterfall, not a split.
    const thin = [{ name: 'BPI', type: 'bank', balance: 150 }]
    expect(earned({ accounts: thin, goals }).has('three-goals')).toBe(false)
  })
})

describe('seven-figures', () => {
  it('crosses at a million, and still ignores credit', () => {
    expect(earned({ accounts: [{ name: 'A', type: 'bank', balance: 999999 }] }).has('seven-figures')).toBe(false)
    expect(earned({ accounts: [{ name: 'A', type: 'bank', balance: 1000000 }] }).has('seven-figures')).toBe(true)

    const card = [{ name: 'A', type: 'credit', balance: 2000000 }]
    expect(earned({ accounts: card }).has('seven-figures')).toBe(false)
  })
})
