import { useEffect, useMemo, useState } from 'react'
import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useBack } from '../hooks/useBack'
import { useToast } from '../context/ToastContext'
import { createNote, purgeNotes, restoreNote, trashNote } from '../lib/notes'
import { noteGroups, noteMatches, notePreview, noteWhen } from '../lib/noteText'
import { holdKeyboard, releaseKeyboard } from '../lib/keyboardHold'
import PageHeader from '../components/PageHeader'
import { IconCompose } from '../components/icons'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Divider from '../components/ui/Divider'
import EmptyState from '../components/ui/EmptyState'
import IconButton from '../components/ui/IconButton'
import SearchField from '../components/ui/SearchField'
import SwipeRow from '../components/ui/SwipeRow'
import { RowDivider } from '../components/ui/Presence'
import { SkeletonList } from '../components/ui/Skeleton'

/**
 * Notes: plans for the next payday, what to buy, an idea for the app - the
 * iOS Notes list, in Spendr's clothes.
 *
 * Reached from the page icon on Home, from the sidebar on a computer, and -
 * in the installed app on an iPhone - by swiping in from the right edge of a
 * tab, the way the left edge goes back (layouts/AppLayout.jsx).
 *
 * The list is the app's: a day heading with a hairline, each section's notes
 * in one card. A note itself is plain, like iOS Notes (notes/NoteEditor.jsx).
 * Sections are the ones iOS uses - pinned, Today, Yesterday, the week, the
 * month, then month by month and year by year - and each row is its title,
 * when it was written, and the start of what follows.
 *
 * Swipe a note left to put it in Recently deleted, where it waits thirty
 * days; the toast has Undo.
 *
 * `peek`: drawn inert under the finger while the edge swipe brings it in, so
 * it must look exactly like itself and do nothing.
 */

/** @param {number} n */
const notesWord = (n) => `${n} ${n === 1 ? 'note' : 'notes'}`

export default function Notes({ peek = false }) {
  const navigate = useNavigate()
  const back = useBack('/')
  const { pathname } = useLocation()
  const { showToast } = useToast()
  const [query, setQuery] = useState('')
  const [now] = useState(() => new Date())

  const all = useLiveQuery(() => db.notes.orderBy('editedAt').reverse().toArray(), [], undefined)

  // What has been in Recently deleted past thirty days goes as the list opens.
  useEffect(() => {
    if (!peek) purgeNotes().catch(() => { /* the next open will */ })
  }, [peek])

  /* A note with nothing in it yet is one being started; it shows only where
     it is open beside the list (the computer's split view), and goes if it
     is left blank. */
  const open = matchPath('/notes/:id', pathname)?.params.id
  const live = useMemo(
    () => (all ?? []).filter(n => !n.deletedAt && ((n.text ?? '').trim() || String(n.id) === open)),
    [all, open],
  )
  const deleted = useMemo(() => (all ?? []).filter(n => n.deletedAt).length, [all])
  const searching = query.trim().length > 0
  const shown = useMemo(() => (searching ? live.filter(n => noteMatches(n, query)) : live), [live, query, searching])
  const groups = useMemo(
    () => (searching ? [{ key: 'found', label: shown.length ? `${notesWord(shown.length)} found` : '', notes: shown }] : noteGroups(shown, now)),
    [searching, shown, now],
  )

  async function compose() {
    // Inside the tap, so the keyboard comes up for the note (lib/keyboardHold.js).
    holdKeyboard()
    try {
      const id = await createNote()
      navigate(`/notes/${id}`, { state: { fresh: true } })
    } catch (e) {
      releaseKeyboard()
      console.error('[Notes] create failed:', e)
      showToast('Could not start a note', 'error')
    }
  }

  /** @param {NoteRow} note */
  async function remove(note) {
    if (note.id == null) return false
    await trashNote(note.id)
    showToast('Moved to Recently deleted', 'success', {
      actionLabel: 'Undo',
      onAction: () => { restoreNote(/** @type {number} */ (note.id)).catch(e => console.error('[Notes] undo failed:', e)) },
    })
    return true
  }

  return (
    <div className="pb-page">
      <PageHeader
        title="Notes"
        onBack={back}
        action={(
          <IconButton label="New note" variant="primary" onClick={compose}>
            <IconCompose size={18} />
          </IconButton>
        )}
      />

      {all === undefined ? (
        <div className="px-5"><SkeletonList rows={4} /></div>
      ) : !live.length ? (
        <div className="px-5">
          <EmptyState
            art="note"
            title="No notes yet"
            body="Plans for payday, things to buy, an idea for the app. Anything worth writing down."
            action={<Button size="sm" className="px-4" onClick={compose}>New note</Button>}
          />
        </div>
      ) : (
        <>
          <div className="px-5 mb-2">
            <SearchField
              value={query}
              onChange={(/** @type {any} */ e) => setQuery(e.target.value)}
              onClear={() => setQuery('')}
              placeholder="Search notes"
            />
          </div>

          {searching && !shown.length ? (
            <div className="px-5">
              <EmptyState art="notFound" title="No notes found" body={`Nothing has "${query.trim()}" in it.`} />
            </div>
          ) : groups.map(g => (
            <section key={g.key} className="pb-1">
              {g.label && (
                <div className="flex items-center gap-3 px-5 py-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap flex items-center gap-1.5">
                    {g.key === 'pinned' && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 17v5M9 10.8V4h6v6.8l2.6 2.4c.5.5.4 1.3-.3 1.5-1.6.5-3.4.8-5.3.8s-3.7-.3-5.3-.8c-.7-.2-.8-1-.3-1.5z" />
                      </svg>
                    )}
                    {g.label}
                  </span>
                  <Divider className="flex-1" />
                </div>
              )}
              <Card clip className="mx-5">
                {g.notes.map((note, i) => (
                  <div key={note.id}>
                    <SwipeRow label={`Delete ${note.title || 'New note'}`} onDelete={() => remove(note)} disabled={peek}>
                      <NoteRowButton note={note} now={now} onOpen={() => navigate(`/notes/${note.id}`)} />
                    </SwipeRow>
                    <RowDivider hidden={i === g.notes.length - 1} inset="row" />
                  </div>
                ))}
              </Card>
            </section>
          ))}

          {!searching && (
            <p className="mt-4 text-center text-12 text-slate-400 dark:text-slate-500 tabular-nums">{notesWord(live.length)}</p>
          )}
        </>
      )}

      {/* The way back to what was deleted, while there is something there. */}
      {deleted > 0 && (
        <div className="flex justify-center mt-3 px-5">
          <Link
            to="/notes/deleted"
            className="press press-fade active:opacity-60 text-13 font-semibold text-slate-500 dark:text-slate-400 px-3 py-2"
          >
            Recently deleted · {deleted}
          </Link>
        </div>
      )}
    </div>
  )
}

/** @param {{note: NoteRow, now: Date, onOpen: () => void}} props */
function NoteRowButton({ note, now, onOpen }) {
  const preview = notePreview(note.text ?? '')
  return (
    <button
      type="button"
      onClick={onOpen}
      data-web-id={`note-${note.id}`}
      className="press press-fade w-full min-w-0 text-left px-4 py-3 active:bg-slate-50 dark:active:bg-white/[0.04]"
    >
      <span className="block text-15 font-semibold text-slate-800 dark:text-white truncate">
        {note.title || 'New note'}
      </span>
      <span className="mt-0.5 flex items-baseline gap-2 min-w-0 text-13">
        <span className="shrink-0 font-medium text-slate-600 dark:text-slate-300 tabular-nums">{noteWhen(note.editedAt, now)}</span>
        <span className="truncate text-slate-500 dark:text-slate-400">{preview || 'No additional text'}</span>
      </span>
    </button>
  )
}
