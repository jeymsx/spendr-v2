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

/** Local YYYY-MM-DD. Never toISOString: in UTC+8 a local midnight converts to
 *  the previous day, which silently shifts every date-keyed sum below. */
function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** The 'YYYY-MM' a stored date string belongs to. */
function monthKey(iso) {
  return String(iso ?? '').slice(0, 7)
}

/** Months strictly before the one `today` falls in. A month still running has
 *  not finished happening, so it cannot yet have been a good one. */
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
    const gap = Math.round((cur - prev) / 86400000)
    run = gap === 1 ? run + 1 : 1
    if (run > best) best = run
  }
  return best
}

/**
 * Money you hold.
 *
 * Credit lines are not balances you own, so they are out. This is deliberately
 * not net worth: that needs the credit-statement machinery, and a badge whose
 * arithmetic you cannot check by looking at the accounts screen is a badge you
 * cannot trust.
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
    test: ({ transactions, categories, today }) => {
      const limits = (categories ?? []).filter(c => (c.budget ?? 0) > 0)
      if (limits.length < 2) return false

      for (const month of completedMonths(transactions, today)) {
        const spend = {}
        let any = false
        for (const t of transactions) {
          if (t.type !== 'expense' || monthKey(t.date) !== month) continue
          any = true
          spend[t.category] = (spend[t.category] ?? 0) + Math.abs(t.amount ?? 0)
        }
        if (!any) continue
        if (limits.every(c => (spend[c.name] ?? 0) <= c.budget)) return true
      }
      return false
    },
  },
  {
    key: 'green-month',
    name: 'Green Month',
    blurb: 'You earned more than you spent.',
    how: 'Finish a calendar month with inflow above expenses.',
    tone: 'teal',
    glyph: 'trend',
    test: ({ transactions, today }) => {
      for (const month of completedMonths(transactions, today)) {
        let inflow = 0
        let expense = 0
        for (const t of transactions) {
          if (monthKey(t.date) !== month) continue
          if (t.type === 'inflow') inflow += Math.abs(t.amount ?? 0)
          else if (t.type === 'expense') expense += Math.abs(t.amount ?? 0)
        }
        /* Both sides non-zero: a month with income and no spending is a month
           with no data in it, not a month you did well in. */
        if (inflow > 0 && expense > 0 && inflow > expense) return true
      }
      return false
    },
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
]

/** Lookup by key, for the detail sheet and for rendering a stored row. */
export const BADGE_BY_KEY = Object.fromEntries(BADGES.map(b => [b.key, b]))

/**
 * Which badges the data currently satisfies.
 *
 * Every `test` is wrapped. A badge that throws on some shape of data must not
 * be able to take the other nine down with it, and least of all on a screen
 * whose whole job is to be a small, pleasant reward.
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
  const ctx = { transactions, accounts, categories, debts, recurring, goals, today }
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
