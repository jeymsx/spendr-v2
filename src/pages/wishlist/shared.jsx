import { daysToGo, daysWaited, daysLabel } from '../../lib/wishes'

/**
 * What the wishlist's screens share: the gift a wish wears, and the few words
 * that say where a wish is in its wait.
 */

/** A wrapped present, in the app's 24px stroke family. @param {{size?: number}} props */
export function IconGift({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  )
}

/** "Tue, 20 Oct", the way the goals write a date. @param {string|null|undefined} key */
export function fmtDay(key) {
  if (!key) return null
  const d = new Date(`${String(key).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' })
}

/**
 * Where a waiting wish is: "Asks in 5 days", "Asks tomorrow", "Asks today".
 *
 * @param {WishRow} wish
 * @param {Date} [now]
 */
export function waitWords(wish, now = new Date()) {
  const n = daysToGo(wish, now)
  if (n <= 0) return 'Asks today'
  if (n === 1) return 'Asks tomorrow'
  return `Asks in ${daysLabel(n)}`
}

/**
 * How long a ready one has waited: "Waited 7 days".
 *
 * @param {WishRow} wish
 * @param {Date} [now]
 */
export function waitedWords(wish, now = new Date()) {
  const n = daysWaited(wish, now)
  return n > 0 ? `Waited ${daysLabel(n)}` : 'Parked today'
}

/**
 * What was decided, for the history: "Skipped 12 Oct".
 *
 * @param {WishRow} wish
 */
export function decidedWords(wish) {
  const day = wish.decidedAt ? fmtDay(wish.decidedAt.slice(0, 10)) : null
  const what = wish.status === 'bought' ? 'Bought'
    : wish.status === 'skipped' ? 'Skipped'
    : wish.status === 'saving' ? 'Saved up for'
    : 'Waiting'
  return day ? `${what} ${day.replace(/^\w+, /, '')}` : what
}
