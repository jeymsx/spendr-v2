import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import SubPage from '../components/SubPage'
import EmptyState from '../components/ui/EmptyState'
import Divider from '../components/ui/Divider'
import NotificationIcon, { BellGlyph } from '../components/NotificationIcon'
import WhatsNewModal from '../components/WhatsNewModal'
import { groupByDay, timeOf } from '../lib/notifications'
import { markRead } from '../db/notifications'

/** How long unread rows keep their dot on the way in, before they are marked read. */
const MARK_READ_AFTER_MS = 1200

/**
 * Everything the app has had to tell you, newest first, one group per day.
 *
 * Opening the page reads them: the bell's count goes. Rows that were unread
 * when you arrived keep their dot for as long as you stay, so you can still
 * tell which ones are new - marking them read is about the bell, not about
 * pretending you have seen them.
 */
export default function Notifications() {
  const navigate = useNavigate()
  const rows = useLiveQuery(() => db.notifications.orderBy('at').reverse().toArray(), [], undefined)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)

  /* The ids that were unread on arrival - read once, before anything is
     marked, so they keep their dot for the whole visit. Then those, and only
     those, are marked read: after a moment on the page, or on leaving it,
     whichever comes first - a tap on the top row inside that moment has
     still seen the list. */
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

  const groups = useMemo(() => groupByDay(rows ?? [], new Date()), [rows])

  /** @param {NotificationRow} n */
  const open = (n) => {
    if (n.kind === 'whats-new') { setWhatsNewOpen(true); return }
    if (n.url) navigate(n.url)
  }

  return (
    <SubPage title="Notifications">
      {rows && rows.length === 0 && (
        <EmptyState
          className="mt-10"
          icon={<BellGlyph size={24} />}
          title="You're all caught up"
          body="Card due dates, bills, budget alerts and your monthly recap will show up here."
        />
      )}

      {groups.map((g, gi) => (
        <section key={g.heading} aria-label={g.heading}>
          {gi > 0 && <Divider inset="gutter" className="mt-2" />}
          <h2 className="px-5 pt-5 pb-1 text-13 font-semibold text-slate-500 dark:text-slate-400">
            {g.heading}
          </h2>
          <ul>
            {g.items.map(n => {
              const isNew = newIds.has(n.id)
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => open(n)}
                    className="w-full flex items-start gap-4 px-5 py-3 text-left
                      active:bg-slate-100 dark:active:bg-white/[0.04] transition-colors"
                  >
                    <NotificationIcon kind={n.kind} />
                    <span className="flex-1 min-w-0 pt-0.5">
                      <span className={`block text-15 leading-snug text-slate-900 dark:text-white ${isNew ? 'font-semibold' : 'font-medium'}`}>
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="block mt-0.5 text-14 leading-snug text-slate-600 dark:text-slate-300">
                          {n.body}
                        </span>
                      )}
                      <span className="block mt-1 text-12 text-slate-500 dark:text-slate-400 tabular-nums">
                        {timeOf(n.at)}
                      </span>
                    </span>
                    {isNew && (
                      <>
                        <span className="mt-2 w-2 h-2 rounded-full bg-primary shrink-0" aria-hidden="true" />
                        <span className="sr-only">New</span>
                      </>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {whatsNewOpen && <WhatsNewModal onClose={() => setWhatsNewOpen(false)} />}
    </SubPage>
  )
}
