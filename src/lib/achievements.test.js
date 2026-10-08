/**
 * Milestones, streaks and the one roof they share with badges.
 *
 * What is pinned here is the lines drawn on purpose: a quiet day has to be
 * vouched for, today does not count until it is over, the original badges keep
 * their keys as levels, and every track keeps going past the last badge.
 */
import { describe, it, expect } from 'vitest'
import {
  ACHIEVEMENTS, TRACKS, achievementDef, addDays, dayKey, daysBetween, evaluateAchievements,
  loggingStreak, noSpendStreak, trackProgress, trackView, tierKey,
} from './achievements'
import { BADGES } from './badges'

const TODAY = new Date(2026, 8, 20, 10)           // Sun 20 Sep 2026, 10:00 local
/** Noon on the day `n` days before TODAY, as a stored timestamp. @param {number} n */
const ago = (n) => new Date(2026, 8, 20 - n, 12).toISOString()
/** @param {number} n @param {string} type @param {number} [amount] @param {string} [category] */
const tx = (n, type, amount = 100, category = 'Food') => ({ date: ago(n), type, amount, category })
/** The day key `n` days before TODAY. @param {number} n */
const key = (n) => addDays(dayKey(TODAY), -n)

describe('day arithmetic', () => {
  it('moves across month ends in local days', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-09-20', '2026-09-27')).toBe(7)
  })
})

describe('loggingStreak', () => {
  it('stays alive through a today not logged yet', () => {
    const s = loggingStreak([tx(1, 'expense'), tx(2, 'expense'), tx(3, 'inflow')], TODAY)
    expect(s.current).toBe(3)
  })

  it('counts today once it has an entry', () => {
    const s = loggingStreak([tx(0, 'expense'), tx(1, 'expense')], TODAY)
    expect(s.current).toBe(2)
  })

  it('keeps the best run after a break', () => {
    const rows = [0, 1, 5, 6, 7, 8, 9].map(n => tx(n, 'expense'))
    const s = loggingStreak(rows, TODAY)
    expect(s.current).toBe(2)
    expect(s.best).toBe(5)
  })

  it('ignores the later months an installment wrote ahead', () => {
    const ahead = { date: new Date(2026, 8, 21, 12).toISOString(), type: 'expense', amount: 1 }
    expect(loggingStreak([ahead], TODAY)).toEqual({ current: 0, best: 0 })
  })
})

describe('noSpendStreak', () => {
  it('counts vouched-for quiet days up to yesterday', () => {
    const active = [key(0), key(1), key(2), key(3)]
    const s = noSpendStreak({ transactions: [tx(4, 'expense')], activeDays: active, today: TODAY })
    expect(s.current).toBe(3)
  })

  it('does not count days nobody was keeping track', () => {
    // An expense 20 days ago and nothing since, app opened only today.
    const s = noSpendStreak({ transactions: [tx(20, 'expense')], activeDays: [key(0)], today: TODAY })
    expect(s.current).toBe(1)   // yesterday, vouched for by opening the app today
    expect(s.best).toBe(1)
  })

  it('takes a logged inflow as proof you were keeping track that day', () => {
    const rows = [tx(5, 'expense'), tx(4, 'inflow'), tx(3, 'inflow'), tx(2, 'inflow'), tx(1, 'inflow')]
    expect(noSpendStreak({ transactions: rows, today: TODAY }).current).toBe(4)
  })

  it('breaks at once when today has spending in it', () => {
    const active = [key(0), key(1), key(2)]
    const s = noSpendStreak({ transactions: [tx(3, 'expense'), tx(0, 'expense')], activeDays: active, today: TODAY })
    expect(s.current).toBe(0)
    expect(s.spentToday).toBe(true)
    expect(s.best).toBe(2)
  })

  it('treats a refund as not spending', () => {
    const active = [key(0), key(1), key(2)]
    const refund = { date: ago(1), type: 'expense', amount: -250, category: 'Food' }
    expect(noSpendStreak({ transactions: [tx(3, 'expense'), refund], activeDays: active, today: TODAY }).current).toBe(2)
  })

  /* Yesterday's lunch is often logged this morning. The run shows it; a level
     - which is for good - waits until today is over. */
  it('counts yesterday in the run, and settles it for levels only once today is over', () => {
    const open = Array.from({ length: 9 }, (_, i) => key(i))
    const s = noSpendStreak({ transactions: [tx(8, 'expense')], activeDays: open, today: TODAY })
    expect(s.current).toBe(7)
    expect(s.settled).toBe(6)
    expect(evaluateAchievements({ transactions: [tx(8, 'expense')], activeDays: open, today: TODAY }).has('no-spend-week')).toBe(false)
    const tomorrow = new Date(2026, 8, 21, 10)
    expect(evaluateAchievements({ transactions: [tx(8, 'expense')], activeDays: [...open, '2026-09-21'], today: tomorrow }).has('no-spend-week')).toBe(true)
  })

  it('takes today as a day the app was open before the write that records it lands', () => {
    // Opened on the 18th and today, not yet recorded for today: the 19th is vouched by today.
    const s = noSpendStreak({ transactions: [tx(3, 'expense')], activeDays: [key(2)], today: TODAY })
    expect(s.current).toBe(2)
  })
})

describe('the tracks', () => {
  it('keep the original badges as levels, under the same keys', () => {
    const levels = new Set(TRACKS.flatMap(t => t.tiers.map(tier => tierKey(t, tier))))
    for (const k of ['seven-days', 'thirty-days', 'first-peso', 'century', 'five-hundred', 'green-month',
      'steady-three', 'under-budget', 'budget-master', 'six-figures', 'seven-figures', 'goal-funded',
      'three-goals', 'no-spend-week']) {
      expect(levels.has(k)).toBe(true)
    }
  })

  it('each go on past the last of those badges', () => {
    for (const t of TRACKS) {
      const last = t.tiers[t.tiers.length - 1]
      expect(last.key).toBeUndefined()
    }
  })

  it('climb in order, with unique keys across everything earnable', () => {
    for (const t of TRACKS) {
      const ns = t.tiers.map(x => x.n)
      expect([...ns].sort((a, b) => a - b)).toEqual(ns)
    }
    const keys = ACHIEVEMENTS.map(a => a.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('leave every original badge with a definition, as a badge or a level', () => {
    for (const b of BADGES) expect(achievementDef(b.key)).not.toBeNull()
  })
})

describe('evaluateAchievements', () => {
  it('earns levels from where a track stands', () => {
    const rows = Array.from({ length: 60 }, (_, i) => tx(i % 5, 'expense'))
    const earned = evaluateAchievements({ transactions: rows, today: TODAY })
    expect(earned.has('first-peso')).toBe(true)
    expect(earned.has('entries-50')).toBe(true)
    expect(earned.has('century')).toBe(false)
    expect(earned.has('logging-3')).toBe(true)
  })

  it('counts challenges won, and only won', () => {
    const challenges = [{ status: 'won' }, { status: 'lost' }, { status: 'active' }]
    expect(evaluateAchievements({ challenges, today: TODAY }).has('challenges-1')).toBe(true)
    expect(evaluateAchievements({ challenges, today: TODAY }).has('challenges-3')).toBe(false)
  })

  it('awards the new badges on their own rules', () => {
    const categories = ['Food', 'Transpo', 'Coffee'].map(name => ({ name, type: 'expense', budget: 1000 }))
    const earned = evaluateAchievements({ categories, goals: [{ name: 'Trip', target: 5000 }], today: TODAY })
    expect(earned.has('limits-set')).toBe(true)
    expect(earned.has('first-goal')).toBe(true)
  })

  it('does not take an inflow category\'s stray budget as one of the three limits', () => {
    const categories = [
      { name: 'Food', type: 'expense', budget: 1000 }, { name: 'Transpo', type: 'expense', budget: 1000 },
      { name: 'Salary', type: 'inflow', budget: 1000 },
    ]
    expect(evaluateAchievements({ categories, today: TODAY }).has('limits-set')).toBe(false)
  })

  it('keeps fifteen badges, every one with a mark and a colour of its own to draw', () => {
    const badges = ACHIEVEMENTS.filter(a => a.kind === 'badge')
    expect(badges).toHaveLength(15)
    expect(new Set(badges.map(b => b.key)).size).toBe(15)
  })

  describe('the seven that came after', () => {
    /** Noon on a day of a month in 2026, stored. @param {number} m @param {number} d */
    const on = (m, d) => new Date(2026, m - 1, d, 12).toISOString()
    const has = (/** @type {Record<string, any>} */ input, /** @type {string} */ k) => evaluateAchievements({ today: TODAY, ...input }).has(k)

    it('Pay Yourself First: into savings, from somewhere that is not', () => {
      const accounts = [{ name: 'BPI', type: 'bank' }, { name: 'Savings', type: 'savings' }, { name: 'MP2', type: 'savings' }]
      const moved = { date: ago(3), type: 'transfer', amount: 2000, fromAccount: 'BPI', toAccount: 'Savings' }
      const shuffled = { ...moved, fromAccount: 'MP2' }
      expect(has({ accounts, transactions: [moved] }, 'pay-yourself-first')).toBe(true)
      expect(has({ accounts, transactions: [shuffled] }, 'pay-yourself-first')).toBe(false)
    })

    it('Half Kept: a finished month that spent no more than half of what came in', () => {
      const august = (/** @type {number} */ spent) => [
        { date: on(8, 15), type: 'inflow', amount: 30000, category: 'Salary' },
        { date: on(8, 20), type: 'expense', amount: spent, category: 'Food' },
      ]
      expect(has({ transactions: august(15000) }, 'half-kept')).toBe(true)
      expect(has({ transactions: august(16000) }, 'half-kept')).toBe(false)
      // This month is not over, however well it is going.
      const september = [{ date: ago(5), type: 'inflow', amount: 30000 }, { date: ago(4), type: 'expense', amount: 100 }]
      expect(has({ transactions: september }, 'half-kept')).toBe(false)
    })

    it('A Lighter Month: a tenth less than the month before, on a month still being logged', () => {
      const july = [{ date: on(7, 10), type: 'expense', amount: 20000, category: 'Food' }]
      const august = (/** @type {number} */ days) => Array.from({ length: days }, (_, i) =>
        ({ date: on(8, i + 1), type: 'expense', amount: Math.round(17000 / days), category: 'Food' }))
      expect(has({ transactions: [...july, ...august(15)] }, 'lighter-month')).toBe(true)
      expect(has({ transactions: [...july, ...august(10)] }, 'lighter-month')).toBe(false)
      const barelyLess = Array.from({ length: 20 }, (_, i) => ({ date: on(8, i + 1), type: 'expense', amount: 950, category: 'Food' }))
      expect(has({ transactions: [...july, ...barelyLess] }, 'lighter-month')).toBe(false)
    })

    it('Money Back: a refund against a purchase', () => {
      const refund = { date: ago(2), type: 'expense', amount: -500, category: 'Shopping', refundOf: 'tx-1' }
      expect(has({ transactions: [refund] }, 'money-back')).toBe(true)
      expect(has({ transactions: [tx(2, 'expense')] }, 'money-back')).toBe(false)
    })

    it('Fair Share and All Squared: money a friend owes you, split and then paid', () => {
      const split = { name: 'Ana', type: 'owed_to_me', amount: 600, amountPaid: 0, sourceTxId: 'dinner' }
      expect(has({ debts: [split] }, 'fair-share')).toBe(true)
      expect(has({ debts: [split] }, 'all-squared')).toBe(false)
      expect(has({ debts: [{ ...split, amountPaid: 600 }] }, 'all-squared')).toBe(true)
      // Paying off what you owe is Debt Cleared's, not this.
      expect(has({ debts: [{ name: 'Bank', type: 'i_owe', amount: 600, amountPaid: 600 }] }, 'all-squared')).toBe(false)
      // And being paid back is All Squared's, not Debt Cleared's.
      expect(has({ debts: [{ ...split, amountPaid: 600 }] }, 'debt-cleared')).toBe(false)
    })

    it('Worldly: money held in two currencies, not an account opened and left empty', () => {
      const peso = { name: 'BPI', type: 'bank', balance: 1000, currency: 'PHP' }
      expect(has({ accounts: [peso, { name: 'USD', type: 'bank', balance: 50, currency: 'USD' }] }, 'two-currencies')).toBe(true)
      expect(has({ accounts: [peso, { name: 'USD', type: 'bank', balance: 0, currency: 'USD' }] }, 'two-currencies')).toBe(false)
    })
  })

  it('earns nothing from an empty app', () => {
    expect(evaluateAchievements({ today: TODAY }).size).toBe(0)
  })

  /* The seven badges that became levels are the track's to award. Their old
     tests read every row, ahead-dated installments too, by older rules. */
  it('leaves the levels to their tracks, and the one-offs to posted rows', () => {
    const daily = Array.from({ length: 30 }, (_, i) => tx(i, 'expense'))
    const installment = { date: new Date(2026, 9, 20, 12).toISOString(), type: 'expense', amount: 999, category: 'Tech' }
    const withAhead = evaluateAchievements({ transactions: [...daily, installment], today: TODAY })
    expect(withAhead.has('no-spend-week')).toBe(false)     // spent every day; the next payment is a month out
    const ninetyOne = Array.from({ length: 91 }, (_, i) => tx(i % 20, 'expense'))
    const ahead = Array.from({ length: 11 }, (_, i) => ({ ...installment, date: new Date(2026, 9 + i, 20, 12).toISOString() }))
    expect(evaluateAchievements({ transactions: [...ninetyOne, ...ahead], today: TODAY }).has('century')).toBe(false)
    const plan = Array.from({ length: 24 }, (_, i) => ({ ...installment, date: new Date(2026, 9 + i, 20, 12).toISOString() }))
    expect(evaluateAchievements({ transactions: [tx(0, 'expense'), ...plan], today: TODAY }).has('year-one')).toBe(false)
  })
})

describe('trackView', () => {
  it('points at the next level and how far along the run is', () => {
    const logging = TRACKS.find(t => t.key === 'logging')
    if (!logging) throw new Error('no logging track')
    const have = new Set(['logging-3'])
    const view = trackView(logging, { value: 5, current: 5 }, have)
    expect(view.next?.n).toBe(7)
    expect(view.share).toBeCloseTo(5 / 7)
    expect(view.earnedCount).toBe(1)
  })

  it('reads a finished track as full', () => {
    const goals = TRACKS.find(t => t.key === 'goals')
    if (!goals) throw new Error('no goals track')
    const have = new Set(goals.tiers.map(tier => tierKey(goals, tier)))
    expect(trackView(goals, { value: 9 }, have).share).toBe(1)
  })
})

describe('trackProgress', () => {
  it('survives a track that throws rather than losing the rest', () => {
    const p = trackProgress({ transactions: [tx(1, 'expense')], accounts: /** @type {any} */ (null), today: TODAY })
    expect(p.entries.value).toBe(1)
    expect(p.held.value).toBe(0)
  })

  /* August's last day is logged on September 1st: August is judged once the
     1st is over. */
  it('judges a month once the 1st after it is over', () => {
    const at = (/** @type {number} */ m, /** @type {number} */ d, /** @type {string} */ type, /** @type {number} */ amount) =>
      ({ date: new Date(2026, m, d, 12).toISOString(), type, amount, category: type === 'inflow' ? 'Salary' : 'Food' })
    const august = [at(7, 1, 'inflow', 30000), at(7, 20, 'expense', 12000)]
    expect(trackProgress({ transactions: august, today: new Date(2026, 8, 1, 10) }).green.value).toBe(0)
    expect(trackProgress({ transactions: august, today: new Date(2026, 8, 2, 10) }).green.value).toBe(1)
  })

  it('counts months on budget only from when there were limits', () => {
    const categories = [{ name: 'Food', type: 'expense', budget: 5000 }, { name: 'Coffee', type: 'expense', budget: 900 }]
    const months = [5, 6, 7].map(m => ({ date: new Date(2026, m, 10, 12).toISOString(), type: 'expense', amount: 100, category: 'Food' }))
    expect(trackProgress({ transactions: months, categories, today: TODAY }).budget.value).toBe(3)
    expect(trackProgress({ transactions: months, categories, today: TODAY, budgetFrom: '2026-08' }).budget.value).toBe(1)
  })

  it('does not count an inflow category\'s stray budget as a limit to stay inside', () => {
    // One real limit and one left on Salary: not the two limits the track needs.
    const categories = [{ name: 'Food', type: 'expense', budget: 5000 }, { name: 'Salary', type: 'inflow', budget: 90000 }]
    const months = [5, 6, 7].map(m => ({ date: new Date(2026, m, 10, 12).toISOString(), type: 'expense', amount: 100, category: 'Food' }))
    expect(trackProgress({ transactions: months, categories, today: TODAY }).budget.value).toBe(0)
  })

  it('does not count a balance in a currency it cannot price', () => {
    const accounts = [{ name: 'BPI', type: 'bank', balance: 150000 }, { name: 'Yen', type: 'bank', balance: 1000000, currency: 'JPY' }]
    expect(trackProgress({ accounts, today: TODAY }).held.value).toBe(150000)
  })
})
