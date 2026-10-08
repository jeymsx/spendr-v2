/**
 * The app's motion, in one place.
 *
 * ── One vocabulary ──
 *
 * Three curves and one spring, shared by everything that moves. The same
 * numbers live as custom properties in index.css (--ease-out, --ease-sheet,
 * --ease-settle, --press-in, --press-out) for the things CSS animates, and
 * here for the few things a finger drives. They are the recap's values too
 * (recap/theme.js): zero bounce, arrivals that settle rather than stop, and
 * nothing that overshoots. A shared spring is what makes separate movements
 * read as one gesture.
 *
 * ── No library in the hot path ──
 *
 * A sheet, a row and a balance are on nearly every screen, so the code that
 * moves them lands in the app's first download. Motion is already a
 * dependency, but pulling its animation engine into that first chunk for a
 * spring and a tween would cost more than the two functions below. Both are
 * closed-form - the position at time t is a formula, not a simulation - so
 * they cannot drift or depend on the frame rate.
 */

/** Arrivals and settles: fast out of the gate, a long soft landing. */
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** Sheets. The iOS curve: most of the travel in the first third. */
export const EASE_SHEET = 'cubic-bezier(0.32, 0.72, 0, 1)'
/** Leaving: starts gently and accelerates away rather than settling. */
export const EASE_EXIT = 'cubic-bezier(0.4, 0, 1, 1)'
/**
 * Moving in place - a row opening or closing its height, and the rows under
 * it following. Symmetric, the way a table deletion is on iOS: the sheet
 * curve spends two thirds of a collapse in its first 45ms, which reads as the
 * row snapping shut rather than closing.
 */
export const EASE_MOVE = 'cubic-bezier(0.4, 0, 0.2, 1)'

// ── Reduce motion ────────────────────────────────────────────────────────
//
// Two ways to ask for it: the phone's own Reduce Motion, and Spendr's switch
// in Preferences, which turns it on here whatever the phone says. Either one
// is enough. The switch is kept on this device (localStorage), and marked on
// <html> as `reduce-motion` - set before the first paint by index.html, so a
// launch never plays the animations it is about to stop - where index.css
// stops what CSS animates and everything below reads it for what script
// moves.

const REDUCE_KEY = 'spendr-reduce-motion'
const REDUCE_CLASS = 'reduce-motion'
const reduceListeners = new Set()

/** Whether the switch in Preferences is on - not the phone's setting. */
export function reduceMotionChosen() {
  try { return localStorage.getItem(REDUCE_KEY) === '1' } catch { return false }
}

/** Turn the switch on or off, now and for next time. @param {boolean} on */
export function setReduceMotion(on) {
  try { localStorage.setItem(REDUCE_KEY, on ? '1' : '0') } catch { /* private window: this session only */ }
  try { document.documentElement.classList.toggle(REDUCE_CLASS, on) } catch { /* no document: tests */ }
  for (const l of reduceListeners) l()
}

/** The phone's own Reduce Motion. */
export function systemReducesMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/**
 * Should motion be reduced right now - by the phone or by the switch. Read
 * when it is needed rather than once at load, so either can change while the
 * app is open.
 */
export function prefersReducedMotion() {
  let chosen = false
  try { chosen = document.documentElement.classList.contains(REDUCE_CLASS) } catch { /* no document: tests */ }
  return chosen || systemReducesMotion()
}

/**
 * Hear about either changing. @param {() => void} fn
 * @returns {() => void} stop listening
 */
export function onReducedMotionChange(fn) {
  reduceListeners.add(fn)
  /** @type {MediaQueryList|null} */
  let mq = null
  try { mq = window.matchMedia('(prefers-reduced-motion: reduce)') } catch { /* no window */ }
  mq?.addEventListener?.('change', fn)
  return () => {
    reduceListeners.delete(fn)
    mq?.removeEventListener?.('change', fn)
  }
}

/**
 * A critically damped spring from `from` to `to`, carrying `velocity`.
 *
 * Critically damped is `bounce: 0`: the fastest settle that never passes its
 * target. The velocity is what makes a released sheet keep the speed the
 * finger gave it instead of starting again from rest - a flick leaves fast,
 * a slow drag returns slowly.
 *
 * `duration` is perceptual, like Motion's visualDuration: roughly when the
 * eye stops seeing it move. x(t) = (x0 + (v0 + w*x0) t) e^(-w t), where x is
 * the distance still to go; w = 6.6 / duration puts 99% of it done by then.
 *
 * @param {{from: number, to: number, velocity?: number, duration?: number,
 *          onUpdate: (v: number) => void, onComplete?: () => void}} o
 * @returns {() => void} stop - leaves the value wherever it had got to
 */
export function spring({ from, to, velocity = 0, duration = 0.32, onUpdate, onComplete }) {
  const w = 6.6 / duration
  const x0 = from - to
  // x'(0) = b - w*x0 has to equal the velocity we were handed.
  const b = velocity + w * x0
  const start = performance.now()
  let raf = 0
  const step = (/** @type {number} */ now) => {
    const t = (now - start) / 1000
    const e = Math.exp(-w * t)
    const x = (x0 + b * t) * e
    const v = (b - w * (x0 + b * t)) * e
    if (Math.abs(x) < 0.5 && Math.abs(v) < 12) {
      onUpdate(to)
      onComplete?.()
      return
    }
    onUpdate(to + x)
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

/**
 * A plain tween that lands exactly on `to`.
 *
 * For figures, not surfaces: a spring approaches its target forever, and on
 * a six-figure balance the last fraction of that tail is a wrong number on
 * screen. An ease-out that ends on the dot looks the same and is never off.
 *
 * @param {{from: number, to: number, duration?: number,
 *          onUpdate: (v: number) => void, onComplete?: () => void}} o
 * @returns {() => void} stop
 */
export function tween({ from, to, duration = 0.7, onUpdate, onComplete }) {
  const start = performance.now()
  let raf = 0
  const step = (/** @type {number} */ now) => {
    /* Never before the start. The frame's own timestamp is when the frame
       began, which can be a few milliseconds earlier than the performance.now()
       the tween started on, and a negative progress through an ease-out runs
       the figure BACKWARDS first: a spent total of 21,280 rolling to 114,314
       showed -8,783 for a frame. */
    const p = Math.max(0, Math.min(1, (now - start) / (duration * 1000)))
    // Quint out: close to EASE_OUT, and exact at both ends.
    const e = 1 - (1 - p) ** 5
    if (p >= 1) { onUpdate(to); onComplete?.(); return }
    onUpdate(from + (to - from) * e)
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}
