import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import SubPage from '../components/SubPage'
import Card from '../components/ui/Card'
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
 *
 * ── Laid out as the ledger is ──
 *
 * A day's heading over a hairline, and the day's rows in one card, each led
 * by a 40px tile - Transactions' shape, so the two lists read as one app.
 * Where a ledger row is one line and an amount, a notification is a title
 * and a sentence, so the rows wrap rather than cut, and the time takes the
 * amount's place at the top right.
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

      {groups.map(g => {
        const fresh = g.items.filter(n => newIds.has(n.id)).length
        return (
          <section key={g.heading} aria-label={g.heading} className="mb-1">
            <div className="flex items-center gap-3 px-5 py-2">
              <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {g.heading}
              </h2>
              <Divider className="flex-1" />
              {/* In the accent's ink, as the rows' dots are: a light accent's
                  own fill is 1.6:1 on white. */}
              {fresh > 0 && (
                <span className="text-11 font-semibold accent-ink tabular-nums whitespace-nowrap">
                  {fresh} new
                </span>
              )}
            </div>

            <Card clip className="mx-5">
              <ul>
                {g.items.map((n, i) => {
                  const isNew = newIds.has(n.id)
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => open(n)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left
                          active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
                      >
                        <NotificationIcon kind={n.kind} />
                        {/* Two lines of text are 36px beside a 40px tile: the
                            2px down centres them on it, and a longer row
                            grows from the tile's top edge. A title alone is
                            centred on the tile outright. */}
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
                            <span className="block mt-0.5 text-12 leading-snug text-slate-500 dark:text-slate-400 break-words">
                              {n.body}
                            </span>
                          )}
                        </span>
                        {isNew && <span className="sr-only">New</span>}
                      </button>
                      {/* Under the text, not under the tile, as the ledger's are. */}
                      {i < g.items.length - 1 && <Divider inset="glyph" />}
                    </li>
                  )
                })}
              </ul>
            </Card>
          </section>
        )
      })}

      {whatsNewOpen && <WhatsNewModal onClose={() => setWhatsNewOpen(false)} />}
    </SubPage>
  )
}
