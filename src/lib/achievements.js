import {
  BADGES, evaluateBadges, longestDayStreak, monthStats, nextMonth, inTheGreen, withinLimits,
} from './badges'
import { allocateGoals } from './goals'
import { isoToDateInput } from '../utils/txDate'
import { getFxContext, txBase } from './fxContext'
import { toBase } from './fx'
import { isSpend } from './flows'
import { isLiquid } from './accountMeta'
import { isBudgeted } from './budgetLevels'
import { spendingRows } from '../utils/installments'

/**
 * Achievements: badges, milestones and challenges, under one roof.
 *
 * ── Three kinds, one rule ──
 *
 * lib/badges.js set the rule, and it still holds for everything here: each
 * one means something you did with your money, and the app proves it from
 * the ledger rather than taking your word for it.
 *
 *   badge      a one-off. Settling a debt, holding four kinds of account.
 *              Earned once, kept for good.
 *   milestone  a level on a track that keeps going. A streak of days, a count
 *              of entries, money held. Reaching one level shows the next, so
 *              there is always something ahead - which is what a finite set
 *              of badges could not do once you had them all.
 *   challenge  something you choose to take on, for a set time: a weekend
 *              without spending, a week under a cap on one category. Won or
 *              missed, then yours to try again. See lib/challenges.js.
 *
 * ── The first twenty badges live on ──
 *
 * Seven of the original twenty were already a harder version of another -
 * Seven Days then Thirty Days, Century then Five Hundred - which is a track
 * in all but name. They are levels on their tracks now, under the SAME keys,
 * so everything already earned stays earned and nothing is migrated.
 *
 * ── Stored as badges ──
 *
 * A milestone level is a key and the date it was reached, exactly as a badge
 * is, so it lives in the same table and syncs through the same Supabase table
 * (006) with nothing new to run. Challenges are different - they have a start,
 * an end and a state - and get a table of their own (021).
 */

/** Local 'YYYY-MM-DD'. @param {Date} d */
export function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A day key moved by `n` days, in local time. @param {string} key @param {number} n */
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + n))
}

/** Whole days from `a` to `b`. @param {string} a @param {string} b */
export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5)
}

// ── Stored on the device ────────────────────────────────────────────────────

/**
 * Which identity this device last took stock of achievements as - a user id,
 * or 'local' signed out. A pass that finds it different writes what is earned
 * without celebrating it: the first run of this version, a sign-in that pulls
 * an account's history down, a restore or an import. Those bring months in at
 * once, and none of it was just earned. A restore or an import deletes it in
 * the same transaction as its writes, so no pass can see one without the
 * other.
 */
export const PRIMED_META = 'achievementsPrimedFor'

/** The month there were first two limits to be inside: see the budget track. */
export const BUDGET_FROM_META = 'budgetTrackFrom'

// ── Streaks ─────────────────────────────────────────────────────────────────

/**
 * The run of days with something logged: the one going now, and the longest.
 *
 * "Now" survives a day not yet logged: until today is over, a streak that
 * reached yesterday is still alive, and calling it broken at breakfast would
 * be the app being wrong about you. Rows dated ahead - an installment's later
 * months - are not logging and are left out.
 *
 * @param {any[]} transactions
 * @param {Date} today
 */
export function loggingStreak(transactions, today) {
  const now = dayKey(today)
  const past = (transactions ?? []).filter(t => {
    const d = isoToDateInput(t.date ?? '')
    return d && d <= now
  })
  const days = new Set(past.map(t => isoToDateInput(t.date ?? '')))
  let cursor = days.has(now) ? now : addDays(now, -1)
  let current = 0
  while (days.has(cursor)) { current++; cursor = addDays(cursor, -1) }
  return { current, best: Math.max(current, longestDayStreak(past)) }
}

/**
 * The run of days without spending: the one going now, and the longest.
 *
 * ── A quiet day has to be vouched for ──
 *
 * A day with no expenses is exactly what a day you never opened the app looks
 * like, and the second must not count - or a month away earns a thirty-day
 * streak on the way back. So a day counts only if something shows you were
 * keeping track: you opened Spendr that day or the next (when yesterday's
 * spending would have been logged), or logged anything at all on it.
 * `activeDays` is that record, kept on the device from the day this shipped.
 *
 * ── Today does not count until it is over ──
 *
 * Spending nothing by noon is not a no-spend day. The run ends yesterday; and
 * one peso spent today breaks it now, because that answer is already in.
 *
 * ── And a level waits for the day after ──
 *
 * `current` counts yesterday, because that is the run you are on. But
 * yesterday's lunch is often logged this morning, so `settled` - the best run
 * whose days have all had their day after - is what a level is awarded on.
 * Awarding is for good; a streak that loses yesterday to a late entry is
 * only a number going down.
 *
 * Refunds are not spending, so a day with only a refund on it is quiet.
 *
 * @param {object} input
 * @param {Array<{date?: string, type?: string, amount?: number}>} input.transactions
 * @param {string[]} [input.activeDays]
 * @param {Date} input.today
 */
export function noSpendStreak({ transactions, activeDays = [], today }) {
  const now = dayKey(today)
  const spent = new Set()
  const logged = new Set()
  let first = ''
  // A plan's later payments are the card's doing, not a day you logged or spent (utils/installments).
  for (const t of spendingRows(transactions ?? [])) {
    const d = isoToDateInput(t.date ?? '')
    if (!d || d > now) continue
    logged.add(d)
    if (!first || d < first) first = d
    // A balance correction is not spending, so it does not break a streak.
    if (isSpend(t) && txBase(/** @type {any} */ (t)) > 0) spent.add(d)
  }
  /* Today is a day the app was open - it is, or nothing would be asking -
     whether or not the write recording it has landed yet. */
  const active = new Set(activeDays)
  active.add(now)
  for (const d of active) if (d <= now && (!first || d < first)) first = d

  const vouched = (/** @type {string} */ d) => active.has(d) || active.has(addDays(d, 1)) || logged.has(d)
  let best = 0
  let settled = 0
  let run = 0
  const yesterday = addDays(now, -1)
  const lastSettled = addDays(now, -2)
  for (let d = first; d <= yesterday; d = addDays(d, 1)) {
    run = !spent.has(d) && vouched(d) ? run + 1 : 0
    if (run > best) best = run
    if (d <= lastSettled && run > settled) settled = run
  }
  const spentToday = spent.has(now)
  return { current: spentToday ? 0 : run, best, settled, spentToday }
}

/**
 * The longest run of adjacent completed months that pass, and the run that
 * ends with the last completed month.
 *
 * @param {Map<string, import('./badges').MonthStat>} stats
 * @param {(m: import('./badges').MonthStat) => boolean} passes
 * @param {Date} today
 */
export function monthRuns(stats, passes, today) {
  const good = new Set([...stats.entries()].filter(([, v]) => passes(v)).map(([k]) => k))
  let best = 0
  for (const start of good) {
    if (good.has(prevMonth(start))) continue
    let k = start, len = 1
    while (good.has(nextMonth(k))) { k = nextMonth(k); len++ }
    if (len > best) best = len
  }
  let current = 0
  let k = prevMonth(dayKey(today).slice(0, 7))
  while (good.has(k)) { current++; k = prevMonth(k) }
  return { best, current }
}

/** @param {string} key "2026-09" */
function prevMonth(key) {
  const [y, m] = key.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

// ── Tracks ──────────────────────────────────────────────────────────────────

/**
 * @typedef {object} TrackDef
 * @property {string} key
 * @property {string} name
 * @property {string} about    what the number counts
 * @property {string} unit     'days', 'entries' ... for "12 days"
 * @property {string} glyph
 * @property {string} tone
 * @property {boolean} [streak]    has a run going now, as well as a best
 * @property {boolean} [judgesMonth]
 * @property {Array<{n: number, key?: string, label?: string}>} tiers
 * @property {(n: number, label: string) => string} title
 * @property {(n: number, label: string) => string} blurb
 * @property {(n: number, label: string) => string} how
 */

/** @param {number} n */
const count = (n) => n.toLocaleString('en-US')

/** Every track, in the order the page lists them. @type {TrackDef[]} */
export const TRACKS = [
  {
    key: 'logging', name: 'Logging streak', about: 'Days in a row with something logged', unit: 'days',
    glyph: 'flame', tone: 'orange', streak: true,
    tiers: [{ n: 3 }, { n: 7, key: 'seven-days' }, { n: 14 }, { n: 30, key: 'thirty-days' }, { n: 60 }, { n: 100 }, { n: 180 }, { n: 365 }],
    title: n => `${n}-Day Streak`,
    blurb: n => (n === 7 ? 'A full week of logging, day after day.'
      : n === 30 ? 'A month of logging without missing a day.'
        : `${count(n)} days in a row with something logged.`),
    how: n => `Log something ${n} days in a row.`,
  },
  {
    key: 'nospend', name: 'No-spend streak', about: 'Days in a row without spending', unit: 'days',
    glyph: 'nospend', tone: 'lime', streak: true,
    tiers: [{ n: 3 }, { n: 7, key: 'no-spend-week' }, { n: 14 }, { n: 30 }, { n: 60 }, { n: 100 }],
    title: n => `${n} No-Spend Days`,
    blurb: n => (n === 7 ? 'Seven days in a row without spending.' : `${count(n)} days in a row without spending.`),
    how: n => `Go ${n} days in a row without logging an expense.`,
  },
  {
    key: 'entries', name: 'Entries logged', about: 'Transactions on the books', unit: 'entries',
    glyph: 'stack', tone: 'steel',
    tiers: [{ n: 1, key: 'first-peso' }, { n: 50 }, { n: 100, key: 'century' }, { n: 250 }, { n: 500, key: 'five-hundred' }, { n: 1000, label: '1K' }, { n: 2500, label: '2.5K' }, { n: 5000, label: '5K' }],
    title: n => (n === 1 ? 'First Entry' : `${count(n)} Entries`),
    blurb: n => (n === 1 ? 'You logged your first transaction.' : `${count(n)} transactions on the books.`),
    how: n => (n === 1 ? 'Log any expense, inflow or transfer.' : `Log ${count(n)} transactions.`),
  },
  {
    key: 'green', name: 'Green months', about: 'Months in a row earning more than you spent', unit: 'months',
    glyph: 'trend', tone: 'teal', judgesMonth: true,
    tiers: [{ n: 1, key: 'green-month' }, { n: 3, key: 'steady-three' }, { n: 6 }, { n: 12 }],
    title: n => (n === 1 ? 'Green Month' : `${n} Green Months`),
    blurb: n => (n === 1 ? 'You earned more than you spent.' : `${n} months running, you earned more than you spent.`),
    how: n => `Finish ${n === 1 ? 'a month' : `${n} months in a row`} with inflow above spending.`,
  },
  {
    key: 'budget', name: 'On budget', about: 'Months in a row inside every limit', unit: 'months',
    glyph: 'gauge', tone: 'green', judgesMonth: true,
    tiers: [{ n: 1, key: 'under-budget' }, { n: 3, key: 'budget-master' }, { n: 6 }, { n: 12 }],
    title: n => (n === 1 ? 'Under Budget' : `${n} Months on Budget`),
    blurb: n => (n === 1 ? 'A whole month inside every limit you set.' : `${n} months running, inside every limit.`),
    how: n => `Finish ${n === 1 ? 'a month' : `${n} months in a row`} without passing any category limit.`,
  },
  {
    key: 'held', name: 'Money held', about: 'Across your accounts, outside of credit', unit: '',
    glyph: 'crown', tone: 'gold',
    tiers: [{ n: 100000, key: 'six-figures', label: '100K' }, { n: 250000, label: '250K' }, { n: 500000, label: '500K' }, { n: 1000000, key: 'seven-figures', label: '1M' }, { n: 2500000, label: '2.5M' }],
    title: (_n, label) => `${label} Held`,
    blurb: (n, label) => (n === 100000 ? 'A hundred thousand across your accounts.'
      : n === 1000000 ? 'A million across your accounts.' : `${label} across your accounts.`),
    how: (_n, label) => `Hold ${label} outside of credit.`,
  },
  {
    key: 'goals', name: 'Goals funded', about: 'Savings goals at their target at once', unit: 'goals',
    glyph: 'flag', tone: 'amber',
    tiers: [{ n: 1, key: 'goal-funded' }, { n: 3, key: 'three-goals' }, { n: 5 }],
    title: n => (n === 1 ? 'Goal Funded' : `${n} Goals Funded`),
    blurb: n => (n === 1 ? 'A savings goal reached its target.' : `${n} savings goals funded at the same time.`),
    how: n => (n === 1 ? 'Save enough behind any goal to cover it.' : `Fund ${n} goals to their targets at the same time.`),
  },
  {
    key: 'challenges', name: 'Challenges won', about: 'Challenges you took on and finished', unit: 'won',
    glyph: 'trophy', tone: 'violet',
    tiers: [{ n: 1 }, { n: 3 }, { n: 5 }, { n: 10 }, { n: 25 }],
    title: n => (n === 1 ? 'First Challenge' : `${n} Challenges Won`),
    blurb: n => (n === 1 ? 'You took one on and saw it through.' : `${n} challenges taken on and won.`),
    how: n => (n === 1 ? 'Win any challenge.' : `Win ${n} challenges.`),
  },
]

/** A tier's own key: the legacy badge's where it was one, else track-level. @param {TrackDef} t @param {{n: number, key?: string}} tier */
export function tierKey(t, tier) {
  return tier.key ?? `${t.key}-${tier.n}`
}

/** A tier's short label: its chip, "7", "100K". @param {{n: number, label?: string}} tier */
export function tierLabel(tier) {
  return tier.label ?? count(tier.n)
}

// ── Badges: the one-offs ────────────────────────────────────────────────────

const IN_TRACKS = new Set(TRACKS.flatMap(t => t.tiers.map(tier => tier.key).filter(Boolean)))

/**
 * The badges that arrived after the original twenty. Same rule as the rest:
 * something done with the money, proved from the ledger.
 *
 * They are asked with the posted rows and the completed months - `months`,
 * judged once the 1st after a month is over, as the month tracks are - so a
 * month still running cannot earn one and have to take it back.
 *
 * @typedef {AchievementCtx & {months: Map<string, import('./badges').MonthStat>}} BadgeInput
 */
/** @type {Array<{key: string, name: string, blurb: string, how: string, tone: string, glyph: string, judgesMonth?: boolean, test: (ctx: BadgeInput) => boolean}>} */
const NEW_BADGES = [
  {
    key: 'limits-set',
    name: 'Limits Set',
    blurb: 'Three categories with a monthly limit.',
    how: 'Set a monthly limit on three categories.',
    tone: 'indigo',
    glyph: 'target',
    test: ({ categories }) => (categories ?? []).filter(isBudgeted).length >= 3,
  },
  {
    key: 'first-goal',
    name: 'Something to Save For',
    blurb: 'You set your first savings goal.',
    how: 'Create a savings goal.',
    tone: 'sky',
    glyph: 'summit',
    test: ({ goals }) => (goals ?? []).length >= 1,
  },
  /* ── Seven more, 2026-09-27 ──────────────────────────────────────────────
     Saving on purpose, spending less, and money that comes back - from a
     shop, from a friend - and money that lives in more than one currency.
     Their tones are ones the other eight badges on the page do not wear:
     those are mostly blues already. */
  {
    key: 'pay-yourself-first',
    name: 'Pay Yourself First',
    blurb: 'You moved money into savings.',
    how: 'Transfer money from another account into a savings account.',
    tone: 'teal',
    glyph: 'bank',
    /* Into savings from somewhere that is not savings: shuffling between two
       savings accounts is not setting anything aside. */
    test: ({ transactions, accounts }) => {
      // An investment counts: putting money into MP2 is setting it aside too.
      const savings = new Set((accounts ?? [])
        .filter(a => a?.type === 'savings' || a?.type === 'investment').map(a => a.name))
      return (transactions ?? []).some(t => t?.type === 'transfer' && (t.amount ?? 0) > 0
        && savings.has(t.toAccount) && !savings.has(t.fromAccount))
    },
  },
  {
    key: 'half-kept',
    name: 'Half Kept',
    blurb: 'You kept half of what came in.',
    how: 'Finish a month having spent no more than half of what came in.',
    tone: 'lime',
    glyph: 'piggy',
    judgesMonth: true,
    test: ({ months }) => [...months.values()].some(m => m.inflow > 0 && m.expense > 0 && m.expense <= m.inflow / 2),
  },
  {
    key: 'lighter-month',
    name: 'A Lighter Month',
    blurb: 'You spent less than the month before.',
    how: 'Keep logging, and spend at least 10% less in a month than the month before.',
    tone: 'orange',
    glyph: 'trendDown',
    judgesMonth: true,
    /* A month that looks lighter because nothing was logged in it is not
       one. Fifteen days with an entry is what shows you were still counting. */
    test: ({ months, transactions }) => {
      /** @type {Map<string, Set<string>>} */
      const logged = new Map()
      for (const t of transactions ?? []) {
        const d = isoToDateInput(t?.date ?? '')
        if (!d) continue
        const k = d.slice(0, 7)
        if (!logged.has(k)) logged.set(k, new Set())
        logged.get(k)?.add(d)
      }
      for (const [k, m] of months) {
        const before = months.get(prevMonth(k))
        if (!before || before.expense <= 0 || m.expense <= 0) continue
        if (m.expense <= before.expense * 0.9 && (logged.get(k)?.size ?? 0) >= 15) return true
      }
      return false
    },
  },
  {
    key: 'money-back',
    name: 'Money Back',
    blurb: 'A refund, logged against what you bought.',
    how: 'Log a refund on a purchase.',
    tone: 'plum',
    glyph: 'receipt',
    test: ({ transactions }) => (transactions ?? []).some(t => t?.type === 'expense' && !!t.refundOf),
  },
  {
    key: 'fair-share',
    name: 'Fair Share',
    blurb: 'You split a purchase with someone.',
    how: 'Split an expense with someone, so they owe you their share.',
    tone: 'violet',
    glyph: 'people',
    test: ({ debts }) => (debts ?? []).some(d => d?.type === 'owed_to_me' && !!d.sourceTxId),
  },
  {
    key: 'all-squared',
    name: 'All Squared',
    blurb: 'Someone paid you back in full.',
    how: 'Collect everything a person owed you.',
    tone: 'gold',
    glyph: 'checkCircle',
    test: ({ debts }) => (debts ?? []).some(d => d?.type === 'owed_to_me' && (d.amount ?? 0) > 0 && (d.amountPaid ?? 0) >= d.amount),
  },
  {
    key: 'two-currencies',
    name: 'Worldly',
    blurb: 'Your money lives in two currencies.',
    how: 'Hold money in accounts of two different currencies.',
    tone: 'bronze',
    glyph: 'globe',
    /* Held, not merely opened: an empty dollar account is not money in dollars. */
    test: ({ accounts }) => {
      const base = String(getFxContext().base || 'PHP').toUpperCase()
      const held = (accounts ?? []).filter(a => a && isLiquid(a) && (a.role ?? '') !== 'credit' && (a.balance ?? 0) > 0)
      return new Set(held.map(a => String(a.currency || base).toUpperCase())).size >= 2
    },
  },
]

// ── Everything earnable ─────────────────────────────────────────────────────

/**
 * @typedef {object} AchievementDef
 * @property {string} key
 * @property {'badge'|'milestone'} kind
 * @property {string} name
 * @property {string} blurb
 * @property {string} how
 * @property {string} tone
 * @property {string} glyph
 * @property {boolean} [judgesMonth]
 * @property {string} [track]  a milestone's track
 * @property {number} [n]      its threshold
 * @property {string} [level]  its chip: "7", "100K"
 */

/** @type {AchievementDef[]} */
export const ACHIEVEMENTS = [
  ...TRACKS.flatMap(t => t.tiers.map(tier => {
    const label = tierLabel(tier)
    return /** @type {AchievementDef} */ ({
      key: tierKey(t, tier), kind: 'milestone', track: t.key, n: tier.n, level: label,
      name: t.title(tier.n, label), blurb: t.blurb(tier.n, label), how: t.how(tier.n, label),
      tone: t.tone, glyph: t.glyph, judgesMonth: !!t.judgesMonth,
    })
  })),
  ...BADGES.filter(b => !IN_TRACKS.has(b.key)).map(b => /** @type {AchievementDef} */ ({
    key: b.key, kind: 'badge', name: b.name, blurb: b.blurb, how: b.how, tone: b.tone, glyph: b.glyph,
    judgesMonth: !!b.judgesMonth,
  })),
  ...NEW_BADGES.map(b => /** @type {AchievementDef} */ ({
    key: b.key, kind: 'badge', name: b.name, blurb: b.blurb, how: b.how, tone: b.tone, glyph: b.glyph,
    judgesMonth: !!b.judgesMonth,
  })),
]

const BY_KEY = new Map(ACHIEVEMENTS.map(a => [a.key, a]))

/** The definition behind a stored key, or null for one this version does not know. @param {string} key */
export function achievementDef(key) {
  return BY_KEY.get(key) ?? null
}

// ── Evaluation ──────────────────────────────────────────────────────────────

/**
 * @typedef {object} AchievementCtx
 * @property {any[]} [transactions]
 * @property {any[]} [accounts]
 * @property {any[]} [categories]
 * @property {any[]} [debts]
 * @property {any[]} [recurring]
 * @property {any[]} [goals]
 * @property {any[]} [challenges]   stored challenge rows
 * @property {string[]} [activeDays]
 * @property {Date} [today]
 * @property {string|null} [budgetFrom]  the month limits were first seen, 'YYYY-MM'
 */

/**
 * Where each track stands: `value` is what the tiers are judged against - a
 * streak's best, a count, a total - and `current` is the run going now, for
 * the tracks that have one.
 *
 * The month tracks judge a month once the 1st after it is over, for the same
 * reason the no-spend run waits a day: the 31st's spending is logged on the
 * 1st, and a green month awarded before it would be awarded for good.
 *
 * @param {AchievementCtx} input
 * @returns {Record<string, {value: number, current?: number, spentToday?: boolean}>}
 */
export function trackProgress({
  transactions = [], accounts = [], categories = [], goals = [], challenges = [], activeDays = [], today = new Date(),
  budgetFrom = null,
} = {}) {
  const out = /** @type {Record<string, {value: number, current?: number, spentToday?: boolean}>} */ ({})
  const guard = (/** @type {string} */ key, /** @type {() => {value: number, current?: number}} */ fn) => {
    try { out[key] = fn() } catch (e) {
      console.warn('[achievements] %s could not be worked out:', key, e)
      out[key] = { value: 0, current: 0 }
    }
  }
  const nowKey = dayKey(today)
  const posted = transactions.filter(t => (isoToDateInput(t?.date ?? '') || '9999') <= nowKey)
  const graceDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12)
  const months = monthStats(posted, graceDay)
  // Expense categories with a limit: a stray budget on an inflow category is not one to stay inside.
  const limits = categories.filter(isBudgeted)

  guard('logging', () => {
    const s = loggingStreak(transactions, today)
    return { value: s.best, current: s.current }
  })
  guard('nospend', () => {
    const s = noSpendStreak({ transactions, activeDays, today })
    return { value: s.settled, current: s.current, spentToday: s.spentToday }
  })
  guard('entries', () => ({ value: posted.length }))
  guard('green', () => {
    const r = monthRuns(months, inTheGreen, graceDay)
    return { value: r.best, current: r.current }
  })
  /* Only the months since there were limits to be inside. Every month is
     judged against today's limits, and two generous ones set this afternoon
     would otherwise award a year of months on budget at once. */
  guard('budget', () => {
    if (limits.length < 2) return { value: 0, current: 0 }
    const since = budgetFrom ? new Map([...months].filter(([k]) => k >= budgetFrom)) : months
    const r = monthRuns(since, withinLimits(limits), graceDay)
    return { value: r.best, current: r.current }
  })
  guard('held', () => ({ value: heldInBase(accounts) }))
  guard('goals', () => ({ value: allocateGoals({ goals, accounts }).active.filter(g => g.complete).length }))
  guard('challenges', () => ({ value: challenges.filter(c => c?.status === 'won').length }))
  return out
}

/**
 * Money held outside credit, in the ledger's own currency.
 *
 * liquidTotal adds balances as they are, which is right only while every
 * account is in one currency: a ¥1,000,000 account read as pesos is "1M
 * Held". An account in a currency with no rate yet is left out rather than
 * counted at face value, as the dashboard leaves it out of net worth.
 *
 * @param {any[]} accounts
 */
function heldInBase(accounts) {
  const { base, rates } = getFxContext()
  let total = 0
  for (const a of accounts ?? []) {
    // Money you hold: not a card, a loan, or an investment's typed value.
    if (!a || !isLiquid(a) || (a.role ?? '') === 'credit') continue
    const v = toBase(a.balance ?? 0, String(a.currency || base).toUpperCase(), base, rates)
    if (v != null && Number.isFinite(v)) total += v
  }
  return total
}

/**
 * Every key the data earns right now: each track's levels, and the one-off
 * badges - the original twenty's that are not levels, and the new ones.
 *
 * The seven original badges that became levels are decided by their track
 * alone. Their old tests still exist, in lib/badges.js, and disagree with the
 * tracks at the edges - an eight-day gap between purchases as a no-spend week,
 * scheduled installments counted as entries - so asking them too would award
 * a level the track does not reach. The one-offs are asked about posted rows
 * only: an installment's payments two years out are not two years of history.
 *
 * Like evaluateBadges this is "true now", not "ever true" - the caller unions
 * it with what is stored and never takes anything away.
 *
 * @param {AchievementCtx} input
 * @param {Record<string, {value: number}>} [progress]  trackProgress, if already worked out
 * @returns {Set<string>}
 */
export function evaluateAchievements(input = {}, progress = trackProgress(input)) {
  const nowKey = dayKey(input.today ?? new Date())
  const posted = (input.transactions ?? []).filter(t => (isoToDateInput(t?.date ?? '') || '9999') <= nowKey)
  const earned = new Set([...evaluateBadges({ ...input, transactions: posted })].filter(k => !IN_TRACKS.has(k)))
  for (const t of TRACKS) {
    const value = progress[t.key]?.value ?? 0
    for (const tier of t.tiers) if (value >= tier.n) earned.add(tierKey(t, tier))
  }
  const today = input.today ?? new Date()
  const graceDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12)
  /** @type {BadgeInput} */
  const ctx = { ...input, transactions: posted, today, months: monthStats(posted, graceDay) }
  for (const b of NEW_BADGES) {
    try { if (b.test(ctx)) earned.add(b.key) } catch { /* see evaluateBadges */ }
  }
  return earned
}

/**
 * A track, laid out for the page: its levels with whether each is reached,
 * and the next one ahead with how far along the way you are.
 *
 * @param {TrackDef} track
 * @param {{value: number, current?: number}} progress
 * @param {Set<string>} have  keys earned
 */
export function trackView(track, progress, have) {
  const tiers = track.tiers.map(tier => {
    const key = tierKey(track, tier)
    return { key, n: tier.n, label: tierLabel(tier), earned: have.has(key) }
  })
  const next = tiers.find(t => !t.earned) ?? null
  const prev = [...tiers].reverse().find(t => t.earned) ?? null
  /* The bar measures the run going now for a streak - the thing you can do
     something about today - and the best for everything else. */
  const shown = track.streak ? (progress.current ?? 0) : progress.value
  const from = 0
  const share = next ? Math.max(0, Math.min(1, (shown - from) / (next.n - from))) : 1
  return { tiers, next, prev, shown, share, earnedCount: tiers.filter(t => t.earned).length }
}

/**
 * The hue each tone is drawn in. Glass derives its own light and dark from
 * one colour, so these are the clear middle of each hue rather than a light
 * or a dark end of it.
 *
 * @type {Record<string, string>}
 */
export const TONE_HUE = {
  blue: '#228BE6', violet: '#7048E8', slate: '#64748B', green: '#2F9E44', teal: '#0CA678',
  amber: '#F59F00', rose: '#E64980', indigo: '#4263EB', cyan: '#1098AD', gold: '#E8A40C',
  plum: '#9C36B5', steel: '#4C6EF5', sky: '#1C7ED6', emerald: '#099268', bronze: '#C2711D',
  lime: '#66A80F', denim: '#3B5BDB', crimson: '#E03131', orange: '#F76707', platinum: '#74A5D6',
}

/** @param {string} tone */
export function toneHue(tone) {
  return TONE_HUE[tone] ?? TONE_HUE.blue
}

/**
 * How an achievement is drawn: its medallion's mark, hue, shape and level.
 * Null for a key this version does not know.
 *
 * @param {string} key
 * @returns {{glyph: string, hue: string, shape: 'hex'|'circle', level?: string} | null}
 */
export function achievementArt(key) {
  const def = achievementDef(key)
  if (!def) return null
  return { glyph: def.glyph, hue: toneHue(def.tone), shape: def.kind === 'milestone' ? 'circle' : 'hex', level: def.level }
}

/**
 * What a set of newly earned things is called: "A new badge", "3 new
 * milestones", "4 achievements".
 *
 * @param {string[]} keys
 */
export function earnedLabel(keys) {
  const kinds = new Set(keys.map(k => achievementDef(k)?.kind ?? 'badge'))
  const kind = kinds.size === 1 ? [...kinds][0] : null
  if (keys.length === 1) return kind === 'milestone' ? 'A new milestone' : 'A new badge'
  return kind === 'milestone' ? `${keys.length} new milestones` : kind === 'badge' ? `${keys.length} new badges` : `${keys.length} achievements`
}
