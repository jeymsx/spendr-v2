/**
 * Which day a possible duplicate is on, in the words "Possible duplicate"
 * puts after "already exists".
 *
 * The sheet always said "today", and the check it belongs to is for the day
 * the form is DATED: a back-dated entry from October 3rd was told it
 * "already exists today" when it meant the 3rd. So the day comes from the
 * form, and "today" is said only when it is.
 *
 * @param {string} [day]  the form's local day, 'YYYY-MM-DD'
 * @param {Date} [now]
 * @returns {string}  "today", "on Oct 3" ("on Oct 3, 2025" in another year), or
 *   '' when there is no day to speak of
 */
export function dupWhen(day, now = new Date()) {
  const [y, m, d] = String(day ?? '').split('-').map(Number)
  if (!y || !m || !d) return ''
  if (y === now.getFullYear() && m === now.getMonth() + 1 && d === now.getDate()) return 'today'
  const date = new Date(y, m - 1, d)
  return `on ${date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: y !== now.getFullYear() ? 'numeric' : undefined,
  })}`
}
