import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { SPRING } from './theme'

/**
 * The small set of pieces every recap slide is built from, so eleven slides
 * share one type scale, one rhythm and one entrance.
 *
 * Type: a chip that names the slide, one headline figure, one 15px line under
 * it. Spacing sits on the 8px grid. Every piece enters the same way - up 12px
 * as it fades in, on the shared spring - staggered 60ms apart, which is what
 * makes a slide read as arriving rather than appearing.
 *
 * ── White on colour, and paper on colour ──
 *
 * Text sits straight on the card in white; the palette keeps every card dark
 * enough for it. Anything that is an object - the chip, a sticker, a receipt,
 * a tile - is paper: white, with the accent's darkest shade as its ink. The
 * two never mix, so nothing on a card is ever white-on-almost-white.
 *
 * The blur belongs to the card as a whole (Deck), not to each piece: a blur
 * per piece stacked a blurred layer per piece inside a blurred card.
 */

/** @typedef {import('./theme').RecapPalette} RecapPalette */
/** @typedef {import('./theme').CardTone} CardTone */

/**
 * What a slide needs from the story around it: the palette, its own card's
 * tone, the ledger's currency, and `hold` - true while a finger is on a
 * chart, which keeps the story still; false when it lifts, which gives the
 * slide its full time again, so it never moves on the moment someone lets go.
 *
 * @type {import('react').Context<{pal: RecapPalette, tone: CardTone, currency: string, hold: (on: boolean) => void}>}
 */
export const SlideContext = createContext({
  pal: /** @type {RecapPalette} */ ({}),
  tone: /** @type {CardTone} */ ({}),
  currency: 'PHP',
  hold: (/** @type {boolean} */ _on) => {},
})
export const useSlide = () => useContext(SlideContext)

const rise = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0 },
}

/** Staggers the pieces inside it. */
export function Stack({ children, className = '', gap = 0.06, delay = 0.12 }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: gap, delayChildren: delay } } }}
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

/**
 * The chip that names a slide - "💸 You spent" - in paper and the accent's
 * darkest ink. The emoji is decoration; the words say it.
 *
 * @param {{emoji?: string|null, children: import('react').ReactNode}} props
 */
export function Eyebrow({ emoji = null, children }) {
  const { pal } = useSlide()
  return (
    <Piece className="flex min-w-0">
      <p
        className="inline-flex max-w-full items-center gap-1.5 h-8 pl-2.5 pr-3 rounded-full text-13 font-semibold shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
        style={{ backgroundColor: pal.paper, color: pal.deepInk }}
      >
        {emoji && <span className="text-15 leading-none shrink-0" aria-hidden="true">{emoji}</span>}
        <span className="truncate">{children}</span>
      </p>
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
 *
 * @param {{children: import('react').ReactNode, tone?: 'muted'|'ink'|'good'|'soft', clamp?: boolean}} props
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
 * A short verdict under a figure - "↓ 12% less than July" - on a dark wash,
 * which keeps the pale green and peach of `good` and `soft` readable on the
 * lightest card there is.
 *
 * @param {{children: import('react').ReactNode, tone?: 'ink'|'good'|'soft', className?: string}} props
 */
export function Pill({ children, tone = 'ink', className = '' }) {
  const { pal } = useSlide()
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 min-h-7 px-3 py-1 rounded-full text-13 font-semibold leading-snug ${className}`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.2)', color: pal[tone] ?? pal.ink }}
    >
      {children}
    </span>
  )
}

/**
 * An emoji on a paper disc, slapped on at an angle - the recap's sticker.
 * Decoration only: whatever it shows, the slide also says in words.
 *
 * @param {{emoji: string, size?: number, rotate?: number, delay?: number, className?: string,
 *          style?: import('react').CSSProperties}} props
 */
export function Sticker({ emoji, size = 48, rotate = 0, delay = 0, className = '', style = undefined }) {
  const { pal } = useSlide()
  return (
    <motion.span
      aria-hidden="true"
      className={`absolute flex items-center justify-center rounded-full shadow-[0_6px_16px_rgba(0,0,0,0.2)] select-none ${className}`}
      style={{ width: size, height: size, backgroundColor: pal.paper, fontSize: Math.round(size * 0.52), lineHeight: 1, ...style }}
      initial={{ opacity: 0, scale: 1.5, rotate: rotate - 14 }}
      animate={{ opacity: 1, scale: 1, rotate }}
      exit={{ opacity: 0, scale: 0.5, rotate: rotate + 20, transition: { duration: 0.15 } }}
      transition={{ ...SPRING, delay }}
    >
      {emoji}
    </motion.span>
  )
}

/**
 * Holds a decorative object - a stamp card, a row of badges - in whatever
 * room the slide leaves it, scaled down whole when it would not fit rather
 * than cut off at the card's edge. The object is laid out at the full width
 * and its natural height; only its drawing shrinks, so nothing inside it
 * reflows or wraps differently on a short phone.
 *
 * @param {{children: import('react').ReactNode, className?: string}} props
 */
export function FitBox({ children, className = '' }) {
  const [outerRef, outer] = useBox()
  const innerRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [natural, setNatural] = useState(0)
  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    // offsetHeight is the layout box, which the scale below does not touch -
    // so measuring it cannot feed back into what it measures.
    const measure = () => setNatural(el.offsetHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = natural > 0 && outer.h > 0 ? Math.min(1, outer.h / natural) : 1
  return (
    <div ref={outerRef} className={`relative ${className}`}>
      <div
        className="absolute left-0 top-1/2 w-full origin-center"
        style={{ transform: `translateY(-50%) scale(${scale})` }}
      >
        <div ref={innerRef}>{children}</div>
      </div>
    </div>
  )
}

/**
 * A figure on a paper tile - its emoji, what it is, how much - as the closing
 * card and the kept slide show them. A list item: put it in a <ul>. A long
 * figure steps down a size rather than being cut to "P12,345,...".
 *
 * @param {{emoji: string, label: string, value: string, tone?: 'good'|'soft', height: number,
 *          delay?: number, tilt?: number}} props
 */
export function Tile({ emoji, label, value, tone, height, delay = 0, tilt = 0 }) {
  const { pal } = useSlide()
  return (
    <motion.li
      className="flex items-center gap-2 px-2.5 rounded-2xl shadow-[0_6px_16px_rgba(0,0,0,0.14)] min-w-0"
      style={{ height, backgroundColor: pal.paper }}
      initial={{ opacity: 0, scale: 0.8, rotate: tilt }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ ...SPRING, delay }}
    >
      <span className="text-20 leading-none shrink-0" aria-hidden="true">{emoji}</span>
      <span className="min-w-0 flex flex-col">
        <span className="text-12 font-medium truncate" style={{ color: pal.paperMuted }}>{label}</span>
        <span
          className={`${value.length > 10 ? 'text-12' : value.length > 8 ? 'text-13' : 'text-15'} font-semibold tabular-nums truncate`}
          style={{ color: tone === 'good' ? pal.paperGood : tone === 'soft' ? pal.paperSoft : pal.paperInk }}
        >
          {value}
        </span>
      </span>
    </motion.li>
  )
}

/** The card's grain and light from above - see `.recap-texture` in index.css. */
export function CardTexture() {
  return <span className="recap-texture" aria-hidden="true" />
}

/**
 * An element's size, measured before the first paint and again whenever it
 * changes. Returns the ref to put on the element and its content-box size.
 *
 * Nothing that sets the element's size may depend on what is measured, or
 * the two would chase each other a frame at a time.
 *
 * @returns {readonly [import('react').MutableRefObject<HTMLDivElement|null>, {w: number, h: number}]}
 */
export function useBox() {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setBox(b => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return /** @type {const} */ ([ref, box])
}

/**
 * How many rows of a fixed height fit the element given the returned ref -
 * measured, so a short phone shows fewer rows instead of cutting the last
 * one in half at the card's edge. The element must take its height from the
 * slide (flex-1 min-h-0), not from its rows.
 *
 * Before the first measurement it says `max`, and the first measurement is
 * taken before the first paint, so no frame shows rows that do not fit.
 *
 * @param {number} rowPx
 * @param {number} gapPx
 * @param {number} max
 * @returns {readonly [import('react').MutableRefObject<HTMLDivElement|null>, number]}
 */
export function useRowsThatFit(rowPx, gapPx, max) {
  const [ref, box] = useBox()
  const count = box.h > 0 ? Math.min(max, Math.max(1, Math.floor((box.h + gapPx) / (rowPx + gapPx)))) : max
  return /** @type {const} */ ([ref, count])
}
