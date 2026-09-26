import { useId, useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { seeded, seedOf } from './assets'
import { Logo } from './art'
import { useBox, useSlide } from './parts'
import { SPRING } from './theme'

/**
 * The paper things a slide can hold: a receipt that prints, a loyalty card
 * that gets stamped, a price tag on a string, and a ring that fills. Each
 * says something the slide's figures already say, in a shape that says it
 * faster - a stamp for every visit, a receipt for what was bought.
 *
 * They are paper, so they are drawn in the palette's paper colours, never in
 * the card's white-on-colour: see parts.jsx.
 */

/** @typedef {{label: string, value: string}} ReceiptRow */

/* The receipt's parts, by height, so it can drop the ones that do not fit
   rather than be cut off at the card's edge. The total always shows; the
   week-by-week lines when all of them fit, and two summary lines when they
   do not; then the header, the line under it, the barcode and the sign-off,
   in that order, as the room allows. */
const R_PAD = 14
const R_HEAD = 34
const R_SUB = 22
const R_RULE = 13
const R_ROW = 26
const R_TOTAL = 30
const R_CODE = 42
const R_THANKS = 20
const R_TEETH = 8

/**
 * A receipt, printing out of a slot. Fills the height it is given, and
 * shows as much of itself as fits there - see the constants above.
 *
 * @param {{items: ReceiptRow[], fallback: ReceiptRow[], total: ReceiptRow, title: string, sub: string,
 *          seed: string, stamp?: string|null, children?: import('react').ReactNode}} props
 *        items: the lines, when they all fit; fallback: the fewer lines shown when they do not.
 *        `children` sit over the slot's right-hand end - an illustration flying off the receipt.
 */
export function Receipt({ items, fallback, total, title, sub, seed, stamp = null, children }) {
  const { pal } = useSlide()
  const [ref, box] = useBox()
  const teeth = `rt-${useId().replace(/:/g, '')}`

  // What fits, most important first, each part out of what the last left.
  const room = box.h - 10 - (R_PAD * 2 + R_RULE + R_TOTAL + R_TEETH)
  const lines = room >= items.length * R_ROW ? items : room >= fallback.length * R_ROW ? fallback : []
  const afterLines = room - lines.length * R_ROW
  const head = afterLines >= R_HEAD + R_RULE
  const afterHead = afterLines - (head ? R_HEAD + R_RULE : 0)
  const subline = head && afterHead >= R_SUB
  const afterSub = afterHead - (subline ? R_SUB : 0)
  const code = afterSub >= R_CODE
  const thanks = code && afterSub - R_CODE >= R_THANKS
  const bars = useMemo(() => {
    const next = seeded(seedOf(seed))
    return Array.from({ length: 34 }, () => 1 + Math.floor(next() * 3.2))
  }, [seed])

  const rule = <div className="my-1.5 border-t-2 border-dashed" style={{ borderColor: 'rgba(15, 23, 42, 0.14)' }} />
  const line = (/** @type {ReceiptRow} */ r, strong = false) => (
    <div key={r.label} className="flex items-baseline justify-between gap-3" style={{ height: strong ? R_TOTAL : R_ROW }}>
      <span className={`${strong ? 'text-13' : 'text-11'} font-semibold uppercase tracking-wider truncate`} style={{ color: strong ? pal.paperInk : pal.paperMuted }}>{r.label}</span>
      <span className={`${strong ? 'text-15' : 'text-14'} font-semibold tabular-nums shrink-0`} style={{ color: pal.paperInk }}>{r.value}</span>
    </div>
  )

  return (
    <div ref={ref} className="relative flex-1 min-h-0">
      {/* The slot it prints from. */}
      <div className="absolute left-2 right-2 top-0 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(0, 0, 0, 0.28)' }} />
      {box.h > 0 && (
        <div className="absolute left-5 right-5 top-1.5 bottom-0 overflow-hidden">
          <motion.div
            className="relative"
            initial={{ y: '-101%' }}
            animate={{ y: 0 }}
            transition={{ duration: 1.2, ease: [0.25, 0.8, 0.3, 1], delay: 0.35 }}
          >
            <div className="rounded-b-sm px-4 shadow-[0_10px_24px_rgba(0,0,0,0.22)]" style={{ backgroundColor: pal.paper, paddingTop: R_PAD, paddingBottom: R_PAD }}>
              {head && (
                <>
                  <div className="flex items-center justify-between gap-2" style={{ height: R_HEAD }}>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Logo size={18} />
                      <span className="text-12 font-semibold uppercase tracking-[0.18em]" style={{ color: pal.paperInk }}>Spendr</span>
                    </span>
                    <span className="text-11 font-semibold uppercase tracking-wider truncate" style={{ color: pal.paperMuted }}>{title}</span>
                  </div>
                  {subline && <p className="text-12 truncate" style={{ height: R_SUB, color: pal.paperMuted }}>{sub}</p>}
                  {rule}
                </>
              )}
              {lines.map(r => line(r))}
              {lines.length > 0 && rule}
              {line(total, true)}
              {code && (
                <div className="flex items-stretch justify-center gap-[2px] pt-3" style={{ height: R_CODE }} aria-hidden="true">
                  {bars.map((w, i) => <span key={i} style={{ width: w, backgroundColor: pal.paperInk, opacity: i % 5 === 2 ? 0 : 0.85 }} />)}
                </div>
              )}
              {thanks && (
                <p className="text-center text-10 font-semibold uppercase tracking-[0.24em] pt-1.5" style={{ height: R_THANKS, color: pal.paperMuted }}>
                  Thank you for tracking
                </p>
              )}
            </div>
            {/* The torn edge. */}
            <svg className="block w-full" height={R_TEETH} aria-hidden="true">
              <defs>
                <pattern id={teeth} width="12" height={R_TEETH} patternUnits="userSpaceOnUse">
                  <path d={`M0 0 L6 ${R_TEETH} L12 0 Z`} fill={pal.paper} />
                </pattern>
              </defs>
              <rect width="100%" height={R_TEETH} fill={`url(#${teeth})`} />
            </svg>
            {stamp && (
              <motion.span
                className="absolute right-4 bottom-12 px-2.5 py-1 rounded-md border-[3px] text-15 font-semibold uppercase tracking-widest"
                style={{ color: pal.paperGood, borderColor: pal.paperGood }}
                initial={{ opacity: 0, scale: 2, rotate: -26 }}
                animate={{ opacity: 0.9, scale: 1, rotate: -14 }}
                transition={{ ...SPRING, delay: 1.6 }}
              >
                {stamp}
              </motion.span>
            )}
          </motion.div>
        </div>
      )}
      {children}
    </div>
  )
}

/** A loyalty card's stamps: ten, as a café's card has. */
const STAMPS = 10

/**
 * A loyalty card with a stamp for every visit - one per purchase at your
 * go-to place, up to a card's ten, then a count of the rest in the last spot.
 *
 * @param {{count: number, emoji: string, seed: string}} props
 */
export function StampCard({ count, emoji, seed }) {
  const { pal } = useSlide()
  const stamped = Math.min(count, STAMPS)
  const over = count > STAMPS ? count - (STAMPS - 1) : 0
  const tilt = useMemo(() => {
    const next = seeded(seedOf(seed))
    return Array.from({ length: STAMPS }, () => Math.round(next() * 36 - 18))
  }, [seed])
  return (
    <div className="relative rounded-[22px] p-4 shadow-[0_14px_30px_rgba(0,0,0,0.25)]" style={{ backgroundColor: pal.paper }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-11 font-semibold uppercase tracking-[0.2em] truncate" style={{ color: pal.paperMuted }}>Loyalty card</span>
        <span className="text-13 font-semibold tabular-nums shrink-0" style={{ color: pal.deepInk }}>
          {count} {count === 1 ? 'visit' : 'visits'}
        </span>
      </div>
      <ol className="mt-3 grid grid-cols-5 gap-2" aria-hidden="true">
        {Array.from({ length: STAMPS }, (_, i) => {
          const isCount = over > 0 && i === STAMPS - 1
          const on = i < stamped
          return (
            <li key={i} className="relative aspect-square">
              <span className="absolute inset-0 rounded-full border-2 border-dashed" style={{ borderColor: 'rgba(15, 23, 42, 0.16)' }} />
              {on && (
                <motion.span
                  className="absolute inset-0 rounded-full flex items-center justify-center border-2"
                  style={{ borderColor: pal.deepInk, backgroundColor: `${pal.glow}40`, color: pal.deepInk }}
                  initial={{ opacity: 0, scale: 1.9, rotate: tilt[i] - 30 }}
                  animate={{ opacity: 1, scale: 1, rotate: isCount ? 0 : tilt[i] }}
                  transition={{ ...SPRING, visualDuration: 0.35, delay: 0.55 + i * 0.1 }}
                >
                  {isCount
                    ? <span className="text-12 font-semibold tabular-nums">+{over}</span>
                    : <span className="leading-none" style={{ fontSize: 'min(20px, 5.4cqw)' }}>{emoji}</span>}
                </motion.span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/**
 * A price tag on a string, swaying - the biggest purchase's category, and
 * the day it was bought.
 *
 * @param {{emoji: string, label: string, sub: string}} props
 */
export function PriceTag({ emoji, label, sub }) {
  const { pal } = useSlide()
  return (
    <motion.div
      className="relative w-full"
      style={{ containerType: 'inline-size' }}
      initial={{ opacity: 0, y: -30, rotate: 14 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ ...SPRING, delay: 0.45 }}
      aria-hidden="true"
    >
      <div className="recap-sway relative">
        <svg viewBox="0 0 112 150" className="block w-full drop-shadow-[0_10px_16px_rgba(0,0,0,0.28)]">
          <path d="M56 0 C 52 12, 60 20, 56 30" fill="none" stroke="rgba(255, 255, 255, 0.85)" strokeWidth="2" strokeLinecap="round" />
          <path
            fillRule="evenodd"
            fill={pal.paper}
            d="M56 22 L98 46 Q104 50 104 57 L104 138 Q104 146 96 146 L16 146 Q8 146 8 138 L8 57 Q8 50 14 46 Z
               M56 34 a6 6 0 1 0 0.01 0 Z"
          />
        </svg>
        <div className="absolute inset-x-[10%] top-[34%] bottom-[6%] flex flex-col items-center justify-center text-center">
          <span className="leading-none" style={{ fontSize: '28cqw' }}>{emoji}</span>
          <span className="mt-[6cqw] max-w-full font-semibold truncate" style={{ color: pal.paperInk, fontSize: 'max(11px, 11cqw)' }}>{label}</span>
          <span className="font-semibold uppercase tracking-wider" style={{ color: pal.paperMuted, fontSize: 'max(10px, 9.5cqw)' }}>{sub}</span>
        </div>
      </div>
    </motion.div>
  )
}

/** The ring's gradient ends, for a month that kept something and one that did not. */
const RING_STOPS = { good: ['#DCFCE7', '#4ADE80'], soft: ['#FFEDD5', '#FB923C'] }
/** Gauge ticks around the ring: one every six degrees. */
const TICKS = 60

/**
 * What came in, as a gauge: filled to the share kept, with whatever the
 * slide puts in the middle of it - the piggy bank - and a paper label
 * sitting on the ring's foot saying the share in words.
 *
 * Only the part kept is drawn in colour. The part spent is the ring's own
 * track: a month's story is what was kept, and two arcs in two colours asked
 * the reader to work out which one was the point.
 *
 * @param {{share: number, tone?: 'good'|'soft', label: string, children?: import('react').ReactNode}} props
 *        share: 0..1 of the ring to fill.
 */
export function SavingsRing({ share, tone = 'good', label, children }) {
  const { pal } = useSlide()
  const reduce = useReducedMotion()
  const id = `ring-${useId().replace(/:/g, '')}`
  const fill = Math.min(1, Math.max(0, share))
  const [from, to] = RING_STOPS[tone]
  const tick = (2 * Math.PI * 57) / TICKS
  return (
    <div className="relative w-full aspect-square">
      <svg viewBox="0 0 120 120" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="57" fill="none" stroke={pal.track} strokeWidth="3" strokeDasharray={`0.8 ${tick - 0.8}`} />
        <circle cx="60" cy="60" r="47" fill="none" stroke={pal.track} strokeWidth="10" />
        {fill > 0 && (
          <motion.circle
            cx="60" cy="60" r="47" fill="none" stroke={`url(#${id})`} strokeWidth="10" strokeLinecap="round"
            transform="rotate(-90 60 60)"
            style={{ filter: `drop-shadow(0 0 4px ${to}88)` }}
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: fill, opacity: 1 }}
            transition={{ pathLength: { duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.35 }, opacity: { duration: 0.15, delay: 0.35 } }}
          />
        )}
      </svg>
      <div className="absolute inset-[19%]">{children}</div>
      <motion.span
        className="absolute left-1/2 bottom-[2%] -translate-x-1/2 whitespace-nowrap px-3 py-1 rounded-full text-13 font-semibold tabular-nums shadow-[0_6px_14px_rgba(0,0,0,0.2)]"
        style={{ backgroundColor: pal.paper, color: tone === 'good' ? pal.paperGood : pal.paperSoft }}
        initial={{ opacity: 0, scale: 1.5, rotate: -8 }}
        animate={{ opacity: 1, scale: 1, rotate: -3 }}
        transition={{ ...SPRING, delay: 1.1 }}
      >
        {label}
      </motion.span>
    </div>
  )
}
