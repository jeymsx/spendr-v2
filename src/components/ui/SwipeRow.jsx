import { useEffect, useRef, useState } from 'react'
import { Trash01 } from '@untitledui/icons'
import { cx } from './cx'
import { prefersReducedMotion, spring } from './motion'

/**
 * A row you drag left to delete, the way Mail and Messages do it.
 *
 * ── The gesture ──
 *
 * Drag left and the row follows the finger. Let go past the button's width
 * and the row stays open on it, to tap; let go further than half the row - or
 * flick it - and it goes. Drag it back, tap anywhere else, or scroll, and it
 * closes. One row is open at a time.
 *
 * ── The row leaves its card ──
 *
 * The moment it starts to move, the row lifts out of the group it sits in:
 * its own rounded, opaque surface and a shadow, and the card it belongs to
 * stops clipping, so the row can travel off the edge of the screen rather
 * than being cut off at the card's. What it uncovers is the card itself, with
 * the delete button in the gap. When it goes, it flies off; the gap then
 * closes over the same beat the list's rows always leave on
 * (ui/Presence), and the card's corners meet again.
 *
 * ── The button ──
 *
 * The bin on its own, on a softened red - not the solid slab it was. The red
 * fills the gap the row leaves (drawn only while the row is lifted, when the
 * row is opaque and covers the rest of it); the bin sits in the middle of
 * that gap, so it travels with the row's edge, and grows in as the gap opens.
 * Both deepen a step once letting go would delete.
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

/** Where the row rests when open, in px - room for the bin. */
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
 * A card's clipping, off while any of its rows is lifted out of it - counted
 * on the element, because a row closing and the next one opening overlap.
 *
 * @param {HTMLElement|null} card @param {1|-1} step
 */
function unclip(card, step) {
  if (!card) return
  const n = Math.max(0, (Number(card.dataset.swipeLifted) || 0) + step)
  card.dataset.swipeLifted = String(n)
  card.style.overflow = n > 0 ? 'visible' : ''
}

/**
 * @param {{children: import('react').ReactNode, onDelete: () => (boolean|void|Promise<boolean|void>),
 *          label: string, disabled?: boolean, className?: string}} props
 *   onDelete: resolve false when nothing was deleted (it went to a
 *   confirmation instead), and the row comes back
 *   label: the button's name, "Delete Lunch"
 */
export default function SwipeRow({ children, onDelete, label, disabled = false, className = '' }) {
  const root = useRef(/** @type {HTMLDivElement|null} */ (null))
  const face = useRef(/** @type {HTMLDivElement|null} */ (null))
  const bin = useRef(/** @type {HTMLButtonElement|null} */ (null))
  const [open, setOpen] = useState(false)
  const self = useRef({ close: () => {} })
  const x = useRef(0)
  const stop = useRef(/** @type {null | (() => void)} */ (null))
  const swallow = useRef(false)
  const alive = useRef(true)
  /** The card this row has unclipped, while it is lifted. */
  const lifted = useRef(/** @type {HTMLElement|null} */ (null))

  function lift() {
    if (lifted.current || !root.current) return
    const card = /** @type {HTMLElement|null} */ (root.current.parentElement?.closest('.card') ?? null)
    lifted.current = card ?? root.current
    unclip(card, 1)
    root.current.dataset.lifted = 'true'
  }
  function land() {
    if (!lifted.current) return
    if (lifted.current !== root.current) unclip(lifted.current, -1)
    lifted.current = null
    if (root.current) root.current.dataset.lifted = 'false'
  }

  useEffect(() => {
    /* Set on the way in as well as cleared on the way out: React's
       development mode unmounts and remounts every component once, and a
       flag only ever cleared stayed false for good - the row then never
       came back from a swipe that went to a confirmation. */
    alive.current = true
    const me = self.current
    const node = root.current
    return () => {
      alive.current = false
      stop.current?.()
      if (openRow === me) openRow = null
      // A row deleted while lifted must still give its card its clipping back.
      if (lifted.current && lifted.current !== node) unclip(lifted.current, -1)
      lifted.current = null
    }
  }, [])

  /** @param {number} v */
  function paint(v) {
    x.current = v
    const el = face.current, b = bin.current, r = root.current
    if (el) el.style.translate = v ? `${v}px 0` : ''
    const gap = Math.max(0, -v)
    if (b) {
      // Centred in the gap, so it moves with the row's edge; grown in as the gap opens.
      const grown = Math.min(1, gap / ACTION_W)
      b.style.right = `${Math.max(6, gap / 2 - ACTION_W / 2)}px`
      b.style.opacity = String(Math.min(1, gap / (ACTION_W * 0.6)))
      b.style.scale = String(0.55 + 0.45 * grown)
    }
    if (r) {
      const w = r.offsetWidth || 0
      r.dataset.armed = String(w > 0 && gap > w * FAR_ENOUGH)
    }
  }

  /** @param {number} to @param {number} [velocity] @param {() => void} [then] */
  function settle(to, velocity = 0, then) {
    stop.current?.()
    stop.current = null
    const done = () => { stop.current = null; if (to === 0) land(); then?.() }
    if (prefersReducedMotion()) { paint(to); done(); return }
    stop.current = spring({ from: x.current, to, velocity, duration: 0.3, onUpdate: paint, onComplete: done })
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
    lift()
    setOpen(true)
    settle(-ACTION_W, velocity)
  }

  async function remove(velocity = 0) {
    // Clear of the screen's edge, not just the card's: it is leaving.
    const w = (root.current?.offsetWidth ?? 320) + 48
    if (openRow === self.current) openRow = null
    lift()
    setOpen(false)
    if (root.current) root.current.dataset.removing = 'true'
    await new Promise(r => settle(-w, Math.min(velocity, -1200), () => r(undefined)))
    const done = await onDelete()
    // Sent to a confirmation, or refused: the row comes back.
    if (done === false && alive.current) {
      if (root.current) root.current.dataset.removing = 'false'
      settle(0)
    }
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
      lift()
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
      className={cx('swipe-row relative', className)}
      data-lifted="false"
      onClickCapture={(e) => { if (swallow.current) { e.preventDefault(); e.stopPropagation() } }}
    >
      {/* The gap the row leaves: a softened red, shown only while the row is
          lifted and opaque, so a see-through card at rest never shows it; the
          bin in it, transparent and scaled down until the gap opens. */}
      <div aria-hidden={!open} className="absolute inset-0 pointer-events-none">
        <span className="swipe-back absolute" />
        <button
          ref={bin}
          type="button"
          tabIndex={open ? 0 : -1}
          aria-label={label}
          onClick={() => remove()}
          className="swipe-bin pointer-events-auto absolute inset-y-0 flex items-center justify-center"
          style={{ width: ACTION_W, right: 6, opacity: 0, scale: '0.55' }}
        >
          <Trash01 size={21} strokeWidth={2} className="swipe-icon" aria-hidden="true" />
        </button>
      </div>
      <div
        ref={face}
        className="swipe-face relative"
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
