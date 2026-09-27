import { useEffect, useRef, useState } from 'react'
import { Trash01 } from '@untitledui/icons'
import { cx } from './cx'
import { prefersReducedMotion, spring } from './motion'

/**
 * A row you drag left to delete, the way Mail and Messages do it.
 *
 * ── The gesture ──
 *
 * Drag left and the row follows the finger, uncovering a red strip with a
 * bin in it. Let go past the button's width and the row stays open on it, to
 * tap; let go further than half the row - or flick it - and it goes. Drag it
 * back, tap anywhere else, or scroll, and it closes. One row is open at a
 * time.
 *
 * The strip is exactly as wide as what has been uncovered, never behind the
 * row: the dark cards are see-through, and a red panel under one would tint
 * it the moment the finger landed.
 *
 * ── What it never takes ──
 *
 * A vertical drag, which is the list scrolling: the row is `touch-action:
 * pan-y`, so the browser keeps those and hands over only the sideways ones.
 * And the tap at the end of a drag, which is not a tap on the row.
 *
 * ── Reduced motion ──
 *
 * The row still follows the finger - that is the finger, not an animation -
 * but lets go without a spring: it is open, closed or gone at once.
 */

/** The button's width, in px. */
const ACTION_W = 76
/** Travel before a press becomes a drag. */
const SLOP = 8
/** Past this share of the row, letting go deletes. */
const FAR_ENOUGH = 0.5
/** A flick this fast to the left opens the row, px/s. */
const FLICK = 500

/** @type {{close: () => void}|null} */
let openRow = null

/** @typedef {{id: number, x0: number, y0: number, from: number, live: boolean, pts: number[][]}} Drag */

/** Resistance past the end - the further, the stiffer. @param {number} d */
const stretch = (d) => (d * 40) / (40 + d)

/**
 * @param {{children: import('react').ReactNode, onDelete: () => (boolean|void|Promise<boolean|void>),
 *          label: string, disabled?: boolean, className?: string}} props
 *   onDelete: resolve false when nothing was deleted (it went to a
 *   confirmation instead), and the row closes again
 *   label: the button's name, "Delete Lunch"
 */
export default function SwipeRow({ children, onDelete, label, disabled = false, className = '' }) {
  const root = useRef(/** @type {HTMLDivElement|null} */ (null))
  const face = useRef(/** @type {HTMLDivElement|null} */ (null))
  const strip = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [open, setOpen] = useState(false)
  const self = useRef({ close: () => {} })
  const x = useRef(0)
  const stop = useRef(/** @type {null | (() => void)} */ (null))
  const swallow = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    /* Set on the way in as well as cleared on the way out: React's
       development mode unmounts and remounts every component once, and a
       flag only ever cleared stayed false for good - the row then never
       came back from a swipe that went to a confirmation. */
    alive.current = true
    const me = self.current
    return () => {
      alive.current = false
      stop.current?.()
      if (openRow === me) openRow = null
    }
  }, [])

  /** @param {number} v */
  function paint(v) {
    x.current = v
    const el = face.current, s = strip.current
    if (el) el.style.translate = v ? `${v}px 0` : ''
    if (s) {
      const w = root.current?.offsetWidth ?? 0
      s.style.width = `${Math.max(0, -v)}px`
      s.style.setProperty('--reveal', `${Math.max(0, -v)}px`)
      // Far enough to delete on letting go: the bin follows the row's edge.
      s.dataset.armed = String(-v > w * FAR_ENOUGH)
    }
  }

  /** @param {number} to @param {number} [velocity] @param {() => void} [then] */
  function settle(to, velocity = 0, then) {
    stop.current?.()
    stop.current = null
    if (prefersReducedMotion()) { paint(to); then?.(); return }
    stop.current = spring({
      from: x.current, to, velocity, duration: 0.3,
      onUpdate: paint,
      onComplete: () => { stop.current = null; then?.() },
    })
  }

  function close() {
    setOpen(false)
    if (openRow === self.current) openRow = null
    settle(0)
  }
  // What another row calls to close this one: the latest close, not the first render's.
  useEffect(() => { self.current.close = close })

  function openUp(velocity = 0) {
    if (openRow && openRow !== self.current) openRow.close()
    openRow = self.current
    setOpen(true)
    settle(-ACTION_W, velocity)
  }

  async function remove(velocity = 0) {
    const w = root.current?.offsetWidth ?? 320
    if (openRow === self.current) openRow = null
    setOpen(false)
    await new Promise(r => settle(-w, velocity, () => r(undefined)))
    const done = await onDelete()
    // Sent to a confirmation, or refused: the row comes back.
    if (done === false && alive.current) settle(0)
  }

  // While open, a touch anywhere else closes it.
  useEffect(() => {
    if (!open) return
    /** @param {PointerEvent} e */
    const away = (e) => {
      if (root.current && !root.current.contains(/** @type {Node} */ (e.target))) close()
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  })

  const drag = useRef(/** @type {Drag|null} */ (null))

  /** @param {React.PointerEvent<HTMLDivElement>} e */
  function onPointerDown(e) {
    if (disabled || drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return
    stop.current?.()
    stop.current = null
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, from: x.current, live: false, pts: [[e.timeStamp, e.clientX]] }
  }

  /** @param {React.PointerEvent<HTMLDivElement>} e */
  function onPointerMove(e) {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    if (!d.live) {
      const dx = e.clientX - d.x0, dy = e.clientY - d.y0
      if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) { drag.current = null; return } // the list scrolling
      if (Math.abs(dx) < SLOP) return
      d.live = true
      d.x0 = e.clientX
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* already released */ }
      if (openRow && openRow !== self.current) openRow.close()
    }
    d.pts.push([e.timeStamp, e.clientX])
    if (d.pts.length > 8) d.pts.shift()
    const w = root.current?.offsetWidth ?? 320
    const raw = d.from + (e.clientX - d.x0)
    paint(raw > 0 ? stretch(raw) : raw < -w ? -w - stretch(-w - raw) : raw)
  }

  /** @param {React.PointerEvent<HTMLDivElement>} e @param {boolean} cancelled */
  function release(e, cancelled) {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    if (!d.live) {
      // A tap on an open row closes it; it does not also open the row.
      if (open) { swallow.current = true; setTimeout(() => { swallow.current = false }, 0); close() }
      return
    }
    swallow.current = true
    setTimeout(() => { swallow.current = false }, 0)
    const recent = d.pts.filter(([t]) => e.timeStamp - t < 80)
    const [t0, x0] = (recent.length >= 2 ? recent : d.pts.slice(-2))[0] ?? [0, 0]
    const [t1, x1] = (recent.length >= 2 ? recent : d.pts.slice(-2)).at(-1) ?? [0, 0]
    const v = cancelled || t1 <= t0 ? 0 : ((x1 - x0) / (t1 - t0)) * 1000
    const w = root.current?.offsetWidth ?? 320
    const at = x.current
    if (!cancelled && (-at > w * FAR_ENOUGH || (v < -FLICK * 3 && -at > ACTION_W))) { remove(v); return }
    if (!cancelled && (-at > ACTION_W / 2 || v < -FLICK) && v < FLICK) { openUp(v); return }
    close()
  }

  return (
    <div
      ref={root}
      className={cx('relative overflow-hidden', className)}
      onClickCapture={(e) => { if (swallow.current) { e.preventDefault(); e.stopPropagation() } }}
    >
      <div
        ref={strip}
        aria-hidden={!open}
        className="swipe-strip absolute inset-y-0 right-0 w-0 overflow-hidden bg-red-500 dark:bg-red-600"
      >
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          aria-label={label}
          onClick={() => remove()}
          className="swipe-bin absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-1 text-white text-11 font-semibold"
          style={{ width: ACTION_W }}
        >
          <Trash01 size={20} strokeWidth={1.9} aria-hidden="true" />
          Delete
        </button>
      </div>
      <div
        ref={face}
        className="relative"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => release(e, false)}
        onPointerCancel={(e) => release(e, true)}
      >
        {children}
      </div>
    </div>
  )
}
