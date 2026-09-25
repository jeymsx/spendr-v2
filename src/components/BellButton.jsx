import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import IconButton from './ui/IconButton'
import { BellGlyph } from './NotificationIcon'

/**
 * The notifications entry point in the dashboard header.
 *
 * The same disc as Settings beside it, so the pair reads as one row. The
 * count is the only thing that differs, and it only appears when there is
 * something unread - capped at 9+, because past that the number stops being
 * information and starts being a reproach.
 *
 * It took the badges trophy's place. Badges are still one tap from Settings,
 * and a new one now arrives here as a notification, which is where news
 * belongs.
 */
export default function BellButton() {
  const navigate = useNavigate()
  const unread = useLiveQuery(() => db.notifications.where('read').equals(0).count(), [], 0)
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'

  return (
    <span className="relative inline-flex">
      <IconButton label={label} onClick={() => navigate('/notifications')}>
        <BellGlyph />
      </IconButton>
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1
            rounded-full bg-red-500 text-white text-10 font-semibold leading-[18px] text-center tabular-nums
            ring-2 ring-slate-50 dark:ring-slate-950"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </span>
  )
}
