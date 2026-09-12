/**
 * The handful of helpers more than one Accounts module needs.
 *
 * Accounts.jsx was 2,547 lines with the account form alone accounting for
 * 1,216 of them. Splitting the form, the sort sheet and the detail rows out
 * left these three behind in the middle of the page, reached into from four
 * directions - so they have a file, rather than each new module growing its
 * own date formatter.
 *
 * Nothing here changed in the move.
 */
import { fieldFrame } from '../../components/ui/Field'

export function fmtTxDate(isoStr) {
  if (!isoStr) return ''
  const d    = new Date(isoStr)
  const now  = new Date(); now.setHours(0, 0, 0, 0)
  const tmrw = new Date(now); tmrw.setDate(now.getDate() + 1)
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  // Both bounds matter. `d >= now` alone labelled every future date "Today",
  // which went unnoticed while nothing could be dated ahead — installments
  // schedule charges months out, so the whole plan read as "Today".
  if (d >= now  && d < tmrw) return 'Today'
  if (d >= yest && d < now)  return 'Yesterday'
  // Include the year once it differs: a 24- or 36-month plan runs past it.
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-PH',
    sameYear ? { month: 'short', day: 'numeric' }
             : { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtTxTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
}

/**
 * The account form's eight text inputs, wearing the app's field.
 *
 * This was a private recipe: 48px tall at radius 16, a white/6% dark fill, a
 * white/9% hairline and a focus ring - none of which matched the capsule
 * every other form in the app uses, and all of which had to be kept in step
 * with it by hand. It is fieldFrame now, which owns the height, the fill, the
 * hairline and the invalid state in one place.
 *
 * `block` replaces the frame's flex, because these are bare inputs rather
 * than a row with a glyph in it; everything else comes through untouched.
 */
export function inputClass(error = false) {
  return [
    fieldFrame(error).replace('flex items-center gap-3', 'block w-full'),
    'text-sm font-medium text-slate-800 dark:text-white',
    'placeholder-slate-400 dark:placeholder-slate-500 placeholder:font-normal',
    'outline-none',
  ].join(' ')
}

/**
 * "Sep 15" for the next time a day-of-month comes round, or null if the day
 * is not a real one.
 *
 * Moved here from Accounts.jsx when the account card did: a card importing it
 * from the page that renders the card is a cycle, and ES modules only survive
 * one because nothing reads the binding during evaluation.
 *
 * @param {number} [dayOfMonth]
 */
export function nextOccurrence(dayOfMonth) {
  if (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 31) return null
  const now = new Date()
  let d = new Date(now.getFullYear(), now.getMonth(), dayOfMonth)
  if (d <= now) d = new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth)
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}
