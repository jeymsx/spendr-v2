import { useLayoutEffect, useRef } from 'react'
import { cx } from './cx'
import { prefersReducedMotion, tween } from './motion'

/** The last figure each `id` showed, for the length of the session. */
const shown = new Map()

/**
 * A figure that rolls from what you last saw to what it is now.
 *
 * Log a ₱150 lunch, come back to the account, and its balance counts down
 * the 150 instead of already being different - the number shows the change
 * rather than asking you to notice it.
 *
 * ── From the last value you SAW ──
 *
 * Every screen that shows a figure is a fresh mount, so "the previous value"
 * cannot come from the previous render. Figures are remembered by `id` for
 * the session instead, and a figure rolls only when it differs from the one
 * this `id` last showed. So the first sight of a number is just the number -
 * nothing counts up from zero every time a page opens - and a change made
 * while it is on screen rolls in place. A figure you have not looked at
 * since it changed rolls when you do.
 *
 * `id` names the figure, currency included where it can change: a balance
 * switched from pesos to dollars is a different figure, not one that rolled.
 *
 * ── The text is React's ──
 *
 * The span renders the final figure, which is what a screen reader reads and
 * what shows with reduced motion. The roll writes into that same text node,
 * one frame at a time, and lands back on exactly the string React rendered -
 * so nothing re-renders while it runs and nothing is left behind if it stops.
 *
 * @param {{value: number, format: (v: number) => string, id: string,
 *          className?: string}} props
 */
export default function RollingNumber({ value, format, id, className = '' }) {
  const ref = useRef(/** @type {HTMLSpanElement|null} */ (null))
  // What is on screen right now, mid-roll included - a new target starts there.
  const onScreen = useRef(/** @type {{id: string, v: number}|null} */ (null))
  const formatRef = useRef(format)
  useLayoutEffect(() => { formatRef.current = format })

  useLayoutEffect(() => {
    const text = ref.current?.firstChild
    const from = onScreen.current?.id === id ? onScreen.current.v : shown.get(id)
    shown.set(id, value)
    onScreen.current = { id, v: value }
    if (!text || text.nodeType !== Node.TEXT_NODE) return
    if (from == null || !Number.isFinite(from) || !Number.isFinite(value)) return
    if (Math.abs(from - value) < 0.005 || prefersReducedMotion()) return
    if (typeof requestAnimationFrame !== 'function') return

    const final = formatRef.current(value)
    let at = from
    text.nodeValue = formatRef.current(from)
    const stop = tween({
      from, to: value, duration: 0.75,
      onUpdate: (v) => { at = v; text.nodeValue = formatRef.current(v) },
      onComplete: () => { at = value; text.nodeValue = final },
    })
    return () => {
      stop()
      /* Where it had got to is where the next roll starts - a new value
         mid-roll turns from there instead of jumping. That is also what
         keeps StrictMode's mount-unmount-mount from eating the roll: the
         second run finds it still at `from`. */
      onScreen.current = { id, v: at }
      text.nodeValue = final
    }
  }, [value, id])

  return <span ref={ref} className={cx('tabular-nums', className)}>{format(value)}</span>
}
