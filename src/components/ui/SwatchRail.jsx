import { useEffect, useRef } from 'react'
import FadeScroller from '../FadeScroller'
import { cx } from './cx'

/**
 * A horizontal rail of circular colour swatches.
 *
 * The skeleton of the card-colour rail, without the card. `ColorRail` in
 * CardStyle.jsx knows about account brands, house colours and gradient
 * presets, so it could not be dropped into a category form - and the category
 * form had grown its own picker instead: eight rounded RECTANGLES, stretched
 * to fill the row, ticked with a white check. Same job, different object, two
 * screens apart.
 *
 * So this is the shape both of them share: 36px circles, 12px apart, scrolling
 * sideways, the selected one ringed in its own colour. It reuses `.swatch-on`
 * and `--swatch-color` from index.css, which is what makes it look identical
 * to the card rail rather than merely similar - the ring's inner gap has to be
 * the page colour, and only a class can answer the theme.
 *
 * ── The bleed ──
 *
 * `-mx-5 px-5` so the row runs to both edges of a `px-5` parent instead of
 * stopping inside its padding: a scrolling row that ends where the text ends
 * looks clipped, and one that ends at the screen edge looks like it continues.
 * `scroll-px-5` keeps the padding honest when the browser scrolls a swatch
 * into view.
 *
 * A pair spelled "#a855f7,#ec4899" renders as a 135deg gradient and rings
 * with its first stop, because ringing a two-colour swatch in two colours is
 * a worse problem than picking one.
 *
 * ── Why it fades at the ends ──
 *
 * Bleeding to the screen edge is what says "there is more", but it also cuts
 * the swatch at that edge in half, and half a circle against the panel edge
 * looks like a mistake rather than an invitation. FadeScroller's mask on the
 * x axis takes the last one out gently instead, and only at the end you have
 * not reached - so a rail that fits has no fade at all.
 */
export default function SwatchRail({
  /** Hex strings, or "from,to" pairs for a gradient. */
  colors,
  value,
  onChange,
  /** Names the group for screen readers. */
  ariaLabel = 'Colour',
  className = '',
}) {
  const railRef = useRef(null)

  /* Reveal the selection, but only if it is out of sight, and only on entry:
     re-scrolling on every pick yanks the row out from under the finger that
     just tapped it. */
  useEffect(() => {
    const row = railRef.current
    const on = row?.querySelector('[aria-pressed="true"]')
    if (!row || !on) return
    const left = on.offsetLeft - row.scrollLeft
    if (left >= 0 && left + on.offsetWidth <= row.clientWidth) return
    row.scrollTo({ left: on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2 })
  }, [])

  return (
    <FadeScroller
      ref={railRef}
      axis="x"
      role="group"
      aria-label={ariaLabel}
      className={cx(
        'flex items-center gap-3 snap-x',
        '-mx-5 px-5 scroll-px-5 py-2.5',
        className,
      )}
      style={{ touchAction: 'pan-x pan-y', overscrollBehaviorX: 'contain' }}
    >
      {colors.map(c => {
        const [from, to] = String(c).split(',')
        const on = value === c
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={to ? `Gradient ${from} to ${to}` : from}
            aria-pressed={on}
            className={cx(
              'w-9 h-9 shrink-0 snap-center rounded-full',
              'transition-transform duration-150 active:scale-90',
              on && 'swatch-on',
            )}
            style={{
              background: to
                ? `linear-gradient(135deg, ${from} 0%, ${to} 100%)`
                : from,
              '--swatch-color': from,
            }}
          />
        )
      })}
    </FadeScroller>
  )
}
