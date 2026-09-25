import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { SPRING } from './theme'

/**
 * The small set of pieces every recap slide is built from, so eleven slides
 * share one type scale, one rhythm and one entrance.
 *
 * Type: a 15px label, one headline figure, one 15px line under it. Spacing
 * sits on the 8px grid. Every piece enters the same way - up 12px as it
 * fades in, on the shared spring - staggered 60ms apart, which is what makes
 * a slide read as arriving rather than appearing.
 *
 * The blur belongs to the swap between slides, and is drawn once, on the
 * slide as a whole (RecapStory). A blur on every piece as well stacked a
 * blurred layer per piece inside a blurred slide: the same look, and GPU
 * work a mid-range phone can feel.
 */

/** @typedef {import('./theme').Swatch} Swatch */

/**
 * What a slide needs from the story around it: its colours, the ledger's
 * currency, and `hold` - true while a finger is on a chart, which keeps the
 * story still; false when it lifts, which gives the slide its full time
 * again, so it never moves on the moment someone lets go of it.
 *
 * @type {import('react').Context<{pal: Swatch, currency: string, hold: (on: boolean) => void}>}
 */
export const SlideContext = createContext({
  pal: /** @type {Swatch} */ ({}), currency: 'PHP', hold: (/** @type {boolean} */ _on) => {},
})
export const useSlide = () => useContext(SlideContext)

const rise = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0 },
}

/** Staggers the pieces inside it. */
export function Stack({ children, className = '', gap = 0.06 }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: gap, delayChildren: 0.08 } } }}
    >
      {children}
    </motion.div>
  )
}

/** One piece of a slide, entering on the shared spring. */
export function Piece({ children, className = '', style = undefined }) {
  return (
    <motion.div className={className} style={style} variants={rise} transition={SPRING}>
      {children}
    </motion.div>
  )
}

/** The label above a figure. */
export function Eyebrow({ children }) {
  const { pal } = useSlide()
  return (
    <Piece>
      <p className="text-15 font-medium" style={{ color: pal.muted }}>{children}</p>
    </Piece>
  )
}

/**
 * How big a headline can be and still fit its line: 56px for a short figure,
 * 44 for a long one, 34 for the longest. Measured in characters, because the
 * width available is fixed and Inter's figures are tabular.
 *
 * @param {string} text
 */
export function heroClass(text) {
  const n = String(text).length
  return n <= 8 ? 'text-56' : n <= 11 ? 'text-44' : 'text-34'
}

/**
 * The line under a figure. `clamp` holds text people typed - a purchase's
 * description - to three lines, so a paragraph pasted into a note cannot
 * push the slide out of its card.
 */
export function Line({ children, tone = 'muted', clamp = false }) {
  const { pal } = useSlide()
  return (
    <Piece>
      <p className={`text-15 leading-snug ${clamp ? 'line-clamp-3 break-words' : ''}`} style={{ color: pal[tone] ?? pal.muted }}>{children}</p>
    </Piece>
  )
}

/**
 * How many rows of a fixed height fit the element given the returned ref -
 * measured, so a short phone shows fewer rows instead of cutting the last
 * one in half at the card's edge. The element must take its height from the
 * slide (flex-1 min-h-0), not from its rows.
 *
 * Measured before the first paint, so no frame shows rows that do not fit,
 * and again whenever the space changes size. Nothing that sets the space may
 * depend on the count, or the two would chase each other a frame at a time.
 *
 * @param {number} rowPx
 * @param {number} gapPx
 * @param {number} max
 */
export function useRowsThatFit(rowPx, gapPx, max) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [count, setCount] = useState(max)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setCount(Math.min(max, Math.max(1, Math.floor((el.clientHeight + gapPx) / (rowPx + gapPx)))))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [rowPx, gapPx, max])
  return /** @type {const} */ ([ref, count])
}
