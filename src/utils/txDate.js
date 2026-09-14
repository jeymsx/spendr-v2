/**
 * Turning a stored timestamp into a date field, and back.
 *
 * ── The bug these exist to end ──
 *
 * A transaction's date is stored as a UTC ISO string and DISPLAYED in local
 * time, and the edit form read it by slicing the first ten characters - which
 * is the UTC date, not the local one. East of Greenwich those disagree for
 * most of the evening.
 *
 * A salary stored at 2026-09-13T23:55:16Z is the 14th in Manila. The ledger
 * said the 14th, the edit field said the 13th, and correcting the field to
 * the 14th moved the stored value to 2026-09-14T23:55:16Z - the 15th locally,
 * which is tomorrow, which the transactions list hides as scheduled. So the
 * row appeared to be moved to the wrong day, and then to vanish when it was
 * put right.
 *
 * Nothing was lost either time. It is one bug wearing two costumes, and both
 * come from mixing the two clocks.
 */

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0')

/**
 * The value for a `<input type="date">`, in the reader's own timezone.
 *
 * Not `iso.slice(0, 10)`. That is the UTC date, and it is the wrong day for
 * anybody east of Greenwich for the last hours of theirs.
 *
 * @param {string|null|undefined} iso
 */
export function isoToDateInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * A date from the field, put back on the clock the row was already keeping.
 *
 * ── The time of day is kept ──
 *
 * Two transactions on the same day sort by it, so replacing it with midnight
 * would shuffle a day's ledger every time somebody corrected a date. The
 * original LOCAL hour is carried onto the new local date.
 *
 * ── And clamped to now ──
 *
 * Carrying it is not enough on its own. A row at 23:55 moved onto today lands
 * later today, and anything after the end of today is hidden as scheduled -
 * see utils/scheduled.js - so a correction would make the row disappear
 * again, for a different reason.
 *
 * Never later than this moment, then. That also matches what the add form
 * does, which stamps the current time onto whatever date you pick.
 *
 * @param {string} dateStr  'YYYY-MM-DD' from the field, read as local
 * @param {string|null|undefined} originalIso  the row's current timestamp
 * @param {Date} [now]  injectable, so the clamp is testable
 */
export function dateInputToIso(dateStr, originalIso, now = new Date()) {
  if (!dateStr) return originalIso ?? null

  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return originalIso ?? null

  const src = originalIso ? new Date(originalIso) : null
  const keep = src && !Number.isNaN(src.getTime()) ? src : null

  const next = new Date(
    y, m - 1, d,
    keep ? keep.getHours() : now.getHours(),
    keep ? keep.getMinutes() : now.getMinutes(),
    keep ? keep.getSeconds() : now.getSeconds(),
    keep ? keep.getMilliseconds() : 0,
  )

  return (next.getTime() > now.getTime() ? now : next).toISOString()
}
