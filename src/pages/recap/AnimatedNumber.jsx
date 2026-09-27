import { useLayoutEffect, useRef } from 'react'
import { animate } from 'motion/react'
import { useReduceMotion } from '../../hooks/useReduceMotion'

/**
 * A figure that counts up to itself, landing exactly on the true value.
 *
 * The text is written straight into the node on every frame, so a count-up
 * re-renders nothing. The FINAL text is what React renders, which is what a
 * screen reader reads and what shows with reduced motion - the animation only
 * ever runs underneath the true value, never instead of it.
 *
 * A layout effect, so the first frame the eye sees is already the start of
 * the count and not a flash of the final figure. `format` is read through a
 * ref: a parent passing a fresh arrow each render must not restart it.
 *
 * `tabular-nums` keeps the digits from jostling as they change width.
 *
 * @param {{value: number, format: (v: number) => string, className?: string, delay?: number}} props
 */
export default function AnimatedNumber({ value, format, className = '', delay = 0.15 }) {
  const ref = useRef(/** @type {HTMLSpanElement|null} */ (null))
  const formatRef = useRef(format)
  useLayoutEffect(() => { formatRef.current = format }, [format])
  const reduce = useReduceMotion()

  useLayoutEffect(() => {
    const node = ref.current
    if (!node || reduce || !Number.isFinite(value)) return
    node.textContent = formatRef.current(0)
    /* A tween, not the shared spring. A critically damped spring approaches
       its target forever, and on a seven-figure amount the last 0.1% of that
       tail is a wrong number on screen for another second - ₱1,018,412 where
       the month was ₱1,019,014. An ease-out that ends on the dot looks the
       same and lands exactly. */
    const controls = animate(0, value, {
      duration: 1.1, ease: [0.16, 1, 0.3, 1], delay,
      onUpdate: v => { node.textContent = formatRef.current(v) },
      onComplete: () => { node.textContent = formatRef.current(value) },
    })
    return () => controls.stop()
  }, [value, reduce, delay])

  return <span ref={ref} className={`tabular-nums ${className}`}>{format(value)}</span>
}
