/**
 * A moment of deafness after something leaves from under the finger.
 *
 * Double-tap "Save transaction" and the first tap saves and closes the sheet;
 * the second lands on whatever the sheet was covering - the tab bar - and
 * takes you to Accounts. Quick log's tick did the same to Insights. Native
 * apps do not have this, because a closing sheet goes on swallowing touches
 * until it has gone.
 *
 * So a sheet closing, the quick log closing and the page changing each call
 * quietTaps(), and the tab bar ignores a tap that arrives inside that
 * window. A tap made after it - a real one - works as always.
 */

let quietUntil = 0

/** Ignore taps on what was underneath for a moment. @param {number} [ms] */
export function quietTaps(ms = 400) {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  quietUntil = Math.max(quietUntil, now + ms)
}

/** Whether a tap now is still the tail of one on something that has gone. */
export function tapsQuiet() {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return now < quietUntil
}
