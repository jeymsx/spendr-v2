import { describe, expect, it } from 'vitest'
import { MONTH_END, findIncomeStreams, payName, rhythmLabel, rhythmOf, streamDates } from './incomeStreams'
import { buildForecast, FORECAST_SETTINGS_PATH } from './forecast'

const NOW = new Date(2026, 8, 10, 12)   // Thu Sep 10, 2026
const face = (/** @type {any} */ t) => t.amount ?? 0
const at = (/** @type {number} */ y, /** @type {number} */ m, /** @type {number} */ d) => new Date(y, m, d, 9).toISOString()
/** The date, moved back to the Friday before when it lands on a weekend - how payroll pays. @param {Date} d */
const workday = (d) => {
  const x = new Date(d)
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() - 1)
  return x
}
/** @param {number} y @param {number} m */
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate()

/** Salary on the 15th and the last day, March to August, weekends paid the Friday before. */
function semimonthlySalary(over = {}) {
  /** @type {Array<Record<string, any>>} */
  const rows = []
  for (let m = 2; m <= 7; m++) {
    for (const day of [15, lastDay(2026, m)]) {
      const d = workday(new Date(2026, m, day, 9))
      rows.push({ type: 'inflow', category: 'Salary', description: 'Salary', account: 'BPI', amount: day === 15 ? 18000 : 20000, date: d.toISOString(), ...over })
    }
  }
  return rows
}

const find = (/** @type {any[]} */ transactions, over = {}) =>
  findIncomeStreams({ transactions, now: NOW, lookbackDays: 183, priceOf: face, ...over })

describe('finding pay in the history', () => {
  it('reads a salary on the 15th and the last day as twice a month, weekends and all', () => {
    const { streams } = find(semimonthlySalary())
    expect(streams).toHaveLength(1)
    const s = streams[0]
    expect(s.frequency).toBe('semimonthly')
    expect(s.anchors).toEqual([15, MONTH_END])
    // The 15th's pay and the month end's, each on its own.
    expect(s.amounts).toEqual([18000, 20000])
    expect(s.name).toBe('Salary')
    expect(s.account).toBe('BPI')
    expect(rhythmLabel(s)).toBe('Twice a month, the 15th and month end')
  })

  it('expects the next paydays after the last one', () => {
    const [s] = find(semimonthlySalary()).streams
    const next = streamDates(s, new Date(2026, 9, 20)).map(x => `${x.date.getMonth() + 1}/${x.date.getDate()}:${x.amount}`)
    expect(next).toEqual(['9/15:18000', '9/30:20000', '10/15:18000'])
  })

  it('does not mistake pay every other Friday for twice a month', () => {
    /** @type {Array<Record<string, any>>} */
    const rows = []
    for (let d = new Date(2026, 2, 6, 9); d < NOW; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 14, 9)) {
      rows.push({ type: 'inflow', category: 'Salary', account: 'BPI', amount: 15000, date: d.toISOString() })
    }
    const [s] = find(rows).streams
    expect(s.frequency).toBe('fortnightly')
    const next = streamDates(s, new Date(2026, 9, 1))
    expect(next.every(x => x.date.getDay() === 5)).toBe(true)
  })

  it('finds a monthly allowance, and a weekly one', () => {
    const monthly = [3, 4, 5, 6, 7].map(m => ({ type: 'inflow', category: 'Allowance', account: 'GCash', amount: 5000, date: at(2026, m, m === 5 ? 6 : 5) }))
    /** @type {Array<Record<string, any>>} */
    const weekly = []
    for (let d = new Date(2026, 6, 6, 9); d < NOW; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, 9)) {
      weekly.push({ type: 'inflow', category: 'Baon', account: 'Cash', amount: 700, date: d.toISOString() })
    }
    const byName = Object.fromEntries(find([...monthly, ...weekly]).streams.map(s => [s.category, s]))
    expect(byName.Allowance.frequency).toBe('monthly')
    expect(byName.Allowance.anchors).toEqual([5])
    expect(byName.Baon.frequency).toBe('weekly')
    expect(byName.Baon.amount).toBe(700)
  })

  it('keeps month-end pay on the month end when it slips into the 1st', () => {
    const rows = [
      at(2026, 3, 30), at(2026, 5, 1), at(2026, 5, 30), at(2026, 7, 1), at(2026, 7, 31),
    ].map(date => ({ type: 'inflow', category: 'Salary', account: 'BPI', amount: 30000, date }))
    const [s] = find(rows).streams
    expect(s.frequency).toBe('monthly')
    // Not the 16th, which is where an average of [30, 1, 30, 1, 31] would land.
    expect(s.anchors).toEqual([MONTH_END])
  })

  it('splits a category that holds pay and other things, by what the rows are called', () => {
    const rows = [
      ...semimonthlySalary({ category: 'Income', description: 'Payroll' }),
      { type: 'inflow', category: 'Income', description: 'Sold old phone', account: 'GCash', amount: 4000, date: at(2026, 5, 3) },
      { type: 'inflow', category: 'Income', description: 'Commission', account: 'GCash', amount: 2500, date: at(2026, 7, 20) },
      { type: 'expense', category: 'Food', amount: 1, date: at(2026, 0, 5) },
    ]
    const { streams, occasionalPerDay } = find(rows)
    expect(streams).toHaveLength(1)
    expect(streams[0].name).toBe('Payroll')
    expect(streams[0].frequency).toBe('semimonthly')
    // The phone and the commission kept no rhythm: occasional, per day.
    expect(occasionalPerDay).toBeCloseTo(6500 / 183, 1)
  })

  it('reads "Salary Sep 15" and "Salary (Aug 30)" as the same pay', () => {
    expect(payName('Salary Sep 15')).toBe('salary')
    expect(payName('Salary (Aug 30)')).toBe('salary')
    expect(payName('13th month pay')).toBe('month pay')
  })

  it('drops pay that stopped: a job that ended is not a payday', () => {
    const rows = semimonthlySalary().filter(r => new Date(r.date) < new Date(2026, 5, 1))
    expect(find(rows).streams).toHaveLength(0)
  })

  it('leaves out money paid back, corrections and future-dated rows', () => {
    const rows = [
      ...[3, 4, 5, 6, 7].map(m => ({ type: 'inflow', category: 'Debt Collection', settles: ['d1'], amount: 1000, date: at(2026, m, 10) })),
      ...[3, 4, 5, 6, 7].map(m => ({ type: 'inflow', category: 'Others', description: 'Balance adjustment', adjust: 'correction', amount: 50, date: at(2026, m, 2) })),
      { type: 'inflow', category: 'Salary', amount: 50000, date: at(2026, 8, 30) },
    ]
    const { streams, occasionalPerDay } = find(rows)
    expect(streams).toHaveLength(0)
    expect(occasionalPerDay).toBe(0)
  })

  it('skips the rows the caller asks it to', () => {
    const rows = semimonthlySalary({ recurringSyncId: 'r1' })
    expect(find(rows, { skip: (/** @type {any} */ t) => !!t.recurringSyncId }).streams).toHaveLength(0)
  })

  it('needs a rhythm before it believes one', () => {
    const payments = [new Date(2026, 6, 3), new Date(2026, 6, 20)].map(date => ({ date, amount: 900, account: /** @type {string|null} */ (null), name: '' }))
    expect(rhythmOf(payments, NOW)).toBeNull()
  })
})

describe('the forecast, with pay from history', () => {
  const bank = { id: 1, name: 'BPI', type: 'bank', balance: 20000, currency: 'PHP' }
  const run = (/** @type {Record<string, any>} */ over = {}) => buildForecast({
    accounts: [bank], transactions: semimonthlySalary(), recurring: [], debts: [], base: 'PHP', rates: null,
    horizonDays: 30, now: NOW, priceOf: face, income: 'history', ...over,
  })

  it('lays the paydays out and runs safe to spend up to the next one', () => {
    const f = run()
    const pays = f.events.filter(e => e.kind === 'income')
    expect(pays.map(e => [e.date.getDate(), e.amount, e.learned, e.to])).toEqual([
      [15, 18000, true, FORECAST_SETTINGS_PATH],
      [30, 20000, true, FORECAST_SETTINGS_PATH],
    ])
    expect(f.hasIncome).toBe(true)
    expect(f.safeUntil?.getDate()).toBe(15)
    expect(f.days.at(-1)?.balance).toBe(20000 + 18000 + 20000)
  })

  it('counts nothing twice when Recurring already has the pay', () => {
    const recurring = [{ id: 9, name: 'Salary', type: 'inflow', category: 'Salary', amount: 19000, frequency: 'semimonthly', nextDate: '2026-09-15', active: true, account: 'BPI' }]
    const f = run({ income: 'both', recurring })
    const pays = f.events.filter(e => e.kind === 'income')
    expect(pays.every(e => !e.learned)).toBe(true)
    expect(pays).toHaveLength(2)
    expect(f.streams).toHaveLength(0)
  })

  it('ignores the history entirely when set to Recurring', () => {
    const f = run({ income: 'recurring' })
    expect(f.events.filter(e => e.kind === 'income')).toHaveLength(0)
    expect(f.hasIncome).toBe(false)
  })

  it('and ignores Recurring pay when set to history, but keeps the bills', () => {
    const recurring = [
      { id: 1, name: 'Rent', amount: 15000, frequency: 'monthly', nextDate: '2026-09-12', active: true, account: 'BPI' },
      { id: 2, name: 'Old salary', type: 'inflow', category: 'Work', amount: 99999, frequency: 'monthly', nextDate: '2026-09-20', active: true, account: 'BPI' },
    ]
    const f = run({ recurring })
    expect(f.events.map(e => e.name)).toEqual(['Rent', 'Salary', 'Salary'])
  })

  it('lists a payday that has not come in yet, without counting it', () => {
    // Everything but August's month-end pay.
    const rows = semimonthlySalary().filter(r => !(new Date(r.date).getMonth() === 7 && new Date(r.date).getDate() > 20))
    const f = run({ transactions: rows })
    const late = f.events.find(e => e.overdue)
    expect(late).toMatchObject({ kind: 'income', counted: false, learned: true, amount: 20000 })
    expect(late?.date.getDate()).toBe(10)
    expect(f.days[0].balance).toBe(20000)
  })

  it('spreads occasional income over the days when asked', () => {
    // An old row, so the ledger covers the whole six months the average is taken over.
    const rows = [...semimonthlySalary(), { type: 'inflow', category: 'Gift Money', amount: 18300, date: at(2026, 6, 4) },
      { type: 'expense', category: 'Food', amount: 1, date: at(2026, 0, 5) }]
    const f = run({ transactions: rows, occasional: true })
    expect(f.dailyIncome).toBe(100)
    expect(f.days[1].balance).toBe(20100)
  })
})

describe('the forecast settings that are not about pay', () => {
  const bank = { id: 1, name: 'BPI', type: 'bank', role: 'spending', balance: 20000, currency: 'PHP' }
  const savings = { id: 2, name: 'MP2 Savings', type: 'bank', role: 'savings', balance: 50000, currency: 'PHP' }
  // Twelve weeks: most cost 700, a few much more.
  /** @type {Array<Record<string, any>>} */
  const spend = []
  for (let w = 1; w <= 12; w++) {
    spend.push({ type: 'expense', account: 'BPI', category: 'Food', amount: w % 3 === 0 ? 2800 : 700, date: new Date(2026, 8, 10 - w * 7 + 2, 12).toISOString() })
  }
  const run = (/** @type {Record<string, any>} */ over = {}) => buildForecast({
    accounts: [bank, savings], transactions: spend, recurring: [], debts: [], base: 'PHP', rates: null,
    horizonDays: 30, now: NOW, priceOf: face, ...over,
  })

  it('leaves savings out of the start when told to', () => {
    expect(run().start).toBe(70000)
    expect(run({ countSavings: false }).start).toBe(20000)
  })

  it('estimates a cautious day above the usual one, and takes a set figure as given', () => {
    const typical = run()
    const cautious = run({ spend: 'cautious' })
    const custom = run({ spend: 'custom', customDaily: 250 })
    expect(typical.dailySpend).toBe(100)
    expect(cautious.dailySpend).toBeGreaterThan(typical.dailySpend ?? 0)
    expect(custom.dailySpend).toBe(250)
    // A set figure is not a guess: no likely range around it.
    expect(custom.days.at(-1)?.low).toBe(custom.days.at(-1)?.balance)
    expect(run({ spend: 'custom', customDaily: 0 }).dailySpend).toBeNull()
  })
})

describe('found pay you say is not pay', () => {
  const bank = { id: 1, name: 'BPI', type: 'bank', balance: 20000, currency: 'PHP' }
  it('is left out of the forecast, and kept aside for the settings to offer back', () => {
    /** @type {Record<string, any>} */
    const base = { accounts: [bank], transactions: semimonthlySalary(), recurring: [], debts: [], base: 'PHP', rates: null, horizonDays: 30, now: NOW, priceOf: face, income: 'history' }
    const found = buildForecast(/** @type {any} */ (base))
    const key = found.streams[0].key
    const without = buildForecast(/** @type {any} */ ({ ...base, ignoredStreams: [key] }))
    expect(without.streams).toHaveLength(0)
    expect(without.hiddenStreams.map(s => s.key)).toEqual([key])
    expect(without.events.some(e => e.kind === 'income')).toBe(false)
    expect(without.hasIncome).toBe(false)
  })
})
