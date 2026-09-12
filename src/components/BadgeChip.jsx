import { useNavigate } from 'react-router-dom'
import { useBadges } from '../context/BadgeContext'

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
          IconButton's baseline.

          Points at top and bottom with flat vertical sides, matching the
          rendered artwork - which came back in that orientation rather than
          the flat-top one this was first drawn in. A chip that does not match
          the thing it opens is a chip that has to be explained. Proportions
          follow the art too: 280 x 332 there is 30 x 36 here.

          Corners are rounded by the stroke rather than by the path - see
          HEX_OUTER in BadgeMark. The stroke does two jobs, the radius and the
          hairline, so thinning it squares the corners off. */}
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true" className="absolute inset-0 m-auto">
        <polygon
          points="18,4 30,11 30,25 18,32 6,25 6,11"
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
