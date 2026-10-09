import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import SubPage from '../../components/SubPage'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import Button from '../../components/ui/Button'
import Segmented from '../../components/ui/Segmented'
import EmptyState from '../../components/ui/EmptyState'
import { useIsDeveloper } from '../../hooks/useIsDeveloper'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  deleteFeedback, describeDevice, kindLabel, listFeedback, markFeedback, replyLink,
} from '../../lib/feedback'

/** How long a deleted report can be put back before it is gone for good. */
const UNDO_MS = 6000

const KIND_TONE = {
  bug: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  idea: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  other: 'bg-slate-100 text-slate-600 dark:bg-white/[0.08] dark:text-slate-300',
}

/** Anything as plain text, for what came from the cloud: a row can be written by hand. @param {unknown} v */
const text = (v) => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v))
/** "Oct 9, 2026". @param {string} iso */
const dayOf = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
/** "8:41 PM". @param {string} iso */
const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

/**
 * Every report and idea people have sent from Report a bug, for the person who
 * makes Spendr: what they wrote, who they are, the version and device, and the
 * errors their device had noticed when they chose to send them.
 *
 * The developer's alone (lib/developer.js) - in the app as in the database,
 * where nobody else's account can read a row that is not their own
 * (034_feedback.sql). New until marked done; deleting one waits a moment for
 * Undo, the way Recently deleted's Delete does.
 */
export default function FeedbackPage() {
  const developer = useIsDeveloper()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState(/** @type {import('../../lib/feedback').FeedbackRow[]|null} */ (null))
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState(/** @type {'new'|'done'} */ ('new'))
  /** Deletes waiting out their Undo, by id. */
  const [pending] = useState(() => /** @type {Map<number, ReturnType<typeof setTimeout>>} */ (new Map()))

  const load = useCallback(async () => {
    try {
      const all = await listFeedback()
      setRows(all.filter(r => !pending.has(r.id)))
      setLoadError('')
    } catch {
      setLoadError('Could not load reports. Check your connection.')
      setRows(prev => prev ?? [])
    }
  }, [pending])

  // On opening, and whenever the app comes back to the front: new ones may have come in.
  useEffect(() => {
    if (!developer || !user) return
    // A request to the cloud whose answer is the state: an effect is where it belongs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [developer, user, load])

  // Leaving the page does what was asked: a delete waiting on Undo goes now.
  useEffect(() => () => {
    for (const [id, timer] of pending) { clearTimeout(timer); deleteFeedback(id).catch(() => {}) }
    pending.clear()
  }, [pending])

  const shown = useMemo(() => (rows ?? []).filter(r => r.status === tab), [rows, tab])
  const counts = useMemo(() => ({
    new: (rows ?? []).filter(r => r.status === 'new').length,
    done: (rows ?? []).filter(r => r.status === 'done').length,
  }), [rows])
  const days = useMemo(() => {
    /** @type {Array<{day: string, items: import('../../lib/feedback').FeedbackRow[]}>} */
    const out = []
    for (const r of shown) {
      const day = dayOf(r.created_at)
      const last = out[out.length - 1]
      if (last?.day === day) last.items.push(r)
      else out.push({ day, items: [r] })
    }
    return out
  }, [shown])

  if (!developer) return <Navigate to="/settings" replace />

  /** @param {import('../../lib/feedback').FeedbackRow} r */
  async function toggleDone(r) {
    const done = r.status !== 'done'
    setRows(prev => (prev ?? []).map(x => (x.id === r.id ? { ...x, status: done ? 'done' : 'new' } : x)))
    try {
      await markFeedback(r.id, done)
    } catch {
      setRows(prev => (prev ?? []).map(x => (x.id === r.id ? r : x)))
      showToast('Could not save that. Try again.', 'error')
    }
  }

  /** @param {import('../../lib/feedback').FeedbackRow} r */
  function remove(r) {
    setRows(prev => (prev ?? []).filter(x => x.id !== r.id))
    const timer = setTimeout(() => {
      pending.delete(r.id)
      deleteFeedback(r.id).catch(() => {
        setRows(prev => [...(prev ?? []), r].sort((a, b) => b.created_at.localeCompare(a.created_at)))
        showToast('Could not delete it. Try again.', 'error')
      })
    }, UNDO_MS)
    pending.set(r.id, timer)
    showToast('Report deleted', 'success', {
      actionLabel: 'Undo',
      duration: UNDO_MS,
      onAction: () => {
        clearTimeout(pending.get(r.id))
        pending.delete(r.id)
        setRows(prev => [...(prev ?? []), r].sort((a, b) => b.created_at.localeCompare(a.created_at)))
      },
    })
  }

  return (
    <SubPage title="Bug reports & ideas">
      {!user ? (
        <EmptyState art="cloud" title="Sign in to read reports" body="They are kept in the cloud, under your account." />
      ) : (
        <>
          <div className="mx-5 mt-1 mb-4">
            <Segmented
              options={[
                { value: 'new', label: counts.new ? `New · ${counts.new}` : 'New' },
                { value: 'done', label: counts.done ? `Done · ${counts.done}` : 'Done' },
              ]}
              value={tab}
              onChange={v => setTab(/** @type {'new'|'done'} */ (v))}
            />
          </div>

          {loadError && <p role="alert" className="mx-5 mb-3 text-13 font-medium text-red-600 dark:text-red-400">{loadError}</p>}

          {rows === null ? (
            <p className="mx-5 py-10 text-center text-13 text-slate-500 dark:text-slate-400">Loading…</p>
          ) : !days.length ? (
            tab === 'new'
              ? <EmptyState art="allClear" tone="good" title="Nothing new" body="Reports and ideas people send show up here." />
              : <EmptyState art="note" title="Nothing done yet" body="Mark a report done once you have dealt with it." />
          ) : days.map(({ day, items }) => (
            <section key={day} aria-label={day} className="mb-3">
              <div className="flex items-center gap-3 px-5 py-2">
                <h2 className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{day}</h2>
                <Divider className="flex-1" />
              </div>
              <Card clip className="mx-5">
                {items.map((r, i) => (
                  <Report key={r.id} r={r} first={i === 0} onToggle={() => toggleDone(r)} onDelete={() => remove(r)} />
                ))}
              </Card>
            </section>
          ))}
          <div className="h-6" />
        </>
      )}
    </SubPage>
  )
}

/**
 * One report: its kind, who sent it and when, what they wrote, where from,
 * and the errors their device sent with it.
 *
 * @param {{r: import('../../lib/feedback').FeedbackRow, first: boolean, onToggle: () => void, onDelete: () => void}} props
 */
function Report({ r, first, onToggle, onDelete }) {
  const [showLog, setShowLog] = useState(false)
  /* As text, whatever arrived: a row can be written by hand straight to the
     cloud, not only by the app, and an entry that is not an object, or a field
     that is not text, used to take this whole page down. */
  const log = (Array.isArray(r.error_log) ? r.error_log : [])
    .filter(e => e && typeof e === 'object' && !Array.isArray(e))
    .map(e => ({
      message: text(e.message), where: text(e.where), route: text(e.route), version: text(e.version),
      last: text(e.last), stack: text(e.stack), count: Number(e.count) || 1,
    }))
  const reply = replyLink(r)
  const where = [r.app_version ? `v${r.app_version}` : '', describeDevice(r.device)].filter(Boolean).join(' · ')
  return (
    <article className={`px-4 py-3.5 ${first ? '' : 'border-t border-slate-100 dark:border-white/[0.07]'}`}>
      <div className="flex items-center gap-2">
        <span className={`text-11 font-semibold px-2 py-0.5 rounded-full ${KIND_TONE[r.kind] ?? KIND_TONE.other}`}>{kindLabel(r.kind)}</span>
        {/* The address, always: it is the account's own, while the name is
            whatever its owner has set it to be. */}
        <span className="flex-1 min-w-0 truncate text-13 text-slate-500 dark:text-slate-400">
          {r.sender_name && <span className="font-semibold text-slate-800 dark:text-slate-100">{text(r.sender_name)} </span>}
          {text(r.sender_email) || (r.sender_name ? '' : 'Someone')}
        </span>
        <span className="text-11 text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">{timeOf(r.created_at)}</span>
      </div>

      <p className="mt-2 text-14 leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words">{r.message}</p>
      {where && <p className="mt-1.5 text-12 text-slate-500 dark:text-slate-400">{where}</p>}

      {log.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowLog(s => !s)}
            aria-expanded={showLog}
            className="text-12 font-semibold accent-ink"
          >
            {showLog ? 'Hide' : 'Show'} {log.length} error{log.length === 1 ? '' : 's'}
          </button>
          {showLog && (
            <ul className="mt-2 flex flex-col gap-2">
              {log.map((e, i) => (
                <li key={i} className="px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04]">
                  <p className="text-13 font-semibold text-slate-800 dark:text-white break-words">{e.message}</p>
                  <p className="text-11 text-slate-500 dark:text-slate-400 mt-0.5">
                    {e.where} on {e.route || '/'}{e.version ? ` · v${e.version}` : ''}
                    {e.last && !Number.isNaN(Date.parse(e.last)) ? ` · ${dayOf(e.last)} ${timeOf(e.last)}` : ''}{e.count > 1 ? ` · ${e.count} times` : ''}
                  </p>
                  {e.stack && (
                    <pre className="mt-1.5 text-11 leading-snug text-slate-500 dark:text-slate-400 whitespace-pre-wrap break-all font-mono">{e.stack}</pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button size="xs" variant={r.status === 'done' ? 'secondary' : 'tint'} className="px-4" onClick={onToggle}>
          {r.status === 'done' ? 'Move to new' : 'Mark done'}
        </Button>
        {reply && (
          <Button size="xs" variant="secondary" className="px-4" onClick={() => { window.location.href = reply }}>
            Reply
          </Button>
        )}
        <Button size="xs" variant="quiet" className="px-4 ml-auto" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </article>
  )
}
