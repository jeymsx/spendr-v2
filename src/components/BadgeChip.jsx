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
 * ── An emoji, on purpose ──
 *
 * There is a note in Dashboard about a raw U+26A0 that used to sit under a
 * drawn settings icon, and it is right in general: OS-font emoji beside
 * hand-drawn glyphs is exactly how a header stops matching itself.
 *
 * This one earns the exception. Everything behind this button is full-colour
 * raster artwork - ten glassy badges - so a flat monochrome line icon is the
 * thing that would misrepresent the destination. The trophy is the only glyph
 * in the header that is a picture rather than a symbol, and so is everything
 * it opens.
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
      {/* leading-none and a nudge: emoji sit on their own baseline inside the
          line box, so a bare one lands a pixel or two low in a flex centre. */}
      <span className="text-17 leading-none -mt-px" aria-hidden="true">🏆</span>
    </IconButton>
  )
}
