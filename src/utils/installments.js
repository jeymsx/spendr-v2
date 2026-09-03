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
 */

const LABEL_RE = /^(.*)\s\((\d+)\/(\d+)\)$/

/** `"Laptop (2/6)"` -> `{ base: 'Laptop', index: 2, total: 6 }`, else null. */
export function parseInstallmentLabel(description) {
  const m = LABEL_RE.exec(String(description ?? '').trim())
  if (!m) return null
  const index = Number(m[2])
  const total = Number(m[3])
  if (!(total > 1) || !(index >= 1) || index > total) return null
  return { base: m[1], index, total }
}

/** True when this row looks like part of an installment plan. */
export function isInstallmentRow(tx) {
  return !!tx?.installmentId || !!parseInstallmentLabel(tx?.description)
}

/**
 * Every row belonging to the same plan as `tx`, including `tx`, oldest first.
 * Returns [tx] when it isn't part of a plan, so callers can treat the result
 * uniformly.
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

function byDate(a, b) {
  return String(a.date ?? '').localeCompare(String(b.date ?? ''))
}
