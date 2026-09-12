/**
 * The small, pure facts about an account that every screen needs.
 *
 * These lived in pages/Accounts.jsx, which was fine while only pages imported
 * them. components/CardStyle.jsx needs them too, and a component importing a
 * page to get a colour list is both backwards and a real import cycle the
 * moment that page renders the component. Nothing here touches Dexie, React
 * or the DOM, so it belongs in lib.
 *
 * pages/Accounts.jsx re-exports all of it, so `from './Accounts'` keeps
 * working everywhere it already did.
 */

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Peso, two decimals, with a real minus sign rather than a hyphen. */
/** @param {number} [v] */
export const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _phpFmt.format(Math.abs(n))
}

export const PALETTE = [
  '#10b981', '#2D9DFF', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#f97316',
  '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#a78bfa', '#64748b', '#0ea5e9',
]

/* Sentence case, like every other label in the app: these are common nouns,
   not brand names. `value` is the stored key and does not move. */
export const TYPE_OPTIONS = [
  { value: 'cash',    label: 'Cash',        shortLabel: 'Cash'     },
  { value: 'ewallet', label: 'E-wallet',    shortLabel: 'E-wallet' },
  { value: 'savings', label: 'Savings',     shortLabel: 'Savings'  },
  { value: 'bank',    label: 'Bank',        shortLabel: 'Bank'     },
  { value: 'credit',  label: 'Credit card', shortLabel: 'Credit'   },
]

export const TYPE_LABEL = Object.fromEntries(TYPE_OPTIONS.map(t => [t.value, t.label]))

/** @param {string} type */
export function defaultRole(type) {
  if (type === 'credit') return 'credit'
  return ['cash', 'ewallet'].includes(type) ? 'spending' : 'savings'
}
