import { useEffect, useMemo, useState } from 'react'
import { FlipBackward, Trash01 } from '@untitledui/icons'
import db, { TRASH_DAYS } from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useBack } from '../../hooks/useBack'
import { useToast } from '../../context/ToastContext'
import { daysLeft, deleteNoteForever, emptyNotesTrash, purgeNotes, restoreNote } from '../../lib/notes'
import { notePreview } from '../../lib/noteText'
import SubPage from '../../components/SubPage'
import SwipeConfirm from '../../components/SwipeConfirm'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import IconButton from '../../components/ui/IconButton'
import SectionLabel from '../../components/ui/SectionLabel'
import Sheet from '../../components/ui/Sheet'
import SwipeRow from '../../components/ui/SwipeRow'
import { RowDivider } from '../../components/ui/Presence'
import { SkeletonList } from '../../components/ui/Skeleton'

/**
 * Notes put in Recently deleted, for thirty days: to put back, or to be rid
 * of for good. The transactions' Recently deleted, for notes - the same rows,
 * the same swipe, the same swipe-to-confirm for emptying the lot
 * (pages/transactions/RecentlyDeleted.jsx).
 *
 * On every device you are signed in on: deleting a note is a mark on it, and
 * the mark syncs (lib/notes.js).
 */

/** "Deleted today", "Deleted 3 days ago". @param {string} iso @param {Date} now */
function deletedWhen(iso, now) {
  const day = (/** @type {Date} */ d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(new Date(iso))) / 86_400_000)
  if (days <= 0) return 'Deleted today'
  if (days === 1) return 'Deleted yesterday'
  return `Deleted ${days} days ago`
}

export default function NotesDeleted() {
  const back = useBack('/notes')
  const { showToast } = useToast()
  const notes = useLiveQuery(() => db.notes.orderBy('editedAt').reverse().filter(n => !!n.deletedAt).toArray(), [], undefined)
  const [now] = useState(() => new Date())
  const [emptying, setEmptying] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { purgeNotes().catch(() => { /* the next open will */ }) }, [])

  const list = useMemo(
    () => [...(notes ?? [])].sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt))),
    [notes],
  )

  /** @param {NoteRow} note */
  async function putBack(note) {
    await restoreNote(/** @type {number} */ (note.id))
    showToast('Note put back')
  }

  /** @param {NoteRow} note */
  async function forget(note) {
    await deleteNoteForever(/** @type {number} */ (note.id))
    showToast('Deleted for good')
    return true
  }

  async function empty() {
    setBusy(true)
    try {
      await emptyNotesTrash()
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
        {notes === undefined ? <SkeletonList rows={3} /> : !list.length ? (
          <EmptyState
            art="trash"
            title="Nothing deleted"
            body={`Notes you delete stay here for ${TRASH_DAYS} days, so you can put them back.`}
          />
        ) : (
          <>
            <SectionLabel gap="loose">
              Kept {TRASH_DAYS} days. Swipe one left to delete it for good.
            </SectionLabel>
            <Card clip>
              {list.map((note, i) => {
                const left = daysLeft(/** @type {string} */ (note.deletedAt), now)
                const preview = notePreview(note.text ?? '')
                return (
                  <div key={note.id}>
                    <SwipeRow label={`Delete ${note.title || 'New note'} for good`} onDelete={() => forget(note)}>
                      <div className="flex items-center">
                        <div className="flex-1 min-w-0 pl-4 pr-2 py-3">
                          <p className="text-15 font-semibold text-slate-700 dark:text-slate-200 truncate">{note.title || 'New note'}</p>
                          {preview && <p className="mt-0.5 text-13 text-slate-500 dark:text-slate-400 truncate">{preview}</p>}
                          <p className="mt-0.5 text-11 text-slate-400 dark:text-slate-500">
                            {deletedWhen(/** @type {string} */ (note.deletedAt), now)} · {left <= 1 ? 'Last day' : `${left} days left`}
                          </p>
                        </div>
                        <IconButton label={`Put back ${note.title || 'New note'}`} variant="tint" className="mr-4" onClick={() => putBack(note)}>
                          <FlipBackward size={17} strokeWidth={1.8} />
                        </IconButton>
                      </div>
                    </SwipeRow>
                    <RowDivider hidden={i === list.length - 1} inset="row" />
                  </div>
                )
              })}
            </Card>
          </>
        )}
      </div>

      <Sheet open={emptying} onClose={() => setEmptying(false)} title="Delete all for good?" dismissible={!busy}>
        <p className="text-13 text-slate-500 dark:text-slate-400 mb-5">
          {list.length === 1 ? 'The note' : `All ${list.length} notes`} in Recently deleted will be gone from every device. This can&apos;t be undone.
        </p>
        <SwipeConfirm label="Swipe to delete all" onConfirm={empty} busy={busy} tone="danger" />
      </Sheet>
    </SubPage>
  )
}
