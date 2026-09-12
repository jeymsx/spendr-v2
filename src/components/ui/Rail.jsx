import { forwardRef } from 'react'
import { cx } from './cx'

/**
 * A row that scrolls sideways.
 *
 * ── What it settles, and what it deliberately does not ──
 *
 * Fourteen of these were written by hand, and the classes were never the
 * problem: `flex overflow-x-auto no-scrollbar` repeated across fourteen files
 * is Tailwind working as intended, not duplication worth a component.
 *
 * The problem was the two properties nobody remembers:
 *
 *     touch-action: pan-x pan-y
 *     overscroll-behavior-x: contain
 *
 * Seven of the fourteen had them and seven did not. That is not a style
 * inconsistency - `overscroll-behavior-x: contain` is what stops a flick past
 * the end of a rail from reaching the browser underneath it, where on iOS
 * Safari and Chrome Android a horizontal overscroll is the back-navigation
 * gesture. So on half the rails in this app, swiping the account carousel too
 * hard could start navigating away from the page.
 *
 * That is what this owns. Everything else - the gap, the padding, the negative
 * margin that lets a row bleed to the screen edge, whether it snaps - stays at
 * the call site, because it genuinely differs at every one of them and a
 * component with eight layout props is worse than fourteen honest class lists.
 *
 * ── Why it sets no gap and no padding ──
 *
 * Not an oversight. `cx` is not a tailwind-merge, and Tailwind emits utilities
 * in a fixed order, so a baked-in `gap-2` could not be overridden down to
 * `gap-1.5` by a caller - only up. SectionLabel learned that the hard way and
 * named its options instead. Owning nothing a caller might want to change
 * sidesteps the question entirely.
 *
 * ── Not for tables ──
 *
 * A `<div className="overflow-x-auto">` around a `<table>` is a different
 * thing wearing one of the same classes: it has no flex row, no gap, and no
 * touch semantics to get right. Six of those exist and none of them are Rails.
 */
const Rail = forwardRef(function Rail({ className = '', style, children, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={cx('flex overflow-x-auto no-scrollbar', className)}
      style={{
        touchAction: 'pan-x pan-y',
        overscrollBehaviorX: 'contain',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
})

export default Rail
