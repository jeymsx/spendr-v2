/**
 * When a budget is "near its limit" and when it is "over" - said once.
 *
 * It used to be said five times, with three different numbers: the phone's
 * amber meter and the "!" badge at 75%, the bell's early warning at 80%, and
 * the Home greeting and the desktop's amber bars at 85%. So a category could
 * be amber on one screen, calm on the next and already in your notifications
 * before either - three answers to one question, and none of them wrong
 * enough to look like a bug.
 *
 * 80% is the one the bell has always used, and it is what a person means by
 * "getting close": with a fifth of the limit left, the next big shop is the
 * one that tips it. Over is strictly past the limit; spending exactly all of it
 * is still within it, which is how every surface already treated 100%.
 *
 * Everything that colours, badges, words or notifies about a budget reads its
 * thresholds from here. Change the number here and every surface follows.
 */

/** Share of a limit at which a budget counts as near it. */
export const BUDGET_NEAR_AT = 0.8
/** Share of a limit past which a budget counts as over it. */
export const BUDGET_OVER_AT = 1

/** The same two, as the percentages the meters and tables are drawn in. */
export const BUDGET_NEAR_PCT = 80
export const BUDGET_OVER_PCT = 100

/**
 * Float dust. A month's spending is a sum of converted amounts, so exactly
 * hitting the limit can land a hair either side of it; a thousandth of a peso
 * is below anything a person can spend.
 */
const EPSILON = 0.004

/** @typedef {'ok'|'near'|'over'} BudgetLevel */

/**
 * Where a percentage of a limit sits: 'ok', 'near' (80% up to the limit) or
 * 'over' (past it). For the places that already hold a percentage - a meter's
 * tone, a table's bar colour.
 *
 * @param {number} pct  may exceed 100
 * @returns {BudgetLevel}
 */
export function levelOfPct(pct) {
  if (pct > BUDGET_OVER_PCT) return 'over'
  if (pct >= BUDGET_NEAR_PCT) return 'near'
  return 'ok'
}

/**
 * Where an amount spent sits against a limit.
 *
 * A limit of nothing is over as soon as anything is spent: that is what a
 * carried overspend does to a limit (lib/rollover.js clamps it at zero), and
 * "nothing left, money still going out" is the over-budget state, not the calm
 * one. With nothing spent either it is simply not in play.
 *
 * @param {number} spent
 * @param {number} limit  the limit in force this month - carry included
 * @returns {BudgetLevel}
 */
export function budgetLevel(spent, limit) {
  if (!(limit > 0)) return spent > EPSILON ? 'over' : 'ok'
  if (spent > limit * BUDGET_OVER_AT + EPSILON) return 'over'
  if (spent >= limit * BUDGET_NEAR_AT - EPSILON) return 'near'
  return 'ok'
}

/**
 * Can this category carry a monthly limit at all?
 *
 * Only money going out has one. An inflow category - Salary, Gifts - has no
 * limit to stay under, so any budget it holds (the form once offered the field
 * for it) is a stray number that must not count in a total or show in a list.
 * Transfers are not categories of spending either.
 *
 * @param {{type?: string}|null|undefined} cat
 */
export function canHaveBudget(cat) {
  return !!cat && cat.type !== 'inflow' && cat.type !== 'transfer'
}

/**
 * Is this category one of the month's budgeted ones - an expense category with
 * a limit set?
 *
 * The one test every total and list of budgets filters by, so an old inflow
 * category that still carries a budget stops skewing them.
 *
 * @param {{type?: string, budget?: number}|null|undefined} cat
 */
export function isBudgeted(cat) {
  return canHaveBudget(cat) && (cat?.budget ?? 0) > 0
}
