/**
 * The pieces the goals screens share: the ring, the account rail, and the
 * formatters all three of them need.
 *
 * Goals is three views now - the grid, one goal's page, and the form - and
 * they have to agree about what a goal looks like. A ring drawn slightly
 * differently on the detail page than on the grid is exactly the kind of
 * drift that makes a app feel assembled rather than designed.
 */
import { useEffect, useRef } from 'react'
import { AccountChip } from '../../components/AccountPickerSheet'
import { cx } from '../../components/ui/cx'
import { fmtCompact } from '../../lib/money'
import Rail from '../../components/ui/Rail'

// ── Money and dates ──────────────────────────────────────────────────────────



const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Jun 2027". A goal's date is a month you are aiming at, not a day. */
export function fmtTargetDate(iso) {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

/** "Wed, 30 Jun 2027", for the one place with room to spell it out. */
export function fmtDateFull(iso) {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-PH', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ── Icons ────────────────────────────────────────────────────────────────────

export function IconPlus() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconCheck({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

export function IconGrip() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
    </svg>
  )
}

/** Two stacked arrows: the verb is "reorder", not "sort A-Z". */
export function IconReorder() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
    </svg>
  )
}

// ── The ring ─────────────────────────────────────────────────────────────────

/**
 * A goal's progress, as a circle.
 *
 * ── Why a ring and not the bar it replaces ──
 *
 * A bar is a good way to read one number and a bad way to read eight: a
 * column of them is eight parallel lines whose only difference is where they
 * stop, so the page reads as a table and you have to compare left edges to
 * get anything out of it. A ring encloses the thing it measures, which means
 * a goal can be an OBJECT on the screen - an icon in a circle - instead of a
 * row in a list. Twelve of those tile into a grid; twelve bars cannot.
 *
 * ── Drawn in pixels, not in a fixed viewBox ──
 *
 * The tempting version uses `viewBox="0 0 100 100"` and scales. That makes
 * the stroke scale too, so the 168px ring on the detail page comes out with a
 * stroke half again as heavy as the 116px one on the grid, and the two stop
 * looking like the same component. Here the caller passes both numbers and
 * the geometry is computed from them, so the detail ring is the grid ring,
 * larger.
 *
 * ── Complete is a different hue, not a fuller circle ──
 *
 * The same rule the old bar followed. Scanning a grid, "done" has to be
 * legible without reading the number inside it, and 100% of an accent ring
 * looks a lot like 94% of one.
 */
export function GoalRing({
  pct = 0,
  size = 116,
  stroke = 8,
  complete = false,
  /* Archived. Its ring is history, so it is drawn in ink rather than accent -
     a grey circle does not compete with the live goals above it. */
  muted = false,
  className = '',
  children,
}) {
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, pct ?? 0))
  const mid = size / 2

  return (
    <span
      className={cx('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block" aria-hidden="true">
        <circle
          cx={mid} cy={mid} r={r} fill="none" strokeWidth={stroke} stroke="currentColor"
          className="text-slate-200/90 dark:text-white/[0.07]"
        />
        {/* Nothing at zero. A round cap on a zero-length dash still paints a
            dot in some engines, and a dot at twelve o'clock reads as "just
            started" on a goal that has not. */}
        {p > 0 && (
          <circle
            cx={mid} cy={mid} r={r} fill="none" strokeWidth={stroke} stroke="currentColor"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - p / 100)}
            transform={`rotate(-90 ${mid} ${mid})`}
            /* Transitions CHANGES only - the first paint has no previous
               offset to travel from. Which is the behaviour we want: the ring
               is a fact about your balance, not an animation to sit through,
               but when a transfer moves it the arc should sweep rather than
               jump. */
            style={{ transition: 'stroke-dashoffset 520ms cubic-bezier(0.4, 0, 0.2, 1)' }}
            className={
              muted ? 'text-slate-300 dark:text-slate-600'
              : complete ? 'text-emerald-500'
              : 'text-primary'
            }
          />
        )}
      </svg>

      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {children}
      </span>
    </span>
  )
}

// ── Picking the accounts that fund a goal ────────────────────────────────────

/**
 * The accounts a goal draws on, as a scrolling row of their own card faces.
 *
 * ── Why cards and not a wrap of name chips ──
 *
 * This is the one field on the form that is about YOUR accounts rather than
 * about the goal, and everywhere else in the app an account is a card you
 * recognise by its face - the home carousel, the Accounts tab, the picker
 * sheet, the reconciliation list two screens away. Picking one from a row of
 * text chips meant recognising by name something you have only ever navigated
 * by colour.
 *
 * ── Why it scrolls instead of wrapping ──
 *
 * A wrap grows a row for every account you own, so this was the one field
 * whose height depended on your data - at eight accounts it pushed the target
 * date off the bottom of the sheet. One line that scrolls is the same idiom
 * the account form's parent picker uses, and the negative margin lets it run
 * to both screen edges so the overflow is visible rather than clipped mid-card.
 */
export function AccountPickRail({
  accounts, picked, onToggle,
  /**
   * Changes when the rail becomes visible - the form passes the goal's id on
   * open. Without it the rail opens at Cash while the two accounts the goal
   * actually uses sit off the right edge, so editing a goal starts by showing
   * you none of its answer. Not a mount effect: the sheet keeps this mounted
   * between openings.
   */
  revealOn = null,
}) {
  const railRef = useRef(null)
  /* Which `revealOn` has already been scrolled to. Two jobs at once.

     It waits. Child effects run before their parent's, and the parent is
     what hydrates `picked` when the sheet opens - so on the opening commit
     this ran while every tile was still unselected, found nothing to reveal,
     and never got another chance. Now a miss simply leaves the latch unset
     and the next render tries again.

     And it stops. `picked` is in the deps so the retry happens, which means
     this also fires on every tick and untick; without the latch the rail
     would scroll itself back to the first selection while you are choosing
     the fourth. */
  const revealedFor = useRef(null)

  useEffect(() => {
    if (!revealOn) { revealedFor.current = null; return }
    if (revealedFor.current === revealOn) return
    const rail = railRef.current
    const first = rail?.querySelector('[data-picked="true"]')
    if (!rail || !first) return
    revealedFor.current = revealOn
    /* Measured, not scrollIntoView. That walks every scrollable ancestor, so
       revealing a card in here would also scroll the sheet body it sits in -
       the form would open somewhere down its own middle. 20px lands the tile
       on the rail's own gutter rather than flush against the screen. */
    rail.scrollLeft +=
      first.getBoundingClientRect().left - rail.getBoundingClientRect().left - 20
  }, [revealOn, picked])

  return (
    <Rail ref={railRef} className="gap-2.5 -mx-5 px-5 py-1">
      {accounts.map(a => {
        const on = picked.includes(a.name)
        return (
          <button
            key={a.name}
            onClick={() => onToggle(a.name)}
            aria-pressed={on}
            data-picked={on ? 'true' : undefined}
            className={cx(
              'relative shrink-0 w-[122px] rounded-2xl p-2.5 text-left',
              'border transition-colors duration-100 active:scale-[0.97]',
              on
                ? 'border-primary bg-primary/[0.07] dark:bg-primary/[0.12]'
                : 'border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.04]',
            )}
          >
            <AccountChip acct={a} />

            {/* Inside the padding rather than straddling the corner: a disc
                that overlaps the border needs a ring in the panel's own
                colour to punch through it, and this rail appears on two
                surfaces. The top right of the tile is empty anyway. */}
            <span
              className={cx(
                'absolute top-2.5 right-2.5 w-[18px] h-[18px] rounded-full',
                'flex items-center justify-center transition-colors duration-100',
                on
                  ? 'bg-primary text-white'
                  : 'border border-slate-200 dark:border-white/[0.12]',
              )}
              aria-hidden="true"
            >
              {on && <IconCheck size={10} />}
            </span>

            <span className="mt-2 block truncate text-[12px] font-semibold text-slate-800 dark:text-white">
              {a.name}
            </span>
            <span className="mt-0.5 block truncate text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
              {fmtCompact(a.balance ?? 0)}
            </span>
          </button>
        )
      })}
    </Rail>
  )
}
