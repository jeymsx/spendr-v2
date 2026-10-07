import { txBase } from '../../lib/fxContext'

/**
 * What the cash-flow chart on Insights is made of: the period's money in,
 * grouped by what it was (the biggest six and the rest together), and out,
 * grouped by category or by account (the biggest eight and the rest) - and
 * each node carries the transactions that make it up, so the chart can say
 * what is in a band when it is pressed.
 *
 * When more went out than came in the gap is drawn on the left as "From
 * savings", and when less did, what is left over is drawn on the right as
 * "Kept", so both sides always add up to the middle. Neither has
 * transactions of its own.
 *
 * Both sides are useInsightsData's own rows (income and spending by
 * lib/flows, in the ledger's currency), so they add up to the Spent and
 * Came in figures above the chart.
 *
 * @typedef {'income'|'other-income'|'savings'|'category'|'account'|'rest'|'kept'} FlowKind
 * @typedef {{id: string, name: string, value: number, color: string, kind: FlowKind,
 *            txs: Array<Record<string, any>>, href?: string}} FlowSource
 */

export const INCOME_COLOURS = ['#0f9f7a', '#14b8a6', '#0891b2', '#22c55e', '#65a30d', '#0d9488']
const GREY = '#94a3b8'
const FALLBACK = '#6366f1'

/**
 * @param {{inflows: Array<Record<string, any>>, expenses: Array<Record<string, any>>,
 *          catMap: Record<string, any>, acctMap: Record<string, any>, by?: 'category'|'account'}} input
 */
export function buildCashFlow({ inflows, expenses, catMap, acctMap, by = 'category' }) {
  /** @type {Map<string, {name: string, value: number, color: string, txs: Array<Record<string, any>>}>} */
  const incomeBy = new Map()
  for (const t of inflows) {
    const name = String(t.description || t.category || 'Income').trim() || 'Income'
    const at = incomeBy.get(name) ?? { name, value: 0, color: '', txs: [] }
    at.value += txBase(t)
    at.txs.push(t)
    incomeBy.set(name, at)
  }
  const ins = [...incomeBy.values()].filter(n => n.value > 0.005).sort((a, b) => b.value - a.value)
  /** @type {FlowSource[]} */
  const sources = ins.slice(0, 6).map((n, i) => ({
    id: `in:${n.name}`, name: n.name, value: n.value, color: INCOME_COLOURS[i % INCOME_COLOURS.length], kind: 'income', txs: n.txs,
  }))
  const restIn = ins.slice(6)
  if (restIn.length) {
    sources.push({ id: 'in:other', name: 'Other income', value: restIn.reduce((s, n) => s + n.value, 0), color: GREY, kind: 'other-income', txs: restIn.flatMap(n => n.txs) })
  }

  /** @type {Map<string, {name: string, value: number, color: string, txs: Array<Record<string, any>>}>} */
  const outBy = new Map()
  for (const t of expenses) {
    const key = by === 'account' ? t.account : t.category
    if (key == null) continue
    const at = outBy.get(key) ?? { name: key, value: 0, color: (by === 'account' ? acctMap[key]?.color : catMap[key]?.color) ?? FALLBACK, txs: [] }
    at.value += txBase(t)
    at.txs.push(t)
    outBy.set(key, at)
  }
  /* A group whose refunds outweigh its spending has no band to draw: a
     negative band is not a band. It is still in the total. */
  const outs = [...outBy.values()].filter(n => n.value > 0.005).sort((a, b) => b.value - a.value)
  /** @type {FlowSource[]} */
  const targets = outs.slice(0, 8).map(n => ({
    id: `out:${n.name}`, name: n.name, value: n.value, color: n.color, kind: by === 'account' ? 'account' : 'category', txs: n.txs,
    href: by === 'account'
      ? (acctMap[n.name]?.id != null ? `/accounts/${acctMap[n.name].id}` : undefined)
      : `/categories/${encodeURIComponent(n.name)}`,
  }))
  const restOut = outs.slice(8)
  if (restOut.length) {
    targets.push({ id: 'out:rest', name: 'Everything else', value: restOut.reduce((s, n) => s + n.value, 0), color: GREY, kind: 'rest', txs: restOut.flatMap(n => n.txs) })
  }

  const inTotal = sources.reduce((s, n) => s + n.value, 0)
  const outTotal = targets.reduce((s, n) => s + n.value, 0)
  const drawn = outTotal - inTotal
  if (drawn > 0.005) sources.push({ id: 'in:savings', name: 'From savings', value: drawn, color: '#c27803', kind: 'savings', txs: [] })
  const kept = inTotal - outTotal
  if (kept > 0.005) targets.push({ id: 'out:kept', name: 'Kept', value: kept, color: '#059669', kind: 'kept', txs: [] })
  return { sources, targets, inTotal, outTotal }
}
