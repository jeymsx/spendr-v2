import { useId } from 'react'
import { useNavigate } from 'react-router-dom'
import IconButton from './ui/IconButton'
import { useBadges } from '../context/BadgeContext'

/**
 * The badges entry point in the dashboard header.
 *
 * ── A disc, like everything else up there ──
 *
 * It was a hexagon for a while, on the reasoning that this is the one header
 * control that leads somewhere you go for pleasure rather than to do a task,
 * so it should not look like chrome. That was true and it was still wrong: two
 * controls of different SHAPES sitting 6px apart read as a layout accident
 * before they read as a distinction. The uniform geometry is what makes a
 * header look deliberate.
 *
 * So the shape goes back to IconButton's disc and the difference moves into
 * colour and content, which is where a difference of KIND belongs.
 *
 * ── A picture, not a symbol, and not an emoji either ──
 *
 * There is a note in Dashboard about a raw U+26A0 that used to sit under a
 * drawn settings icon, and it is right in general: OS-font emoji beside
 * hand-drawn glyphs is exactly how a header stops matching itself.
 *
 * This one earns an exception to the monochrome rule, because everything
 * behind the button is full-colour artwork - ten glassy badges - so a flat
 * line icon is the thing that would misrepresent the destination. It does
 * NOT earn an exception to the drawn-glyph rule: it was a raw U+1F3C6 for a
 * while and that is a different picture on every platform, at a size and
 * weight nobody here chose. So it is drawn.
 *
 * ── The count did not survive, and that is fine ──
 *
 * The hexagon carried "6" because a bare hexagon is a shape nobody would tap.
 * A trophy is not: it says what it opens on its own, and the number was never
 * information you needed at a glance, only an invitation. It is the first
 * thing on the page one tap away, and it is still in the accessible name for
 * anyone who cannot see the trophy.
 */
export default function BadgeChip() {
  const navigate = useNavigate()
  const { earnedCount, total, loading } = useBadges()

  return (
    <IconButton
      label={loading ? 'Badges' : `Badges, ${earnedCount} of ${total} earned`}
      onClick={() => navigate('/badges')}
      /* `plain` carries no fill of its own, which is the only variant that can
         safely take one from here: cx is a plain joiner and Tailwind decides
         between two `bg-` utilities by stylesheet order, not class order, so
         layering amber over `surface` would win or lose at random. */
      variant="plain"
      /* The shadow and the inset are not decoration - they are what `surface`
         gives the settings chip beside it. Without them this disc sat flat
         against a lifted one, which is the same control looking like two. */
      className="bg-amber-100/80 border border-amber-200/70 shadow-sm
        dark:bg-amber-400/[0.14] dark:border-amber-400/[0.22]
        dark:shadow-[inset_0_1px_0_rgba(251,191,36,0.14)]"
    >
      <IconFire />
    </IconButton>
  )
}

/**
 * A flame, drawn.
 *
 * ── Hardcoded colour, on purpose ──
 *
 * Everything else in this app takes `currentColor` so one class answers both
 * themes and the accent preset. Fire is not a UI colour: it is the same red
 * whatever the accent is set to, the way a category's own colour and a bank's
 * gradient are. designcheck's raw-colour rule exempts exactly this case and
 * says why.
 *
 * ── Two tongues ──
 *
 * The first attempt was a smooth symmetric teardrop with a yellow core and it
 * read as a water drop. What makes a flame legible at 22px is the notch: two
 * licks of different heights, the taller one leaning. Drawn at 24 and checked
 * at 22 and 80 before it went anywhere near the header.
 *
 * The gradient IDs are per-instance. Two of these on one page - the phone
 * header and the desktop one - would otherwise both point at whichever
 * `<defs>` the document happened to define last.
 */
function IconFire() {
  // useId's colons are legal in an id and fine inside url(#...), but they are
  // not legal in a CSS selector, and a debugger that tries one should not be
  // the thing that breaks.
  const uid = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`f${uid}o`} x1="12" y1="1.2" x2="12" y2="22.8"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#dc2626" />
          <stop offset=".5" stopColor="#ef4444" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
        <linearGradient id={`f${uid}i`} x1="12" y1="9.6" x2="12" y2="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#fef08a" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#f${uid}o)`}
        d="M12.9 1.3c.6 3.6 2.8 5.4 4.5 7.5 1.7 2.1 2.7 4 2.7 6.4A8.1 8.1 0 0 1 3.9 15.2c0-2.2 1-3.7 2.4-5.2C8.1 8.1 9.6 6.3 9.4 3.6c1.3 1.3 2.2 2.2 2.4 3.4.5-2.2.8-4.2 1.1-5.7Z"
      />
      <path
        fill={`url(#f${uid}i)`}
        d="M12.6 9.6c.4 2.4 1.9 3.4 2.9 4.8.7 1 1 1.9 1 2.8a4.5 4.5 0 0 1-9 0c0-1.4.7-2.4 1.6-3.4 1-1.1 1.8-2.1 1.7-3.4.7.7 1.2 1.3 1.3 2 .2-1.2.3-2.1.5-2.8Z"
      />
    </svg>
  )
}
