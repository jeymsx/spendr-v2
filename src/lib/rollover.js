/**
 * Budget carried between months.
 *
 * ── It rolls BOTH ways, or not at all ──
 *
 * Under-spend 2,000 on Groceries and it is yours next month. Over-spend 2,000
 * and next month is 2,000 smaller. The second half is the one people want to
 * leave out, and leaving it out is what makes rollover useless: bank every
 * windfall, forgive every overrun, and the limit drifts upward for ever while
 * telling you that you are fine. A budget that only ever grows is not a
 * budget.
 *
 * ── Per category, with a global default ──
 *
 * Rent has no meaningful "unspent" - the bill is the bill. Groceries does. So
 * the flag lives on the category, and `meta.budgetRollover` is what a category
 * with no opinion of its own falls back to. Turning the global on therefore
 * changes every category that has not been decided individually, and turning a
 * single one off keeps it off whatever the global says.
 *
 * ── Why it needs a start date ──
 *
 * Without one, turning rollover on in September silently credits you with
 * every unspent peso back to January - a four-figure windfall out of nowhere,
 * for months you were not budgeting this way. `rolloverFrom` is stamped when
 * the flag goes on and the carry starts there.
 *
 * A category that rolls but has no `rolloverFrom` carries nothing at all
 * (effectiveLimit starts counting at the month asked about, which is no
 * months). So every way a category can START rolling has to stamp one, and
 * this file holds the rules for it, as pure functions the screens call:
 *
 *   the global switch goes on     startsForGlobalOn
 *   a category's button goes on   planLimitSave / startForLimit
 *   a limit is set on a category  planLimitSave / startForLimit
 *
 * The switch used to stamp nothing. Turning "Carry budgets over" on made every
 * category roll in name only, because the only code that wrote a start month
 * was the per-category button - which, with the switch already on, could not
 * write at all.
 */

import { txBase } from './fxContext'
import { canHaveBudget } from './budgetLevels'
import { isSpend } from './flows'
import { spendingRows } from '../utils/installments'

/** "2026-09" for a Date or a month key.
 *  @param {Date|string|number} d */
export function monthKey(d) {
  const dt = d instanceof Date ? d : new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

/** The month before this one, as a key.
 *  @param {string} key */
export function prevMonth(key) {
  const [y, m] = String(key).split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/**
 * Does this category roll over?
 *
 * An explicit `false` on the category wins over a global `true`, which is what
 * makes "everything except rent" expressible.
 *
 * @param {Record<string, any>} cat
 * @param {boolean} [globalDefault]
 */
export function rollsOver(cat, globalDefault = false) {
  if (cat?.rollover === true) return true
  if (cat?.rollover === false) return false
  return !!globalDefault
}

/**
 * Spend per month for one category, as { '2026-09': 4210.5 }.
 *
 * Refunds are negative expenses, so they subtract here with no special case,
 * which is the whole reason they are stored that way.
 *
 * @param {Array<Record<string, any>>} txs
 * @param {string} categoryName
 */
export function spendByMonth(txs, categoryName) {
  /** @type {Record<string, number>} */
  const out = {}
  // An installment plan is spent in full the month it was bought (utils/installments).
  for (const tx of spendingRows(txs ?? [])) {
    if (!isSpend(tx) || tx.category !== categoryName) continue
    const k = monthKey(tx.date)
    out[k] = Math.round(((out[k] ?? 0) + txBase(tx)) * 100) / 100
  }
  return out
}

/**
 * What this category carries INTO `month`.
 *
 * Walks every month from `from` up to but not including `month`, adding
 * whatever was left of the limit and subtracting whatever went over. Positive
 * means you have more to spend; negative means less.
 *
 * A month with no limit set contributes nothing rather than crediting the
 * whole of its spend as "under" - a category you had not budgeted yet is not
 * a month you saved money.
 *
 * @param {object} input
 * @param {number} input.limit        the monthly limit
 * @param {Record<string, number>} input.spend  from spendByMonth
 * @param {string} input.from         first month to count, inclusive
 * @param {string} input.month        month being computed, exclusive
 */
export function carryInto({ limit, spend, from, month }) {
  if (!(limit > 0) || !from || !month || from >= month) return 0
  let carry = 0
  let k = prevMonth(month)
  /* Backwards from the month before, so a long-dormant category costs one
     iteration per month rather than a scan of the whole ledger. 120 is ten
     years and exists only so a corrupt `from` cannot spin for ever. */
  for (let guard = 0; guard < 120 && k >= from; guard++) {
    carry += limit - (spend[k] ?? 0)
    k = prevMonth(k)
  }
  return Math.round(carry * 100) / 100
}

/**
 * The limit a category actually has this month, carry included.
 *
 * Clamped at zero: a carried overspend big enough to wipe out the limit
 * leaves you with nothing to spend, not with a negative allowance, and the
 * meter has no sensible way to draw below empty.
 *
 * @param {object} input
 * @param {Record<string, any>} input.cat
 * @param {Array<Record<string, any>>} input.txs
 * @param {string} input.month
 * @param {boolean} [input.globalDefault]
 */
export function effectiveLimit({ cat, txs, month, globalDefault = false }) {
  const limit = cat?.budget ?? 0
  if (!(limit > 0) || !rollsOver(cat, globalDefault)) {
    return { limit, carry: 0, effective: limit }
  }
  const from = cat.rolloverFrom ?? month
  const carry = carryInto({
    limit, spend: spendByMonth(txs, cat.name), from, month,
  })
  return { limit, carry, effective: Math.max(0, Math.round((limit + carry) * 100) / 100) }
}

/**
 * Did `month`'s leftover really go into the next month's limit?
 *
 * Rolling is not enough. The carry into the month after `month` counts `month`
 * only when it starts at or before it (carryInto), so a category that rolls
 * but starts this month - or has no start at all - has NOT kept last month's
 * leftover, and that money is still loose.
 *
 * @param {Record<string, any>} cat
 * @param {boolean} globalDefault
 * @param {string} month  the month whose leftover is in question
 */
export function keptLeftover(cat, globalDefault, month) {
  return rollsOver(cat, globalDefault) && !!cat?.rolloverFrom && cat.rolloverFrom <= month
}

/**
 * Last month's leftovers, for the sweep.
 *
 * Only categories that came in UNDER, and only the amount they were under by.
 * A category with no limit is not under anything, and one whose leftover was
 * carried into this month's limit has already kept it - sweeping it too would
 * move the same money twice. One that rolls but only began this month, or has
 * no start yet, kept nothing, so it is still offered: otherwise its leftover
 * would be neither carried nor offered, which is lost.
 *
 * And only a month you spent in at all. With no spending logged that month -
 * limits set today, a ledger begun this month, a month not logged - every
 * limit is "under" by all of itself, and the sweep would offer to keep the
 * whole budget as money saved that never was.
 *
 * @param {object} input
 * @param {Array<Record<string, any>>} input.categories
 * @param {Array<Record<string, any>>} input.txs
 * @param {string} input.month  the month that just ended
 * @param {boolean} [input.globalDefault]
 */
export function sweepable({ categories, txs, month, globalDefault = false }) {
  if (!spendingRows(txs ?? []).some(tx => isSpend(tx) && monthKey(tx.date) === month)) return { rows: [], total: 0 }
  const out = []
  for (const cat of categories ?? []) {
    const limit = cat.budget ?? 0
    // An inflow category's stray budget is not a limit anyone is under.
    if (!canHaveBudget(cat) || !(limit > 0) || keptLeftover(cat, globalDefault, month)) continue
    const spent = spendByMonth(txs, cat.name)[month] ?? 0
    const left = Math.round((limit - spent) * 100) / 100
    if (left > 0) out.push({ name: cat.name, limit, spent, left, icon: cat.icon, color: cat.color })
  }
  out.sort((a, b) => b.left - a.left)
  const total = Math.round(out.reduce((s, c) => s + c.left, 0) * 100) / 100
  return { rows: out, total }
}

/**
 * The start month to write for each category now that the global switch is on.
 *
 * Every expense category that has none, so that what the switch promises -
 * "unspent rolls into next month" - starts from this month for all of them. A
 * category already holding a start keeps it (turning the switch off and on
 * again must not move it), and one explicitly set NOT to roll is left alone:
 * stamping it would give the carry a date to reach back to if it were ever
 * switched on by hand.
 *
 * A category with no limit is stamped too. It carries nothing until it has
 * one, and the day it gets one startForLimit begins its carry afresh.
 *
 * @param {Array<Record<string, any>>} categories
 * @param {string} month  the current month, as a key
 * @returns {Array<{id: number, rolloverFrom: string}>}
 */
export function startsForGlobalOn(categories, month) {
  /** @type {Array<{id: number, rolloverFrom: string}>} */
  const out = []
  for (const c of categories ?? []) {
    if (c?.id == null || !canHaveBudget(c) || c.rolloverFrom || c.rollover === false) continue
    out.push({ id: c.id, rolloverFrom: month })
  }
  return out
}

/**
 * The `rolloverFrom` to write alongside a limit, or undefined to leave it be.
 *
 * Starts the carry at `month` when a category that rolls is given a limit it
 * did not have: carryInto measures every month since the start against the
 * CURRENT limit, so a start that predates the limit would credit months in
 * which nothing was budgeted - the "windfall out of nowhere" the start date
 * exists to prevent. Also when it rolls, has a limit and has never had a start
 * at all, which is how a category created or restored with the switch already
 * on would otherwise sit there carrying nothing for ever.
 *
 * Left alone when a start already stands and the limit was already there: a
 * category switched off and on again keeps its old start, as it always has.
 *
 * @param {object} input
 * @param {Record<string, any>|null|undefined} input.cat  the category as saved; absent for a new one
 * @param {number} input.budget  the limit it will have once this is written
 * @param {boolean} input.rolls  whether it will roll over once this is written
 * @param {string} input.month   the current month, as a key
 * @returns {string|undefined}
 */
export function startForLimit({ cat, budget, rolls, month }) {
  if (!rolls || !(budget > 0)) return undefined
  if (!((cat?.budget ?? 0) > 0) || !cat?.rolloverFrom) return month
  return undefined
}

/**
 * What to write, per category, when the limit editor saves.
 *
 * Only the categories the person touched. For each: the new limit, the new
 * carry flag, and a start month where one is needed (startForLimit).
 *
 * The flag is written only when it differs from what the category resolves to
 * now - tapping the button and tapping it back changes nothing - and when it
 * is written it is written EXPLICITLY, true or false, whatever the global
 * switch says. That is what lets one category opt in or out against the
 * default: an explicit value beats the global in rollsOver, so the default
 * changing later does not move it. (It used to be skipped whenever the shown
 * state equalled the global, which left the button unable to stamp anything
 * while the switch was on.)
 *
 * @param {object} input
 * @param {Array<Record<string, any>>} input.categories  as saved
 * @param {Record<string, number>} input.budgets  new limits, parsed, by category id
 * @param {Record<string, boolean>} input.carry   the carry buttons pressed, by category id
 * @param {boolean} input.globalDefault
 * @param {string} input.month  the current month, as a key
 * @returns {Array<{id: number, patch: Record<string, any>}>}  only rows with something to write
 */
export function planLimitSave({ categories, budgets, carry, globalDefault, month }) {
  /** @type {Array<{id: number, patch: Record<string, any>}>} */
  const out = []
  for (const cat of categories ?? []) {
    const key = String(cat.id)
    const hasBudget = Object.prototype.hasOwnProperty.call(budgets, key)
    const hasCarry  = Object.prototype.hasOwnProperty.call(carry, key)
    if (!hasBudget && !hasCarry) continue

    const before = cat.budget ?? 0
    const budget = hasBudget ? budgets[key] : before
    const resolved = rollsOver(cat, globalDefault)
    const rolls = hasCarry ? carry[key] : resolved

    /** @type {Record<string, any>} */
    const patch = {}
    if (hasBudget && budget !== before) patch.budget = budget
    if (hasCarry && carry[key] !== resolved) patch.rollover = carry[key]
    const from = startForLimit({ cat, budget, rolls, month })
    if (from) patch.rolloverFrom = from
    if (Object.keys(patch).length) out.push({ id: cat.id, patch })
  }
  return out
}

/** The meta key that records what was done about a month's leftovers. @param {string} month */
export const sweptKey = (month) => `swept-${month}`

/** What the stamp holds once the money has been moved into a goal. */
export const SWEPT_MOVED = 'moved'
/** What it holds once the offer has been turned down. */
export const SWEPT_DISMISSED = 'dismissed'

/**
 * What became of a month's leftovers, from its stamp: 'moved' into a goal,
 * 'dismissed', or null while the offer is still open.
 *
 * Moving and dismissing used to write the same `true`, so the Budget page
 * could not tell them apart and went on offering to "keep" money that had
 * already been moved - a second transfer of the same leftovers, one tap away.
 *
 * A stamp from before the two were told apart is `true`, and reads as moved.
 * That is the reading that cannot lose money: if it was really a dismissal the
 * quiet line that offered the sweep again is gone for that one month, where the
 * other reading would offer money that has left twice.
 *
 * @param {unknown} value  the stamp's value
 * @returns {'moved'|'dismissed'|null}
 */
export function sweepOutcome(value) {
  if (value === SWEPT_DISMISSED) return SWEPT_DISMISSED
  return value ? SWEPT_MOVED : null
}
