import { Link } from 'react-router-dom'
import { cx } from './cx'

/**
 * A top-level block of a page: its name, and optionally something opposite.
 *
 * ── The other heading, and why there are two ──
 *
 * SectionLabel is the app's caption - 12px semibold, muted, over a field or a
 * card. This is the one above it: a real 16px `<h2>` in the text colour,
 * naming a whole section of a screen. "Budget", "Upcoming", "Recent", "Top
 * expenses". Two sizes with two jobs, not two versions of one thing.
 *
 * ── What it settles ──
 *
 * Five components called some variant of SectionHeader or SectionHeading.
 * Two of them were this: Dashboard's took `title`, `subtitle`, `right`, an
 * `actionLabel`/`actionTo` link and a `px` boolean; Insights' took `children`
 * and `action`, and hardcoded px-5 and mb-3. Same type, same weight, same
 * colour - and then one aligned its row on the baseline and the other on the
 * centre, and one owed its own bottom margin while the other did not.
 *
 * The remaining three were not this at all. Recurring and RecurringDetail had
 * byte-identical copies of "a SectionLabel with a figure beside it", which is
 * what SectionLabel's own `action` slot is for; Settings had a caption a
 * shade off SectionLabel's. All three are gone rather than moved here.
 *
 * ── align ──
 *
 * `baseline` is right when the thing opposite is text - a total sits on the
 * heading's own line. `center` is right when it is a control: a row of
 * segmented buttons hung from a text baseline sits visibly low. Both have a
 * caller, which is the only reason the option exists.
 */

/** Space below. The callers inside an already-padded section pass `none`. */
const GAP = { none: '', tight: 'mb-1', normal: 'mb-2', loose: 'mb-3' }
/** The page gutter, for a heading that is not already inside one. */
const INSET = { none: '', gutter: 'px-5' }

export default function SectionHeading({
  children,
  /** A quieter word beside the name - "This month". */
  subtitle = null,
  /** Anything opposite: a total, a filter, a control. */
  action = null,
  /** A route away from here. Rendered as the app's "See all" link. */
  actionLabel = null,
  actionTo = null,
  align = 'baseline',
  inset = 'gutter',
  gap = 'loose',
  className = '',
}) {
  return (
    <div className={cx(
      'flex justify-between gap-3',
      align === 'center' ? 'items-center' : 'items-baseline',
      INSET[inset] ?? INSET.gutter,
      GAP[gap] ?? GAP.loose,
      className,
    )}>
      <div className="flex items-baseline gap-2 min-w-0">
        <h2 className="text-base font-semibold text-slate-800 dark:text-white truncate">
          {children}
        </h2>
        {subtitle && (
          <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
            {subtitle}
          </span>
        )}
      </div>

      {action}

      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="text-xs font-medium text-primary shrink-0 active:opacity-70"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}
