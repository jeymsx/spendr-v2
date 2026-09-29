import { toDateInput } from './txDate'

/**
 * Advance a date string forward by one frequency period.
 * Returns a YYYY-MM-DD string.
 *
 * @param {string} dateStr
 * @param {string} frequency
 */
export function advanceNextDate(dateStr, frequency) {
  const step = FREQ_BY_VALUE[frequency]?.step
  const d = parseDateLocal(dateStr) ?? new Date(dateStr)
  // An unknown frequency stays put - on the same LOCAL day, not the UTC one.
  if (!step) return toDateInput(d)

  if (step.unit === 'semimonth') {
    /* Twice a month on the Philippine payroll cut-offs: the 15th, then the
       last day of the month. Not "every 15 days", which drifts off both
       within a quarter. A date that is on neither - one typed before this
       existed - lands on the next of the two. */
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    if (d.getDate() < 15) d.setDate(15)
    else if (d.getDate() < last) d.setDate(last)
    else { d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(15) }
  } else if (step.unit === 'day') {
    d.setDate(d.getDate() + step.n)
  } else {
    /* Reset to the 1st before moving, then clamp. Adding a month to Jan 31
       lands on Mar 2 otherwise, because Feb has no 31st and the overflow
       carries - and a bill due on the 31st would walk forward through the
       calendar a day or two every quarter. Clamping keeps it on the last day
       of the target month and, crucially, does not lose the original day:
       the NEXT advance is computed from the stored date, so a Jan 31 bill
       becomes Feb 28 and then Mar 28 rather than returning to the 31st.
       That is the same behaviour this had for monthly and yearly; the only
       change is that the period is now a number from the table. */
    const day = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + step.n)
    const lastOfTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, lastOfTarget))
  }

  /* Local, not toISOString: the date is a calendar day, and in UTC+8 an
     ISO conversion of a local midnight lands on the previous day. */
  /** @param {number} n */
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Normalize an amount to its monthly equivalent.
 *
 * @param {number} amount
 * @param {string} frequency
 */
export function toMonthlyAmount(amount, frequency) {
  return (amount ?? 0) * (FREQ_BY_VALUE[frequency]?.perMonth ?? 1)
}

// ── Shared vocabulary ────────────────────────────────────────────────────────
//
// The list and the detail page have to agree on what "Monthly" is called, on
// what counts as overdue, and on how a due date is worded. When these lived in
// Recurring.jsx the detail page could only have its own copy, and two copies
// of "is this overdue?" is how a row ends up amber on one screen and red on
// the next.

/**
 * Every frequency, and everything that follows from it.
 *
 * `step` advances a due date, `perMonth` normalises an amount, and the three
 * labels are what the list, the hero and a chip each need. They live in one
 * row per frequency on purpose: the first version had the labels here and the
 * arithmetic in two switch statements further down, so adding "quarterly"
 * meant editing three places and a bill added on the fourth would have had a
 * name, no way to advance its date, and a monthly cost of its full amount.
 *
 * perMonth is stated rather than derived from `step`. A month is not 30.44
 * days for a bill that arrives on the 8th - monthly, quarterly and yearly
 * divide exactly, and only the day-stepped ones need the average.
 */
export const FREQ_OPTIONS = [
  { value: 'daily',       label: 'Daily',          short: 'day', every: 'day',      step: { unit: 'day',   n: 1  }, perMonth: 30.44   },
  { value: 'weekly',      label: 'Weekly',         short: 'wk',  every: 'week',     step: { unit: 'day',   n: 7  }, perMonth: 52 / 12 },
  { value: 'fortnightly', label: 'Every 2 weeks',  short: '2wk', every: '2 weeks',  step: { unit: 'day',   n: 14 }, perMonth: 26 / 12 },
  /* The 15th and the last day - how pay lands in the Philippines. See
     advanceNextDate, and snapToCutoff for where a new one starts. */
  { value: 'semimonthly', label: 'Twice a month',  short: '½mo', every: 'half month', step: { unit: 'semimonth', n: 1 }, perMonth: 2 },
  { value: 'monthly',     label: 'Monthly',        short: 'mo',  every: 'month',    step: { unit: 'month', n: 1  }, perMonth: 1       },
  { value: 'quarterly',   label: 'Quarterly',      short: 'qtr', every: 'quarter',  step: { unit: 'month', n: 3  }, perMonth: 1 / 3   },
  { value: 'semiannual',  label: 'Every 6 months', short: '6mo', every: '6 months', step: { unit: 'month', n: 6  }, perMonth: 1 / 6   },
  { value: 'yearly',      label: 'Yearly',         short: 'yr',  every: 'year',     step: { unit: 'month', n: 12 }, perMonth: 1 / 12  },
]

const FREQ_BY_VALUE = Object.fromEntries(FREQ_OPTIONS.map(f => [f.value, f]))

/** Commonest first: how the All tab groups, and how a picker should order. */
export const FREQ_ORDER = [
  'monthly', 'semimonthly', 'weekly', 'fortnightly', 'quarterly', 'semiannual', 'yearly', 'daily',
]

/**
 * Where a twice-a-month item starts: the first cut-off - the 15th or the
 * last day of the month - on or after the date chosen.
 *
 * @param {string} dateStr  YYYY-MM-DD
 * @returns {string}
 */
export function snapToCutoff(dateStr) {
  const d = parseDateLocal(dateStr)
  if (!d) return dateStr
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  if (d.getDate() <= 15) d.setDate(15)
  else d.setDate(last)
  return toDateInput(d)
}

/** "15th", "1st", "22nd". @param {number} n */
export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

export const FREQ_LABEL = Object.fromEntries(FREQ_OPTIONS.map(f => [f.value, f.label]))
export const FREQ_SHORT = Object.fromEntries(FREQ_OPTIONS.map(f => [f.value, f.short]))
/** A YYYY-MM-DD string as a local date, not a UTC one.
 *
 * @param {string} [str]
 * @returns {Date|null}
 */
export function parseDateLocal(str) {
  if (!str) return null
  const [y, m, d] = String(str).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const out = new Date(y, m - 1, d)
  return Number.isNaN(out.getTime()) ? null : out
}

/** Whole days from today to `dateStr`; negative when it has passed.
 *
 * @param {string} [dateStr]
 * @returns {number|null}
 */
export function daysUntil(dateStr) {
  const due = parseDateLocal(dateStr)
  if (!due) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - now.getTime()) / 86400000)
}

/**
 * How urgent a due date is, as a word and a tone.
 *
 * `tone` is a name rather than a class list so callers can render it at
 * whatever size they need - the detail page's hero and a 11px list row want
 * the same three states in very different type.
 *
 * @param {string} [dateStr]
 */
export function dueStatus(dateStr) {
  const n = daysUntil(dateStr)
  if (n == null) return null
  if (n < 0)   return { days: n, label: `${Math.abs(n)}d overdue`, tone: 'late' }
  if (n === 0) return { days: n, label: 'Today',                   tone: 'late' }
  if (n === 1) return { days: n, label: 'Tomorrow',                tone: 'soon' }
  if (n <= 7)  return { days: n, label: `${n} days`,               tone: 'soon' }
  if (n <= 14) return { days: n, label: '1 week',                  tone: 'calm' }
  // "3 weeks", not "3w", in a list that already says "6 days" and "1 week".
  return       { days: n, label: `${Math.round(n / 7)} weeks`,     tone: 'calm' }
}

/** Class list for a `dueStatus` tone. */
export const DUE_TONE = {
  late: 'text-red-500 dark:text-red-400 font-semibold',
  soon: 'text-amber-600 dark:text-amber-400 font-medium',
  calm: 'text-slate-500 dark:text-slate-400',
}

/** "Sep 14, 2026" — for a date far enough out that the year matters.
 *
 * @param {string} [str]
 */
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
 *
 * @param {string} [dateStr]
 */
export function billingLine(dateStr, income = false) {
  if (income) return incomeLine(dateStr)
  const d = parseDateLocal(dateStr)
  if (!d) return 'No date set'
  const n = daysUntil(dateStr)
  const when = fmtDateFull(dateStr)
  if (n < 0)   return `Overdue since ${when}`
  if (n === 0) return `Billing today · ${when}`
  if (n === 1) return `Next billing tomorrow · ${when}`
  if (n <= 7)  return `Next billing in ${n} days · ${when}`
  return `Next billing ${when}`
}

/**
 * The same line for income: it arrives rather than bills, and a date that
 * has passed is not "overdue" - it is waiting to be marked received.
 *
 * @param {string} [dateStr]
 */
export function incomeLine(dateStr) {
  const d = parseDateLocal(dateStr)
  if (!d) return 'No date set'
  const n = daysUntil(dateStr)
  const when = fmtDateFull(dateStr)
  if (n < 0)   return `Expected ${when} · not marked yet`
  if (n === 0) return `Arrives today · ${when}`
  if (n === 1) return `Arrives tomorrow · ${when}`
  if (n <= 7)  return `Arrives in ${n} days · ${when}`
  return `Next on ${when}`
}
