import { amountDisplay, TONE_CLASS } from '../../lib/txMoney'
import { isoToDateInput } from '../../utils/txDate'

/** "12:30 PM". The time under a transaction's description. */
export function fmtTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// ── Date range helper ──────────────────────────────────────────────────────────

export function inDateRange(tx, range, customFrom, customTo) {
  if (range === 'all') return true
  const txDate = new Date(tx.date ?? 0)
  const today  = new Date(); today.setHours(0, 0, 0, 0)

  if (range === 'week') {
    const start = new Date(today); start.setDate(today.getDate() - today.getDay())
    return txDate >= start
  }
  if (range === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return txDate >= start
  }
  if (range === 'last_month') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const end   = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999)
    return txDate >= start && txDate <= end
  }
  if (range === 'custom') {
    if (customFrom) {
      const from = new Date(customFrom); from.setHours(0, 0, 0, 0)
      if (txDate < from) return false
    }
    if (customTo) {
      const to = new Date(customTo); to.setHours(23, 59, 59, 999)
      if (txDate > to) return false
    }
    return true
  }
  return true
}

// ── Grouping ───────────────────────────────────────────────────────────────────

/**
 * One bucket per calendar day, in the reader's own timezone.
 *
 * The key was `tx.date.slice(0, 10)`, which is the UTC date. A transaction at
 * 07:55 in Manila is 23:55 the previous day in UTC, so it grouped under
 * yesterday and the heading said so - while a transaction logged an hour
 * later, whose UTC date happens to agree, sat correctly under Today. Two rows
 * from the same morning, filed a day apart.
 *
 * fmtGroupDate already reads the key as local midnight, so it was only ever
 * the key that was on the wrong clock.
 *
 * @param {Array<Record<string, any>>} txs
 */
export function groupByDate(txs) {
  const map = new Map()
  txs.forEach(tx => {
    const key = isoToDateInput(tx.date) || 'unknown'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(tx)
  })
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, txs]) => ({ date, txs }))
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const PAGE_SIZE = 50

export const TYPE_OPTS = [
  { value: 'all',      label: 'All'      },
  { value: 'expense',  label: 'Expense'  },
  { value: 'inflow',   label: 'Inflow'   },
  { value: 'transfer', label: 'Transfer' },
]

export const DATE_OPTS = [
  { value: 'all',        label: 'All time'   },
  { value: 'week',       label: 'This week'  },
  { value: 'month',      label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom',     label: 'Custom…'    },
]

/**
 * Sign, colour and the figure to print, for one row.
 *
 * The magnitude matters: a refund is stored at -500 so every sum-by-category
 * in the app stays right about it without being told refunds exist (see
 * lib/txMoney.js). Printing sign + amount straight would give a double
 * negative, so callers get an already-absolute number to format.
 *
 * @param {Record<string, any>} tx
 * @param {{account?: string|null}} [ctx]
 */
export function txRowTone(tx, ctx) {
  const { sign, magnitude, tone } = amountDisplay(tx, ctx)
  return { sign, magnitude, cls: TONE_CLASS[/** @type {keyof typeof TONE_CLASS} */ (tone)] }
}
