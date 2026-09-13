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
 */

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
  for (const tx of txs ?? []) {
    if (tx.type !== 'expense' || tx.category !== categoryName) continue
    const k = monthKey(tx.date)
    out[k] = Math.round(((out[k] ?? 0) + (tx.amount ?? 0)) * 100) / 100
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
 * Last month's leftovers, for the sweep.
 *
 * Only categories that came in UNDER, and only the amount they were under by.
 * A category with no limit is not under anything, and one that rolls over has
 * already kept its leftover - sweeping it too would move the same money
 * twice.
 *
 * @param {object} input
 * @param {Array<Record<string, any>>} input.categories
 * @param {Array<Record<string, any>>} input.txs
 * @param {string} input.month  the month that just ended
 * @param {boolean} [input.globalDefault]
 */
export function sweepable({ categories, txs, month, globalDefault = false }) {
  const out = []
  for (const cat of categories ?? []) {
    const limit = cat.budget ?? 0
    if (!(limit > 0) || rollsOver(cat, globalDefault)) continue
    const spent = spendByMonth(txs, cat.name)[month] ?? 0
    const left = Math.round((limit - spent) * 100) / 100
    if (left > 0) out.push({ name: cat.name, limit, spent, left, icon: cat.icon, color: cat.color })
  }
  out.sort((a, b) => b.left - a.left)
  const total = Math.round(out.reduce((s, c) => s + c.left, 0) * 100) / 100
  return { rows: out, total }
}
