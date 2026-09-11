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
 * A shield with nothing in it is decoration and gets ignored. The number is
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
      {/* 36x36 box, 32x36 shield centred in it - the taper needs the full
          height, and matching IconButton's 36 on BOTH axes would either
          squash the point or push the shoulders wider than the disc. */}
      <svg width="36" height="36" viewBox="0 0 32 36" fill="none" aria-hidden="true" className="absolute inset-0 m-auto">
        <path
          d="M2 8a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v10c0 7.5-4.7 12.4-14 16C6.7 30.4 2 25.5 2 18z"
          className="badge-chip-face"
          strokeWidth="1"
        />
      </svg>

      {/* Nudged up 1px: the shield's optical centre sits above its box centre,
          because everything below the shoulders narrows to a point. */}
      <span className="relative -mt-px text-[12px] font-bold tabular-nums leading-none text-slate-600 dark:text-white">
        {loading ? '' : earnedCount}
      </span>
    </button>
  )
}
