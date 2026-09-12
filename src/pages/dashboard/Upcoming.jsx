import { useNavigate } from 'react-router-dom'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import { fmt } from '../../lib/money'
import { fmtCompact } from './shared'
import { SectionHeader } from './Tiles'

// ── Upcoming ───────────────────────────────────────────────────────────────────

/**
 * "Tomorrow", "Today", or a date. Relative wording only where it is genuinely
 * more useful than the date itself - past three days out, "in 5 days" is more
 * arithmetic than "Sep 15".
 */
export function fmtUpcoming(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  const days = Math.round((d - today) / 864e5)
  if (days < 0)  return 'Overdue'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 6)  return d.toLocaleDateString('en-PH', { weekday: 'long' })
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

/** Circular arrows: this charge comes back every month. */
export function IconRepeatBadge() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11a9 9 0 0 1 15-5l3 3M21 13a9 9 0 0 1-15 5l-3-3" />
      <path d="M21 3v6h-6M3 21v-6h6" />
    </svg>
  )
}

/** A calendar leaf: this one falls due on a date rather than repeating. */
export function IconDueBadge() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

/**
 * One committed-but-not-yet-real charge.
 *
 * Same metrics as TxRow - 40px icon, same paddings, same type scale - so it
 * reads as the same kind of object. What differs is the weight: the name is
 * slate-600 where a real transaction is slate-800, and the amount is neutral
 * rather than red, because nothing has left the account yet. Colouring an
 * unspent peso red would be the same lie as counting it.
 *
 * The fade is done with muted COLOURS rather than a container opacity on
 * purpose. `opacity-60` over white drops slate-800 to about 4.3:1, under the
 * 4.5:1 floor; slate-600 and slate-500 are 7.6:1 and 4.8:1 and look just as
 * recessive next to full-strength rows.
 */
export function UpcomingRow({ item, isLast }) {
  const navigate = useNavigate()
  const overdue = fmtUpcoming(item.date) === 'Overdue'
  return (
    <>
    <button
      onClick={() => navigate(item.to)}
      className="w-full text-left flex items-center gap-3 px-4 py-3.5
        active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
    >
      <span className="relative shrink-0">
        <span
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-base opacity-70"
          style={{ backgroundColor: (item.color ?? '#2D9DFF') + '18' }}
          aria-hidden="true"
        >
          {item.icon}
        </span>
        {/* Bottom-right, overlapping the corner, ringed in the row's own
            background so it reads as punched out rather than stuck on. The
            ring colour lives in index.css next to the .card rules it is
            derived from - see .upcoming-badge. */}
        <span className="upcoming-badge absolute -bottom-0.5 -right-0.5 w-[15px] h-[15px]
          rounded-full flex items-center justify-center">
          {item.kind === 'recurring' ? <IconRepeatBadge /> : <IconDueBadge />}
        </span>
      </span>

      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-slate-600 dark:text-slate-300 truncate">
          {item.name}
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
          <span className={overdue ? 'text-red-500 dark:text-red-400 font-semibold' : ''}>
            {fmtUpcoming(item.date)}
          </span>
          {item.meta ? ` · ${item.meta}` : ''}
        </span>
      </span>

      <span className="text-sm font-semibold tabular-nums shrink-0 text-slate-500 dark:text-slate-400">
        −{fmt(item.amount)}
      </span>
    </button>
    {!isLast && <Divider inset="glyph" />}
    </>
  )
}

/**
 * Renders nothing when there is nothing coming.
 *
 * A home screen carrying an empty "Upcoming — no upcoming payments" panel
 * spends a section's worth of space saying that a section is not needed.
 */
export default function UpcomingSection({ items }) {
  if (!items?.length) return null
  const total = items.reduce((sum, i) => sum + (i.amount ?? 0), 0)
  return (
    <section className="px-5 mt-8">
      {/* Headed like Accounts, Budget and Recent, because it is the same kind
          of thing: a top-level block of this screen.
 
          It started as small caps, copied from the reference app -
          but there, "UPCOMING" is a group divider INSIDE one continuous
          transaction list, a peer of "THU, 20 JUL". Borrowing that
          typography for a standalone card borrowed the wrong hierarchy, and
          sitting directly under the Budget block it read as a sub-part of
          it rather than a section in its own right. */}
      <SectionHeader
        title="Upcoming"
        right={
          /* The total covers the rows on screen, not every future bill - a
             figure that disagreed with the two rows under it would be worse
             than no figure at all. */
          <span className="text-[13px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
            −{fmtCompact(total)}
          </span>
        }
      />
      <Card clip className="mt-3">
        {items.map((item, i) => (
          <UpcomingRow key={item.key} item={item} isLast={i === items.length - 1} />
        ))}
      </Card>
    </section>
  )
}
