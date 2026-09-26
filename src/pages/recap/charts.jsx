import { useId, useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { SPRING } from './theme'
import { useBox, useSlide } from './parts'

/**
 * The recap's charts. Drawn here rather than with the app's chart library,
 * for the same reason the rest of the recap is: every bar and cell moves on
 * the shared spring, in the card's own colours, and a finger on any of them
 * holds the story still.
 *
 * Every chart is `data-interactive`, which the story reads as "this tap is
 * not a request for the next slide".
 *
 * ── Arriving and answering are two different speeds ──
 *
 * A bar grows in on the spring, staggered, once. Choosing it - a tap on a
 * category, a finger dragged across the days - recolours it at once, with no
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
 * Pointer tracking that turns a finger's position into a choice, and holds
 * the story while the finger is down. `at` maps a point inside the element
 * to an index, or -1 for none.
 *
 * @param {(x: number, y: number, box: DOMRect) => number} at
 * @param {(i: number) => void} onPick
 */
function useScrub(at, onPick) {
  const holding = useHold()
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  /** @param {import('react').PointerEvent} e */
  const pick = (e) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const i = at(e.clientX - box.left, e.clientY - box.top, box)
    if (i >= 0) onPick(i)
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
 * Where the money went: one row per category, each with its emoji, the
 * chosen one lit. Tapping a row chooses it.
 *
 * @param {{rows: Array<{name: string, amount: number, share: number, icon?: string|null}>, selected: number,
 *          onSelect: (i: number) => void, format: (v: number) => string}} props
 */
export function CategoryRows({ rows, selected, onSelect, format }) {
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
              className="w-full flex items-center gap-3 text-left"
              style={{ height: CATEGORY_ROW_PX }}
            >
              <motion.span
                className="w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center text-20 leading-none"
                animate={{ backgroundColor: on ? pal.paper : pal.track, scale: on ? 1 : 0.9 }}
                transition={ANSWER}
                aria-hidden="true"
              >
                {r.icon || '🏷️'}
              </motion.span>
              <span className="flex-1 min-w-0">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-15 font-medium truncate" style={{ color: on ? pal.ink : pal.muted }}>{r.name}</span>
                  <span className="text-14 tabular-nums shrink-0" style={{ color: on ? pal.ink : pal.muted }}>{format(r.amount)}</span>
                </span>
                <span className="mt-1.5 block h-2 rounded-full overflow-hidden" style={{ backgroundColor: pal.track }}>
                  <motion.span
                    className="block h-full rounded-full origin-left"
                    style={{ width: `${(r.amount / max) * 100}%` }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1, backgroundColor: on ? pal.ink : pal.muted, opacity: on ? 1 : 0.55 }}
                    transition={{ scaleX: { ...SPRING, delay: 0.18 + i * 0.05 }, default: ANSWER }}
                  />
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** The calendar's column headings, Sunday first, as the app's dates are. */
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const CELL_GAP = 5
const HEAD_PX = 18

/**
 * The month as a calendar, each day shaded by what was spent on it - the
 * busiest in full white with a flame on it. Tap a day, or drag across the
 * month, to read any of them.
 *
 * The cells are sized from the room the slide leaves - by width on a tall
 * phone, by height on a short one - so the whole month always fits.
 *
 * @param {{month: string, days: Array<{day: number, amount: number}>, selected: number, busiest: number,
 *          onSelect: (i: number) => void}} props
 *        selected and busiest are indexes into `days`; busiest is -1 when nothing was spent.
 */
export function CalendarHeat({ month, days, selected, busiest, onSelect }) {
  const { pal } = useSlide()
  const [y, m] = month.split('-').map(Number)
  const lead = new Date(y, m - 1, 1).getDay()
  const weeks = Math.ceil((lead + days.length) / 7)
  /* Shaded by rank among the days that had spending, not by share of the
     biggest: one enormous day - a deposit, a laptop - turned every other day
     the same faint shade, and the month's pattern disappeared. */
  const rank = useMemo(() => {
    const spent = days.filter(d => d.amount > 0).map(d => d.amount).sort((a, b) => a - b)
    const at = new Map()
    spent.forEach((v, i) => at.set(v, spent.length > 1 ? i / (spent.length - 1) : 1))
    return at
  }, [days])

  const [boxRef, box] = useBox()
  const cell = Math.max(14, Math.floor(Math.min(
    (box.w - CELL_GAP * 6) / 7,
    (box.h - HEAD_PX - CELL_GAP * (weeks - 1)) / weeks,
    44,
  )))
  const gridW = cell * 7 + CELL_GAP * 6
  const gridH = HEAD_PX + weeks * cell + (weeks - 1) * CELL_GAP
  // In the middle of the room it has, when it has more than it needs.
  const top = Math.max(0, Math.floor((box.h - gridH) / 2))

  const scrub = useScrub((px, py) => {
    const left = (box.w - gridW) / 2
    const col = Math.floor((px - left) / (cell + CELL_GAP))
    const row = Math.floor((py - top - HEAD_PX) / (cell + CELL_GAP))
    if (col < 0 || col > 6 || row < 0 || row >= weeks) return -1
    const i = row * 7 + col - lead
    return i >= 0 && i < days.length ? i : -1
  }, onSelect)

  return (
    <div ref={boxRef} className="relative w-full h-full">
      {box.w > 0 && (
        <div {...scrub} className="absolute inset-0 cursor-pointer select-none" aria-hidden="true">
          <div className="mx-auto" style={{ width: gridW, marginTop: top }}>
            <div className="grid grid-cols-7" style={{ columnGap: CELL_GAP, height: HEAD_PX }}>
              {WEEKDAYS.map((d, i) => (
                <span key={i} className="text-center text-11 font-semibold" style={{ color: pal.muted }}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7" style={{ gap: CELL_GAP }}>
              {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} style={{ height: cell }} />)}
              {days.map((d, i) => {
                const alpha = d.amount > 0 ? 0.22 + 0.74 * (rank.get(d.amount) ?? 0) : 0.07
                const bright = alpha > 0.55
                const on = i === selected
                const row = Math.floor((lead + i) / 7), col = (lead + i) % 7
                return (
                  <motion.span
                    key={d.day}
                    className="relative flex items-center justify-center rounded-[28%] tabular-nums"
                    style={{
                      height: cell,
                      fontSize: Math.max(9, Math.min(12, Math.round(cell * 0.34))),
                      fontWeight: 600,
                      color: bright ? pal.deepInk : pal.muted,
                      boxShadow: on ? `0 0 0 2px ${pal.ink}` : 'none',
                    }}
                    initial={{ opacity: 0, scale: 0.4, backgroundColor: 'rgba(255, 255, 255, 0)' }}
                    animate={{ opacity: 1, scale: 1, backgroundColor: `rgba(255, 255, 255, ${alpha})` }}
                    transition={{ ...SPRING, delay: 0.15 + (row + col) * 0.035 }}
                  >
                    {d.day}
                    {i === busiest && (
                      <motion.span
                        className="absolute -top-2 -right-1.5 leading-none"
                        style={{ fontSize: Math.max(12, Math.round(cell * 0.5)) }}
                        initial={{ opacity: 0, scale: 0, rotate: -30 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        transition={{ ...SPRING, delay: 0.9 }}
                      >
                        🔥
                      </motion.span>
                    )}
                  </motion.span>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Net worth across the month: a line drawn in over a soft fill, with a dot
 * that follows the finger.
 *
 * @param {{series: Array<{day: number, value: number}>, selected: number, onSelect: (i: number) => void, rising: boolean}} props
 */
export function NetWorthArea({ series, selected, onSelect, rising }) {
  const { pal } = useSlide()
  const reduce = useReducedMotion()
  const scrub = useScrub((px, _py, box) => {
    if (series.length < 1) return -1
    const f = Math.min(0.9999, Math.max(0, px / box.width))
    return Math.floor(f * series.length)
  }, onSelect)
  // useId's colons are not valid in url(#...), so they go.
  const id = `nw-${useId().replace(/:/g, '')}`
  const W = 300, H = 120, PAD = 8
  const { line, area, points } = useMemo(() => {
    const vals = series.map(s => s.value)
    const lo = Math.min(...vals), hi = Math.max(...vals)
    const span = hi - lo || 1
    const pts = series.map((s, i) => [
      series.length > 1 ? (i / (series.length - 1)) * W : W / 2,
      PAD + (1 - (s.value - lo) / span) * (H - PAD * 2),
    ])
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
    const last = pts[pts.length - 1] ?? [W, H]
    return { line: d, area: `${d} L${last[0].toFixed(1)} ${H} L${(pts[0]?.[0] ?? 0).toFixed(1)} ${H} Z`, points: pts }
  }, [series])
  const dot = points[Math.min(selected, points.length - 1)] ?? [0, 0]
  const stroke = rising ? pal.good : pal.soft

  return (
    <div {...scrub} className="relative h-full select-none cursor-pointer">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
        {/* Drawn in by a clip sweeping left to right, not by pathLength. The
            SVG is stretched to its box and its stroke kept a true 3px, and a
            dash measured in the one space and drawn in the other came up
            short - the line stopped before reaching its own dot. A clip is
            measured where the line is drawn. Reduced motion: simply there. */}
        <defs>
          <clipPath id={`${id}-clip`}>
            <motion.rect
              x={-PAD} y={-PAD * 4} height={H + PAD * 8}
              initial={reduce ? false : { width: 0 }} animate={{ width: W + PAD * 2 }}
              transition={{ type: 'spring', bounce: 0, visualDuration: 1.1, delay: 0.2 }}
            />
          </clipPath>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.42" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <g clipPath={`url(#${id}-clip)`}>
          <path d={area} fill={`url(#${id}-fill)`} />
          <path d={line} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      {/* The dot lives outside the stretched SVG, so it stays round. It waits
          for the line to finish drawing to where it sits, then keeps up with
          the finger. */}
      <motion.span
        className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full"
        style={{ backgroundColor: pal.paper, boxShadow: `0 0 0 4px ${stroke}, 0 4px 10px rgba(0, 0, 0, 0.3)` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, left: `${(dot[0] / W) * 100}%`, top: `${(dot[1] / H) * 100}%` }}
        transition={{
          default: { type: 'spring', bounce: 0, visualDuration: 0.15 },
          opacity: { duration: 0.25, delay: reduce ? 0 : 1.2 },
        }}
      />
    </div>
  )
}
