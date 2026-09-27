/**
 * Challenges: each one's window, and the moment it is won or missed.
 *
 * Two rules run through all of them (see the header of lib/challenges.js): a
 * day settles only once the day after it is over, and a day nobody kept track
 * of does not count as a quiet one. Most tests here open the app every day -
 * OPEN - so they can be about timing; the untracked cases say so.
 */
import { describe, it, expect } from 'vitest'
import { CHALLENGES, challengeDef, judgeChallenge, niceAmount, timeLeft, topCategory } from './challenges'
import { addDays, dayKey } from './achievements'

/** Wed 16 Sep 2026, 10:00 local. */
const WED = new Date(2026, 8, 16, 10)
/** A stored timestamp at noon on a day key. @param {string} day */
const at = (day) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12).toISOString()
}
/** @param {string} day @param {number} amount @param {string} [category] @param {string} [type] */
const spend = (day, amount, category = 'Food', type = 'expense') => ({ date: at(day), type, amount, category })
/** 9am on a day of September 2026. @param {number} d */
const sep = (d, h = 9) => new Date(2026, 8, d, h)

/** The app opened every day from late August to early November. */
const OPEN = Array.from({ length: 70 }, (_, i) => addDays('2026-08-25', i))

/** @param {string} key */
function def(key) {
  const d = challengeDef(key)
  if (!d) throw new Error(`no challenge ${key}`)
  return d
}

/**
 * Plan a challenge on `today`, then judge it on `later`.
 * @param {string} key @param {any[]} txs @param {Date} today @param {Date} later
 * @param {Record<string, any>} [params] @param {{activeDays?: string[], categories?: any[], judgeCategories?: any[]}} [opts]
 */
function run(key, txs, today, later, params = {}, opts = {}) {
  const d = def(key)
  const activeDays = opts.activeDays ?? OPEN
  const ctx = { transactions: txs, today, activeDays, categories: opts.categories }
  const plan = d.plan(ctx, { ...d.defaults(ctx), ...params })
  const row = { key, status: /** @type {const} */ ('active'), ...plan }
  return {
    plan,
    judged: judgeChallenge(row, { transactions: txs, today: later, activeDays, categories: opts.judgeCategories ?? opts.categories }),
  }
}

describe('the catalogue', () => {
  it('has unique keys, and every one can be planned and judged on an empty ledger', () => {
    const keys = CHALLENGES.map(c => c.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const c of CHALLENGES) {
      const plan = c.plan({ transactions: [], today: WED }, c.defaults({ transactions: [], today: WED }))
      expect(plan.startDay <= plan.endDay).toBe(true)
      expect(c.judge({ transactions: [], categories: [], today: WED }, { key: c.key, status: 'active', ...plan })).toBeTruthy()
    }
  })
})

describe('no-spend-day', () => {
  /* The 17th is for logging the 16th's stragglers; the day is won once that
     is over too. */
  it('runs today when nothing is spent yet, and is won once the day after it is over', () => {
    const { plan, judged } = run('no-spend-day', [], WED, WED)
    expect(plan.startDay).toBe('2026-09-16')
    expect(judged).toMatchObject({ status: 'active', settling: false, progress: 'Nothing spent yet' })
    expect(run('no-spend-day', [], WED, sep(17)).judged).toMatchObject({ status: 'active', settling: true })
    expect(run('no-spend-day', [], WED, sep(18)).judged).toMatchObject({ status: 'won', progress: 'Nothing spent' })
  })

  it('is missed by lunch logged the next morning for the day before', () => {
    expect(run('no-spend-day', [spend('2026-09-16', 180)], WED, sep(17)).judged?.status).toBe('active')
    const row = { key: 'no-spend-day', status: /** @type {const} */ ('active'), startDay: '2026-09-16', endDay: '2026-09-16' }
    expect(judgeChallenge(row, { transactions: [spend('2026-09-16', 180)], today: sep(17), activeDays: OPEN })).toMatchObject({ status: 'lost', progress: 'Spent that day' })
  })

  it('moves past today, and past any day with spending already scheduled', () => {
    expect(run('no-spend-day', [spend('2026-09-16', 50)], WED, WED).plan.startDay).toBe('2026-09-17')
    // An installment's next payment, dated ahead, is spending committed to.
    const scheduled = [spend('2026-09-16', 50), spend('2026-09-17', 2500, 'Shopping')]
    expect(run('no-spend-day', scheduled, WED, WED).plan.startDay).toBe('2026-09-18')
  })

  it('is not won by a day nobody kept track of', () => {
    expect(run('no-spend-day', [], WED, sep(19), {}, { activeDays: [] }).judged).toMatchObject({ status: 'lost', progress: 'Went untracked' })
    // Opened the next day is enough: that is when yesterday gets logged.
    expect(run('no-spend-day', [], WED, sep(19), {}, { activeDays: ['2026-09-17'] }).judged?.status).toBe('won')
  })
})

describe('no-spend-weekend', () => {
  it('plans the coming Saturday and Sunday', () => {
    const { plan } = run('no-spend-weekend', [], WED, WED)
    expect(plan).toMatchObject({ startDay: '2026-09-19', endDay: '2026-09-20' })
  })

  it('starts today on a clean Saturday, and waits a week on a Sunday', () => {
    expect(run('no-spend-weekend', [], sep(19), sep(19)).plan.startDay).toBe('2026-09-19')
    expect(run('no-spend-weekend', [], sep(20), sep(20)).plan.startDay).toBe('2026-09-26')
  })

  it('skips a weekend that already has spending scheduled on it', () => {
    expect(run('no-spend-weekend', [spend('2026-09-20', 999, 'Bills')], WED, WED).plan.startDay).toBe('2026-09-26')
  })

  it('is won once Monday is over, and missed by a Sunday coffee at once', () => {
    expect(run('no-spend-weekend', [spend('2026-09-18', 400)], WED, sep(21, 8)).judged).toMatchObject({ status: 'active', settling: true, progress: '2 of 2 days' })
    expect(run('no-spend-weekend', [spend('2026-09-18', 400)], WED, sep(22, 8)).judged?.status).toBe('won')
    const weekend = { key: 'no-spend-weekend', status: /** @type {const} */ ('active'), startDay: '2026-09-19', endDay: '2026-09-20' }
    const coffee = [spend('2026-09-20', 150, 'Coffee')]
    expect(judgeChallenge(weekend, { transactions: coffee, today: sep(20, 20), activeDays: OPEN })?.status).toBe('lost')
  })
})

describe('quiet-five', () => {
  it('is won once its fifth quiet day has settled', () => {
    const txs = [spend('2026-09-17', 10), spend('2026-09-19', 10)]
    // 16, 18, 20, 21, 22 are quiet: the fifth settles once the 23rd is over.
    expect(run('quiet-five', txs, WED, sep(22, 20)).judged).toMatchObject({ status: 'active', progress: '4 of 5 days' })
    expect(run('quiet-five', txs, WED, sep(23, 8)).judged).toMatchObject({ status: 'active', settling: true, progress: '5 of 5 days' })
    expect(run('quiet-five', txs, WED, sep(24, 8)).judged?.status).toBe('won')
  })

  it('is missed once five cannot be reached in what is left', () => {
    const txs = Array.from({ length: 11 }, (_, i) => spend(addDays('2026-09-16', i), 10))
    expect(run('quiet-five', txs, WED, sep(27)).judged?.status).toBe('lost')
  })

  it('does not count quiet days nobody kept track of', () => {
    const txs = [spend('2026-09-17', 10), spend('2026-09-19', 10)]
    expect(run('quiet-five', txs, WED, sep(24, 8), {}, { activeDays: [] }).judged?.status).toBe('active')
  })
})

describe('log-seven', () => {
  it('is won the moment the seventh day is logged', () => {
    const all = Array.from({ length: 7 }, (_, i) => spend(addDays('2026-09-16', i), 5))
    expect(run('log-seven', all, WED, sep(22, 21)).judged?.status).toBe('won')
  })

  /* Friday's lunch logged on Saturday morning still counts for Friday. */
  it('is missed only once the day after a gap is over too', () => {
    const gap = Array.from({ length: 7 }, (_, i) => spend(addDays('2026-09-16', i), 5)).filter((_, i) => i !== 2)
    expect(run('log-seven', gap, WED, sep(19)).judged?.status).toBe('active')
    expect(run('log-seven', gap, WED, sep(20)).judged?.status).toBe('lost')
  })

  it('does not call today missed before it is over', () => {
    expect(run('log-seven', [spend('2026-09-16', 5)], WED, sep(17)).judged?.status).toBe('active')
  })
})

describe('category-cap', () => {
  const history = Array.from({ length: 28 }, (_, i) => spend(addDays('2026-08-19', i), 200, 'Coffee'))
  const coffee = { name: 'Coffee', type: 'expense', syncId: 'cat-coffee' }

  it('suggests the top category at four-fifths of a normal week', () => {
    const d = def('category-cap').defaults({ transactions: history, today: WED })
    expect(d.category).toBe('Coffee')
    expect(d.cap).toBe(niceAmount(1400 * 0.8))
  })

  it('is missed the moment the category passes the cap, and won under it once the week settles', () => {
    const over = [...history, spend('2026-09-17', 900, 'Coffee'), spend('2026-09-18', 400, 'Coffee')]
    expect(run('category-cap', over, WED, sep(18, 20), { category: 'Coffee', cap: 1000 }).judged?.status).toBe('lost')
    const under = [...history, spend('2026-09-17', 300, 'Coffee'), spend('2026-09-18', 5000, 'Rent')]
    expect(run('category-cap', under, WED, sep(23), { category: 'Coffee', cap: 1000 }).judged).toMatchObject({ status: 'active', settling: true })
    expect(run('category-cap', under, WED, sep(24), { category: 'Coffee', cap: 1000 }).judged?.status).toBe('won')
  })

  it('counts what is already scheduled inside the week', () => {
    const scheduled = [...history, spend('2026-09-21', 1200, 'Coffee')]
    expect(run('category-cap', scheduled, WED, sep(17), { category: 'Coffee', cap: 1000 }).judged?.status).toBe('lost')
  })

  /* Renaming a category rewrites its transactions; a cap looking for the old
     name would find nothing spent and call the week won. */
  it('follows its category through a rename', () => {
    const renamed = [...history, spend('2026-09-17', 3400, 'Cafe')]
    const { plan, judged } = run('category-cap', renamed, WED, sep(18), { category: 'Coffee', cap: 1000 }, {
      categories: [coffee], judgeCategories: [{ ...coffee, name: 'Cafe' }],
    })
    expect(plan.params.categoryId).toBe('cat-coffee')
    expect(judged).toMatchObject({ status: 'lost', subject: 'Cafe' })
  })

  it('is missed when a day of the week went untracked', () => {
    // Opened on the first three days only, nothing logged after: the 20th and 21st went unseen.
    const judged = run('category-cap', history, WED, sep(24), { category: 'Coffee', cap: 1000 }, { activeDays: ['2026-09-16', '2026-09-17', '2026-09-18'] }).judged
    expect(judged).toMatchObject({ status: 'lost', progress: 'Went untracked' })
  })

  it('is not offered without spending to cap', () => {
    expect(def('category-cap').available({ transactions: [], today: WED }).ok).toBe(false)
    expect(topCategory({ transactions: [], today: WED })).toBeNull()
  })

  /* A month's bills outweigh a month of coffee, but they are paid on a
     couple of days: there is no week under a cap to be had from them. */
  it('suggests everyday spending over a bigger bill paid once or twice', () => {
    const bills = [spend('2026-08-28', 4200, 'Bills'), spend('2026-09-08', 4100, 'Bills')]
    expect(topCategory({ transactions: [...history, ...bills], today: WED })?.name).toBe('Coffee')
    // With nothing everyday to go on, the biggest is still the answer.
    expect(topCategory({ transactions: bills, today: WED })?.name).toBe('Bills')
  })
})

describe('spend-less', () => {
  it('takes last week as the number to beat, loses on reaching it, and wins once the week settles', () => {
    const last = [spend('2026-09-10', 1000), spend('2026-09-14', 500)]
    const { plan } = run('spend-less', last, WED, WED)
    expect(plan.params.target).toBe(1500)
    const matched = [...last, spend('2026-09-17', 1500)]
    expect(run('spend-less', matched, WED, sep(18)).judged?.status).toBe('lost')
    expect(run('spend-less', [...last, spend('2026-09-17', 700)], WED, sep(23)).judged?.status).toBe('active')
    expect(run('spend-less', [...last, spend('2026-09-17', 700)], WED, sep(24)).judged?.status).toBe('won')
  })

  it('is not offered when this week has already spent more than all of the last', () => {
    const d = def('spend-less')
    expect(d.available({ transactions: [spend('2026-09-12', 500), spend('2026-09-16', 600)], today: WED }).ok).toBe(false)
    expect(d.available({ transactions: [spend('2026-09-12', 500), spend('2026-09-16', 200)], today: WED }).ok).toBe(true)
  })
})

describe('keep-month', () => {
  it('judges the whole month, once it has settled', () => {
    const txs = [spend('2026-09-01', 30000, 'Salary', 'inflow'), spend('2026-09-05', 20000)]
    const { plan } = run('keep-month', txs, WED, WED, { amount: 5000 })
    expect(plan).toMatchObject({ startDay: '2026-09-16', endDay: '2026-09-30' })
    expect(run('keep-month', txs, WED, sep(25), { amount: 5000 }).judged?.status).toBe('active')
    expect(run('keep-month', txs, WED, new Date(2026, 9, 1, 9), { amount: 5000 }).judged).toMatchObject({ status: 'active', settling: true })
    expect(run('keep-month', txs, WED, new Date(2026, 9, 2, 9), { amount: 5000 }).judged?.status).toBe('won')
    expect(run('keep-month', txs, WED, new Date(2026, 9, 2, 9), { amount: 15000 }).judged?.status).toBe('lost')
  })

  it('waits for next month when there is less than a week of this one left', () => {
    const late = sep(27)
    expect(run('keep-month', [], late, late, { amount: 100 }).plan).toMatchObject({ startDay: '2026-10-01', endDay: '2026-10-31' })
  })
})

describe('budget-month', () => {
  const categories = [{ name: 'Food', type: 'expense', budget: 3000 }, { name: 'Coffee', type: 'expense', budget: 800 }]

  it('needs two limits, and none already passed', () => {
    expect(def('budget-month').available({ transactions: [], categories: categories.slice(0, 1), today: WED }).ok).toBe(false)
    expect(def('budget-month').available({ transactions: [spend('2026-09-02', 900, 'Coffee')], categories, today: WED }).ok).toBe(false)
    expect(def('budget-month').available({ transactions: [], categories, today: WED }).ok).toBe(true)
  })

  it('is missed the moment a limit is passed, and won once the month has settled', () => {
    const row = { key: 'budget-month', status: /** @type {const} */ ('active'), startDay: '2026-09-16', endDay: '2026-09-30' }
    const ctx = (/** @type {any[]} */ txs, /** @type {Date} */ today) => ({ transactions: txs, categories, today, activeDays: OPEN })
    expect(judgeChallenge(row, ctx([spend('2026-09-20', 900, 'Coffee')], sep(20, 20)))?.status).toBe('lost')
    expect(judgeChallenge(row, ctx([spend('2026-09-20', 500, 'Coffee')], new Date(2026, 9, 1, 9)))?.status).toBe('active')
    expect(judgeChallenge(row, ctx([spend('2026-09-20', 500, 'Coffee')], new Date(2026, 9, 2, 9)))?.status).toBe('won')
  })
})

describe('judgeChallenge', () => {
  it('keeps a finished verdict, and reads giving up as missed', () => {
    const row = { key: 'log-seven', status: /** @type {const} */ ('quit'), startDay: '2026-09-16', endDay: '2026-09-22' }
    expect(judgeChallenge(row, { transactions: [], today: WED })?.status).toBe('lost')
  })

  /* Given up on the 18th with three days logged, it stays three - the days
     logged after it was given up are not part of it. */
  it('judges a finished attempt as it stood the day it finished', () => {
    const logs = Array.from({ length: 7 }, (_, i) => spend(addDays('2026-09-16', i), 5))
    const row = {
      key: 'log-seven', status: /** @type {const} */ ('quit'), startDay: '2026-09-16', endDay: '2026-09-22',
      finishedAt: sep(18, 20).toISOString(),
    }
    expect(judgeChallenge(row, { transactions: logs, today: sep(27), activeDays: OPEN })).toMatchObject({ status: 'lost', progress: '3 of 7 days', settling: false })
  })

  it('returns null for a challenge this version does not know', () => {
    const row = { key: 'from-the-future', status: /** @type {const} */ ('active'), startDay: '2026-09-16', endDay: '2026-09-16' }
    expect(judgeChallenge(row, { transactions: [], today: WED })).toBeNull()
  })
})

describe('timeLeft', () => {
  it('says it in words', () => {
    const row = (/** @type {string} */ s, /** @type {string} */ e) => ({ key: 'x', status: /** @type {const} */ ('active'), startDay: s, endDay: e })
    expect(timeLeft(row('2026-09-17', '2026-09-17'), WED)).toBe('Starts tomorrow')
    expect(timeLeft(row('2026-09-19', '2026-09-20'), WED)).toBe('Starts Saturday')
    expect(timeLeft(row('2026-09-10', '2026-09-16'), WED)).toBe('Ends today')
    expect(timeLeft(row('2026-09-10', '2026-09-19'), WED)).toBe('3 days left')
    expect(timeLeft(row('2026-09-10', '2026-09-15'), WED)).toBe('Settles tonight')
    expect(dayKey(WED)).toBe('2026-09-16')
  })
})
