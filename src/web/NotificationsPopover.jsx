import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import Divider from '../components/ui/Divider'
import NotificationIcon from '../components/NotificationIcon'
import WhatsNewModal from '../components/WhatsNewModal'
import { groupByDay, timeOf } from '../lib/notifications'
import { markRead } from '../db/notifications'
import useGettingStarted from '../hooks/useGettingStarted'
import { GoalRing } from '../pages/goals/shared'
import { IconChevronRight } from '../components/icons'

/** How many of the newest it shows; "See all" opens the rest. */
const SHOWN = 12
/** As on the Notifications page: unread rows keep their dot this long before they are marked read. */
const MARK_READ_AFTER_MS = 1200

/**
 * The bell's notifications on a computer: a panel dropping from the bell, as
 * a Mac app's would, rather than a whole page in place of Home.
 *
 * The newest dozen, laid out as the Notifications page lays them out (a
 * day's heading, a tile, a title and its sentence) and read the same way:
 * the ones unread on opening keep their dot while it is open, and are marked
 * read after a moment or on closing. "See all" goes to the page.
 *
 * Closes on Escape, a click outside it - the bell's own click toggles it,
 * so that is not outside (`data-bell`) - and on picking a row.
 *
 * @param {{onClose: () => void}} props
 */
export default function NotificationsPopover({ onClose }) {
  const navigate = useNavigate()
  const gettingStarted = useGettingStarted()
  const panel = useRef(/** @type {HTMLDivElement|null} */ (null))
  const rows = useLiveQuery(() => db.notifications.orderBy('at').reverse().limit(SHOWN).toArray(), [], undefined)
  const total = useLiveQuery(() => db.notifications.count(), [], 0)
  const [whatsNew, setWhatsNew] = useState(false)

  // The ids unread on opening, read once before anything is marked (see Notifications.jsx).
  const [newIds, setNewIds] = useState(/** @type {Set<string>} */ (new Set()))
  useEffect(() => {
    let live = true
    let timer = 0
    /** @type {string[]} */
    let seen = []
    const mark = () => { clearTimeout(timer); if (seen.length) markRead(seen).catch(() => {}); seen = [] }
    db.notifications.where('read').equals(0).primaryKeys().then(keys => {
      if (!live) return
      seen = /** @type {string[]} */ (keys)
      setNewIds(new Set(seen))
      timer = window.setTimeout(mark, MARK_READ_AFTER_MS)
    })
    return () => { live = false; mark() }
  }, [])

  useEffect(() => {
    if (whatsNew) return
    panel.current?.focus({ preventScroll: true })
    const onDown = (/** @type {MouseEvent} */ e) => {
      const t = /** @type {Element} */ (e.target)
      if (panel.current?.contains(t) || t.closest?.('[data-bell]')) return
      onClose()
    }
    const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [whatsNew, onClose])

  const groups = useMemo(() => groupByDay(rows ?? [], new Date()), [rows])

  /** @param {NotificationRow} n */
  const open = (n) => {
    if (n.kind === 'whats-new') { setWhatsNew(true); return }
    onClose()
    if (n.url) navigate(n.url)
  }

  if (whatsNew) return <WhatsNewModal onClose={onClose} />

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Notifications"
      tabIndex={-1}
      className="web-bell-pop card-solid absolute right-0 top-full mt-2 z-50 w-[380px] rounded-2xl outline-none flex flex-col text-left"
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <h2 className="text-15 font-semibold text-slate-900 dark:text-white">Notifications</h2>
        {total > 0 && (
          <button
            type="button"
            onClick={() => { onClose(); navigate('/notifications') }}
            className="text-13 font-semibold accent-ink hover:underline underline-offset-2"
          >
            See all{total > SHOWN ? ` ${total}` : ''}
          </button>
        )}
      </div>
      <Divider />

      {/* Getting started, pinned above the news while it is unfinished
          (lib/gettingStarted.js). In full on the Notifications page, so this goes there. */}
      {gettingStarted.on && !gettingStarted.complete && (
        <div className="px-1.5 pt-1.5">
          <button
            type="button"
            onClick={() => { onClose(); navigate('/notifications') }}
            className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-left bg-primary/[0.06] dark:bg-primary/[0.10]
              hover:bg-primary/[0.10] dark:hover:bg-primary/[0.14] focus-visible:bg-primary/[0.10] outline-none transition-colors duration-100"
          >
            <GoalRing pct={(gettingStarted.doneCount / gettingStarted.total) * 100} size={40} stroke={4}>
              <span className="text-10 font-bold tabular-nums text-slate-900 dark:text-white">{gettingStarted.doneCount}/{gettingStarted.total}</span>
            </GoalRing>
            <span className="flex-1 min-w-0">
              <span className="block text-13 font-semibold text-slate-800 dark:text-slate-100">Getting started</span>
              <span className="block mt-0.5 text-12 text-slate-500 dark:text-slate-400 truncate">
                {gettingStarted.next ? `Next: ${gettingStarted.next.title}` : `${gettingStarted.doneCount} of ${gettingStarted.total} done`}
              </span>
            </span>
            <span className="text-slate-400 dark:text-slate-500 shrink-0"><IconChevronRight size={16} /></span>
          </button>
        </div>
      )}

      <div className="overflow-y-auto overscroll-contain max-h-[min(540px,70vh)] pb-1.5">
        {rows && rows.length === 0 && (
          <div className="px-6 py-10 text-center">
            <p className="text-13 font-semibold text-slate-800 dark:text-slate-100">You&rsquo;re all caught up</p>
            <p className="mt-1 text-12 text-slate-500 dark:text-slate-400 text-balance">Due dates, bills, budget alerts, badges and your monthly Wrapped show up here.</p>
          </div>
        )}
        {groups.map(g => (
          <section key={g.heading} aria-label={g.heading}>
            <h3 className="px-4 pt-3 pb-1 text-11 font-semibold text-slate-500 dark:text-slate-400">{g.heading}</h3>
            <ul className="px-1.5">
              {g.items.map(n => {
                const isNew = newIds.has(n.id)
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => open(n)}
                      className="w-full flex items-start gap-3 px-2.5 py-2.5 rounded-xl text-left
                        hover:bg-slate-100 dark:hover:bg-white/[0.06] focus-visible:bg-slate-100 dark:focus-visible:bg-white/[0.06]
                        outline-none transition-colors duration-100"
                    >
                      <NotificationIcon kind={n.kind} />
                      <span className={`flex-1 min-w-0 ${n.body ? 'pt-0.5' : 'self-center'}`}>
                        <span className="flex items-start justify-between gap-3">
                          <span className={`min-w-0 break-words text-13 leading-snug text-slate-800 dark:text-slate-100 ${isNew ? 'font-semibold' : 'font-medium'}`}>
                            {n.title}
                          </span>
                          <span className="shrink-0 flex items-center gap-1.5 h-[18px] text-10 text-slate-500 dark:text-slate-400 tabular-nums">
                            {isNew && <span className="w-2 h-2 rounded-full bg-current accent-ink" aria-hidden="true" />}
                            {timeOf(n.at)}
                          </span>
                        </span>
                        {n.body && (
                          <span className="block mt-0.5 text-12 leading-snug text-slate-500 dark:text-slate-400 break-words line-clamp-2">
                            {n.body}
                          </span>
                        )}
                      </span>
                      {isNew && <span className="sr-only">New</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
