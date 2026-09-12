import { allocateGoals } from './goals'

/**
 * What the app is willing to call an achievement.
 *
 * ── The rule every one of these follows ──
 *
 * A badge has to mean something the person actually did with their money, and
 * it has to be something THIS app can prove from the ledger without asking.
 * That rules out most of what gamification usually is: no points for opening
 * the app, no streak for tapping around, nothing that rewards using Spendr
 * rather than managing money. "Opened the app 30 days running" is a badge
 * about the app. "Closed a month inside every limit you set" is a badge about
 * you.
 *
 * It also rules out anything the app cannot see. Every predicate below reads
 * only from the local tables, so badges work fully offline and a phone with no
 * account earns exactly what a synced one does.
 *
 * ── They are permanent ──
 *
 * `evaluateBadges` answers "is this true right now", which is not the same
 * question as "has this ever been true" - a green month stops being the
 * current month, a goal can be edited upward after it was funded, a debt can
 * be re-opened. So the caller unions the result with what is already stored
 * and never removes (see hooks/useBadges.js). Earning is a one-way door,
 * which is the only thing that makes a badge worth having.
 *
 * ── Completed months only ──
 *
 * Two of these judge a calendar month, and both ignore the month in progress.
 * A "green month" awarded on the 3rd, because rent has not come out yet, is a
 * badge that lies for four weeks and then has to be taken back.
 */

/**
 * One completed month, rolled up. Five of the twenty badges read these, which
 * is why they are computed once and shared rather than re-derived per badge.
 *
 * @typedef {object} MonthStat
 * @property {number} inflow
 * @property {number} expense
 * @property {Record<string, number>} byCategory
 */

/**
 * What every badge's `test` receives. `months` and `limits` are the shared
 * roll-up; the rest are the raw tables.
 *
 * @typedef {object} BadgeCtx
 * @property {Transaction[]} transactions
 * @property {Account[]} accounts
 * @property {Category[]} categories
 * @property {Debt[]} debts
 * @property {Recurring[]} recurring
 * @property {Goal[]} goals
 * @property {Date} today
 * @property {Map<string, MonthStat>} months
 * @property {Category[]} limits
 */

/**
 * A badge definition. Nothing here is stored - the table keeps only the key
 * and the date - so copy can be reworded and art replaced without a migration.
 *
 * @typedef {object} BadgeDef
 * @property {string} key
 * @property {string} name
 * @property {string} blurb
 * @property {string} how
 * @property {string} tone
 * @property {string} glyph
 * @property {(ctx: BadgeCtx) => boolean} test
 */

/** Local YYYY-MM-DD. Never toISOString: in UTC+8 a local midnight converts to
 *  the previous day, which silently shifts every date-keyed sum below.
 *
 * @param {Date} d
 */
function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** The 'YYYY-MM' a stored date string belongs to.
 *
 * @param {string} iso  an ISO date; the month is its first seven characters
 */
function monthKey(iso) {
  return String(iso ?? '').slice(0, 7)
}

/** Months strictly before the one `today` falls in. A month still running has
 *  not finished happening, so it cannot yet have been a good one.
 *
 * @param {Transaction[]} transactions
 * @param {Date} today
 * @returns {string[]}
 */
function completedMonths(transactions, today) {
  const current = monthKey(ymd(today))
  const seen = new Set()
  for (const t of transactions) {
    const k = monthKey(t.date)
    if (k && k < current) seen.add(k)
  }
  return [...seen]
}

/**
 * The longest run of consecutive calendar days that each carry a transaction.
 *
 * Days are de-duplicated first, so five coffees on one day is still one day -
 * the badge is about showing up, not about volume.
 *
 * @param {Transaction[]} transactions
 * @returns {number}
 */
export function longestDayStreak(transactions) {
  const days = [...new Set(
    (transactions ?? []).map(t => String(t.date ?? '').slice(0, 10)).filter(Boolean),
  )].sort()
  if (!days.length) return 0

  let best = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1] + 'T00:00:00')
    const cur = new Date(days[i] + 'T00:00:00')
    const gap = Math.round((cur.getTime() - prev.getTime()) / 86400000)
    run = gap === 1 ? run + 1 : 1
    if (run > best) best = run
  }
  return best
}

/** '2026-01' -> '2026-02'. Calendar arithmetic, so a run of months means
 *  ADJACENT months and not merely three months that happen to be in the data.
 *
 * @param {string} key  "2026-09"
 * @returns {string}
 */
function nextMonth(key) {
  const [y, m] = key.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/**
 * Inflow, expense and per-category spend for every COMPLETED month.
 *
 * Built once in evaluateBadges and handed to every predicate, rather than each
 * one walking the ledger again. With twenty badges and five of them reading
 * monthly figures, the difference is five passes over every transaction you
 * have ever logged versus one - on a screen that re-runs whenever any of seven
 * tables changes.
 *
 * @param {Transaction[]} transactions
 * @param {Date} today
 * @returns {Map<string, MonthStat>}
 */
function monthStats(transactions, today) {
  /** @type {Map<string, MonthStat>} */
  const stats = new Map()
  for (const key of completedMonths(transactions, today)) {
    stats.set(key, { inflow: 0, expense: 0, byCategory: {} })
  }
  for (const t of transactions) {
    const row = stats.get(monthKey(t.date))
    if (!row) continue
    const amt = Math.abs(t.amount ?? 0)
    if (t.type === 'inflow') row.inflow += amt
    else if (t.type === 'expense') {
      row.expense += amt
      row.byCategory[t.category] = (row.byCategory[t.category] ?? 0) + amt
    }
  }
  return stats
}

/**
 * Is there a run of `n` calendar-adjacent completed months that all pass?
 *
 * The adjacency is the point. "Three good months" awarded for January, April
 * and September is not a streak, it is three good months, and a badge that
 * says the first while meaning the second is a badge that lies.
 *
 * @param {Map<string, MonthStat>} stats
 * @param {number} n
 * @param {(m: MonthStat) => boolean} passes
 */
function hasRun(stats, n, passes) {
  const good = new Set([...stats.entries()].filter(([, v]) => passes(v)).map(([k]) => k))
  for (const start of good) {
    let k = start
    let len = 1
    while (len < n && good.has(nextMonth(k))) { k = nextMonth(k); len++ }
    if (len >= n) return true
  }
  return false
}

/** Every month inside every limit. Shared by Under Budget and Budget Master,
 *  so the harder badge cannot drift into meaning something else.
 *
 * @param {Category[]} limits
 * @returns {(m: MonthStat) => boolean}
 */
function withinLimits(limits) {
  return month => month.expense > 0 && limits.every(c => (month.byCategory[c.name] ?? 0) <= c.budget)
}

/** Inflow beat spending, and both actually happened.
 *
 * @param {MonthStat} month
 */
function inTheGreen(month) {
  return month.inflow > 0 && month.expense > 0 && month.inflow > month.expense
}

/**
 * Money you hold.
 *
 * Credit lines are not balances you own, so they are out. This is deliberately
 * not net worth: that needs the credit-statement machinery, and a badge whose
 * arithmetic you cannot check by looking at the accounts screen is a badge you
 * cannot trust.
 *
 * @param {Account[]} accounts
 * @returns {number}
 */
export function liquidTotal(accounts) {
  return (accounts ?? [])
    .filter(a => a.type !== 'credit' && (a.role ?? '') !== 'credit')
    .reduce((s, a) => s + (a.balance ?? 0), 0)
}

/* ── The ten ─────────────────────────────────────────────────────────────────

   Ordered as a path rather than by difficulty: the first thing you do, the
   habit, the volume, the two about discipline, the two about finishing
   something, then setup and scale. The grid renders in this order, so it
   reads as a progression rather than a scoreboard.

   `tone` is a name, not a hex, so a badge cannot drift out of the theme. It
   drives the drawn mark and the earned-date chip.                            */
/**
 * Typed as a whole, which is what gives every inline `test` below its ctx -
 * annotating twenty arrow functions one at a time would say the same thing
 * twenty times and let the twenty-first be written without it.
 *
 * (A plain block comment does not work here: only a doc comment carries a
 *  type, which is a thing you find out by watching thirty-six errors not go
 *  away.)
 *
 * @type {BadgeDef[]}
 */
export const BADGES = [
  {
    key: 'first-peso',
    name: 'First Peso',
    blurb: 'You logged your first transaction.',
    how: 'Log any expense, inflow or transfer.',
    tone: 'blue',
    glyph: 'peso',
    test: ({ transactions }) => transactions.length >= 1,
  },
  {
    key: 'seven-days',
    name: 'Seven Days',
    blurb: 'A full week of logging, day after day.',
    how: 'Log something on seven days in a row.',
    tone: 'violet',
    glyph: 'flame',
    test: ({ transactions }) => longestDayStreak(transactions) >= 7,
  },
  {
    key: 'century',
    name: 'Century',
    blurb: 'A hundred transactions on the books.',
    how: 'Log 100 transactions.',
    tone: 'slate',
    glyph: 'stack',
    test: ({ transactions }) => transactions.length >= 100,
  },
  {
    key: 'under-budget',
    name: 'Under Budget',
    blurb: 'A whole month inside every limit you set.',
    how: 'Finish a calendar month without passing any category limit.',
    tone: 'green',
    glyph: 'gauge',
    /* Two budgeted categories minimum, or this is earned by setting one limit
       on something never bought. And at least one expense in the month, so an
       empty month does not get counted as restraint. */
    test: ({ months, limits }) =>
      limits.length >= 2 && [...months.values()].some(withinLimits(limits)),
  },
  {
    key: 'green-month',
    name: 'Green Month',
    blurb: 'You earned more than you spent.',
    how: 'Finish a calendar month with inflow above expenses.',
    tone: 'teal',
    glyph: 'trend',
    /* Both sides non-zero, in inTheGreen: a month with income and no spending
       is a month with no data in it, not a month you did well in. */
    test: ({ months }) => [...months.values()].some(inTheGreen),
  },
  {
    key: 'goal-funded',
    name: 'Goal Funded',
    blurb: 'A savings goal reached its target.',
    how: 'Save enough in the accounts behind any goal to cover it.',
    tone: 'amber',
    glyph: 'flag',
    /* The same allocator the goals page draws from, so the badge and the page
       can never disagree about whether something is funded. */
    test: ({ goals, accounts }) =>
      allocateGoals({ goals, accounts }).active.some(g => g.complete),
  },
  {
    key: 'debt-cleared',
    name: 'Debt Cleared',
    blurb: 'You paid one off in full.',
    how: 'Settle any debt down to zero.',
    tone: 'rose',
    glyph: 'check',
    test: ({ debts }) =>
      (debts ?? []).some(d => (d.amount ?? 0) > 0 && (d.amountPaid ?? 0) >= d.amount),
  },
  {
    key: 'on-autopilot',
    name: 'On Autopilot',
    blurb: 'Your regular bills track themselves.',
    how: 'Keep three recurring bills active.',
    tone: 'indigo',
    glyph: 'repeat',
    test: ({ recurring }) => (recurring ?? []).filter(r => r.active).length >= 3,
  },
  {
    key: 'diversified',
    name: 'Diversified',
    blurb: 'Your money lives in more than one place.',
    how: 'Hold accounts of four different kinds.',
    tone: 'cyan',
    glyph: 'cards',
    test: ({ accounts }) =>
      new Set((accounts ?? []).map(a => a.type).filter(Boolean)).size >= 4,
  },
  {
    key: 'six-figures',
    name: 'Six Figures',
    blurb: 'A hundred thousand pesos across your accounts.',
    how: 'Hold 100,000 outside of credit.',
    tone: 'gold',
    glyph: 'crown',
    test: ({ accounts }) => liquidTotal(accounts) >= 100000,
  },
  /* ── The second ten ────────────────────────────────────────────────────────

     Seven of these are a harder version of one of the first ten, on purpose.
     A collection where every badge is its own unrelated stunt has no shape;
     one where Seven Days leads to Thirty Days and Six Figures leads to Seven
     Figures tells you what the app thinks progress looks like, and the grid
     reads as a path rather than a checklist. Their tones stay in the same
     family as their predecessor for the same reason.

     The other three - Year One, No-Spend Week, Rainy Day - are new dimensions
     rather than tiers: how long you have kept it up, restraint, and whether
     you could absorb a bad month.                                            */
  {
    key: 'thirty-days',
    name: 'Thirty Days',
    blurb: 'A month of logging without missing a day.',
    how: 'Log something on thirty days in a row.',
    tone: 'plum',
    glyph: 'calendar',
    test: ({ transactions }) => longestDayStreak(transactions) >= 30,
  },
  {
    key: 'five-hundred',
    name: 'Five Hundred',
    blurb: 'Five hundred transactions on the books.',
    how: 'Log 500 transactions.',
    tone: 'steel',
    glyph: 'coins',
    test: ({ transactions }) => transactions.length >= 500,
  },
  {
    key: 'year-one',
    name: 'Year One',
    blurb: 'A full year of records, end to end.',
    how: 'Keep logging until a year separates your first entry from your last.',
    tone: 'sky',
    glyph: 'hourglass',
    /* Span, not count. This one is about having KEPT it up, so a thousand
       transactions in a fortnight does not earn it and one a month for a year
       does. */
    test: ({ transactions }) => {
      const days = transactions.map(t => String(t.date ?? '').slice(0, 10)).filter(Boolean).sort()
      if (days.length < 2) return false
      const span = new Date(days[days.length - 1] + 'T00:00:00').getTime()
        - new Date(days[0] + 'T00:00:00').getTime()
      return span >= 365 * 86400000
    },
  },
  {
    key: 'steady-three',
    name: 'Steady Three',
    blurb: 'Three months running, you earned more than you spent.',
    how: 'Finish three months in a row with inflow above expenses.',
    tone: 'emerald',
    glyph: 'bars',
    test: ({ months }) => hasRun(months, 3, inTheGreen),
  },
  {
    key: 'budget-master',
    name: 'Budget Master',
    blurb: 'Three months running, inside every limit.',
    how: 'Finish three months in a row without passing any category limit.',
    tone: 'bronze',
    glyph: 'target',
    test: ({ months, limits }) => limits.length >= 2 && hasRun(months, 3, withinLimits(limits)),
  },
  {
    key: 'no-spend-week',
    name: 'No-Spend Week',
    blurb: 'Seven days in a row without spending a peso.',
    how: 'Go a full week with no expenses logged.',
    tone: 'lime',
    glyph: 'nospend',
    /* Bracketed by real spending on both sides, which is the whole difficulty
       of this one: a week with no expenses is indistinguishable from a week
       you did not open the app, and the second must not earn a badge. A gap
       BETWEEN two expense days is a week you were still recording and simply
       did not spend. */
    test: ({ transactions }) => {
      const days = [...new Set(
        transactions.filter(t => t.type === 'expense')
          .map(t => String(t.date ?? '').slice(0, 10)).filter(Boolean),
      )].sort()
      for (let i = 1; i < days.length; i++) {
        const gap = Math.round(
          (new Date(days[i] + 'T00:00:00').getTime()
            - new Date(days[i - 1] + 'T00:00:00').getTime()) / 86400000,
        )
        if (gap >= 8) return true
      }
      return false
    },
  },
  {
    key: 'rainy-day',
    name: 'Rainy Day',
    blurb: 'Three months of spending, sitting in savings.',
    how: 'Hold three times your average monthly spending in a savings account.',
    tone: 'denim',
    glyph: 'umbrella',
    /* The emergency fund, measured against YOUR spending rather than a round
       number - which is the only way the figure means anything. Needs two
       completed months with spending in them, or the average is one month
       pretending to be a baseline. */
    test: ({ accounts, months }) => {
      const spent = [...months.values()].map(m => m.expense).filter(v => v > 0)
      if (spent.length < 2) return false
      const avg = spent.reduce((a, b) => a + b, 0) / spent.length
      const savings = (accounts ?? [])
        .filter(a => a.type === 'savings')
        .reduce((s, a) => s + (a.balance ?? 0), 0)
      return savings >= avg * 3
    },
  },
  {
    key: 'debt-free',
    name: 'Debt Free',
    blurb: 'Every debt on your books, settled.',
    how: 'Clear every debt you are carrying.',
    tone: 'crimson',
    glyph: 'chain',
    /* Two minimum, and every one settled. Owing nothing because you have never
       recorded a debt is not the same achievement as having paid them off, and
       the badge would otherwise land on an empty page. */
    test: ({ debts }) => {
      const real = (debts ?? []).filter(d => (d.amount ?? 0) > 0)
      return real.length >= 2 && real.every(d => (d.amountPaid ?? 0) >= d.amount)
    },
  },
  {
    key: 'three-goals',
    name: 'Three Goals',
    blurb: 'Three savings goals, all funded.',
    how: 'Fund three goals to their targets at the same time.',
    tone: 'orange',
    glyph: 'summit',
    test: ({ goals, accounts }) =>
      allocateGoals({ goals, accounts }).active.filter(g => g.complete).length >= 3,
  },
  {
    key: 'seven-figures',
    name: 'Seven Figures',
    blurb: 'A million pesos across your accounts.',
    how: 'Hold 1,000,000 outside of credit.',
    tone: 'platinum',
    glyph: 'gem',
    test: ({ accounts }) => liquidTotal(accounts) >= 1000000,
  },
]

/**
 * Which badges the data currently satisfies.
 *
 * Every `test` is wrapped. A badge that throws on some shape of data must not
 * be able to take the other nine down with it, and least of all on a screen
 * whose whole job is to be a small, pleasant reward.
 */
/**
 * @param {Partial<BadgeCtx>} [input]
 * @returns {Set<string>}
 */
export function evaluateBadges({
  transactions = [],
  accounts = [],
  categories = [],
  debts = [],
  recurring = [],
  goals = [],
  today = new Date(),
} = {}) {
  /* Computed once and shared. Five of the twenty read monthly figures, and
     re-deriving them per badge is five walks over the whole ledger on a screen
     that re-runs whenever any of seven tables changes. */
  const months = monthStats(transactions, today)
  const limits = (categories ?? []).filter(c => (c.budget ?? 0) > 0)
  const ctx = { transactions, accounts, categories, debts, recurring, goals, today, months, limits }
  const earned = new Set()
  for (const badge of BADGES) {
    try {
      if (badge.test(ctx)) earned.add(badge.key)
    } catch (e) {
      console.warn('[badges] %s could not be evaluated:', badge.key, e)
    }
  }
  return earned
}
