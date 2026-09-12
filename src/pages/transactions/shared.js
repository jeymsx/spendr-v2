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

export function groupByDate(txs) {
  const map = new Map()
  txs.forEach(tx => {
    const key = tx.date?.slice(0, 10) ?? 'unknown'
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

export const AMOUNT_COLOR = {
  expense:  { cls: 'text-red-500 dark:text-red-400',         sign: '−' },
  inflow:   { cls: 'text-emerald-600 dark:text-emerald-400', sign: '+' },
  transfer: { cls: 'text-blue-500 dark:text-blue-400',       sign: ''  },
}
