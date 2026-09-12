/**
 * Savings goals, derived entirely from real account balances.
 *
 * ── The problem ────────────────────────────────────────────────────────────
 *
 * A goal has a target ("₱90,000 for the emergency fund") and is funded by a
 * real account ("Maya Savings"). Progress must come from that account's actual
 * balance - never a number typed in - or the app is keeping two sets of books
 * and they will disagree within a week.
 *
 * That is easy for one goal on one account: progress IS the balance. It breaks
 * the moment a second goal points at the same account, which is the normal
 * case. If both goals simply read the balance, an account holding ₱120,000
 * would report ₱120,000 saved toward a ₱90,000 goal AND ₱120,000 toward a
 * ₱60,000 goal - claiming ₱240,000 of progress out of ₱120,000 of money. A
 * finance app cannot tell that lie.
 *
 * ── The model: a waterfall ─────────────────────────────────────────────────
 *
 * Goals are ranked. Each account's balance is poured into its goals in rank
 * order: the first goal fills to its target, the overflow fills the next, and
 * whatever survives is unassigned. Every peso is counted exactly once, so the
 * allocations always sum to the money that actually exists.
 *
 *   Maya Savings ₱120,000
 *     1. Emergency Fund   target ₱90,000  ->  ₱90,000   (100%)
 *     2. New Laptop       target ₱60,000  ->  ₱30,000   ( 50%)
 *        unassigned                           ₱0
 *
 *   Balance drops to ₱50,000
 *     1. Emergency Fund                   ->  ₱50,000   ( 56%)
 *     2. New Laptop                       ->  ₱0        (  0%)
 *
 * The alternative - splitting the balance in proportion to targets - is worse,
 * and not just aesthetically: it would report the emergency fund as 57% funded
 * at a moment when there is more than enough cash to cover it in full. Rank
 * order encodes intent ("the emergency fund comes first"), and intent is the
 * thing a plan is made of.
 *
 * A goal may draw on several accounts, which is why the loop below is goals
 * outer, accounts inner: a goal takes what it needs from each of its accounts
 * in turn until its target is met. Both orderings are stable and explicit
 * (rank, then account sort order), so the same inputs always give the same
 * split - there is no hidden state to reconcile and nothing to migrate.
 *
 * ── What this deliberately does NOT have ───────────────────────────────────
 *
 * No `allocated` or `saved` column, anywhere. Those are the fields that rot:
 * they need a manual top-up every payday, they drift from the balance, and
 * they turn every transfer into a two-step chore. Progress here is a pure
 * function of (goals, balances), recomputed on read. Rename an account, spend
 * from it, move money between accounts - the goals follow, because there is
 * nothing to keep in step.
 *
 * Everything in this file is pure and takes `today` as an argument, so it can
 * be tested without a database or a clock.
 */

/** Rank step. Leaves room to insert between two goals without a full rewrite. */
export const GOAL_RANK_STEP = 100

export const GOAL_ICONS = [
  '🛟', '🏠', '🚗', '✈️', '🎓', '💍', '📱', '💻',
  '🏥', '🎁', '🪙', '🏖️', '👶', '🐕', '🔧', '🎯',
]

/**
 * Can this account fund a goal?
 *
 * Assets only. A credit card's "balance" is a debt, so pouring it into a goal
 * would count money you owe as money you have - the sign is not merely
 * inconvenient, it is the opposite of the truth.
 *
 * @param {Account} [acct]
 */
export function isFundable(acct) {
  if (!acct) return false
  return acct.type !== 'credit' && (acct.role ?? '') !== 'credit'
}

/** Rank order, with `id` as the tiebreak so the sort is total, not partial.
 *
 * @param {Goal} a
 * @param {Goal} b
 */
function byRank(a, b) {
  const pa = a.priority ?? Number.MAX_SAFE_INTEGER
  const pb = b.priority ?? Number.MAX_SAFE_INTEGER
  if (pa !== pb) return pa - pb
  return (a.id ?? 0) - (b.id ?? 0)
}

/** The order accounts contribute in - the same order the Accounts tab shows.
 *
 * @param {Account} a
 * @param {Account} b
 */
function byAccountOrder(a, b) {
  const sa = a.sort_order ?? 9999
  const sb = b.sort_order ?? 9999
  if (sa !== sb) return sa - sb
  return String(a.name ?? '').localeCompare(String(b.name ?? ''))
}

/** @param {Goal} [goal] */
export function isArchived(goal) {
  return !!goal?.archivedAt
}

/**
 * Split every fundable balance across the active goals that draw on it.
 *
 * Pure: same inputs, same output, no clock and no database.
 *
 * The returned shape is GoalAllocation in src/types.d.ts:
 *
 *   goals      every goal, active first, each with saved/pct/sources
 *   active     just the ones being funded, in rank order
 *   byAccount  per-account assigned/unassigned split
 *   totals     portfolio-level roll-up
 *
 * (That prose used to live inside the return-tag's own type literal, which
 *  is not valid JSDoc - the annotation parsed as far as the first sentence
 *  and described nothing. It reads the same and now type-checks. The tag is
 *  named obliquely here on purpose: spelled out, a second one appears in the
 *  block and the checker rejects the duplicate, which is how this sentence
 *  was written the first time.)
 *
 * @param {object}    input
 * @param {Goal[]}    [input.goals]     Goal records. `accounts` is a list of names.
 * @param {Account[]} [input.accounts]  Account records (the full set; filtered here).
 * @returns {GoalAllocation}
 */
export function allocateGoals({ goals = [], accounts = [] } = {}) {
  const fundable = accounts.filter(isFundable).slice().sort(byAccountOrder)

  // Money still available on each account, drawn down as goals take from it.
  // Clamped at zero: an overdrawn asset account has nothing to give, and a
  // negative here would let one goal's shortfall inflate another's progress.
  const remaining = new Map(
    fundable.map(a => [a.name, Math.max(0, a.balance ?? 0)]),
  )
  const startBalance = new Map(remaining)
  /** @type {Map<string, Array<{goalId?: number, name: string, amount: number}>>} */
  const takenFrom = new Map(fundable.map(a => [a.name, /** @type {any[]} */ ([])]))

  const active = goals.filter(g => !isArchived(g)).slice().sort(byRank)
  /** @type {AllocatedGoal[]} */
  const out = []

  for (const goal of active) {
    const target = Math.max(0, goal.target ?? 0)
    // A goal names its accounts; the order it draws them in is the accounts'
    // own order, not the order they were attached, so the split does not
    // depend on the sequence someone happened to tick boxes in.
    const linked = fundable.filter(a => (goal.accounts ?? []).includes(a.name))

    let need = target
    let saved = 0
    const sources = []

    for (const acct of linked) {
      if (need <= 0) break
      const avail = remaining.get(acct.name) ?? 0
      if (avail <= 0) continue
      const take = Math.min(need, avail)
      remaining.set(acct.name, avail - take)
      need -= take
      saved += take
      sources.push({ account: acct.name, amount: take })
      takenFrom.get(acct.name).push({ goalId: goal.id, name: goal.name, amount: take })
    }

    out.push(decorate(goal, saved, target, sources, linked.length))
  }

  // Archived goals keep their place in the list but take no money - they are
  // history, and history should not move when this month's balance moves.
  for (const goal of goals.filter(isArchived)) {
    out.push({ ...decorate(goal, 0, Math.max(0, goal.target ?? 0), [], 0), archived: true })
  }

  /** @type {Record<string, AccountSplit>} */
  const byAccount = {}
  for (const acct of fundable) {
    const start = startBalance.get(acct.name) ?? 0
    const left = remaining.get(acct.name) ?? 0
    byAccount[acct.name] = {
      balance: start,
      assigned: start - left,
      unassigned: left,
      goals: takenFrom.get(acct.name) ?? [],
    }
  }

  const activeOut = out.filter(g => !g.archived)
  /** @type {GoalTotals} */
  const totals = {
    pct: 0,
    target: activeOut.reduce((s, g) => s + g.target, 0),
    saved: activeOut.reduce((s, g) => s + g.saved, 0),
    unassigned: fundable.reduce((s, a) => s + (remaining.get(a.name) ?? 0), 0),
    fundableBalance: fundable.reduce((s, a) => s + (startBalance.get(a.name) ?? 0), 0),
    count: activeOut.length,
    complete: activeOut.filter(g => g.complete).length,
    unfunded: activeOut.filter(g => g.linkedCount === 0).length,
  }
  totals.pct = totals.target > 0 ? (totals.saved / totals.target) * 100 : 0

  return { goals: out, active: activeOut, byAccount, totals }
}

/**
 * @param {Goal} goal
 * @param {number} saved
 * @param {number} target
 * @param {Array<{account: string, amount: number}>} sources
 * @param {number} linkedCount
 * @returns {AllocatedGoal}
 */
function decorate(goal, saved, target, sources, linkedCount) {
  return {
    ...goal,
    target,
    saved,
    sources,
    linkedCount,
    remaining: Math.max(0, target - saved),
    // `target > 0` guards the degenerate goal: with no target there is no
    // fraction to report, and calling it 100% complete would be a lie that
    // reads as an achievement.
    pct: target > 0 ? Math.min(100, (saved / target) * 100) : 0,
    complete: target > 0 && saved >= target,
    archived: false,
  }
}

// ── Pace ─────────────────────────────────────────────────────────────────────

/** Whole months from `today` to `iso`, rounded up; null when there is no date.
 *
 * @param {string} iso
 * @param {Date} today
 * @returns {number|null}
 */
export function monthsUntil(iso, today) {
  if (!iso) return null
  const then = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(then.getTime())) return null
  const from = new Date(today)
  from.setHours(0, 0, 0, 0)
  const months =
    (then.getFullYear() - from.getFullYear()) * 12 +
    (then.getMonth() - from.getMonth())
  // Part of the current month still counts as a month you can save in.
  return then.getDate() >= from.getDate() ? months : months - 1
}

/**
 * What this goal needs per month to land on its target date.
 *
 * Returns null when there is no date or nothing left to save, and flags the
 * date as past rather than dividing by zero or a negative - "₱-4,500 a month"
 * is worse than no number at all.
 *
 * @param {{target?: number, saved?: number, targetDate?: string|null}} goal
 * @param {Date} [today]
 */
export function pace(goal, today = new Date()) {
  const left = Math.max(0, (goal.target ?? 0) - (goal.saved ?? 0))
  if (!goal.targetDate) return null
  const months = monthsUntil(goal.targetDate, today)
  if (months === null) return null
  if (left <= 0) return { months, perMonth: 0, done: true, overdue: false }
  if (months <= 0) return { months, perMonth: left, done: false, overdue: true }
  return { months, perMonth: left / months, done: false, overdue: false }
}

// ── Rank helpers ─────────────────────────────────────────────────────────────

/** The rank a new goal gets: last in line, so it can never displace a funded one.
 *
 * @param {Goal[]} [goals]
 * @returns {number}
 */
export function nextRank(goals = []) {
  const max = goals.reduce((m, g) => Math.max(m, g.priority ?? 0), 0)
  return max + GOAL_RANK_STEP
}

/**
 * Re-rank a whole list after a drag, as evenly-spaced values.
 *
 * Returns only the goals whose rank actually changed, so a reorder writes two
 * or three rows instead of every row in the table.
 *
 * @param {number[]} orderedIds
 * @param {Goal[]} [goals]
 * @returns {Array<{id: number, priority: number}>}
 */
export function reRank(orderedIds, goals = []) {
  const byId = new Map(goals.map(g => [g.id, g]))
  /** @type {Array<{id: number, priority: number}>} */
  const out = []
  orderedIds.forEach((id, i) => {
    const goal = byId.get(id)
    const priority = (i + 1) * GOAL_RANK_STEP
    if (goal && goal.priority !== priority) out.push({ id, priority })
  })
  return out
}
