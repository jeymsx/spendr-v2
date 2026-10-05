import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useBack } from '../../hooks/useBack'
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
import FormatControls, { formatCommands, useFormatState } from './FormatControls'
import { keepCaretClear } from './keyboardRoom'
import { rememberKeyboard } from '../../lib/keyboard'
import { IconBin, IconChecklist, IconMore, IconPin, IconShare } from './icons'

/**
 * One note, open: the words on the page and nothing else, as iOS Notes has
 * it. No Save - it writes itself a moment after each change (lib/notes.js) -
 * and no title field: the first line is the title.
 *
 * ── On a phone ──
 *
 * While you write, the header holds Aa, a checklist and Done. Aa swaps the
 * keyboard for the formatting panel, as on an iPhone; Aa again, the panel's
 * X, or a tap on the note swaps it back.
 *
 * They were a bar on the keyboard, and nothing of ours can sit there on an
 * iPhone. iOS puts its own ^ v ✓ bar on the keyboard, which a web page
 * cannot remove, and the installed app reports the screen short by the
 * status bar, so a bar placed from the screen's height landed behind iOS's.
 * The header is also the part of the page iOS can be kept from moving while
 * you type (keyboardRoom.js).
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

/** How long after a touch the focus it brings still counts as that touch's, in ms. */
const TAP_FRESH = 1000

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
  const [desktop] = useState(onDesktop)
  const readOnly = !!note.deletedAt

  const [focused, setFocused] = useState(false)
  const [formatOpen, setFormatOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  /* Where the last touch on the note landed. The caret is going there, but
     the focus arrives before the selection has moved (keyboardRoom.js). */
  const tap = useRef(/** @type {{x: number, y: number, at: number}|null} */ (null))

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
        // Its own caret, kept clear here (keyboardRoom.js), not by the pages' guard.
        'data-own-keyboard': '',
      },
      /* Keeping the caret in view. On a phone, clear of the header and the
         keyboard, by scrolling the note alone: ProseMirror's own way ends by
         scrolling the window, and on an iPhone that slides the whole page
         (keyboardRoom.js). On a computer, ProseMirror's way, clear of the bar
         above the note. */
      handleScrollToSelection: (view) => !desktop && keepCaretClear(view),
      scrollMargin: { top: 90, bottom: 80, left: 0, right: 0 },
      scrollThreshold: { top: 90, bottom: 80, left: 0, right: 0 },
    },
    onUpdate: ({ editor: e, transaction }) => {
      /* Only a change to the document is something to save. Tiptap also
         emits an update with no change in it - setEditable does, below, as
         the note opens - and saving that stamped editedAt on every note
         merely opened, so opening one moved it to the top of the list. */
      if (transaction && !transaction.docChanged) return
      latest.current = e.getJSON()
      dirty.current = true
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => { flushRef.current() }, SAVE_AFTER)
    },
    onFocus: ({ editor: e }) => {
      setFocused(true)
      setFormatOpen(false)
      if (desktop) return
      /* The caret above where the keyboard is about to be, before it is up,
         so iOS finds nothing to scroll the page for (keyboardRoom.js). */
      const touched = tap.current && performance.now() - tap.current.at < TAP_FRESH ? tap.current : null
      tap.current = null
      keepCaretClear(e.view, touched)
    },
    onBlur: () => { setFocused(false); flushRef.current() },
  })

  // Just made: write in it straight away. The pencil held the keyboard up (lib/keyboardHold.js).
  useEffect(() => {
    if (!editor || readOnly) { releaseKeyboard(); return }
    if (fresh) editor.commands.focus('end')
    releaseKeyboard()
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

  // Put in Recently deleted, or put back, while open.
  // false: no update event, which would read as an edit (see onUpdate).
  useEffect(() => { editor?.setEditable(!readOnly, false) }, [editor, readOnly])

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

  /* Done: the keyboard or the panel down, whichever is up. */
  function done() {
    setFormatOpen(false)
    editor?.commands.blur()
  }

  const writing = (focused || formatOpen) && !readOnly && !desktop

  /* While you write: the note taller than the room above the keyboard, and a
     drag past its end kept in it rather than moving the page (index.css,
     html.note-writing). */
  useEffect(() => {
    if (!writing) return
    const root = document.documentElement
    root.classList.add('note-writing')
    return () => root.classList.remove('note-writing')
  }, [writing])

  /* The keyboard, as it comes and goes. Its height is kept for the next time
     it opens. If iOS scrolled the page anyway, the page goes back and the note
     scrolls instead - not more than once a beat, so a scroll iOS insists on
     is never fought over. */
  useEffect(() => {
    if (desktop || !editor) return
    const vv = window.visualViewport
    if (!vv) return
    let undone = -Infinity
    const onChange = () => {
      rememberKeyboard('text')
      if (editor.isDestroyed || !editor.isFocused) return
      if (Math.abs(vv.scale - 1) > 0.01) return
      if (vv.offsetTop > 1 && performance.now() - undone > 300) {
        undone = performance.now()
        window.scrollTo(0, 0)
      }
      keepCaretClear(editor.view)
    }
    vv.addEventListener('resize', onChange)
    vv.addEventListener('scroll', onChange)
    return () => {
      vv.removeEventListener('resize', onChange)
      vv.removeEventListener('scroll', onChange)
    }
  }, [editor, desktop])

  return (
    <div className="pb-page">
      <PageHeader
        title={<span className="sr-only">{note.title || 'New note'}</span>}
        backLabel="Back to notes"
        onBack={back}
        action={writing && editor ? (
          <WritingActions
            editor={editor}
            focused={focused}
            formatOpen={formatOpen}
            onFormat={formatOpen ? closeFormat : openFormat}
            onDone={done}
          />
        ) : desktop ? (
          <NoteMenu open={menuOpen} onOpen={() => setMenuOpen(true)} onClose={() => setMenuOpen(false)}>
            <NoteMenuItem onPress={togglePin} label={note.pinned ? 'Unpin note' : 'Pin note'}><IconPin size={17} /></NoteMenuItem>
            {canShare && <NoteMenuItem onPress={share} label="Share"><IconShare size={17} /></NoteMenuItem>}
            <NoteMenuItem onPress={remove} label="Delete note" danger><IconBin size={17} /></NoteMenuItem>
          </NoteMenu>
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
        <div className="note-desk-bar sticky top-0 z-10 mx-5 mb-3">
          <FormatControls editor={editor} layout="bar" />
        </div>
      )}

      <p className="px-5 mb-3 text-center text-12 text-slate-400 dark:text-slate-500 tabular-nums">
        {noteStamp(note.editedAt)}
      </p>

      <div
        className="px-5"
        onPointerDownCapture={(e) => {
          if (e.pointerType !== 'mouse') tap.current = { x: e.clientX, y: e.clientY, at: performance.now() }
        }}
        onClick={(e) => {
          // A tap under the last line: the caret at the end, as on an iPhone.
          if (!editor || readOnly || e.target !== e.currentTarget) return
          editor.commands.focus('end')
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {formatOpen && editor && !desktop && (
        <FormatPanel editor={editor} onClose={closeFormat} />
      )}

      {/* The phone's options rise from the bottom; the desktop's drop from
          the button (NoteMenu, in the header). */}
      <Sheet open={menuOpen && !desktop} onClose={() => setMenuOpen(false)} ariaLabel="Note options">
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

/**
 * The note's options on a computer: a menu dropping from the button, as a
 * Mac app's would, not a sheet rising from the bottom of the window. Closes
 * on a pick, on Escape, and on a click anywhere else; the arrow keys move
 * through it.
 *
 * @param {{open: boolean, onOpen: () => void, onClose: () => void, children: import('react').ReactNode}} props
 */
function NoteMenu({ open, onOpen, onClose, children }) {
  const box = useRef(/** @type {HTMLDivElement|null} */ (null))

  useEffect(() => {
    if (!open) return
    const el = box.current
    const first = /** @type {HTMLButtonElement|null} */ (el?.querySelector('[role="menuitem"]'))
    first?.focus()
    const onDown = (/** @type {MouseEvent} */ e) => {
      if (el && !el.contains(/** @type {Node} */ (e.target))) onClose()
    }
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const rows = /** @type {HTMLButtonElement[]} */ ([...(el?.querySelectorAll('[role="menuitem"]') ?? [])])
      const at = rows.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement))
      const next = e.key === 'ArrowDown' ? (at + 1) % rows.length : (at - 1 + rows.length) % rows.length
      rows[next]?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <div ref={box} className="relative">
      <IconButton
        label="Note options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={open ? onClose : onOpen}
      >
        <IconMore size={19} />
      </IconButton>
      {open && (
        <div role="menu" aria-label="Note options" className="note-menu card-solid absolute right-0 top-full mt-2 z-30 w-[208px] p-1.5 rounded-xl">
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * A row of NoteMenu. Each option closes the menu itself, as it does the
 * phone's sheet.
 *
 * @param {{label: string, onPress: () => void, danger?: boolean, children: import('react').ReactNode}} props
 */
function NoteMenuItem({ label, onPress, danger = false, children }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onPress}
      className={`w-full flex items-center gap-2.5 px-2.5 h-10 rounded-lg text-left text-13 font-medium
        hover:bg-slate-100 dark:hover:bg-white/[0.07] focus-visible:bg-slate-100 dark:focus-visible:bg-white/[0.07]
        outline-none transition-colors duration-100
        ${danger ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}
    >
      <span className={danger ? '' : 'text-slate-500 dark:text-slate-400'}>{children}</span>
      {label}
    </button>
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
 * Refuses the mouse-down, which is what moves the focus - so a tap on a
 * header button leaves the caret and the keyboard where they are, as the
 * note's other buttons do (FormatControls.jsx NoteButton).
 *
 * @param {import('react').MouseEvent} e
 */
const keepFocus = (e) => e.preventDefault()

/**
 * The header while a note is written on a phone: Aa, a checklist, Done.
 *
 * @param {{editor: import('@tiptap/react').Editor, focused: boolean, formatOpen: boolean, onFormat: () => void, onDone: () => void}} props
 *   focused: the keyboard is up, and the checklist keeps the caret in the
 *   note. With the panel up instead, it works on the selection and leaves
 *   the keyboard down.
 */
function WritingActions({ editor, focused, formatOpen, onFormat, onDone }) {
  const st = useFormatState(editor)
  const cmd = formatCommands(editor, st, focused)
  return (
    <>
      <IconButton
        label="Format"
        aria-pressed={formatOpen}
        variant={formatOpen ? 'primary' : 'surface'}
        onMouseDown={keepFocus}
        onClick={onFormat}
      >
        <span aria-hidden="true" className="text-15 font-semibold leading-none">Aa</span>
      </IconButton>
      <IconButton
        label="Checklist"
        aria-pressed={!!st?.task}
        variant={st?.task ? 'primary' : 'surface'}
        onMouseDown={keepFocus}
        onClick={cmd.task}
      >
        <IconChecklist size={18} />
      </IconButton>
      <Button variant="tint" size="xs" className="px-4" onClick={onDone}>Done</Button>
    </>
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
