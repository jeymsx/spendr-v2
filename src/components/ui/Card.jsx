import { cx } from './cx'

/**
 * The app's surface.
 *
 * ── The paint is already shared; the shape was not ──
 *
 * `.card` in index.css owns the fill, the hairline and the shadow, in both
 * themes, and has for a long time - that part never drifted. What drifted was
 * everything around it: twelve call sites spelled out `card rounded-2xl
 * overflow-hidden`, `card rounded-3xl`, `card px-4 py-3 rounded-2xl`,
 * `card block rounded-2xl px-4 py-4 active:scale-[0.99] transition-transform
 * duration-100` and so on, with the radius, the padding and the press
 * feedback re-decided each time.
 *
 * So this owns the shape. `rounded-2xl` is the default because 171 of the
 * 264 radii in the app are already 2xl; 3xl is for a hero surface that leads
 * a page.
 *
 * ── `recessed` is a different surface, not a variant of this one ──
 *
 * A group of detail rows sits INSIDE a sheet that is already a raised
 * surface. Raised-on-raised has no edge you can see, so those groups use a
 * recessed fill instead - slightly darker than the page in light mode,
 * slightly lighter in dark. TxDetailSheet had it as a local `DetailGroup`;
 * it belongs here next to the surface it contrasts with.
 *
 * ── interactive ──
 *
 * A card you can press answers the press. Same 2% shrink Button uses, for
 * the same reason: a surface that does nothing when touched reads as broken
 * before it reads as disabled.
 */

const RADIUS = {
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-3xl',
}

const PAD = {
  none: '',
  sm: 'px-4 py-3',
  md: 'px-4 py-4',
}

const SURFACE = {
  /** Raised: the page's own cards. Paint comes from .card in index.css. */
  raised: 'card',
  /** Recessed: a group inside an already-raised surface. */
  recessed:
    'bg-slate-50 border border-slate-100 dark:bg-white/[0.03] dark:border-white/[0.06]',
}

export default function Card({
  /** `div` by default; `button`, `label` or a router Link when it acts. */
  as: Tag = 'div',
  surface = 'raised',
  radius = '2xl',
  padding = 'none',
  /** Clips children to the radius - wanted whenever the card holds rows. */
  clip = false,
  /** Answers a press with the same 2% shrink a Button does. */
  interactive = false,
  className = '',
  children,
  ...rest
}) {
  return (
    <Tag
      className={cx(
        SURFACE[surface] ?? SURFACE.raised,
        RADIUS[radius] ?? RADIUS['2xl'],
        PAD[padding] ?? PAD.none,
        clip && 'overflow-hidden',
        interactive && 'active:scale-[0.98] transition-transform duration-100',
        Tag === 'button' && 'w-full text-left',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}
