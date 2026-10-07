import { fmt, fmtCompact } from '../money'

/**
 * How a note says money, dates and counts. Whole figures and plain words:
 * "₱936", "in 8 days", "on Monday" - a note is read, not audited, and the
 * centavos are on every other screen.
 */

const MONTH = new Intl.DateTimeFormat('en-PH', { month: 'long' })
const SHORT = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })
const WEEKDAY = new Intl.DateTimeFormat('en-PH', { weekday: 'long' })

/** A finite number, or the fallback: a note cannot print NaN. @param {unknown} x @param {number} [d] */
export const num = (x, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d)

/** @param {Date} d */
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Whole days from one date to another, negative when the second is earlier. @param {Date} from @param {Date} to */
export const daysBetween = (from, to) => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 864e5)

/** 2026-10-07, in the reader's own day. @param {Date} d */
export const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** "October". @param {Date} d */
export const monthName = (d) => MONTH.format(d)
/** "Oct 15". @param {Date} d */
export const shortDate = (d) => SHORT.format(d)
/** "Wednesday". @param {Date} d */
export const weekdayName = (d) => WEEKDAY.format(d)

/**
 * A whole amount, with its sign left to the sentence: "₱1,200". Always a
 * magnitude, so "past the budget by ₱500" never reads "by -₱500".
 *
 * @param {number} n
 * @param {string} [cur]
 */
export function money(n, cur) {
  const v = Math.round(Math.abs(num(n)))
  return fmt(v, cur || undefined).replace(/[.,]0+$/, '')
}

/** A short amount for a list of piles: "₱47.6K". @param {number} n @param {string} [cur] */
export function moneyK(n, cur) {
  return fmtCompact(Math.abs(num(n)), cur || undefined).replace(/\.0(?=[KMB])/, '')
}

/** A share, whole: "48%". @param {number} n */
export const pct = (n) => `${Math.round(num(n))}%`

/** "1 day", "8 days". @param {number} n @param {string} one @param {string} [many] */
export const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "today", "tomorrow", "in 8 days". @param {number} n days from now */
export const inDays = (n) => (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`)

/**
 * A day inside a sentence: "today", "tomorrow", "on Monday" for the week
 * ahead, "on Oct 15" beyond it, "on Oct 2" for a day already gone.
 *
 * @param {Date} d
 * @param {Date} now
 */
export function onDay(d, now) {
  const n = daysBetween(now, d)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n >= 2 && n <= 6) return `on ${weekdayName(d)}`
  return `on ${shortDate(d)}`
}

/** A pay or a bill's name as a sentence wants it: "Salary" becomes "salary", "Globe Postpaid" stays. @param {string} name */
export const soft = (name) => (/^[A-Z][a-z]+$/.test(name) ? name.toLowerCase() : name)

/** Plain list of strings: "a, b and c". @param {string[]} items */
export function words(items) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

// ── A day's worth of variety ───────────────────────────────────────────────────

/** @param {string} str a 32-bit hash, FNV-1a */
export function hash32(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** A number in [0, 1) that is the same for the same key, every time. @param {string} key */
export const rand01 = (key) => hash32(key) / 4294967296

/**
 * One of the choices, the same one for the same key. The key is the day and
 * the sentence, so a note reads one way all day and another tomorrow, and a
 * tap never reshuffles it.
 *
 * @template T
 * @param {string} key
 * @param {T[]} choices
 * @returns {T}
 */
export function choose(key, choices) {
  return choices[Math.floor(rand01(key) * choices.length) % choices.length]
}
