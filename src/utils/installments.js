/**
 * Installments are ordinary transactions — there is no plan table — so a plan's
 * rows are recognised rather than looked up.
 *
 * New plans stamp every row with a shared `installmentId`, which is exact.
 * Rows written before that existed are matched on the "(n/N)" suffix the
 * generator adds, plus account, term and amount, so plans already in the
 * database can still be deleted as a unit.
 *
 * `installmentId` is a plain property, not an index, so it needs no Dexie
 * migration. It is also not mapped to Supabase, which means a second device
 * pulling these rows falls back to suffix matching — acceptable, and the fix
 * if it ever matters is one nullable column.
 *
 * ── A plan is spent the day it is bought ──
 *
 * The rows are the card's: one a month, each billed on the statement its date
 * falls in, which is what the card's statements, its available credit and its
 * payments read. As spending, though, a ₱36,000 phone on 12 × ₱3,000 is
 * ₱36,000 spent the day you bought it - what you committed to - and paying the
 * card each month is a transfer, not spending again (YNAB's model). Spending
 * read row by row was ₱3,000 a month, in a category's budget long after the
 * thing was bought, and a "new" transaction appearing in the list each month.
 *
 * So everything that reads spending reads `spendingRows` - the plan as one
 * row of its whole price on the first payment's date (the purchase date), the
 * later months as nothing - and every list reads `foldPlans` - the plan as
 * that one row, the later months gone. Nothing stored changes: the rows stay
 * the card's, and a card's own page still lists each month it billed.
 */

import { scheduledCutoff } from './scheduled'

const LABEL_RE = /^(.*)\s\((\d+)\/(\d+)\)$/

/** `"Laptop (2/6)"` -> `{ base: 'Laptop', index: 2, total: 6 }`, else null.
 *
 * @param {string} [description]
 */
export function parseInstallmentLabel(description) {
  const m = LABEL_RE.exec(String(description ?? '').trim())
  if (!m) return null
  const index = Number(m[2])
  const total = Number(m[3])
  if (!(total > 1) || !(index >= 1) || index > total) return null
  return { base: m[1], index, total }
}

/** True when this row looks like part of an installment plan.
 *
 * @param {Partial<Transaction>} [tx]
 */
export function isInstallmentRow(tx) {
  return !!tx?.installmentId || !!parseInstallmentLabel(tx?.description)
}

/**
 * Every row belonging to the same plan as `tx`, including `tx`, oldest first.
 * Returns [tx] when it isn't part of a plan, so callers can treat the result
 * uniformly.
 *
 * @param {Partial<Transaction>} [tx]
 * @param {Array<Partial<Transaction>>} [allTxs]
 */
export function findInstallmentGroup(tx, allTxs) {
  if (!tx) return []
  const pool = allTxs ?? []

  if (tx.installmentId) {
    const exact = pool.filter(t => t.installmentId === tx.installmentId)
    return (exact.length ? exact : [tx]).slice().sort(byDate)
  }

  const label = parseInstallmentLabel(tx.description)
  if (!label) return [tx]

  // Suffix fallback: same card, same base label, same term and same amount.
  // Tight enough that a collision needs two identical plans on one account.
  const matches = pool.filter(t => {
    if (t.installmentId) return false
    if (t.type !== tx.type || t.account !== tx.account) return false
    if ((t.amount ?? 0) !== (tx.amount ?? 0)) return false
    const l = parseInstallmentLabel(t.description)
    return l && l.base === label.base && l.total === label.total
  })
  return (matches.length ? matches : [tx]).slice().sort(byDate)
}

/**
 * @param {Partial<Transaction>} a
 * @param {Partial<Transaction>} b
 */
function byDate(a, b) {
  return String(a.date ?? '').localeCompare(String(b.date ?? ''))
}

// ── A plan as one purchase ──────────────────────────────────────────────────

/**
 * What a plan's lead row stands for: the whole purchase.
 *
 * @typedef {{lead: true, count: number, each: number, total: number, billed: number|null, name: string}} PlanLead
 * @typedef {{lead: false}} PlanFollower
 */

/** @param {number} n */
const round2 = (n) => Math.round(n * 100) / 100

/** The plan a row belongs to, as a key: its stamp, or the suffix fallback's match. @param {Partial<Transaction>} t */
function planKey(t) {
  if (t.installmentId) return `i\u001f${t.installmentId}`
  const l = parseInstallmentLabel(t.description)
  return l ? `s\u001f${t.account}\u001f${t.amount}\u001f${l.base}\u001f${l.total}` : null
}

/** @type {WeakMap<object, Map<object, PlanLead|PlanFollower>>} */
const mapsComplete = new WeakMap()
/** @type {WeakMap<object, Map<object, PlanLead|PlanFollower>>} */
const mapsPartial = new WeakMap()

/**
 * Every plan row in `pool`, as its plan's lead (the first payment) or one of
 * its followers. Rows that are not part of a plan are not in the map.
 *
 * `complete`: the pool holds every row, not a window of dates. Then a plan's
 * total is its rows' own sum and a renamed row (its "(n/N)" gone) still finds
 * its place by date. A window (Insights' month, a Wrapped month) only knows
 * what the label says - a lead is "(1/N)", its total N × its amount, and a
 * renamed row counts as an ordinary one.
 *
 * Memoised on the array: the same live query's array is read by several
 * figures at once.
 *
 * @param {Array<Partial<Transaction>>} pool
 * @param {boolean} [complete]
 * @returns {Map<object, PlanLead|PlanFollower>}
 */
export function planMap(pool, complete = true) {
  const cache = complete ? mapsComplete : mapsPartial
  const hit = cache.get(pool)
  if (hit) return hit
  /** @type {Map<string, Array<Partial<Transaction>>>} */
  const groups = new Map()
  for (const t of pool ?? []) {
    // A row spendingRows already made whole is a plan's purchase, not a payment of one.
    if (t?.type !== 'expense' || t.planOf || !isInstallmentRow(t)) continue
    const k = planKey(t)
    if (!k) continue
    const g = groups.get(k)
    if (g) g.push(t)
    else groups.set(k, [t])
  }
  /** @type {Map<object, PlanLead|PlanFollower>} */
  const out = new Map()
  const now = scheduledCutoff()
  for (const [k, rows] of groups) {
    rows.sort(byDate)
    let leads = rows.filter(r => parseInstallmentLabel(r.description)?.index === 1)
    if (!leads.length && complete && k.startsWith('i')) leads = [rows[0]]
    if (!leads.length && !complete) {
      // A window: what the labels say is all there is to go on.
      for (const r of rows) if (parseInstallmentLabel(r.description)) out.set(r, { lead: false })
      continue
    }
    /* One plan in the group (always, with a stamp) and every month of it
       here: its rows' own sum, so a month changed by hand counts as it is.
       Months missing - a pool cut short at today - or two identical plans
       merged by the suffix fallback: each its term's worth. */
    const single = leads.length === 1
    for (const r of rows) out.set(r, { lead: false })
    for (const lead of leads) {
      const label = parseInstallmentLabel(lead.description)
      const count = label?.total ?? rows.length
      const each = lead.amount ?? 0
      const whole = single && complete && rows.length === count
      const total = whole ? round2(rows.reduce((s, r) => s + (r.amount ?? 0), 0)) : round2(each * count)
      const billed = whole ? rows.filter(r => (r.date ?? '') <= now).length : null
      out.set(lead, { lead: true, count, each, total, billed, name: label?.base ?? String(lead.description ?? '') })
    }
  }
  cache.set(pool, out)
  return out
}

/** @type {WeakMap<object, any[]>} */
const spendComplete = new WeakMap()
/** @type {WeakMap<object, any[]>} */
const spendPartial = new WeakMap()

/**
 * The rows as spending: each plan as one row of its whole price on its first
 * payment's date, the later payments gone. For totals, budgets, Insights,
 * Wrapped - anything that sums what was spent.
 *
 * The plan's row is a copy, its `amount` (and `baseAmount`) the whole price,
 * carrying `plan` for drawing and `planOf`, the stored row it stands for.
 * Never write it back: hand a sheet the row through `storedRow`
 * (lib/loans.js unfoldLoanPayment does it too). Rows that are not part of a
 * plan come back as they are, and with no plan in it the array itself does.
 *
 * @template {Partial<Transaction>} T
 * @param {T[]} txs
 * @param {{complete?: boolean}} [opts] false when `txs` is a window of dates (see planMap)
 * @returns {T[]}
 */
export function spendingRows(txs, { complete = true } = {}) {
  if (!Array.isArray(txs) || !txs.length) return txs ?? []
  const cache = complete ? spendComplete : spendPartial
  const hit = cache.get(txs)
  if (hit) return hit
  const map = planMap(txs, complete)
  let out = txs
  if (map.size) {
    out = []
    for (const t of txs) {
      const info = map.get(t)
      if (!info) { out.push(t); continue }
      if (!info.lead) continue
      const factor = t.amount ? info.total / t.amount : info.count
      out.push(/** @type {T} */ ({
        ...t,
        amount: info.total,
        ...(t.baseAmount != null ? { baseAmount: round2(t.baseAmount * factor) } : {}),
        plan: info,
        planOf: t,
      }))
    }
  }
  cache.set(txs, out)
  return out
}

/**
 * The rows as a list shows them: each plan as its first payment - the
 * purchase - carrying `plan` (its whole price, its term, how many months are
 * billed), and the later payments gone. `pool` is every row, when `rows` is
 * a filtered part of them, so a plan's total and progress are its own.
 *
 * The plan's row is the stored row plus `plan`, for drawing; its `amount` is
 * still the one payment. Hand it to a sheet through `storedRow`.
 *
 * @template {Partial<Transaction>} T
 * @param {T[]} rows
 * @param {Array<Partial<Transaction>>} [pool]
 * @returns {Array<T & {plan?: PlanLead}>}
 */
export function foldPlans(rows, pool = rows) {
  const map = planMap(pool, true)
  if (!map.size) return rows
  /** @type {Array<T & {plan?: PlanLead}>} */
  const out = []
  for (const t of rows) {
    const info = map.get(t)
    if (!info) { out.push(t); continue }
    if (info.lead) out.push({ ...t, plan: info })
  }
  return out
}

/**
 * How much more than its own amount a row from foldPlans stands for, as a
 * multiple: the plan's whole price over its one payment. 1 for any other row.
 *
 * @param {Partial<Transaction> & {plan?: PlanLead}} row
 */
export function planFactor(row) {
  if (!row?.plan || row.planOf) return 1
  return row.amount ? row.plan.total / row.amount : row.plan.count
}

/**
 * The row as stored, for a sheet to open or a write to take: a spending
 * copy's original, or a folded row without its `plan`.
 *
 * @template {Record<string, any>} T
 * @param {T} row
 * @returns {T}
 */
export function storedRow(row) {
  if (row?.planOf) return row.planOf
  if (!row || !('plan' in row)) return row
  const t = { ...row }
  delete t.plan
  return t
}
