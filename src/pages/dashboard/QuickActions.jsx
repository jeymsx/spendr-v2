import { Link } from 'react-router-dom'
import FadeScroller from '../../components/FadeScroller'
import { RAIL_TOUCH } from '../../components/ui/Rail'
import { IconGift } from '../wishlist/shared'

// ── Quick actions ──────────────────────────────────────────────────────────────

/* One set of glyphs: 24x24, 2px stroke on integer coordinates so the edges
   land on pixel boundaries at 1x, round caps, no fill, currentColor. Drawn
   from primitives rather than freehand curves, which is what stops one of
   them looking hand-made next to its neighbours. */

export function IconTarget() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Concentric at r=10/6/2. The outer ring overshoots an 18x18 square on
          purpose: a circle drawn to the same box reads smaller than one. */}
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

export function IconBanknote() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  )
}

export function IconRepeat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

/** A flag on its pole: a challenge taken on. */
export function IconFlag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 21V4" />
      <path d="M5 4h13l-3 4.5 3 4.5H5" />
    </svg>
  )
}

/** A bolt: the quick log, as the add form's own button draws it. */
export function IconBolt() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  )
}

/** A line running on past today's mark: the forecast. */
export function IconForecast() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 17l5-5 4 3 4-5" />
      <path d="M16 10l5-4" strokeDasharray="2 3" />
      <path d="M3 21h18" />
    </svg>
  )
}

/** A page with lines: notes. */
export function IconNote() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  )
}

/**
 * One circle and its label.
 *
 * The label is the accessible name and the glyph is decorative, so the icon
 * carries aria-hidden and the link needs no aria-label - a screen reader
 * reads "Goals, link" rather than "Goals Goals".
 */
export function QuickAction({ to, icon, label, badge = 0, className = '' }) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center gap-1.5 active:scale-95 transition-transform duration-75 ${className}`}
      /* The count is part of the link's name, not a separate announcement:
         "Bills, 2 need attention, link". A bare "2" floating next to the
         label would be read out with no idea what it counted. */
      aria-label={badge > 0 ? `${label}, ${badge} need${badge === 1 ? 's' : ''} attention` : undefined}
    >
      {/* `card` rather than a bespoke fill: same glass as the budget and
          transaction panels, and it tracks that material if it ever changes.

          The glyph is the navbar's inactive icon weight - soft grey, not solid
          white - which took one utility rather than two because of how the
          numbers fall.

          The navbar itself uses `text-slate-400 dark:text-slate-500`, and
          copying that pair verbatim would have shipped a failing graphic:
          slate-400 on the white card is 2.56:1, under the 3:1 WCAG 1.4.11
          asks of an icon that means something. (It is one of the 235
          instances of that pair noted in plan.md - the shades are the wrong
          way round app-wide.)

          slate-500 works in BOTH themes, so there is no dark: variant here at
          all: 4.76:1 on the light card, 3.74:1 on the dark one, which is
          exactly the navbar's own dark weight. Same softness, no failure. */}
      <span className="relative">
        <span className="card w-11 h-11 rounded-full flex items-center justify-center
          text-slate-500">
          {icon}
        </span>
        {/* Straddling the disc's edge rather than tucked inside it. Inside, an
            18px disc on a 44px one eats a third of the glyph's room and reads
            as part of the icon; on the corner it reads as applied to it,
            which is what a notification is. -top/-right of 1.5 puts its
            centre almost exactly on the circle's 45 degree point.

            Capped at 9+. The disc has to stay a disc - a three-digit count
            would stretch it into a pill, and past nine the exact number stops
            being the point anyway. */}
        {badge > 0 && (
          <span
            className="qa-badge absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1
              rounded-full flex items-center justify-center
              text-10 font-bold tabular-nums leading-none"
            aria-hidden="true"
          >
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      <span className="text-10 font-medium text-slate-600 dark:text-slate-300 text-center leading-tight">
        {label}
      </span>
    </Link>
  )
}

/**
 * The doors, below the accounts, in a row that scrolls sideways.
 *
 * This replaced two rectangles, which replaced three, and the shape is the
 * point: the home screen was cards all the way down, so a row of discs reads
 * as "things you do" against everything above and below being "things you
 * have". No card behind the row - boxing it would put the rectangle straight
 * back - though each disc IS the card material, so the row still belongs to
 * the same surface family as the panels around it.
 *
 * ── Eight, and a rail ──
 *
 * It was six columns across the page's width, gap-1 apart. It still is, for
 * the first six: each door is a sixth of the row, less the gaps, so Goals to
 * Quick log sit exactly where six columns put them and nothing is cut. The
 * other two (0.24.0) wait past the right edge, and the row scrolls to them.
 * The ends feather as they are scrolled past (FadeScroller) rather than
 * slicing a disc down the middle - only 20px, the page's own gutter, so the
 * fade lives in the margin and never dims Quick log - and only at an end that
 * has more beyond it, so the row at rest has a hard left edge.
 *
 * ── The order ──
 *
 * Goals, Debts, Recurring and Wishlist first: places with a backlog, and the
 * only way into them from Home. Then Challenges, which otherwise sat behind
 * Settings › Achievements; Quick log, which otherwise meant knowing to hold
 * the + (it opens with `?log=quick`, the address the daily check-in's
 * notification already uses); the Forecast, which is otherwise two taps into
 * Insights; and Notes. Expense, Income and Transfer gave their discs up: the +
 * reaches all three, so here they were only ever saving a tap.
 *
 * Only the first four carry a count. They are PLACES, and a place can have a
 * backlog - for the wishlist, wishes whose wait is over. A challenge under
 * way, a forecast or a note is nothing to act on, and Quick log is a verb.
 *
 * Every glyph is the same quiet grey, not coloured by what it means. Several
 * hues among eight discs would read as a legend, when the only thing being
 * encoded is "these go to different pages" - the labels say that, and the
 * destination pages carry the semantics.
 */
export default function QuickActions({ counts = {} }) {
  // A sixth of the row's width, less five gap-1s: six across, as the grid was.
  const door = 'flex-none w-[calc((100%-1.25rem)/6)]'
  return (
    /* mt-6 and the rail's pt-2: the 32px every section on this screen keeps
       above it, with the top 8px inside the rail - room for a count that sits
       on a disc's corner, which a scrolling row would otherwise clip. */
    <section className="mt-6">
      <FadeScroller
        axis="x"
        fade={20}
        style={RAIL_TOUCH}
        className="flex gap-1 px-5 pt-2 pb-1"
        aria-label="Shortcuts"
      >
        <QuickAction className={door} to="/goals"     icon={<IconTarget />}   label="Goals"     badge={counts.goals} />
        <QuickAction className={door} to="/debts"     icon={<IconBanknote />} label="Debts"     badge={counts.debts} />
        <QuickAction className={door} to="/recurring" icon={<IconRepeat />}   label="Recurring" badge={counts.bills} />
        <QuickAction className={door} to="/wishlist"  icon={<IconGift />}     label="Wishlist"  badge={counts.wishes} />
        <QuickAction className={door} to="/achievements?tab=challenges" icon={<IconFlag />} label="Challenges" />
        <QuickAction className={door} to="/?log=quick" icon={<IconBolt />}    label="Quick log" />
        <QuickAction className={door} to="/insights/forecast" icon={<IconForecast />} label="Forecast" />
        <QuickAction className={door} to="/notes"     icon={<IconNote />}     label="Notes" />
      </FadeScroller>
    </section>
  )
}
