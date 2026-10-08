import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import NotificationIcon from '../../components/NotificationIcon'
import WhatsNewModal from '../../components/WhatsNewModal'
import { groupByDay, timeOf } from '../../lib/notifications'
import { markRead } from '../../db/notifications'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import { Empty } from '../ui/display'
import Btn from '../ui/Button'
import { ICheck, IChevronRight } from '../ui/icons'
import useGettingStarted, { useShowChecklistParam } from '../../hooks/useGettingStarted'
import GettingStartedPanel from './GettingStartedPanel'

/** How long the page is open before what was new on arrival is marked read. */
const MARK_READ_AFTER_MS = 1200

/**
 * Notifications on a computer: every one, by day, in one panel - the page the
 * bell's panel (NotificationsPopover) opens with "See all". A row opens what
 * it is about; What's new opens its modal.
 *
 * As the phone's page (pages/Notifications): what was unread on arrival keeps
 * its dot and weight for the visit and is marked read after a moment, or on
 * leaving. "Mark all read" does it at once.
 */
export default function WebNotifications() {
  const navigate = useNavigate()
  const gettingStarted = useGettingStarted()
  // The help centre's way of bringing the list back (?checklist=show).
  useShowChecklistParam()
  const rows = useLiveQuery(() => db.notifications.orderBy('at').reverse().toArray(), [], undefined)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
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
  const unread = (rows ?? []).filter(n => !n.read).length

  /** @param {any} n */
  const open = (n) => {
    if (n.kind === 'whats-new') { setWhatsNewOpen(true); return }
    if (n.url) navigate(n.url)
  }
  const markAll = () => {
    const ids = (rows ?? []).filter(n => !n.read).map(n => n.id)
    if (ids.length) markRead(ids).catch(() => {})
    setNewIds(new Set())
  }

  return (
    <Page
      title="Notifications"
      subtitle={rows === undefined ? ' ' : newIds.size ? `${newIds.size} new` : `${(rows ?? []).length} in all`}
      width={980}
      actions={unread > 0 ? <Btn icon={<ICheck size={14} />} onClick={markAll}>Mark all read</Btn> : null}
    >
      {/* The Getting started list lives here, pinned above the news (lib/gettingStarted.js);
          done, it says so until it is put away. */}
      {gettingStarted.ready && <GettingStartedPanel gs={gettingStarted} className="mb-5" />}
      {rows && rows.length === 0 ? (
        <Panel>
          <Empty art="bell" title="You’re all caught up" body="Due dates, bills, budget alerts, badges and your monthly Wrapped show up here." />
        </Panel>
      ) : (
        <Panel flush>
          {groups.map(g => {
            const fresh = g.items.filter(n => newIds.has(n.id)).length
            return (
              <section key={g.heading} aria-label={g.heading}>
                <div className="d-notif-day">
                  <span>{g.heading}</span>
                  {fresh > 0 && <span className="d-ink font-semibold">{fresh} new</span>}
                </div>
                <ul>
                  {g.items.map(n => {
                    const isNew = newIds.has(n.id)
                    const goes = n.kind === 'whats-new' || !!n.url
                    return (
                      <li key={n.id}>
                        <button type="button" onClick={() => open(n)} className="d-notif-row" disabled={!goes}>
                          <NotificationIcon kind={n.kind} />
                          <span className="flex-1 min-w-0">
                            <span className={`block text-14 text-[var(--d-text)] ${isNew ? 'font-semibold' : 'font-medium'}`}>{n.title}</span>
                            {n.body && <span className="block mt-0.5 text-13 text-[var(--d-text-2)]">{n.body}</span>}
                          </span>
                          <span className="shrink-0 flex items-center gap-2 text-12 d-num text-[var(--d-text-3)]">
                            {isNew && <span className="w-2 h-2 rounded-full bg-[var(--d-accent)]" aria-hidden="true" />}
                            {timeOf(n.at)}
                            {goes && <IChevronRight size={14} />}
                          </span>
                          {isNew && <span className="sr-only">New</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </Panel>
      )}
      {whatsNewOpen && <WhatsNewModal onClose={() => setWhatsNewOpen(false)} />}
    </Page>
  )
}
