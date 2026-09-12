import { Link } from 'react-router-dom'

// ── Quick actions ──────────────────────────────────────────────────────────────

/* Four glyphs, one set: 24x24, 2px stroke on integer coordinates so the edges
   land on pixel boundaries at 1x, round caps, no fill, currentColor. Drawn
   from primitives rather than freehand curves, which is what stops one of
   four looking hand-made next to its neighbours. */

export function IconArrowOut() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  )
}

export function IconArrowIn() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12l7 7 7-7" />
    </svg>
  )
}

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

export function IconTransfer() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3L4 7l4 4" />
      <path d="M4 7h16" />
      <path d="M16 21l4-4-4-4" />
      <path d="M20 17H4" />
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
export function QuickAction({ to, icon, label, badge = 0 }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform duration-75"
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
              text-[10px] font-bold tabular-nums leading-none"
            aria-hidden="true"
          >
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 text-center leading-tight">
        {label}
      </span>
    </Link>
  )
}

/**
 * Six doors, below the accounts.
 *
 * This replaced two rectangles, which replaced three, and the shape is the
 * point: the home screen was cards all the way down, so a row of discs reads
 * as "things you do" against everything above and below being "things you
 * have". No card behind the row - boxing it would put the rectangle straight
 * back - though each disc IS the card material, so the row still belongs to
 * the same surface family as the panels around it.
 *
 * Six rather than four because four left 16px of air either side of every
 * disc in an 81px column. Six columns are 58px, which is a disc and its
 * breathing room and nothing spare.
 *
 * Order is deliberate. Goals, Debts and Recurring come first because none of
 * them has another entry point anywhere in the app - and Recurring's only
 * other home, the Upcoming rows, renders nothing at all on a week when
 * nothing is due. Expense, Inflow and Transfer follow, in the order the add
 * sheet lists them, because the FAB already reaches all three; here they are
 * one tap instead of two.
 *
 * Only the first three can carry a count, and that is not an oversight:
 * Goals, Debts and Bills are PLACES, and a place can have a backlog. Expense,
 * Inflow and Transfer are verbs - there is nothing waiting for you behind
 * them, so a badge there would have nothing to count.
 *
 * Every glyph is the accent, not red for Expense and green for Inflow the way
 * the add sheet colours them. Three hues among six discs would read as a
 * legend that means something, when the only thing being encoded is "these go
 * to different pages" - the labels already say that, and the destination
 * pages carry the semantics.
 */
export default function QuickActions({ counts = {} }) {
  return (
    // mt-8, not mt-5. Measured: mt-5 left 20px between the account cards and
    // the discs while the Budget heading below sat 32px away, and the eye
    // reads that as the row belonging to the carousel. 32px is the gap every
    // other section on this screen uses, so matching it makes the row a peer
    // rather than an appendix - and makes the space above and below it equal.
    <section className="px-5 mt-8">
      <div className="grid grid-cols-6 gap-1">
        <QuickAction to="/goals"     icon={<IconTarget />}    label="Goals"    badge={counts.goals} />
        <QuickAction to="/debts"     icon={<IconBanknote />}  label="Debts"    badge={counts.debts} />
        <QuickAction to="/recurring" icon={<IconRepeat />}    label="Bills"    badge={counts.bills} />
        <QuickAction to="/expense"   icon={<IconArrowOut />}  label="Expense" />
        <QuickAction to="/inflow"    icon={<IconArrowIn />}   label="Inflow" />
        <QuickAction to="/transfer"  icon={<IconTransfer />}  label="Transfer" />
      </div>
    </section>
  )
}
