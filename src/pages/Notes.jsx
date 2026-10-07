import { useEffect, useMemo, useState } from 'react'
import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useBack } from '../hooks/useBack'
import { useToast } from '../context/ToastContext'
import { createNote, moveNote, purgeNotes, restoreNote, trashNote } from '../lib/notes'
import { createFolder, renameFolder } from '../lib/noteFolders'
import { folderCounts, inView, tagCounts } from '../lib/noteFiling'
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
import SectionLabel from '../components/ui/SectionLabel'
import SwipeRow from '../components/ui/SwipeRow'
import { RowDivider } from '../components/ui/Presence'
import { SkeletonList } from '../components/ui/Skeleton'
import {
  DeleteFolderSheet, FolderChips, FolderHeader, FolderList, FolderMenu, FolderNameSheet, FolderOptionsButton, NOTE_DRAG, NotesViewSheet,
  TagRail, useFolderMenu, useFolders,
} from './notes/NoteFiling'
import { IconFolder, IconSliders } from './notes/icons'
import { useNotesPrefs } from './notes/notesPrefs'
import { filingOf, screenOf, useNotesView } from './notes/notesView'

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
 * Notes are organised in folders and with tags (pages/notes/NoteFiling.jsx):
 * a row of folders above the list, the tags in use under it. Either narrows
 * the list - and a new note starts in the folder that is open. A note is
 * filed from its own menu, or by dragging its row onto a folder with a mouse.
 * Searching looks through every note, whatever is open.
 *
 * It opens one of two ways, to taste (the sliders beside New note): on the
 * notes, with the folders as a row of chips above them, or on the folders
 * themselves - open one, and its notes are there, with a way back.
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
  const [view, setView] = useNotesView()
  const [prefs] = useNotesPrefs()
  const folders = useFolders()
  const [viewing, setViewing] = useState(false)
  /** What is being asked of a folder: a new one, renaming one, deleting one. */
  const [act, setAct] = useState(/** @type {{kind: 'new'|'rename'|'delete', folder: NoteFolderRow|null}|null} */ (null))
  const menu = useFolderMenu()

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

  /* The open folder, if it is still there - another device may have deleted
     it, or not have sent it yet, and the list must not go blank for a folder
     it cannot show. Its tag, if any note in it still has one. */
  const folder = view.folder === 'all' ? null : (folders ?? []).find(f => f.syncId === view.folder) ?? null
  const folderKey = folder ? view.folder : 'all'
  const inFolder = useMemo(() => inView(live, { folder: folderKey }), [live, folderKey])
  const tags = useMemo(() => tagCounts(inFolder), [inFolder])
  const tag = view.tag && tags.some(t => t.tag === view.tag) ? view.tag : null
  const counts = useMemo(() => folderCounts(live), [live])
  const tagsAll = useMemo(() => tagCounts(live), [live])
  const screen = screenOf(view, prefs)
  const hasFolders = (folders ?? []).length > 0

  // Searching looks through everything; otherwise the open folder, and tag.
  const scope = useMemo(() => (searching ? live : inView(inFolder, { tag })), [searching, live, inFolder, tag])
  const shown = useMemo(() => (searching ? scope.filter(n => noteMatches(n, query)) : scope), [scope, query, searching])
  const groups = useMemo(
    () => (searching ? [{ key: 'found', label: shown.length ? `${notesWord(shown.length)} found` : '', notes: shown }] : noteGroups(shown, now)),
    [searching, shown, now],
  )
  const folderName = useMemo(() => new Map((folders ?? []).map(f => [f.syncId, f.name])), [folders])

  async function compose() {
    // Inside the tap, so the keyboard comes up for the note (lib/keyboardHold.js).
    holdKeyboard()
    try {
      const id = await createNote(undefined, filingOf({ folder: folderKey, tag }, screen))
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

  /**
   * A row dropped on a folder (or on All notes, to take it out of one).
   *
   * @param {number} id @param {string|null} to a folder's syncId
   */
  async function drop(id, to) {
    const note = (all ?? []).find(n => n.id === id)
    if (!note || (note.folder ?? null) === to) return
    const before = note.folder ?? null
    await moveNote(id, to)
    showToast(to ? `Moved to ${folderName.get(to) ?? 'the folder'}` : 'Taken out of its folder', 'success', {
      actionLabel: 'Undo',
      onAction: () => { moveNote(id, before).catch(e => console.error('[Notes] undo failed:', e)) },
    })
  }

  /** Into a folder - or All notes - and its notes. @param {string} key */
  const openFolder = (key) => setView({ folder: key, tag: null, screen: 'notes' })

  /* The notes themselves: sections by date, or what was found, or what is
     missing. */
  const results = !searching && folder && !shown.length ? (
    <div className="px-5">
      <EmptyState
        art="note"
        title={tag ? `Nothing tagged #${tag} here` : 'This folder is empty'}
        body="Drag a note onto it, or file one from its menu. A new note starts here."
        action={<Button size="sm" className="px-4" onClick={compose}>New note</Button>}
      />
    </div>
  ) : searching && !shown.length ? (
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
              <NoteRowButton note={note} now={now} onOpen={() => navigate(`/notes/${note.id}`)}
                folder={!folder && note.folder ? folderName.get(note.folder) ?? null : null} />
            </SwipeRow>
            <RowDivider hidden={i === g.notes.length - 1} inset="row" />
          </div>
        ))}
      </Card>
    </section>
  ))

  return (
    <div className="pb-page">
      <PageHeader
        title="Notes"
        onBack={back}
        action={(
          <>
            <IconButton label="Notes view" onClick={() => setViewing(true)}>
              <IconSliders size={18} />
            </IconButton>
            <IconButton label="New note" variant="primary" onClick={compose}>
              <IconCompose size={18} />
            </IconButton>
          </>
        )}
      />

      {all === undefined ? (
        <div className="px-5"><SkeletonList rows={4} /></div>
      ) : !live.length && !hasFolders ? (
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

          {!searching && screen === 'folders' ? (
            <>
              <FolderList
                folders={folders ?? []}
                counts={counts}
                total={live.length}
                onOpen={openFolder}
                onNewFolder={() => setAct({ kind: 'new', folder: null })}
                onDropNote={drop}
                bind={menu.bind}
              />
              {prefs.tags && tagsAll.length > 0 && (
                <>
                  <SectionLabel inset="gutter" gap="tight">Tags</SectionLabel>
                  <TagRail tags={tagsAll} active={null} onPick={(t) => setView({ folder: 'all', tag: t, screen: 'notes' })} />
                </>
              )}
            </>
          ) : (
            <>
              {!searching && prefs.start === 'folders' && (
                <FolderHeader
                  name={folder?.name ?? 'All notes'}
                  count={inFolder.length}
                  onBack={() => setView({ folder: 'all', tag: null, screen: 'folders' })}
                  onMore={folder ? (el) => menu.openFrom(folder, el) : null}
                />
              )}
              {!searching && prefs.start === 'notes' && (
                <FolderChips
                  folders={folders ?? []}
                  counts={counts}
                  total={live.length}
                  active={folderKey}
                  onOpen={(key) => setView({ folder: key, tag: null })}
                  onNewFolder={() => setAct({ kind: 'new', folder: null })}
                  onDropNote={drop}
                  bind={menu.bind}
                />
              )}
              {!searching && prefs.tags && <TagRail tags={tags} active={tag} onPick={(t) => setView({ tag: t })} />}

              {!searching && prefs.start === 'notes' && folder && (
                <div className="px-5 mb-1 flex items-center gap-3">
                  <p className="flex-1 min-w-0 truncate text-13 text-slate-500 dark:text-slate-400">
                    {notesWord(inFolder.length)} in {folder.name}
                  </p>
                  <FolderOptionsButton onPress={(el) => menu.openFrom(folder, el)} />
                </div>
              )}

              {results}

              {!searching && prefs.start === 'notes' && (
                <p className="mt-4 text-center text-12 text-slate-400 dark:text-slate-500 tabular-nums">{notesWord(shown.length)}</p>
              )}
            </>
          )}
        </>
      )}

      <NotesViewSheet open={viewing} onClose={() => setViewing(false)} />
      <FolderMenu
        state={menu.open}
        onClose={menu.close}
        onRename={(f) => setAct({ kind: 'rename', folder: f })}
        onDelete={(f) => setAct({ kind: 'delete', folder: f })}
      />
      <FolderNameSheet
        open={act?.kind === 'new'}
        onClose={() => setAct(null)}
        title="New folder"
        confirmLabel="Create folder"
        onSubmit={async (name) => {
          const made = await createFolder(name)
          if (!made?.syncId) return 'Could not make the folder'
          setView({ folder: made.syncId, tag: null, screen: 'notes' })
          setAct(null)
        }}
      />
      <FolderNameSheet
        open={act?.kind === 'rename'}
        onClose={() => setAct(null)}
        title="Rename folder"
        initial={act?.folder?.name ?? ''}
        confirmLabel="Save"
        onSubmit={async (name) => {
          if (act?.folder?.id == null) return 'Could not find the folder'
          if (!(await renameFolder(act.folder.id, name))) return 'A folder with that name is already there'
          setAct(null)
        }}
      />
      <DeleteFolderSheet
        folder={act?.kind === 'delete' ? act.folder : null}
        count={act?.folder ? counts.get(String(act.folder.syncId)) ?? 0 : 0}
        onClose={() => setAct(null)}
        onDeleted={() => {
          const gone = act?.folder?.syncId
          setAct(null)
          if (gone && view.folder === gone) setView({ folder: 'all', tag: null, screen: prefs.start === 'folders' ? 'folders' : null })
        }}
      />

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

/** A mouse can drag a row onto a folder; a finger on a phone is left to swipe and scroll. */
const canDrag = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

/** @param {{note: NoteRow, now: Date, onOpen: () => void, folder?: string|null}} props  folder: its name, when the list is not already inside it */
function NoteRowButton({ note, now, onOpen, folder = null }) {
  const preview = notePreview(note.text ?? '')
  const tags = note.tags ?? []
  return (
    <button
      type="button"
      onClick={onOpen}
      data-web-id={`note-${note.id}`}
      draggable={canDrag() || undefined}
      onDragStart={(e) => { e.dataTransfer.setData(NOTE_DRAG, String(note.id)); e.dataTransfer.effectAllowed = 'move' }}
      className="press press-fade w-full min-w-0 text-left px-4 py-3 active:bg-slate-50 dark:active:bg-white/[0.04]"
    >
      <span className="block text-15 font-semibold text-slate-800 dark:text-white truncate">
        {note.title || 'New note'}
      </span>
      <span className="mt-0.5 flex items-baseline gap-2 min-w-0 text-13">
        <span className="shrink-0 font-medium text-slate-600 dark:text-slate-300 tabular-nums">{noteWhen(note.editedAt, now)}</span>
        <span className="truncate text-slate-500 dark:text-slate-400">{preview || 'No additional text'}</span>
      </span>
      {(folder || tags.length > 0) && (
        <span className="mt-1 flex items-center gap-2 min-w-0 text-12 text-slate-400 dark:text-slate-500">
          {folder && <span className="shrink-0 inline-flex items-center gap-1"><IconFolder size={12} /> {folder}</span>}
          {tags.length > 0 && <span className="truncate">{tags.map(t => `#${t}`).join(' ')}</span>}
        </span>
      )}
    </button>
  )
}
