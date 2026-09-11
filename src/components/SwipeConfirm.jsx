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
        bg-primary/[0.18] dark:bg-primary/[0.22]
        ${disabled ? 'opacity-40' : ''} ${className}`}
      style={{
        // The gesture owns the axis, or the sheet scrolls under the finger.
        touchAction: 'none',
        cursor: disabled || busy ? 'default' : 'grab',
      }}
    >
      {/* Fills in behind the knob, so the pill reads as being completed
          rather than as a knob travelling along an empty groove.

          It ends at the knob's CENTRE, is the knob's height, and is fully
          rounded - so its right cap is a half circle of exactly the knob's
          radius, sitting exactly under the knob's left half. The knob covers
          it completely and there is no edge to see.

          It was the full height of the track and four pixels PAST the knob,
          with square corners. That put a hard vertical cut just past the
          circle: a slab of accent with a straight edge, which reads as the
          fill having been sliced rather than as the knob sitting on it. */}
      <div
        className="absolute bg-primary"
        style={{
          top: PAD,
          bottom: PAD,
          left: PAD,
          width: x + KNOB / 2,
          borderRadius: 9999,
          transition: dragging ? 'none' : 'width 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      />

      <span
        className="absolute inset-0 flex items-center justify-center
          text-[14px] font-semibold pointer-events-none"
        style={{
          // Fades as the knob approaches, so the label is not read through
          // the thing covering it.
          opacity: 1 - progress * 0.85,
          color: progress > 0.4 ? '#fff' : 'var(--color-primary)',
        }}
      >
        {showLabel}
      </span>

      {/* Ringed in the accent, like LimitMeter's handle. A plain white disc
          with only a shadow reads as a hole punched in the pill; the ring
          makes it an object sitting on top of it, and it is the one thing
          that stops the knob dissolving into the white fill's own cap
          underneath. 2px, because at 44px across the 3-on-14 proportion
          LimitMeter uses would be a 9px band. */}
      <span
        className="absolute top-1/2 rounded-full bg-white flex items-center justify-center
          shadow-[0_2px_8px_rgba(0,0,0,0.25)] pointer-events-none"
        style={{
          left: PAD + x,
          width: KNOB,
          height: KNOB,
          transform: 'translateY(-50%)',
          border: '2px solid var(--color-primary)',
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
