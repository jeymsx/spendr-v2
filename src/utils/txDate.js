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

/* ── Remembered, because it is asked constantly ──

   Every month and day bucket in the app comes through here - the dashboard,
   Budget, Insights, the recap, badges and notifications each sort the whole
   ledger by it, and some on every render. Building a Date per row each time
   measured 15ms a pass over 20,000 rows, where a string slice had cost 1.

   The answer for a given string never changes unless the device's timezone
   does, so answers are kept, and all dropped when the offset moves - checked
   at most once a minute, which is how a phone that has flown somewhere finds
   out. Bounded, so an app left open for weeks cannot grow it without limit. */
const DAY_CACHE_MAX = 50_000
/** @type {Map<string, string>} */
const dayCache = new Map()
let cachedOffset = new Date().getTimezoneOffset()
let offsetCheckedAt = Date.now()

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
  if (typeof iso !== 'string') return localDay(iso)
  const now = Date.now()
  if (now - offsetCheckedAt > 60_000) {
    offsetCheckedAt = now
    const offset = new Date().getTimezoneOffset()
    if (offset !== cachedOffset) { cachedOffset = offset; dayCache.clear() }
  }
  const hit = dayCache.get(iso)
  if (hit !== undefined) return hit
  const day = localDay(iso)
  if (dayCache.size >= DAY_CACHE_MAX) dayCache.clear()
  dayCache.set(iso, day)
  return day
}

/** @param {string|number|Date} value */
function localDay(value) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : toDateInput(d)
}

/**
 * A moment's LOCAL calendar day, as a date field's value - today's, by
 * default. What a new form's date starts at, and what a file is dated with.
 *
 * Never `new Date().toISOString().slice(0, 10)`: that is the UTC date, and
 * in Manila it is still yesterday until 8 in the morning.
 *
 * @param {Date} [d]
 */
export function toDateInput(d = new Date()) {
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
 * ── Unless the row is meant to be ahead ──
 *
 * One payment of an installment plan is in the future by definition - the
 * plan writes every month up front. Clamped, editing one for any reason, a
 * note or an amount, re-dated it to this moment: it left its month, landed on
 * the wrong statement, and every payment edited that way piled onto today.
 * `allowFuture` keeps a later day as picked. Today is still clamped - a late
 * hour carried onto it would hide it for the rest of the day, as above.
 *
 * @param {string} dateStr  'YYYY-MM-DD' from the field, read as local
 * @param {string|null|undefined} originalIso  the row's current timestamp
 * @param {Date} [now]  injectable, so the clamp is testable
 * @param {boolean} [allowFuture]  keep a day after today: a plan's payment
 */
export function dateInputToIso(dateStr, originalIso, now = new Date(), allowFuture = false) {
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

  if (allowFuture && toDateInput(next) > toDateInput(now)) return next.toISOString()
  return (next.getTime() > now.getTime() ? now : next).toISOString()
}

/**
 * The LOCAL calendar month a stored timestamp falls in, as "2026-09".
 *
 * Not `iso.slice(0, 7)`, and not `iso.startsWith("2026-09")`, which is the
 * same thing. Those read the UTC month, and in Manila the first eight hours
 * of every month are still the previous month in UTC - so a salary that
 * landed at 7am on the 1st counted towards the month before, on the budget,
 * the dashboard and Insights alike, while the daily chart put it on the 1st.
 *
 * @param {string|null|undefined} iso
 */
export function txMonthKey(iso) {
  const day = isoToDateInput(iso)
  return day ? day.slice(0, 7) : ''
}

/**
 * Local midnight on the 1st of a month, as an ISO instant.
 *
 * What a range query over the `date` index has to compare against: the index
 * holds UTC strings, so the bound has to be the UTC instant of LOCAL midnight,
 * not the string "2026-09-01".
 *
 * @param {number} year
 * @param {number} month  0-11; overflow rolls into the next year
 */
export function localMonthStartIso(year, month) {
  return new Date(year, month, 1).toISOString()
}
