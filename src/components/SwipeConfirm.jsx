import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A pill you drag to commit, for actions that should cost more than a tap.
 *
 * Posting a bill writes a transaction, moves a balance and advances a due
 * date. A tap is the same gesture as scrolling past it, which is why the
 * confirmation sheet gained one in the first place - but a tap on the
 * confirmation is still a tap, and a deliberate drag is the cheapest way to
 * make the last step need intent.
 *
 * ── The white shape and the circle are one thing ──
 *
 * The track is the accent colour end to end. Over it sits a single white
 * capsule, pinned to the left, whose RIGHT CAP is the circle - so as it
 * grows there is no second shape behind anything, just one form getting
 * longer with the arrow riding its leading end. At rest its width equals its
 * height and it is exactly a circle.
 *
 * This took three tries. A fill that stopped flush past a separate knob left
 * a hard vertical cut beside the circle. Rounding that fill with
 * border-radius 9999 produced a lopsided blob, because a radius larger than
 * half the box is scaled proportionally - a 26x52 element does not round to
 * a circle, it rounds to a 13x26 ellipse. Hence the explicit KNOB/2 here:
 * 22px is never more than half of either dimension, so the cap is always a
 * true semicircle.
 *
 * ── Why a pointerdown anywhere on the track, not only the knob ──
 *
 * A 44px knob on a 320px track is a small target for a thumb arriving at the
 * middle of a pill that plainly says "drag me". The knob jumps to the finger
 * on contact and follows from there, so the gesture starts wherever you
 * touched.
 *
 * ── Touch pointers capture themselves ──
 *
 * A touch pointer is implicitly captured to the element that received
 * pointerdown, so pointermove keeps firing on this element even once the
 * finger leaves it. A mouse does NOT, hence the explicit setPointerCapture -
 * without it, dragging off the pill loses the pointer and the knob sticks.
 *
 * ── Keyboards cannot drag ──
 *
 * So Enter and Space confirm outright. That is not a loophole in the intent:
 * the drag exists to stop a thumb committing by accident on a surface where
 * everything else is a tap, and a keyboard user pressing Enter on a focused
 * control labelled "Swipe to post" has been every bit as deliberate. A
 * pointer tap does nothing, which is the part that matters.
 */

/** How far along the travel counts as committed. */
const THRESHOLD = 0.82

export default function SwipeConfirm({
  onConfirm,
  label = 'Swipe to confirm',
  confirmingLabel = 'Working…',
  busy = false,
  disabled = false,
  className = '',
}) {
  const trackRef = useRef(null)
  const [x, setX] = useState(0)          // knob offset in px
  const [dragging, setDragging] = useState(false)
  /* State, not a ref. The fill width and the label's fade are computed from
     x/travel during render, and a ref read there does not make the component
     re-render when it changes - which the hooks rule is right to flag even
     though this one happens to be set before x ever moves. */
  const [travel, setTravel] = useState(0)
  const done = useRef(false)
  /* Whether a gesture is in flight, as a ref.
  
     This gate has to be readable in the same task that set it. `dragging`
     state is not: React commits it on a later tick, so a pointermove
     arriving in the same task as the pointerdown - which is exactly what a
     fast flick delivers, and what a synthetic gesture always delivers - was
     tested against `false` and dropped. The knob never moved and a full
     swipe did nothing.
  
     The state stays, because the transitions need to know; it just is not
     what decides whether a move counts. */
  const active = useRef(false)

  const KNOB = 44
  const PAD = 4

  const maxX = () => Math.max(0, (trackRef.current?.clientWidth ?? 0) - KNOB - PAD * 2)

  const reset = useCallback(() => { active.current = false; setX(0); setDragging(false) }, [])

  useEffect(() => { if (!busy) done.current = false }, [busy])

  const begin = (e) => {
    if (disabled || busy || done.current) return
    active.current = true
    setTravel(maxX())
    setDragging(true)
    // Mice need this; touch pointers already have it implicitly.
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not captureable */ }
    move(e)
  }

  const move = (e) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    // The knob centres on the finger, so the gesture starts where you touched.
    const next = e.clientX - rect.left - PAD - KNOB / 2
    // maxX() rather than the state, so the first move of a gesture is not
    // clamped against the previous gesture's travel.
    setX(Math.max(0, Math.min(maxX(), next)))
  }

  const end = () => {
    if (!active.current) return
    active.current = false
    const span = maxX()
    const t = span > 0 ? x / span : 0
    if (t >= THRESHOLD && !done.current) {
      done.current = true
      setX(span)                // stay at the end while the work happens
      setDragging(false)
      onConfirm?.()
      return
    }
    reset()
  }

  const progress = travel > 0 ? Math.min(1, x / travel) : 0
  const showLabel = busy ? confirmingLabel : label

  return (
    <div
      ref={trackRef}
      onPointerDown={begin}
      onPointerMove={(e) => { if (active.current) move(e) }}
      onPointerUp={end}
      onPointerCancel={reset}
      role="button"
      tabIndex={disabled || busy ? -1 : 0}
      aria-label={showLabel}
      aria-disabled={disabled || busy}
      onKeyDown={(e) => {
        if (disabled || busy || done.current) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); done.current = true; onConfirm?.() }
      }}
      className={`relative h-[52px] rounded-full overflow-hidden select-none
        bg-primary ${disabled ? 'opacity-40' : ''} ${className}`}
      style={{
        // The gesture owns the axis, or the sheet scrolls under the finger.
        touchAction: 'none',
        cursor: disabled || busy ? 'default' : 'grab',
      }}
    >
      {/* White on the accent, fading as the capsule comes to cover it. */}
      <span
        className="absolute inset-0 flex items-center justify-center
          text-[14px] font-semibold text-white pointer-events-none"
        style={{ opacity: 1 - progress * 0.8 }}
      >
        {showLabel}
      </span>

      {/* The one white shape. Explicit 22px radius, never 9999 - see above. */}
      <span
        className="absolute bg-white shadow-[0_1px_4px_rgba(0,0,0,0.2)] pointer-events-none"
        style={{
          top: PAD,
          bottom: PAD,
          left: PAD,
          width: KNOB + x,
          borderRadius: KNOB / 2,
          transition: dragging ? 'none' : 'width 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      />

      {/* Rides the capsule's leading cap, which is why it is positioned
          against the same x rather than parented to the shape - a child
          centred in a growing box would drift left as the box grew. */}
      <span
        className="absolute top-1/2 flex items-center justify-center pointer-events-none"
        style={{
          left: PAD + x + KNOB / 2,
          transform: 'translate(-50%, -50%)',
          transition: dragging ? 'none' : 'left 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {busy ? (
          <span className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="var(--color-primary)" strokeWidth="2.4"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h13M13 6l6 6-6 6" />
          </svg>
        )}
      </span>
    </div>
  )
}
