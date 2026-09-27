import { useEffect, useMemo, useState } from 'react'
import { FlipBackward, Trash01 } from '@untitledui/icons'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useBack } from '../../hooks/useBack'
import { useToast } from '../../context/ToastContext'
import { TRASH_DAYS, deleteForever, describeEntry, emptyTrash, purgeTrash, restoreFromTrash } from '../../db/trash'
import SubPage from '../../components/SubPage'
import CategoryGlyph from '../../components/CategoryGlyph'
import SwipeConfirm from '../../components/SwipeConfirm'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import IconButton from '../../components/ui/IconButton'
import Sheet from '../../components/ui/Sheet'
import SectionLabel from '../../components/ui/SectionLabel'
import SwipeRow from '../../components/ui/SwipeRow'
import { SkeletonList } from '../../components/ui/Skeleton'
import { RowDivider } from '../../components/ui/Presence'
import { fmt } from '../../lib/money'
import { txRowTone } from './shared'

/**
 * Recently deleted: every transaction deleted in the last thirty days, to
 * put back or to be rid of for good - on every device you are signed in on,
 * and in backups (db/trash.js, 022_trash.sql).
 *
 * Reached from the foot of Transactions, where the deleting happens, and
 * from Settings under Data. A row puts back with its button, or opens to
 * say what it was and offer both; swipe one left to delete it for good.
 * Emptying the lot asks for a swipe, as every delete that cannot be undone
 * does.
 *
 * db/trash.js has what is kept and why it is kept whole.
 */

/** "Today", "Yesterday", "3 days ago". @param {string} iso @param {Date} now */
function deletedWhen(iso, now) {
  const day = (/** @type {Date} */ d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(new Date(iso))) / 86_400_000)
  if (days <= 0) return 'Deleted today'
  if (days === 1) return 'Deleted yesterday'
  return `Deleted ${days} days ago`
}

/** @param {number} n */
const daysLeftWords = (n) => (n <= 1 ? 'Last day' : `${n} days left`)

export default function RecentlyDeleted() {
  const back = useBack('/transactions')
  const { showToast } = useToast()
  const entries = useLiveQuery(() => db.trash.orderBy('deletedAt').reverse().toArray(), [], undefined)
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const catMap = useMemo(() => Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])
  const [now] = useState(() => new Date())
  const [picked, setPicked] = useState(/** @type {number|null} */ (null))
  const [emptying, setEmptying] = useState(false)
  const [busy, setBusy] = useState(false)

  // What is past thirty days goes as the page opens.
  useEffect(() => { purgeTrash().catch(() => { /* the next open will */ }) }, [])

  const list = entries ?? []
  const pickedEntry = list.find(e => e.id === picked) ?? null

  /** @param {number} id */
  async function putBack(id) {
    try {
      const n = await restoreFromTrash(id)
      setPicked(null)
      showToast(n > 1 ? `${n} transactions put back` : n ? 'Transaction put back' : 'Already put back', n ? 'success' : 'warning')
    } catch (e) {
      console.error('[RecentlyDeleted] restore failed:', e)
      showToast('Could not put it back. Try again.', 'error')
    }
  }

  /** @param {number} id */
  async function forget(id) {
    await deleteForever(id)
    setPicked(null)
    showToast('Deleted for good')
    return true
  }

  async function empty() {
    setBusy(true)
    try {
      await emptyTrash()
      setEmptying(false)
      showToast('Recently deleted is empty')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SubPage
      title="Recently deleted"
      onBack={back}
      action={list.length > 0 ? (
        <IconButton label="Delete all for good" onClick={() => setEmptying(true)}>
          <Trash01 size={18} strokeWidth={1.8} />
        </IconButton>
      ) : null}
    >
      <div className="px-5">
        {entries === undefined ? <SkeletonList rows={3} /> : !list.length ? (
          <EmptyState
            icon={<Trash01 size={26} strokeWidth={1.6} />}
            title="Nothing deleted"
            body={`Transactions you delete stay here for ${TRASH_DAYS} days, so you can put them back.`}
          />
        ) : (
          <>
            <SectionLabel gap="loose">
              Kept {TRASH_DAYS} days. Swipe one left to delete it for good.
            </SectionLabel>
            <Card clip>
              {list.map((entry, i) => {
                const { lead, extra, total, daysLeft } = describeEntry(entry, now)
                const cat = catMap[lead.category]
                const { cls, sign, currency } = txRowTone(lead)
                const name = lead.description || lead.category || (lead.type === 'transfer' ? 'Transfer' : 'Transaction')
                return (
                  <div key={entry.id}>
                    <SwipeRow label={`Delete ${name} for good`} onDelete={() => forget(entry.id)}>
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => setPicked(entry.id)}
                          className="press press-fade flex-1 min-w-0 flex items-center gap-3 pl-4 pr-2 py-3 text-left active:bg-slate-50 dark:active:bg-white/[0.04]"
                        >
                          <span className="cat-tile w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 opacity-70" style={{ '--cat-color': cat?.color ?? '#64748b' }}>
                            <CategoryGlyph cat={cat} size={20} emoji="💸" />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-13 font-semibold text-slate-800 dark:text-slate-100 truncate leading-snug">{name}</span>
                            <span className="block text-11 text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {extra || deletedWhen(entry.deletedAt, now)} · {daysLeftWords(daysLeft)}
                            </span>
                          </span>
                          <span className={`shrink-0 text-13 font-bold tabular-nums ${cls}`}>{sign}{fmt(Math.abs(total), currency)}</span>
                        </button>
                        <IconButton label={`Put back ${name}`} onClick={() => putBack(entry.id)} className="mr-3">
                          <FlipBackward size={17} strokeWidth={1.9} />
                        </IconButton>
                      </div>
                    </SwipeRow>
                    <RowDivider hidden={i === list.length - 1} />
                  </div>
                )
              })}
            </Card>
          </>
        )}
      </div>

      {/* One deletion, opened: what it was, and the two things to do with it. */}
      <Sheet open={!!pickedEntry} onClose={() => setPicked(null)} title="Deleted transaction">
        {pickedEntry && (() => {
          const { lead, extra, total, daysLeft, count } = describeEntry(pickedEntry, now)
          const { cls, sign, currency } = txRowTone(lead)
          return (
            <div className="flex flex-col gap-4 pb-1">
              <div>
                <p className="text-15 font-semibold text-slate-900 dark:text-white">{lead.description || lead.category || 'Transaction'}</p>
                <p className={`mt-1 text-22 font-semibold tabular-nums ${cls}`}>{sign}{fmt(Math.abs(total), currency)}</p>
                <p className="mt-1 text-13 text-slate-500 dark:text-slate-400">
                  {[lead.category, lead.account ?? lead.fromAccount, extra].filter(Boolean).join(' · ')}
                </p>
                <p className="mt-1 text-12 text-slate-400 dark:text-slate-500">
                  {deletedWhen(pickedEntry.deletedAt, now)}. {daysLeft <= 1 ? 'Gone for good tomorrow.' : `Gone for good in ${daysLeft} days.`}
                </p>
              </div>
              <Button size="lg" onClick={() => putBack(pickedEntry.id)}>
                {count > 1 ? `Put back all ${count}` : 'Put back'}
              </Button>
              <SwipeConfirm tone="danger" label="Swipe to delete for good" onConfirm={() => forget(pickedEntry.id)} />
            </div>
          )
        })()}
      </Sheet>

      <Sheet open={emptying} onClose={() => setEmptying(false)} title="Delete all for good?">
        <div className="flex flex-col gap-4 pb-1">
          <p className="text-14 text-slate-600 dark:text-slate-300">
            {list.length === 1 ? 'The one deletion here' : `All ${list.length} deletions here`} will be gone, and can&apos;t be put back.
          </p>
          <SwipeConfirm tone="danger" label="Swipe to delete all" busy={busy} onConfirm={empty} />
        </div>
      </Sheet>
    </SubPage>
  )
}
