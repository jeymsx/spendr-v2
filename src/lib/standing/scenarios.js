/**
 * Situations to write a note for: a way of being, in the order money tends
 * to put people in them. Each is a full set of facts - the same shape the
 * phone reads from its own tables - so the composer is tested against every
 * standing and every edge, and the gallery (standing-gallery.html) draws each
 * as the note itself.
 *
 * The first is the sample-data page's own October, to the peso; the rest
 * change one thing at a time from a shared month, so what differs between two
 * notes is the thing the scenario is about.
 *
 * @typedef {import('./facts').StandingFacts} StandingFacts
 *
 * @typedef {object} Scenario
 * @property {string} id
 * @property {string} title
 * @property {string} blurb    what is true in it, in a line
 * @property {import('./level').LevelId} level   the standing it should read as
 * @property {StandingFacts} facts
 */

const at = (/** @type {number} */ d, /** @type {number} */ h = 19, /** @type {number} */ min = 40) => new Date(2026, 9, d, h, min)

/** The sample-data page's October, on the evening of the 7th. @type {StandingFacts} */
export const SAMPLE_FACTS = {
  now: at(7),
  name: 'James',
  currency: 'PHP',
  txCount: 120,
  loggedToday: 0,
  month: {
    day: 7, days: 31, spent: 21280, earned: 8000, spentToday: 0, spentYesterday: 3390, prevSpent: 20700, quietRun: 1,
    biggestDay: { label: 'Oct 5', amount: 12240 },
    byCategory: [
      { name: 'Rent', value: 12000 }, { name: 'Shopping', value: 2700 }, { name: 'Groceries', value: 2340 },
      { name: 'Food', value: 1640 }, { name: 'Health', value: 1200 }, { name: 'Transpo', value: 930 }, { name: 'Personal', value: 470 },
    ],
    biggestBuy: { name: 'Decathlon', amount: 2700, category: 'Shopping' },
    last7: [1400, 2250, 0, 2000, 12240, 3390, 0],
    weekday: null,
  },
  budget: {
    total: 44700,
    rows: [
      { name: 'Rent', budget: 12000, spent: 12000, fixed: false },
      { name: 'Shopping', budget: 4000, spent: 2700, fixed: false },
      { name: 'Health', budget: 2200, spent: 1200, fixed: false },
      { name: 'Transpo', budget: 2500, spent: 930, fixed: false },
      { name: 'Groceries', budget: 6500, spent: 2340, fixed: false },
      { name: 'Personal', budget: 1500, spent: 470, fixed: false },
      { name: 'Food', budget: 7500, spent: 1640, fixed: false },
      { name: 'Bills', budget: 6500, spent: 0, fixed: false },
      { name: 'Entertainment', budget: 2000, spent: 0, fixed: false },
    ],
  },
  plan: {
    safe: 84313, payDate: new Date(2026, 9, 15), payName: 'Salary', payAmount: 24000,
    bills: [
      { name: 'Globe Postpaid', amount: 999, date: new Date(2026, 9, 12), kind: 'bill', account: 'GCash', overdue: false },
      { name: 'BPI Credit', amount: 4608, date: new Date(2026, 9, 15), kind: 'card', account: 'BPI Credit', overdue: false },
    ],
    shortOn: null, belowFloorOn: null, floor: 0, liquid: 92262,
  },
  worth: { total: 141400, spending: 47570, savings: 52000, invested: 52340, owed: 11500, owedToYou: 0, changeMonth: -13280 },
  cards: [{ name: 'BPI Credit', owed: 7308, limit: 40000, free: 32692 }],
  goal: null,
  last: { spent: 43700, earned: 57700, label: 'September' },
}

/**
 * A scenario's facts: the sample's, with some parts replaced. Nested parts
 * are merged one level down, so a scenario can change "month.spent" without
 * restating the month.
 *
 * @param {Record<string, any>} patch
 * @returns {StandingFacts}
 */
function facts(patch) {
  /** @type {Record<string, any>} */
  const out = { ...SAMPLE_FACTS }
  for (const [k, v] of Object.entries(patch)) {
    const base = /** @type {Record<string, any>} */ (SAMPLE_FACTS)[k]
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && base && typeof base === 'object' && !Array.isArray(base)
      ? { ...base, ...v }
      : v
  }
  return /** @type {StandingFacts} */ (out)
}

/** A budget of the sample's categories with what each has spent. @param {Record<string, number>} spent */
function budgetWith(spent) {
  const limits = { Rent: 12000, Shopping: 4000, Health: 2200, Transpo: 2500, Groceries: 6500, Personal: 1500, Food: 7500, Bills: 6500, Entertainment: 2000 }
  return {
    total: Object.values(limits).reduce((a, b) => a + b, 0),
    rows: Object.entries(limits).map(([name, budget]) => ({ name, budget, spent: spent[name] ?? 0, fixed: false })),
  }
}

/** @type {Scenario[]} */
export const SCENARIOS = [
  {
    id: 'sample', title: 'The sample data, as it is', level: 'steady',
    blurb: 'Day 7. Rent is paid and is half of what has gone; nothing today; payday in 8 days.',
    facts: SAMPLE_FACTS,
  },
  {
    id: 'ahead', title: 'Comfortably ahead', level: 'ahead',
    blurb: 'Day 18, paid, a third of the budget used, last month beaten, a goal closing in.',
    facts: facts({
      now: at(18, 12, 10),
      month: {
        day: 18, spent: 14200, earned: 52000, spentToday: 320, spentYesterday: 0, prevSpent: 24800, quietRun: 0,
        biggestDay: { label: 'Oct 2', amount: 6100 },
        byCategory: [{ name: 'Rent', value: 6100 }, { name: 'Groceries', value: 3100 }, { name: 'Food', value: 2200 }],
        biggestBuy: null, last7: [800, 0, 1900, 0, 640, 0, 320],
      },
      budget: budgetWith({ Rent: 6100, Groceries: 3100, Food: 2200, Transpo: 1800, Personal: 1000 }),
      plan: {
        safe: 61000, payDate: new Date(2026, 9, 31), payName: 'Salary', payAmount: 52000,
        bills: [{ name: 'Globe Postpaid', amount: 999, date: new Date(2026, 9, 24), kind: 'bill', account: 'GCash', overdue: false }],
        liquid: 118000,
      },
      worth: { total: 168900, spending: 62000, savings: 71000, invested: 52340, owed: 16440, changeMonth: 11200 },
      goal: { name: 'Emergency fund', saved: 64000, target: 100000, pct: 64, left: 36000 },
    }),
  },
  {
    id: 'warm', title: 'Running warm', level: 'hot',
    blurb: 'Day 10, 55% of the budget used with 32% of the month gone, 40% above last month.',
    facts: facts({
      now: at(10, 18, 5),
      month: {
        day: 10, spent: 24600, earned: 24000, spentToday: 1450, spentYesterday: 2100, prevSpent: 17500, quietRun: 0,
        biggestDay: { label: 'Oct 8', amount: 5400 },
        byCategory: [{ name: 'Food', value: 6900 }, { name: 'Shopping', value: 5300 }, { name: 'Groceries', value: 4100 }],
        biggestBuy: { name: 'Sneakers', amount: 4200, category: 'Shopping' },
        last7: [1800, 900, 2600, 5400, 1200, 2100, 1450],
      },
      budget: budgetWith({ Food: 7900, Shopping: 3900, Groceries: 4100, Transpo: 1600, Personal: 1100, Bills: 2000 }),
      plan: { safe: 38000, payDate: new Date(2026, 9, 15), payName: 'Salary', payAmount: 24000, bills: [], liquid: 62000 },
      worth: { total: 96500, spending: 22000, savings: 40000, invested: 44000, owed: 9500, changeMonth: -6200 },
    }),
  },
  {
    id: 'tight', title: 'Bills crowd the cash', level: 'tight',
    blurb: 'Day 24. ₱9,000 spendable, ₱6,400 of it already spoken for before payday.',
    facts: facts({
      now: at(24, 20, 30),
      month: {
        day: 24, spent: 41200, earned: 24000, spentToday: 0, spentYesterday: 640, prevSpent: 38000, quietRun: 1,
        biggestDay: { label: 'Oct 5', amount: 13400 }, byCategory: [{ name: 'Rent', value: 12000 }, { name: 'Food', value: 7800 }],
        biggestBuy: null, last7: [640, 0, 2300, 0, 900, 640, 0],
      },
      budget: budgetWith({ Rent: 12000, Food: 7800, Groceries: 6200, Shopping: 3800, Transpo: 2300, Bills: 6000, Personal: 1300, Health: 1800 }),
      plan: {
        safe: 2600, payDate: new Date(2026, 9, 31), payName: 'Salary', payAmount: 24000,
        bills: [
          { name: 'Meralco', amount: 3400, date: new Date(2026, 9, 26), kind: 'bill', account: 'GCash', overdue: false },
          { name: 'BPI Credit', amount: 3000, date: new Date(2026, 9, 28), kind: 'card', account: 'BPI Credit', overdue: false },
        ],
        liquid: 9000,
      },
      worth: { total: 61000, spending: 9000, savings: 20000, invested: 44000, owed: 12000, changeMonth: -17400 },
      cards: [{ name: 'BPI Credit', owed: 12000, limit: 20000, free: 8000 }],
    }),
  },
  {
    id: 'short', title: 'The money runs out', level: 'short',
    blurb: 'Cash goes below zero on Oct 12, three days before payday.',
    facts: facts({
      now: at(9, 21, 15),
      month: { day: 9, spent: 30400, earned: 0, spentToday: 880, spentYesterday: 1200, prevSpent: 26000, quietRun: 0, biggestDay: { label: 'Oct 3', amount: 14000 }, byCategory: [{ name: 'Rent', value: 14000 }], last7: [900, 14000, 700, 1100, 1900, 1200, 880] },
      budget: budgetWith({ Rent: 14000, Food: 5600, Groceries: 4400, Transpo: 2400, Shopping: 2200, Bills: 1800 }),
      plan: {
        safe: 0, payDate: new Date(2026, 9, 15), payName: 'Salary', payAmount: 24000,
        bills: [
          { name: 'Globe Postpaid', amount: 999, date: new Date(2026, 9, 11), kind: 'bill', account: 'GCash', overdue: false },
          { name: 'Meralco', amount: 3200, date: new Date(2026, 9, 12), kind: 'bill', account: 'GCash', overdue: false },
        ],
        shortOn: new Date(2026, 9, 12), liquid: 2100,
      },
      worth: { total: 18000, spending: 2100, savings: 0, invested: 28000, owed: 12100, changeMonth: -30400 },
    }),
  },
  {
    id: 'over', title: 'Past the budget', level: 'tight',
    blurb: 'Day 21 and ₱3,200 over the month, with 11 days still to go.',
    facts: facts({
      now: at(21, 19, 0),
      month: { day: 21, spent: 47900, earned: 52000, spentToday: 1800, spentYesterday: 2400, prevSpent: 36000, quietRun: 0, biggestDay: { label: 'Oct 14', amount: 9000 }, byCategory: [{ name: 'Rent', value: 12000 }, { name: 'Food', value: 9600 }], last7: [2100, 1900, 2800, 2400, 1600, 2400, 1800] },
      budget: budgetWith({ Rent: 12000, Food: 9600, Groceries: 7200, Shopping: 5600, Transpo: 3100, Bills: 6500, Entertainment: 2300, Health: 1600 }),
      plan: { safe: 22000, payDate: new Date(2026, 9, 31), payName: 'Salary', payAmount: 52000, bills: [], liquid: 41000 },
      worth: { total: 88000, spending: 21000, savings: 20000, invested: 52000, owed: 5000, changeMonth: 4100 },
    }),
  },
  {
    id: 'payday', title: 'Payday', level: 'ahead',
    blurb: 'Salary lands today, with ₱5,607 of bills waiting behind it.',
    facts: facts({
      now: at(15, 9, 20),
      month: { day: 15, spent: 19800, earned: 8000, spentToday: 0, spentYesterday: 640, prevSpent: 21000, quietRun: 1, last7: [900, 0, 0, 2200, 640, 640, 0], biggestDay: { label: 'Oct 5', amount: 12240 } },
      budget: budgetWith({ Rent: 12000, Food: 3100, Groceries: 2100, Transpo: 900, Personal: 700, Shopping: 1000 }),
      plan: {
        safe: 78000, payDate: new Date(2026, 9, 15), payName: 'Salary', payAmount: 24000,
        bills: [{ name: 'BPI Credit', amount: 4608, date: new Date(2026, 9, 15), kind: 'card', account: 'BPI Credit', overdue: false }, { name: 'Globe Postpaid', amount: 999, date: new Date(2026, 9, 18), kind: 'bill', account: 'GCash', overdue: false }],
        liquid: 90000,
      },
    }),
  },
  {
    id: 'month-start', title: 'The first days of a month', level: 'steady',
    blurb: 'Day 2. Last month ended a thousand under; a clean budget to spend.',
    facts: facts({
      now: at(2, 8, 30),
      month: { day: 2, spent: 12400, earned: 0, spentToday: 0, spentYesterday: 12400, prevSpent: 12900, quietRun: 1, last7: [], biggestDay: null, byCategory: [{ name: 'Rent', value: 12000 }] },
      budget: budgetWith({ Rent: 12000, Groceries: 400 }),
      plan: { safe: 91000, payDate: new Date(2026, 9, 15), payName: 'Salary', payAmount: 24000, bills: [], liquid: 98000 },
      worth: { total: 152000, spending: 52000, savings: 52000, invested: 52340, owed: 4340, changeMonth: -12400 },
    }),
  },
  {
    id: 'month-end', title: 'The last days of a month', level: 'steady',
    blurb: 'Day 29, three days left, ₱5,800 still in the budget.',
    facts: facts({
      now: at(29, 17, 45),
      month: { day: 29, spent: 38900, earned: 52000, spentToday: 0, spentYesterday: 420, prevSpent: 37000, quietRun: 2, last7: [900, 0, 2100, 420, 0, 420, 0], biggestDay: { label: 'Oct 5', amount: 12240 } },
      budget: budgetWith({ Rent: 12000, Food: 6600, Groceries: 5400, Transpo: 2100, Shopping: 3000, Bills: 6000, Personal: 1300, Health: 1500 }),
      plan: { safe: 70000, payDate: new Date(2026, 10, 15), payName: 'Salary', payAmount: 24000, bills: [], liquid: 96000 },
      worth: { total: 171000, spending: 70000, savings: 52000, invested: 52340, owed: 3340, changeMonth: 6100 },
    }),
  },
  {
    id: 'fresh', title: 'A brand new ledger', level: 'fresh',
    blurb: 'Two things logged. Nothing to read yet - and it says so kindly.',
    facts: facts({
      now: at(5, 10, 0), txCount: 2, loggedToday: 2,
      month: { day: 5, spent: 350, earned: 0, spentToday: 350, spentYesterday: null, prevSpent: null, quietRun: 0, last7: [], biggestDay: null, byCategory: [], biggestBuy: null },
      budget: null, plan: null, worth: { total: 6800, spending: 6800, savings: 0, invested: 0, owed: 0, owedToYou: 0, changeMonth: null },
      cards: [], goal: null, last: { spent: null, earned: null, label: null },
    }),
  },
  {
    id: 'nothing', title: 'Nothing at all', level: 'fresh',
    blurb: 'No transactions, no accounts, no name.',
    facts: facts({
      now: at(5, 10, 0), name: '', txCount: 0, loggedToday: 0,
      month: { day: 5, spent: 0, earned: 0, spentToday: 0, spentYesterday: null, prevSpent: null, quietRun: 0, last7: [], biggestDay: null, byCategory: [], biggestBuy: null },
      budget: null, plan: null, worth: null, cards: [], goal: null, last: { spent: null, earned: null, label: null },
    }),
  },
  {
    id: 'back', title: 'Back after a quiet stretch', level: 'steady',
    blurb: 'Plenty of history, but nothing yet this month, twelve days in.',
    facts: facts({
      now: at(12, 11, 0),
      month: { day: 12, spent: 0, earned: 0, spentToday: 0, spentYesterday: 0, prevSpent: 22000, quietRun: 12, last7: [0, 0, 0, 0, 0, 0, 0], biggestDay: null, byCategory: [], biggestBuy: null },
      budget: budgetWith({}), plan: { safe: 60000, payDate: new Date(2026, 9, 15), payName: 'Salary', payAmount: 24000, bills: [], liquid: 70000 },
    }),
  },
  {
    id: 'no-budget', title: 'No budget set', level: 'steady',
    blurb: 'No category limits, so the note leans on spending and cash instead.',
    facts: facts({
      now: at(13, 14, 0),
      month: {
        day: 13, spent: 22400, earned: 8000, spentToday: 560, spentYesterday: 1800, prevSpent: 21800, quietRun: 0, last7: [700, 12000, 900, 1100, 1800, 1800, 560], biggestDay: { label: 'Oct 5', amount: 12240 },
        byCategory: [{ name: 'Rent', value: 12000 }, { name: 'Food', value: 3100 }, { name: 'Groceries', value: 2400 }],
      },
      budget: null,
      plan: {
        safe: 84313, payDate: new Date(2026, 9, 15), payName: 'Salary', payAmount: 24000,
        bills: [
          { name: 'BPI Credit', amount: 4608, date: new Date(2026, 9, 15), kind: 'card', account: 'BPI Credit', overdue: false },
          { name: 'Globe Postpaid', amount: 999, date: new Date(2026, 9, 17), kind: 'bill', account: 'GCash', overdue: false },
        ],
        liquid: 92262,
      },
    }),
  },
  {
    id: 'no-forecast', title: 'No forecast to lean on', level: 'steady',
    blurb: 'A budget and a net worth, but no recurring bills or pay set up.',
    facts: facts({ now: at(11, 16, 0), plan: null, cards: [] }),
  },
  {
    id: 'underwater', title: 'Owing more than owned', level: 'tight',
    blurb: 'Net worth below zero, mostly cards, with a card bill bigger than the cash.',
    facts: facts({
      now: at(16, 13, 0),
      worth: { total: -14200, spending: 3100, savings: 0, invested: 0, owed: 17300, owedToYou: 0, changeMonth: -2200 },
      cards: [{ name: 'BPI Credit', owed: 17300, limit: 25000, free: 7700 }],
      plan: { safe: 900, payDate: new Date(2026, 9, 31), payName: 'Salary', payAmount: 30000, bills: [{ name: 'BPI Credit', amount: 4200, date: new Date(2026, 9, 25), kind: 'card', account: 'BPI Credit', overdue: false }], liquid: 1800 },
    }),
  },
  {
    id: 'card-due', title: 'A card due tomorrow', level: 'steady',
    blurb: 'BPI Credit is due tomorrow and 70% used.',
    facts: facts({
      now: at(14, 18, 30),
      budget: budgetWith({ Rent: 12000, Food: 4200, Groceries: 3200, Transpo: 1400, Shopping: 2700, Personal: 700, Health: 1200 }),
      plan: {
        safe: 70000, payDate: new Date(2026, 9, 15), payName: 'Salary', payAmount: 24000,
        bills: [{ name: 'BPI Credit', amount: 14200, date: new Date(2026, 9, 15), kind: 'card', account: 'BPI Credit', overdue: false }], liquid: 84000,
      },
      cards: [{ name: 'BPI Credit', owed: 14000, limit: 20000, free: 6000 }],
    }),
  },
  {
    id: 'overdue', title: 'A bill is overdue', level: 'steady',
    blurb: 'Meralco was due two days ago.',
    facts: facts({
      now: at(14, 9, 0),
      budget: budgetWith({ Rent: 12000, Food: 4200, Groceries: 3200, Transpo: 1400, Shopping: 2700, Personal: 700, Health: 1200 }),
      plan: {
        safe: 40000, payDate: new Date(2026, 9, 15), payName: 'Salary', payAmount: 24000,
        bills: [{ name: 'Meralco', amount: 3400, date: new Date(2026, 9, 12), kind: 'bill', account: 'GCash', overdue: true }], liquid: 52000,
      },
    }),
  },
  {
    id: 'streak', title: 'A run of quiet days', level: 'ahead',
    blurb: 'Four days with nothing spent, well under pace.',
    facts: facts({
      now: at(20, 20, 40),
      month: { day: 20, spent: 17800, earned: 52000, spentToday: 0, spentYesterday: 0, prevSpent: 31000, quietRun: 4, last7: [1200, 2600, 0, 0, 0, 0, 0], biggestDay: { label: 'Oct 5', amount: 12240 } },
      budget: budgetWith({ Rent: 12000, Food: 2400, Groceries: 1800, Transpo: 800, Personal: 800 }),
      plan: { safe: 64000, payDate: new Date(2026, 10, 1), payName: 'Salary', payAmount: 52000, bills: [], liquid: 90000 },
      worth: { total: 158000, spending: 60000, savings: 52000, invested: 52340, owed: 6340, changeMonth: 9400 },
    }),
  },
  {
    id: 'cat-over', title: 'One category over', level: 'steady',
    blurb: 'Food is ₱1,100 over its limit; everything else is calm.',
    facts: facts({
      now: at(17, 12, 30),
      month: { day: 17, spent: 30400, earned: 52000, spentToday: 240, spentYesterday: 600, prevSpent: 30800, quietRun: 0, last7: [900, 600, 400, 0, 1200, 600, 240], biggestDay: { label: 'Oct 5', amount: 12240 } },
      budget: budgetWith({ Rent: 12000, Food: 8600, Groceries: 2600, Transpo: 1200, Shopping: 2500, Bills: 800 }),
      plan: {
        safe: 60000, payDate: new Date(2026, 9, 31), payName: 'Salary', payAmount: 52000,
        bills: [{ name: 'Globe Postpaid', amount: 999, date: new Date(2026, 9, 21), kind: 'bill', account: 'GCash', overdue: false }],
        liquid: 90000,
      },
    }),
  },
  {
    id: 'big-day', title: 'A big day today', level: 'hot',
    blurb: '₱2,400 spent today, early in the month: enough to tip it from on track to warm.',
    facts: facts({
      now: at(7, 13, 20), loggedToday: 2,
      month: { spentToday: 2400, spent: 23680, last7: [1400, 2250, 0, 2000, 12240, 3390, 2400] },
      budget: budgetWith({ Rent: 12000, Shopping: 2700, Health: 1200, Transpo: 930, Groceries: 4740, Personal: 470, Food: 1640 }),
    }),
  },
  {
    id: 'no-name-usd', title: 'No name, a dollar ledger', level: 'steady',
    blurb: 'Amounts in dollars; no name set.',
    facts: facts({
      now: at(9, 10, 0), name: '', currency: 'USD',
      month: { day: 9, spent: 1480, earned: 2100, spentToday: 12, spentYesterday: 40, prevSpent: 1500, quietRun: 0, last7: [30, 80, 0, 40, 120, 40, 12], biggestDay: { label: 'Oct 1', amount: 900 }, byCategory: [{ name: 'Rent', value: 900 }, { name: 'Food', value: 320 }], biggestBuy: null },
      budget: { total: 3200, rows: [{ name: 'Rent', budget: 900, spent: 900, fixed: true }, { name: 'Food', budget: 600, spent: 320, fixed: false }, { name: 'Groceries', budget: 500, spent: 120, fixed: false }, { name: 'Transpo', budget: 300, spent: 80, fixed: false }, { name: 'Fun', budget: 900, spent: 60, fixed: false }] },
      plan: { safe: 2400, payDate: new Date(2026, 9, 15), payName: 'Paycheck', payAmount: 2100, bills: [{ name: 'Internet', amount: 60, date: new Date(2026, 9, 12), kind: 'bill', account: null, overdue: false }], liquid: 3400 },
      worth: { total: 8200, spending: 3400, savings: 6000, invested: 0, owed: 1200, changeMonth: -380 },
      cards: [], last: { spent: 2900, earned: 4100, label: 'September' },
    }),
  },
  {
    id: 'late-log', title: 'Late, and nothing logged', level: 'steady',
    blurb: 'Past nine in the evening with no entries today.',
    facts: facts({ now: at(7, 21, 20), loggedToday: 0, month: { biggestBuy: null, biggestDay: null } }),
  },
  {
    id: 'weekday', title: 'A quiet kind of day', level: 'steady',
    blurb: 'Wednesdays are usually the quietest of the week.',
    facts: facts({ month: { weekday: { name: 'Wednesdays', rank: 'quiet' }, biggestBuy: null }, now: at(7, 12, 0), loggedToday: 1 }),
  },
  {
    id: 'all-green', title: 'Everything going well', level: 'ahead',
    blurb: 'Day 25, a streak, net worth up, a goal funded.',
    facts: facts({
      now: at(25, 9, 15),
      month: { day: 25, spent: 24100, earned: 52000, spentToday: 0, spentYesterday: 0, prevSpent: 36000, quietRun: 3, last7: [0, 0, 1500, 0, 0, 0, 0], biggestDay: { label: 'Oct 1', amount: 12400 } },
      budget: budgetWith({ Rent: 12000, Food: 3900, Groceries: 3100, Transpo: 1700, Personal: 1000, Bills: 2400 }),
      plan: { safe: 82000, payDate: new Date(2026, 10, 1), payName: 'Salary', payAmount: 52000, bills: [], liquid: 110000 },
      worth: { total: 194000, spending: 80000, savings: 62000, invested: 56000, owed: 4000, changeMonth: 14800 },
      goal: { name: 'Japan trip', saved: 90000, target: 90000, pct: 100, left: 0 },
    }),
  },
  {
    id: 'accounts-only', title: 'Accounts, little else', level: 'steady',
    blurb: 'Six rows logged, no budget and no forecast: only what the accounts say.',
    facts: facts({
      now: at(8, 15, 0), txCount: 6, loggedToday: 0,
      month: { day: 8, spent: 1900, earned: 0, spentToday: 0, spentYesterday: 400, prevSpent: null, quietRun: 1, last7: [], biggestDay: null, byCategory: [{ name: 'Food', value: 1100 }, { name: 'Transpo', value: 800 }], biggestBuy: null },
      budget: null, plan: null, cards: [], goal: null, last: { spent: null, earned: null, label: null },
      worth: { total: 23500, spending: 8500, savings: 15000, invested: 0, owed: 0, owedToYou: 2000, changeMonth: null },
    }),
  },
]

/** What the picture needs to draw a note's category tiles and account cards: names to their colours and glyphs. */
export const SCENARIO_CATEGORIES = [
  { name: 'Rent', icon: '🏠', color: '#FCC419' }, { name: 'Shopping', icon: '🛍️', color: '#FF8CC8' },
  { name: 'Groceries', icon: '🧴', color: '#20C997' }, { name: 'Food', icon: '🍔', color: '#FFB347' },
  { name: 'Health', icon: '💊', color: '#51CF66' }, { name: 'Transpo', icon: '🚗', color: '#2D9DFF' },
  { name: 'Personal', icon: '💆', color: '#20C997' }, { name: 'Bills', icon: '🧾', color: '#FF6B6B' },
  { name: 'Entertainment', icon: '🎮', color: '#845EF7' }, { name: 'Fun', icon: '🎮', color: '#845EF7' },
]
export const SCENARIO_ACCOUNTS = [
  { name: 'BPI Credit', type: 'credit' }, { name: 'GCash', type: 'ewallet' }, { name: 'BPI', type: 'bank' }, { name: 'Maya Savings', type: 'savings' },
]
