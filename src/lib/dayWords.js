/**
 * A day the way a sentence says it.
 *
 * "Runs short on Sep 29", on the 29th, read as a day still to come; the
 * lists beside it already said Today and Tomorrow. So today and tomorrow
 * are words, and any other day is its date.
 */

const DAY = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })
/** @param {Date} d */
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
/** @param {Date} d @param {Date} now */
const daysFrom = (d, now) => Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 864e5)

/**
 * Inside a sentence: "today", "tomorrow" or "on Sep 29".
 * @param {Date} d
 * @param {Date} [now]
 */
export function onDay(d, now = new Date()) {
  const n = daysFrom(d, now)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  return `on ${DAY.format(d)}`
}

/**
 * On its own: "Today", "Tomorrow" or "Sep 29".
 * @param {Date} d
 * @param {Date} [now]
 */
export function dayName(d, now = new Date()) {
  const n = daysFrom(d, now)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  return DAY.format(d)
}
