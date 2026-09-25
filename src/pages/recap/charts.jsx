import { useId, useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { SPRING } from './theme'
import { useSlide } from './parts'

/**
 * The recap's three charts. Drawn here rather than with the app's chart
 * library, for the same reason the rest of the recap is: every bar and line
 * moves on the shared spring, in the slide's own flat colours, and a finger
 * on any of them holds the story still.
 *
 * Every chart is `data-interactive`, which the story reads as "this tap is
 * not a request for the next slide".
 *
 * ── Arriving and answering are two different speeds ──
 *
 * A bar grows in on the spring, staggered, once. Choosing it - a tap on a
 * category, a finger dragged along the days - recolours it at once, with no
 * stagger: a highlight that waits for its row's entrance delay is one that
 * trails the finger.
 */

/** How fast a chosen bar takes its colour. */
const ANSWER = { duration: 0.15 }

/**
 * Holding the story still while a finger is on a chart, and giving the
 * slide its full time again once the finger lifts - so a slide someone has
 * just interacted with never moves on the moment they let go.
 */
function useHold() {
  const { hold } = useSlide()
  return {
    onPointerDown: () => hold(true),
    onPointerUp: () => hold(false),
    onPointerCancel: () => hold(false),
    onLostPointerCapture: () => hold(false),
  }
}

/**
 * Pointer tracking that turns a position along a chart into an index, and
 * holds the story while the finger is down.
 *
 * @param {number} count
 * @param {(i: number) => void} onPick
 */
function useScrub(count, onPick) {
  const holding = useHold()
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  /** @param {import('react').PointerEvent} e */
  const pick = (e) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box || count < 1) return
    const f = Math.min(0.9999, Math.max(0, (e.clientX - box.left) / box.width))
    onPick(Math.floor(f * count))
  }
  return {
    ...holding,
    ref,
    'data-interactive': true,
    style: { touchAction: 'none' },
    onPointerDown: (/** @type {import('react').PointerEvent<HTMLDivElement>} */ e) => {
      e.currentTarget.setPointerCapture?.(e.pointerId)
      holding.onPointerDown()
      pick(e)
    },
    onPointerMove: (/** @type {import('react').PointerEvent} */ e) => { if (e.buttons || e.pointerType === 'touch') pick(e) },
  }
}

/** One category row, and the space between rows - fixed, so the slide can
 *  work out how many fit before it draws them. */
export const CATEGORY_ROW_PX = 48
export const CATEGORY_GAP_PX = 8

/**
 * Where the money went: one row per category, the chosen one in full ink.
 * Tapping a row chooses it.
 *
 * @param {{rows: Array<{name: string, amount: number, share: number}>, selected: number,
 *          onSelect: (i: number) => void, format: (v: number) => string}} props
 */
export function CategoryBars({ rows, selected, onSelect, format }) {
  const { pal } = useSlide()
  const holding = useHold()
  const max = Math.max(...rows.map(r => r.amount), 1)
  return (
    <ul className="flex flex-col" style={{ gap: CATEGORY_GAP_PX }} data-interactive {...holding}>
      {rows.map((r, i) => {
        const on = i === selected
        return (
          <li key={r.name}>
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-pressed={on}
              className="w-full flex flex-col justify-center text-left"
              style={{ height: CATEGORY_ROW_PX }}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-15 font-medium truncate" style={{ color: on ? pal.ink : pal.muted }}>{r.name}</span>
                <span className="text-15 tabular-nums shrink-0" style={{ color: on ? pal.ink : pal.muted }}>{format(r.amount)}</span>
              </span>
              <span className="mt-2 block h-2 rounded-full overflow-hidden" style={{ backgroundColor: pal.track }}>
                <motion.span
                  className="block h-full rounded-full origin-left"
                  style={{ width: `${(r.amount / max) * 100}%` }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1, backgroundColor: on ? pal.ink : pal.muted, opacity: on ? 1 : 0.6 }}
                  transition={{ scaleX: { ...SPRING, delay: 0.12 + i * 0.05 }, default: ANSWER }}
                />
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The month day by day. The chosen day in full ink, the rest at rest; drag
 * along it to read any day.
 *
 * @param {{days: Array<{day: number, amount: number}>, selected: number, onSelect: (i: number) => void}} props
 */
export function DailyBars({ days, selected, onSelect }) {
  const { pal } = useSlide()
  const max = Math.max(...days.map(d => d.amount), 1)
  const scrub = useScrub(days.length, onSelect)
  return (
    <div {...scrub} className="h-40 flex items-end gap-[3px] cursor-pointer select-none">
      {days.map((d, i) => {
        const h = d.amount > 0 ? Math.max(4, (d.amount / max) * 100) : 0
        const on = i === selected
        return (
          <div key={d.day} className="flex-1 h-full flex flex-col justify-end">
            {h > 0 ? (
              <motion.div
                className="w-full rounded-full origin-bottom"
                style={{ height: `${h}%` }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1, backgroundColor: on ? pal.ink : pal.muted, opacity: on ? 1 : 0.5 }}
                transition={{ scaleY: { ...SPRING, delay: 0.1 + i * 0.012 }, default: ANSWER }}
              />
            ) : (
              <div className="w-full h-1 rounded-full" style={{ backgroundColor: on ? pal.muted : pal.track }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Net worth across the month, drawn in, with a dot that follows the finger.
 *
 * @param {{series: Array<{day: number, value: number}>, selected: number, onSelect: (i: number) => void, rising: boolean}} props
 */
export function NetWorthLine({ series, selected, onSelect, rising }) {
  const { pal } = useSlide()
  const reduce = useReducedMotion()
  const scrub = useScrub(series.length, onSelect)
  // useId's colons are not valid in url(#...), so they go.
  const clipId = `nw-${useId().replace(/:/g, '')}`
  const W = 300, H = 120, PAD = 6
  const { d, points } = useMemo(() => {
    const vals = series.map(s => s.value)
    const lo = Math.min(...vals), hi = Math.max(...vals)
    const span = hi - lo || 1
    const pts = series.map((s, i) => [
      series.length > 1 ? (i / (series.length - 1)) * W : W / 2,
      PAD + (1 - (s.value - lo) / span) * (H - PAD * 2),
    ])
    return { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '), points: pts }
  }, [series])
  const dot = points[Math.min(selected, points.length - 1)] ?? [0, 0]
  const stroke = rising ? pal.good : pal.soft

  return (
    <div {...scrub} className="relative h-36 select-none cursor-pointer">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
        {/* Drawn in by a clip sweeping left to right, not by pathLength. The
            SVG is stretched to its box and its stroke kept a true 3px, and a
            dash measured in the one space and drawn in the other came up
            short - the line stopped before reaching its own dot. A clip is
            measured where the line is drawn. Reduced motion: simply there. */}
        <defs>
          <clipPath id={clipId}>
            <motion.rect
              x={-PAD} y={-PAD * 4} height={H + PAD * 8}
              initial={reduce ? false : { width: 0 }} animate={{ width: W + PAD * 2 }}
              transition={{ type: 'spring', bounce: 0, visualDuration: 1.1, delay: 0.15 }}
            />
          </clipPath>
        </defs>
        <line x1="0" x2={W} y1={H - 1} y2={H - 1} stroke={pal.track} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path
          d={d} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          vectorEffect="non-scaling-stroke" clipPath={`url(#${clipId})`}
        />
      </svg>
      {/* The dot lives outside the stretched SVG, so it stays round. It waits
          for the line to finish drawing to where it sits, then keeps up with
          the finger. */}
      <motion.span
        className="absolute w-3.5 h-3.5 -ml-[7px] -mt-[7px] rounded-full"
        style={{ backgroundColor: stroke, boxShadow: `0 0 0 3px ${pal.surface}` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, left: `${(dot[0] / W) * 100}%`, top: `${(dot[1] / H) * 100}%` }}
        transition={{
          default: { type: 'spring', bounce: 0, visualDuration: 0.15 },
          opacity: { duration: 0.25, delay: reduce ? 0 : 1.1 },
        }}
      />
    </div>
  )
}

/**
 * What came in, split into what went out and what was kept. A month whose
 * refunds took spending below nothing draws as all kept.
 *
 * @param {{income: number, spent: number}} props
 */
export function KeptBar({ income, spent }) {
  const { pal } = useSlide()
  const out = income > 0 ? Math.min(1, Math.max(0, spent) / income) : 1
  return (
    <div className="h-3 rounded-full overflow-hidden flex" style={{ backgroundColor: pal.track }} aria-hidden="true">
      {out > 0 && (
        <motion.span
          className="h-full origin-left"
          style={{ width: `${out * 100}%`, backgroundColor: pal.muted, opacity: 0.55 }}
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...SPRING, delay: 0.2 }}
        />
      )}
      {out < 1 && (
        <motion.span
          className="h-full origin-left"
          style={{ width: `${(1 - out) * 100}%`, backgroundColor: pal.good }}
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...SPRING, delay: 0.35 }}
        />
      )}
    </div>
  )
}
