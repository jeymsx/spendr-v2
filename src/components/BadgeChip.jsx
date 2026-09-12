import { useNavigate } from 'react-router-dom'
import { useBadges } from '../hooks/useBadges'

/**
 * The badges entry point in the dashboard header.
 *
 * ── Why it is not an IconButton ──
 *
 * Every other header control is a glyph inside a 36px disc, and that is right
 * for back, settings, sort and add: they are chrome, and chrome should be
 * uniform. This one is not chrome. It is the only header control that leads
 * somewhere you go for pleasure rather than to do a task, and a rosette inside
 * a circle is a picture of a badge rather than a badge.
 *
 * So the disc is gone and the SHAPE is the shield - wearing IconButton's own
 * `surface` paint (see .badge-chip-face in index.css) so it still has the
 * settings chip's weight sitting next to it, at the same 36px, on the same
 * baseline. Different silhouette, same material.
 *
 * ── The count is inside it ──
 *
 * A hexagon with nothing in it is decoration and gets ignored. The number is
 * the reason to tap: it says there is something here and that it has a size.
 * At zero it still shows "0" rather than hiding - a new user with no badges is
 * exactly who the invitation is for, and an icon that appears only once you
 * have already earned something can never tell you the feature exists.
 */
export default function BadgeChip({ className = '' }) {
  const navigate = useNavigate()
  const { earnedCount, total, loading } = useBadges()

  return (
    <button
      type="button"
      onClick={() => navigate('/badges')}
      aria-label={loading ? 'Badges' : `Badges, ${earnedCount} of ${total} earned`}
      className={[
        'relative w-9 h-9 shrink-0 grid place-items-center',
        'active:scale-90 transition-transform duration-75',
        className,
      ].join(' ')}
    >
      {/* The same hexagon the badges themselves wear, at 36px so it sits on
          IconButton's baseline. Corners rounded by the stroke rather than by
          the path - see HEX_OUTER in BadgeMark for why. The stroke is doing
          two jobs here, the radius and the hairline, so it cannot be thinned
          without squaring the corners off. */}
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true" className="absolute inset-0 m-auto">
        <polygon
          points="11,4 25,4 32,18 25,32 11,32 4,18"
          className="badge-chip-face"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
      </svg>

      {/* A hexagon is symmetric about both axes, so unlike the shield this
          needs no optical nudge - the box centre IS the centre. */}
      <span className="relative text-[12px] font-bold tabular-nums leading-none text-slate-600 dark:text-white">
        {loading ? '' : earnedCount}
      </span>
    </button>
  )
}
