/**
 * Advance a date string forward by one frequency period.
 * Returns a YYYY-MM-DD string.
 */
export function advanceNextDate(dateStr, frequency) {
  const d = new Date(dateStr)
  switch (frequency) {
    case 'daily':  d.setDate(d.getDate() + 1); break
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'monthly': {
      // Save original day, reset to 1st to prevent overflow (e.g. Jan 31 → Mar 2)
      const day = d.getDate()
      d.setDate(1)
      d.setMonth(d.getMonth() + 1)
      // Clamp to last day of the target month (e.g. Jan 31 → Feb 28/29)
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
      break
    }
    case 'yearly': {
      // Save original day/month, reset to 1st to prevent Feb-29 overflow
      const day = d.getDate()
      const mon = d.getMonth()
      d.setDate(1)
      d.setFullYear(d.getFullYear() + 1)
      d.setDate(Math.min(day, new Date(d.getFullYear(), mon + 1, 0).getDate()))
      break
    }
  }
  return d.toISOString().slice(0, 10)
}

/**
 * Normalize an amount to its monthly equivalent.
 */
export function toMonthlyAmount(amount, frequency) {
  switch (frequency) {
    case 'daily':   return (amount ?? 0) * 30.44
    case 'weekly':  return (amount ?? 0) * (52 / 12)
    case 'monthly': return amount ?? 0
    case 'yearly':  return (amount ?? 0) / 12
    default:        return amount ?? 0
  }
}

// ── Shared vocabulary ────────────────────────────────────────────────────────
//
// The list and the detail page have to agree on what "Monthly" is called, on
// what counts as overdue, and on how a due date is worded. When these lived in
// Recurring.jsx the detail page could only have its own copy, and two copies
// of "is this overdue?" is how a row ends up amber on one screen and red on
// the next.

export const FREQ_OPTIONS = [
  { value: 'daily',   label: 'Daily',   short: 'day', every: 'day'   },
  { value: 'weekly',  label: 'Weekly',  short: 'wk',  every: 'week'  },
  { value: 'monthly', label: 'Monthly', short: 'mo',  every: 'month' },
  { value: 'yearly',  label: 'Yearly',  short: 'yr',  every: 'year'  },
]

/** Commonest first: how the All tab groups, and how a picker should order. */
export const FREQ_ORDER = ['monthly', 'weekly', 'yearly', 'daily']

export const FREQ_LABEL = Object.fromEntries(FREQ_OPTIONS.map(f => [f.value, f.label]))
export const FREQ_SHORT = Object.fromEntries(FREQ_OPTIONS.map(f => [f.value, f.short]))
export const FREQ_EVERY = Object.fromEntries(FREQ_OPTIONS.map(f => [f.value, f.every]))

/** A YYYY-MM-DD string as a local date, not a UTC one. */
export function parseDateLocal(str) {
  if (!str) return null
  const [y, m, d] = String(str).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const out = new Date(y, m - 1, d)
  return Number.isNaN(out.getTime()) ? null : out
}

/** Whole days from today to `dateStr`; negative when it has passed. */
export function daysUntil(dateStr) {
  const due = parseDateLocal(dateStr)
  if (!due) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.round((due - now) / 86400000)
}

/**
 * How urgent a due date is, as a word and a tone.
 *
 * `tone` is a name rather than a class list so callers can render it at
 * whatever size they need - the detail page's hero and a 11px list row want
 * the same three states in very different type.
 */
export function dueStatus(dateStr) {
  const n = daysUntil(dateStr)
  if (n == null) return null
  if (n < 0)   return { days: n, label: `${Math.abs(n)}d overdue`, tone: 'late' }
  if (n === 0) return { days: n, label: 'Today',                   tone: 'late' }
  if (n === 1) return { days: n, label: 'Tomorrow',                tone: 'soon' }
  if (n <= 7)  return { days: n, label: `${n} days`,               tone: 'soon' }
  if (n <= 14) return { days: n, label: '1 week',                  tone: 'calm' }
  return       { days: n, label: `${Math.round(n / 7)}w`,          tone: 'calm' }
}

/** Class list for a `dueStatus` tone. */
export const DUE_TONE = {
  late: 'text-red-500 dark:text-red-400 font-semibold',
  soon: 'text-amber-600 dark:text-amber-400 font-medium',
  calm: 'text-slate-500 dark:text-slate-400',
}

/** "Sep 14" */
export function fmtDate(str) {
  const d = parseDateLocal(str)
  return d ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''
}

/** "Sep 14, 2026" — for a date far enough out that the year matters. */
export function fmtDateFull(str) {
  const d = parseDateLocal(str)
  return d ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
}

/**
 * The billing line: "Next billing tomorrow — Nov 22."
 *
 * Relative wording only where it beats the date itself. Past a week out
 * "in 23 days" is arithmetic the date already answers, so it drops the
 * preamble and just says when.
 */
export function billingLine(dateStr) {
  const d = parseDateLocal(dateStr)
  if (!d) return 'No date set'
  const n = daysUntil(dateStr)
  const when = fmtDateFull(dateStr)
  if (n < 0)   return `Overdue since ${when}`
  if (n === 0) return `Billing today — ${when}`
  if (n === 1) return `Next billing tomorrow — ${when}`
  if (n <= 7)  return `Next billing in ${n} days — ${when}`
  return `Next billing ${when}`
}
