import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useBack } from '../../hooks/useBack'
import { useKeyboardInset } from '../../hooks/useKeyboardInset'
import { useToast } from '../../context/ToastContext'
import { discardIfBlank, restoreNote, saveNote, setPinned, trashNote, daysLeft } from '../../lib/notes'
import { noteStamp } from '../../lib/noteText'
import { releaseKeyboard } from '../../lib/keyboardHold'
import PageHeader from '../../components/PageHeader'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import EmptyState from '../../components/ui/EmptyState'
import IconButton from '../../components/ui/IconButton'
import Sheet from '../../components/ui/Sheet'
import { NOTE_EXTENSIONS } from './extensions'
import FormatControls, { NoteButton, formatCommands, useFormatState } from './FormatControls'
import {
  IconBin, IconBullets, IconChecklist, IconIndent, IconKeyboardDown, IconMore, IconNumbered,
  IconOutdent, IconPin, IconShare, IconUndo,
} from './icons'

/**
 * One note, open: the words on the page and nothing else, as iOS Notes has
 * it. No Save - it writes itself a moment after each change (lib/notes.js) -
 * and no title field: the first line is the title.
 *
 * ── On a phone ──
 *
 * While you write, a bar sits on the keyboard with what is reached for most
 * (Aa, a checklist, the lists, indenting, undo) and Done goes in the header,
 * as on an iPhone. Aa swaps the keyboard for the formatting panel; the
 * panel's X, or a tap on the note, swaps it back.
 *
 * ── On a computer ──
 *
 * The same controls sit in one bar above the note, and the editor never
 * loses its focus to them.
 *
 * ── Left blank, not kept ──
 *
 * A note opened and left without a word goes (discardIfBlank). Checked when
 * the editor unmounts, a turn later, so that React's development mode -
 * which unmounts and mounts every component once - does not throw away a
 * note that is still open.
 *
 * ── Written from somewhere else ──
 *
 * A sync can bring a newer copy of the open note from another device. If
 * nothing has been typed here since the last save, the editor takes it; if
 * something has, what is here wins when it saves, the way every synced table
 * settles a conflict (the newer write).
 */

/** How long typing pauses before the note is written, in ms. */
const SAVE_AFTER = 400

/** Editors open on each note, for the blank-note check. */
const openEditors = new Map()

const onDesktop = () => typeof document !== 'undefined' && document.documentElement.classList.contains('web')

export default function NoteEditor() {
  const { id } = useParams()
  const noteId = Number(id)
  const back = useBack('/notes')
  const location = useLocation()
  const fresh = !!/** @type {any} */ (location.state)?.fresh
  // null: looked, and it is not there. undefined: still looking.
  const note = useLiveQuery(
    async () => (Number.isFinite(noteId) ? (await db.notes.get(noteId)) ?? null : null),
    [noteId],
    undefined,
  )

  if (note === undefined) {
    return <div className="pb-page"><PageHeader title="" backLabel="Back to notes" onBack={back} /></div>
  }
  if (note === null) {
    return (
      <div className="pb-page">
        <PageHeader title="" backLabel="Back to notes" onBack={back} />
        <div className="px-5">
          <EmptyState
            art="notFound"
            title="Note not found"
            body="It may have been deleted for good."
            action={<Button variant="tint" size="sm" className="px-4" onClick={back}>Back to notes</Button>}
          />
        </div>
      </div>
    )
  }
  return <NoteBody key={noteId} note={note} back={back} fresh={fresh} />
}

/**
 * @param {{note: NoteRow, back: () => void, fresh: boolean}} props
 *   fresh: just made from the pencil, so the caret goes in at once
 */
function NoteBody({ note, back, fresh }) {
  const noteId = /** @type {number} */ (note.id)
  const navigate = useNavigate()
  const { showToast } = useToast()
  const kb = useKeyboardInset()
  const [desktop] = useState(onDesktop)
  const readOnly = !!note.deletedAt

  const [focused, setFocused] = useState(false)
  const [formatOpen, setFormatOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  /* What the last save wrote, the document as it stands, whether anything
     is waiting to be written, and the write in flight. */
  const written = useRef(note.updatedAt)
  const latest = useRef(note.doc)
  const dirty = useRef(false)
  const timer = useRef(/** @type {ReturnType<typeof setTimeout>|null} */ (null))
  const inFlight = useRef(/** @type {Promise<void>} */ (Promise.resolve()))

  const save = useCallback(async () => {
    if (!dirty.current) return
    dirty.current = false
    try {
      written.current = await saveNote(noteId, latest.current)
    } catch (e) {
      dirty.current = true
      console.error('[NoteEditor] save failed:', e)
    }
  }, [noteId])

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    inFlight.current = inFlight.current.then(save)
    return inFlight.current
  }, [save])
  const flushRef = useRef(flush)
  useEffect(() => { flushRef.current = flush }, [flush])

  const editor = useEditor({
    extensions: NOTE_EXTENSIONS,
    content: note.doc,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: 'note-doc',
        'aria-label': 'Note',
        autocapitalize: 'sentences',
        spellcheck: 'true',
      },
      // Keep the caret clear of the bar on the keyboard and the header.
      scrollMargin: { top: 90, bottom: 80, left: 0, right: 0 },
      scrollThreshold: { top: 90, bottom: 80, left: 0, right: 0 },
    },
    onUpdate: ({ editor: e }) => {
      latest.current = e.getJSON()
      dirty.current = true
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => { flushRef.current() }, SAVE_AFTER)
    },
    onFocus: () => { setFocused(true); setFormatOpen(false) },
    onBlur: () => { setFocused(false); flushRef.current() },
  })

  // Just made: write in it straight away. The pencil held the keyboard up (lib/keyboardHold.js).
  useEffect(() => {
    if (!editor || readOnly) { releaseKeyboard(); return }
    if (fresh) editor.commands.focus('end')
    releaseKeyboard()
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

  // Put in Recently deleted, or put back, while open.
  useEffect(() => { editor?.setEditable(!readOnly) }, [editor, readOnly])

  // A newer copy from another device, taken when nothing here is waiting.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (note.updatedAt === written.current || dirty.current) return
    written.current = note.updatedAt
    if (JSON.stringify(editor.getJSON()) === JSON.stringify(note.doc)) return
    latest.current = note.doc
    editor.commands.setContent(note.doc, { emitUpdate: false })
  }, [editor, note.updatedAt, note.doc])

  // Leaving the app mid-sentence: write it now, not in 400ms that may never come.
  useEffect(() => {
    const now = () => { flushRef.current() }
    const onHide = () => { if (document.visibilityState === 'hidden') now() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', now)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', now)
    }
  }, [])

  // Written down on the way out, and thrown away if there was nothing to write.
  useEffect(() => {
    openEditors.set(noteId, (openEditors.get(noteId) ?? 0) + 1)
    return () => {
      openEditors.set(noteId, Math.max(0, (openEditors.get(noteId) ?? 1) - 1))
      const saved = flushRef.current()
      setTimeout(() => {
        saved.finally(() => {
          if (!openEditors.get(noteId)) discardIfBlank(noteId).catch(e => console.error('[NoteEditor] discard failed:', e))
        })
      }, 0)
    }
  }, [noteId])

  async function remove() {
    setMenuOpen(false)
    await flush()
    await trashNote(noteId)
    back()
    showToast('Moved to Recently deleted', 'success', {
      actionLabel: 'Undo',
      onAction: () => {
        restoreNote(noteId)
          .then(() => navigate(`/notes/${noteId}`))
          .catch(e => console.error('[NoteEditor] undo failed:', e))
      },
    })
  }

  async function togglePin() {
    setMenuOpen(false)
    await setPinned(noteId, !note.pinned)
    showToast(note.pinned ? 'Unpinned' : 'Pinned to the top')
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  async function share() {
    setMenuOpen(false)
    await flush()
    const saved = await db.notes.get(noteId)
    try {
      await navigator.share({ title: saved?.title || 'Note', text: saved?.text ?? '' })
    } catch { /* closed without sharing */ }
  }

  /* Aa: the keyboard down, the panel up. The note keeps its selection, and
     the panel's buttons work on it. */
  function openFormat() {
    setFormatOpen(true)
    editor?.commands.blur()
  }
  /* Back to writing: focused inside the tap, so iOS brings the keyboard back. */
  function closeFormat() {
    editor?.commands.focus()
    setFormatOpen(false)
  }

  const writing = focused && !readOnly && !desktop

  return (
    <div className="pb-page">
      <PageHeader
        title={<span className="sr-only">{note.title || 'New note'}</span>}
        backLabel="Back to notes"
        onBack={back}
        action={writing ? (
          <Button variant="tint" size="xs" className="px-4" onClick={() => editor?.commands.blur()}>Done</Button>
        ) : (
          <IconButton label="Note options" onClick={() => setMenuOpen(true)}>
            <IconMore size={19} />
          </IconButton>
        )}
      />

      {readOnly && (
        <div className="px-5 mb-4">
          <Card padding="md" className="flex items-center gap-3">
            <p className="flex-1 text-13 text-slate-600 dark:text-slate-300">
              In Recently deleted. It goes for good in {daysLeft(/** @type {string} */ (note.deletedAt))} days.
            </p>
            <Button size="sm" className="px-4 shrink-0" onClick={() => restoreNote(noteId)}>Put back</Button>
          </Card>
        </div>
      )}

      {desktop && editor && !readOnly && (
        <div className="sticky top-0 z-10 mx-5 mb-3 py-2 bg-page/95 backdrop-blur border-b border-slate-100 dark:border-white/[0.07]">
          <FormatControls editor={editor} layout="bar" />
        </div>
      )}

      <p className="px-5 mb-3 text-center text-12 text-slate-400 dark:text-slate-500 tabular-nums">
        {noteStamp(note.editedAt)}
      </p>

      <div className="px-5" onClick={(e) => {
        // A tap under the last line: the caret at the end, as on an iPhone.
        if (!editor || readOnly || e.target !== e.currentTarget) return
        editor.commands.focus('end')
      }}>
        <EditorContent editor={editor} />
      </div>

      {/* Room for the bar on the keyboard, so the last line can scroll clear of it. */}
      {writing && <div aria-hidden="true" style={{ height: 56 }} />}

      {writing && editor && (
        <KeyboardBar
          editor={editor}
          bottom={kb.open ? kb.inset : null}
          onFormat={openFormat}
          onDone={() => editor.commands.blur()}
        />
      )}

      {formatOpen && editor && !desktop && (
        <FormatPanel editor={editor} onClose={closeFormat} />
      )}

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} ariaLabel="Note options">
        <Card clip className="mb-2">
          <MenuRow onPress={togglePin} label={note.pinned ? 'Unpin note' : 'Pin note'}>
            <IconPin size={19} />
          </MenuRow>
          {canShare && (
            <>
              <Divider inset="row" />
              <MenuRow onPress={share} label="Share">
                <IconShare size={19} />
              </MenuRow>
            </>
          )}
          <Divider inset="row" />
          <MenuRow onPress={remove} label="Delete note" danger>
            <IconBin size={19} />
          </MenuRow>
        </Card>
      </Sheet>
    </div>
  )
}

/** @param {{label: string, onPress: () => void, danger?: boolean, children: import('react').ReactNode}} props */
function MenuRow({ label, onPress, danger = false, children }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={`press press-fade w-full flex items-center gap-3 px-4 py-3.5 text-left text-14 font-medium
        active:bg-slate-50 dark:active:bg-white/[0.04] ${danger ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}
    >
      <span className={danger ? '' : 'text-slate-500 dark:text-slate-400'}>{children}</span>
      {label}
    </button>
  )
}

/**
 * The bar on the keyboard.
 *
 * @param {{editor: import('@tiptap/react').Editor, bottom: number|null, onFormat: () => void, onDone: () => void}} props
 *   bottom: where the keyboard's top is, or null with none up - then the bar
 *   sits on the tab bar, as it does with a keyboard plugged in
 */
function KeyboardBar({ editor, bottom, onFormat, onDone }) {
  const st = useFormatState(editor)
  const cmd = formatCommands(editor, st, true)
  if (!st) return null
  return (
    <div
      className="note-toolbar"
      role="toolbar"
      aria-label="Formatting"
      style={{ bottom: bottom ?? 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <NoteButton label="Format" onPress={onFormat} className="flex-1 h-10 text-15 font-semibold">Aa</NoteButton>
      <NoteButton label="Checklist" active={st.task} onPress={cmd.task} className="flex-1 h-10"><IconChecklist /></NoteButton>
      <NoteButton label="Bulleted list" active={st.bullet} onPress={cmd.bullet} className="flex-1 h-10"><IconBullets /></NoteButton>
      <NoteButton label="Numbered list" active={st.ordered} onPress={cmd.ordered} className="flex-1 h-10"><IconNumbered /></NoteButton>
      <NoteButton label="Outdent" disabled={!st.canLift} onPress={cmd.outdent} className="flex-1 h-10"><IconOutdent /></NoteButton>
      <NoteButton label="Indent" disabled={!st.canSink} onPress={cmd.indent} className="flex-1 h-10"><IconIndent /></NoteButton>
      <NoteButton label="Undo" disabled={!st.canUndo} onPress={cmd.undo} className="flex-1 h-10"><IconUndo /></NoteButton>
      <NoteButton label="Hide keyboard" onPress={onDone} className="flex-1 h-10"><IconKeyboardDown /></NoteButton>
    </div>
  )
}

/** @param {{editor: import('@tiptap/react').Editor, onClose: () => void}} props */
function FormatPanel({ editor, onClose }) {
  return (
    <div className="note-format bg-panel" role="dialog" aria-label="Format">
      <div className="flex items-center justify-between mb-3">
        <p className="text-15 font-semibold text-slate-800 dark:text-white">Format</p>
        <IconButton label="Close format" size="sm" variant="tint" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </IconButton>
      </div>
      <FormatControls editor={editor} layout="panel" />
    </div>
  )
}
