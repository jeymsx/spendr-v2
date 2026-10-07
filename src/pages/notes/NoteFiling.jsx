import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { createFolder, deleteFolder } from '../../lib/noteFolders'
import { moveNote, setNoteTags } from '../../lib/notes'
import { FOLDER_MAX, MAX_TAGS, TAG_MAX, normalizeTag, tagCounts } from '../../lib/noteFiling'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import Field from '../../components/ui/Field'
import IconButton from '../../components/ui/IconButton'
import { RAIL_TOUCH } from '../../components/ui/Rail'
import SectionLabel from '../../components/ui/SectionLabel'
import Sheet from '../../components/ui/Sheet'
import Switch from '../../components/ui/Switch'
import FadeScroller from '../../components/FadeScroller'
import { IconChevronLeft, IconChevronRight, IconNotes } from '../../components/icons'
import { useNotesPrefs } from './notesPrefs'
import { IconAdd, IconBin, IconClose, IconEdit, IconFolder, IconFolderPlus, IconMore, IconTag, IconTick } from './icons'

/**
 * How notes are organised, on the page that lists them and in the note that
 * is open (lib/noteFiling.js says what a folder and a tag are).
 *
 * The list is set up to open one of two ways (notesPrefs.js, the sliders
 * beside New note). On the notes, newest first, it has a row of folders above
 * it - All notes, then each folder, then a way to make one. On the folders,
 * they are the list: All notes, each folder with its count, and a way to make
 * one, and opening a folder shows the notes inside it, with a way back. Tags
 * are a row of their own in either, and any of them narrows the list. A note
 * is filed from its own menu (Move to folder, Tags), or, with a mouse, by
 * dragging its row onto a folder.
 *
 * The same pieces serve the phone and the computer, as the Notes list does.
 */

/** The folders, by name; undefined until read. */
export function useFolders() {
  return /** @type {NoteFolderRow[]|undefined} */ (
    useLiveQuery(async () => (await db.note_folders.toArray()).sort((a, b) => a.name.localeCompare(b.name)), [], undefined)
  )
}

/** The type a dragged note row carries. */
export const NOTE_DRAG = 'text/spendr-note'

/** A dragged note is over a folder that will take it. @param {import('react').DragEvent} e */
const carriesNote = (e) => [...(e.dataTransfer?.types ?? [])].includes(NOTE_DRAG)

/**
 * What a folder - a chip, a row - needs to take a dragged note: it lights
 * while one is over it, and filing happens on the drop.
 *
 * @param {(noteId: number, folder: string|null) => void} onDropNote
 */
function useDropTargets(onDropNote) {
  const [over, setOver] = useState(/** @type {string|null} */ (null))
  /** @param {string} key 'all' or a folder's syncId  @param {string|null} folder where a drop files the note */
  return (key, folder) => ({
    onDragOver: (/** @type {import('react').DragEvent} */ e) => { if (carriesNote(e)) { e.preventDefault(); setOver(key) } },
    onDragLeave: () => setOver(o => (o === key ? null : o)),
    onDrop: (/** @type {import('react').DragEvent} */ e) => {
      if (!carriesNote(e)) return
      e.preventDefault()
      setOver(null)
      const id = Number(e.dataTransfer.getData(NOTE_DRAG))
      if (Number.isFinite(id)) onDropNote(id, folder)
    },
    'data-drop': over === key ? 'true' : undefined,
  })
}

/**
 * A mouse's wheel, over a rail, moves it sideways - a computer has no swipe,
 * and a row that only scrolls to a shift-wheel is a row nobody finds the end
 * of. Only until the rail is at its end: then the page takes the wheel again.
 *
 * @param {import('react').RefObject<HTMLElement|null>} ref
 */
function useWheelAcross(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el || !document.documentElement.classList.contains('web')) return
    const onWheel = (/** @type {WheelEvent} */ e) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
      const max = el.scrollWidth - el.clientWidth
      if (max <= 1) return
      const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY))
      if (next === el.scrollLeft) return
      e.preventDefault()
      el.scrollLeft = next
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref])
}

/**
 * A row of chips that scrolls sideways, its edges softened where there is
 * more to scroll to (components/FadeScroller) - not wrapped, so a column of
 * any width keeps one line of them.
 *
 * @param {{label: string, gap?: string, children: import('react').ReactNode}} props
 */
function FeatherRail({ label, gap = 'gap-2', children }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  useWheelAcross(ref)
  return (
    <FadeScroller ref={ref} axis="x" fade={32} aria-label={label} className={`flex ${gap} px-5 py-1`} style={RAIL_TOUCH}>
      {children}
      <span className="shrink-0 w-3" aria-hidden="true" />
    </FadeScroller>
  )
}

/**
 * One chip of a rail.
 *
 * @param {{on?: boolean, tone?: 'folder'|'tag'|'ghost', children: import('react').ReactNode} & import('react').ButtonHTMLAttributes<HTMLButtonElement>} props
 */
function Chip({ on = false, tone = 'folder', children, className = '', ...rest }) {
  const size = tone === 'tag' ? 'h-7 px-3 text-12' : 'h-8 px-3.5 text-13'
  const look = on
    ? 'bg-primary text-on-primary'
    : tone === 'ghost'
      ? 'text-primary border border-dashed border-primary/40 active:bg-primary/[0.08]'
      : 'bg-slate-100 text-slate-600 active:bg-slate-200 dark:bg-white/[0.07] dark:text-slate-300 dark:active:bg-white/[0.11]'
  return (
    <button
      type="button"
      aria-pressed={tone === 'ghost' ? undefined : on}
      className={`press press-fade shrink-0 inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-colors duration-150 ${size} ${look} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/** The count beside a chip's name. @param {{n: number}} props */
const Count = ({ n }) => <span className="tabular-nums opacity-60 font-medium">{n}</span>

/**
 * The folders as a row of chips above the notes: All notes, each folder, and
 * a way to make one.
 *
 * @param {{folders: NoteFolderRow[], counts: Map<string, number>, total: number, active: string,
 *          onOpen: (folder: string) => void, onNewFolder: () => void,
 *          onDropNote: (noteId: number, folder: string|null) => void,
 *          bind: (folder: NoteFolderRow) => Record<string, any>}} props  bind: what opens a folder's menu (useFolderMenu)
 */
export function FolderChips({ folders, counts, total, active, onOpen, onNewFolder, onDropNote, bind }) {
  const target = useDropTargets(onDropNote)
  return (
    <div className="note-filing mb-1">
      <FeatherRail label="Folders">
        <Chip on={active === 'all'} onClick={() => onOpen('all')} {...target('all', null)}>
          All notes <Count n={total} />
        </Chip>
        {folders.map(f => (
          <Chip key={f.syncId} on={active === f.syncId} onClick={() => onOpen(String(f.syncId))} {...target(String(f.syncId), f.syncId ?? null)} {...bind(f)}>
            <IconFolder size={15} /> {f.name} <Count n={counts.get(String(f.syncId)) ?? 0} />
          </Chip>
        ))}
        <Chip tone="ghost" onClick={onNewFolder}>
          <IconFolderPlus size={15} /> {folders.length ? 'New' : 'New folder'}
        </Chip>
      </FeatherRail>
    </div>
  )
}

/**
 * The tags in use, as a row of chips that scrolls; one narrows the list.
 *
 * @param {{tags: Array<{tag: string, count: number}>, active: string|null, onPick: (tag: string|null) => void}} props
 */
export function TagRail({ tags, active, onPick }) {
  if (!tags.length) return null
  return (
    <div className="note-filing mb-1">
      <FeatherRail label="Tags" gap="gap-1.5">
        {tags.map(t => (
          <Chip key={t.tag} tone="tag" on={active === t.tag} onClick={() => onPick(active === t.tag ? null : t.tag)}>
            #{t.tag} <Count n={t.count} />
          </Chip>
        ))}
      </FeatherRail>
    </div>
  )
}

/**
 * One row of a list of folders: its glyph, its name, how many notes, and
 * the way in.
 *
 * @param {{icon: import('react').ReactNode, label: string, count?: number, accent?: boolean, onPress: () => void} & Record<string, any>} props
 */
function NavRow({ icon, label, count, accent = false, onPress, className = '', ...rest }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={`press press-fade w-full flex items-center gap-3 px-4 py-3.5 text-left text-15 font-medium active:bg-slate-50 dark:active:bg-white/[0.04]
        ${accent ? 'text-primary' : 'text-slate-800 dark:text-slate-100'} ${className}`}
      {...rest}
    >
      <span className={accent ? '' : 'text-primary'}>{icon}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {count != null && <span className="text-13 font-medium tabular-nums text-slate-400 dark:text-slate-500">{count}</span>}
      {!accent && <span className="text-slate-300 dark:text-slate-600"><IconChevronRight size={16} /></span>}
    </button>
  )
}

/**
 * The folders as the list, for a Notes that opens on them: All notes, each
 * folder with the notes in it, and a way to make one. Opening one shows its
 * notes; a note dragged onto a row is filed there.
 *
 * @param {{folders: NoteFolderRow[], counts: Map<string, number>, total: number,
 *          onOpen: (folder: string) => void, onNewFolder: () => void,
 *          onDropNote: (noteId: number, folder: string|null) => void,
 *          bind: (folder: NoteFolderRow) => Record<string, any>}} props  bind: what opens a folder's menu (useFolderMenu)
 */
export function FolderList({ folders, counts, total, onOpen, onNewFolder, onDropNote, bind }) {
  const target = useDropTargets(onDropNote)
  return (
    <section className="note-filing px-5 mb-3" aria-label="Folders">
      <Card clip>
        <NavRow icon={<IconNotes size={20} />} label="All notes" count={total} onPress={() => onOpen('all')} {...target('all', null)} />
        {folders.map(f => (
          <div key={f.syncId}>
            <Divider inset="row" />
            <NavRow icon={<IconFolder size={20} />} label={f.name} count={counts.get(String(f.syncId)) ?? 0}
              onPress={() => onOpen(String(f.syncId))} {...target(String(f.syncId), f.syncId ?? null)} {...bind(f)} />
          </div>
        ))}
        <Divider inset="row" />
        <NavRow accent icon={<IconFolderPlus size={20} />} label="New folder" onPress={onNewFolder} />
      </Card>
    </section>
  )
}

/**
 * Inside a folder on a Notes that opens on folders: the way back, the
 * folder's name and how many notes it holds, and - for a folder, not All
 * notes - its options button.
 *
 * @param {{name: string, count: number, onBack: () => void, onMore?: ((el: HTMLElement) => void)|null}} props
 */
export function FolderHeader({ name, count, onBack, onMore = null }) {
  return (
    <div className="px-5 mb-2">
      <div className="flex items-center gap-3 -ml-1.5">
        <button type="button" onClick={onBack} className="press press-fade inline-flex items-center gap-0.5 h-8 pl-1 pr-2 rounded-full text-14 font-semibold text-primary">
          <IconChevronLeft size={18} /> Folders
        </button>
        <span className="flex-1" />
        {onMore && <FolderOptionsButton onPress={onMore} />}
      </div>
      <h2 className="mt-1 text-22 font-bold tracking-tight text-slate-900 dark:text-white truncate">{name}</h2>
      <p className="text-13 text-slate-500 dark:text-slate-400 tabular-nums">{count} {count === 1 ? 'note' : 'notes'}</p>
    </div>
  )
}

/** The button beside an open folder that opens its menu. @param {{onPress: (el: HTMLElement) => void}} props */
export function FolderOptionsButton({ onPress }) {
  return (
    <IconButton label="Folder options" size="sm" aria-haspopup="menu" onClick={(/** @type {import('react').MouseEvent<HTMLElement>} */ e) => onPress(e.currentTarget)}>
      <IconMore size={17} />
    </IconButton>
  )
}

/** Longest a finger holds before it means a menu, in ms, and how far it may drift while it does, in px. */
const HOLD_MS = 480
const HOLD_SLOP = 10

/** Whether a press is a finger's, whose menu is a sheet and not a pop-up. @param {{pointerType?: string}|null} [e] */
const touchy = (e) => e?.pointerType === 'touch' || (typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches)

/**
 * A folder's menu - Rename, Delete - and every way to reach it: a right click,
 * the context-menu key, holding a finger on it (what a phone has instead of a
 * right click), and the options button beside an open folder.
 *
 * `bind(folder)` is what goes on a chip or a row; `openFrom(folder, element)`
 * is for a button; `open` is what <FolderMenu> draws.
 */
export function useFolderMenu() {
  const [open, setOpen] = useState(/** @type {{folder: NoteFolderRow, x: number, y: number, sheet: boolean}|null} */ (null))
  const hold = useRef(/** @type {{x: number, y: number, timer: ReturnType<typeof setTimeout>}|null} */ (null))
  /** A hold that opened the menu: the click that may follow its release is not a tap on the folder. */
  const held = useRef(false)

  const stop = () => { if (hold.current) clearTimeout(hold.current.timer); hold.current = null }

  /** @param {NoteFolderRow} folder */
  const bind = (folder) => ({
    onContextMenu: (/** @type {import('react').MouseEvent} */ e) => {
      e.preventDefault()
      stop()
      setOpen({ folder, x: e.clientX, y: e.clientY, sheet: touchy(/** @type {any} */ (e.nativeEvent)) })
    },
    onPointerDown: (/** @type {import('react').PointerEvent} */ e) => {
      if (e.pointerType !== 'touch') return
      stop()
      const at = { x: e.clientX, y: e.clientY }
      hold.current = {
        ...at,
        timer: setTimeout(() => {
          hold.current = null
          held.current = true
          navigator.vibrate?.(8)
          setOpen({ folder, ...at, sheet: true })
        }, HOLD_MS),
      }
    },
    onPointerMove: (/** @type {import('react').PointerEvent} */ e) => {
      const h = hold.current
      if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > HOLD_SLOP) stop()
    },
    onPointerUp: () => { stop(); if (held.current) setTimeout(() => { held.current = false }, 450) },
    onPointerCancel: stop,
    onPointerLeave: stop,
    onKeyDown: (/** @type {import('react').KeyboardEvent<HTMLElement>} */ e) => {
      if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return
      e.preventDefault()
      const r = e.currentTarget.getBoundingClientRect()
      setOpen({ folder, x: r.left + 12, y: r.bottom, sheet: false })
    },
    onClickCapture: (/** @type {import('react').MouseEvent} */ e) => {
      if (!held.current) return
      held.current = false
      e.preventDefault()
      e.stopPropagation()
    },
    className: 'select-none [-webkit-touch-callout:none]',
  })

  /** @param {NoteFolderRow} folder @param {HTMLElement} el the button it hangs from */
  const openFrom = (folder, el) => {
    const r = el.getBoundingClientRect()
    setOpen({ folder, x: r.right - 200, y: r.bottom + 6, sheet: touchy(null) })
  }

  return { open, bind, openFrom, close: () => setOpen(null) }
}

/**
 * The folder menu itself: a small pop-up at the pointer for a mouse, a sheet
 * for a finger. Closes on a pick, on Escape, on a click elsewhere, and when
 * the page moves under it.
 *
 * @param {{state: ReturnType<typeof useFolderMenu>['open'], onClose: () => void,
 *          onRename: (folder: NoteFolderRow) => void, onDelete: (folder: NoteFolderRow) => void}} props
 */
export function FolderMenu({ state, onClose, onRename, onDelete }) {
  // Kept while the sheet closes, so its title does not blank mid-exit.
  const [last, setLast] = useState(state)
  if (state && state !== last) setLast(state)
  const shown = state ?? last
  const box = useRef(/** @type {HTMLDivElement|null} */ (null))
  const popup = !!state && !state.sheet

  useEffect(() => {
    if (!popup) return
    const el = box.current
    ;/** @type {HTMLElement|null} */ (el?.querySelector('[role="menuitem"]'))?.focus()
    const onDown = (/** @type {MouseEvent} */ e) => { if (el && !el.contains(/** @type {Node} */ (e.target))) onClose() }
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const items = /** @type {HTMLElement[]} */ ([...(el?.querySelectorAll('[role="menuitem"]') ?? [])])
      const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement))
      items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [popup, onClose])

  const pick = (/** @type {(f: NoteFolderRow) => void} */ fn) => () => { const f = shown?.folder; onClose(); if (f) fn(f) }

  return (
    <>
      {popup && state && createPortal(
        <div
          ref={box}
          role="menu"
          aria-label={`${state.folder.name} folder`}
          className="note-menu card-solid fixed z-[260] w-[200px] p-1.5 rounded-xl"
          style={{ left: Math.max(8, Math.min(state.x, window.innerWidth - 208)), top: Math.max(8, Math.min(state.y, window.innerHeight - 100)) }}
        >
          <PopupItem label="Rename folder" onPress={pick(onRename)}><IconEdit size={17} /></PopupItem>
          <PopupItem label="Delete folder" danger onPress={pick(onDelete)}><IconBin size={17} /></PopupItem>
        </div>,
        document.body,
      )}
      <Sheet open={!!state?.sheet} onClose={onClose} title={shown?.folder.name ?? ''}>
        <Card clip className="mb-2">
          <FolderRow label="Rename folder" onPress={pick(onRename)}><IconEdit size={19} /></FolderRow>
          <Divider inset="row" />
          <FolderRow label="Delete folder" danger onPress={pick(onDelete)}><IconBin size={19} /></FolderRow>
        </Card>
      </Sheet>
    </>
  )
}

/** A row of the pop-up menu. @param {{label: string, danger?: boolean, onPress: () => void, children: import('react').ReactNode}} props */
function PopupItem({ label, danger = false, onPress, children }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onPress}
      className={`w-full flex items-center gap-2.5 px-2.5 h-10 rounded-lg text-left text-13 font-medium outline-none transition-colors duration-100
        hover:bg-slate-100 dark:hover:bg-white/[0.07] focus-visible:bg-slate-100 dark:focus-visible:bg-white/[0.07]
        ${danger ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}
    >
      <span className={danger ? '' : 'text-slate-500 dark:text-slate-400'}>{children}</span>
      {label}
    </button>
  )
}

/**
 * The Notes list, to taste: what it opens on, and whether the tags show.
 * Each change is made as it is picked.
 *
 * @param {{open: boolean, onClose: () => void}} props
 */
export function NotesViewSheet({ open, onClose }) {
  const [prefs, setPrefs] = useNotesPrefs()
  return (
    <Sheet open={open} onClose={onClose} title="Notes view" footer={<Button block onClick={onClose}>Done</Button>}>
      <SectionLabel>Open Notes to</SectionLabel>
      <Card clip>
        <ChoiceRow label="All notes" hint="Newest first, with your folders in a row along the top"
          on={prefs.start === 'notes'} onPress={() => setPrefs({ start: 'notes' })}><IconNotes size={20} /></ChoiceRow>
        <Divider inset="row" />
        <ChoiceRow label="Folders" hint="Your folders first. Open one to see the notes inside it"
          on={prefs.start === 'folders'} onPress={() => setPrefs({ start: 'folders' })}><IconFolder size={20} /></ChoiceRow>
      </Card>
      <SectionLabel className="mt-5">Show</SectionLabel>
      <Card clip>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="text-slate-500 dark:text-slate-400"><IconTag size={20} /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-14 font-medium text-slate-800 dark:text-slate-100">Tags</span>
            <span className="block text-12 text-slate-500 dark:text-slate-400">A row of the tags in use, to narrow the list</span>
          </span>
          <Switch on={prefs.tags} label="Show tags" onChange={(on) => setPrefs({ tags: on })} />
        </div>
      </Card>
    </Sheet>
  )
}

/** One of two ways, with what it does. @param {{label: string, hint: string, on: boolean, onPress: () => void, children: import('react').ReactNode}} props */
function ChoiceRow({ label, hint, on, onPress, children }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onPress}
      className="press press-fade w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50 dark:active:bg-white/[0.04]">
      <span className="text-slate-500 dark:text-slate-400">{children}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-14 font-medium text-slate-800 dark:text-slate-100">{label}</span>
        <span className="block text-12 text-slate-500 dark:text-slate-400">{hint}</span>
      </span>
      {on && <span className="text-primary"><IconTick size={18} /></span>}
    </button>
  )
}

/**
 * A sheet that asks for a folder's name: making one, or renaming it.
 *
 * @param {{open: boolean, onClose: () => void, title: string, initial?: string, confirmLabel: string,
 *          onSubmit: (name: string) => Promise<string|null|void>}} props
 *   onSubmit says what is wrong (a string) or, returning nothing, that it worked
 */
export function FolderNameSheet({ open, onClose, title, initial = '', confirmLabel, onSubmit }) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState(/** @type {string|null} */ (null))
  const [busy, setBusy] = useState(false)
  // Each opening starts from what it was given, and clean.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setName(initial); setError(null); setBusy(false) }
  }

  async function submit() {
    if (busy) return
    if (!name.trim()) { setError('Give it a name'); return }
    setBusy(true)
    try {
      const problem = await onSubmit(name)
      if (problem) { setError(problem); setBusy(false) }
    } catch (e) {
      console.error('[Notes] folder failed:', e)
      setError('Could not save it'); setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}
      footer={<Button block disabled={busy || !name.trim()} onClick={submit}>{confirmLabel}</Button>}>
      <Field
        label="Name"
        value={name}
        maxLength={FOLDER_MAX}
        placeholder="Work, Ideas, Shopping"
        error={error}
        autoFocus
        onChange={(/** @type {any} */ e) => { setName(e.target.value); setError(null) }}
        onKeyDown={(/** @type {import('react').KeyboardEvent} */ e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
      />
    </Sheet>
  )
}

/**
 * Taking a folder away, said plainly: its notes stay.
 *
 * @param {{folder: NoteFolderRow|null, count: number, onClose: () => void, onDeleted: () => void}} props
 */
export function DeleteFolderSheet({ folder, count, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false)
  // Kept while the sheet closes, so its words do not blank mid-exit.
  const [last, setLast] = useState(folder)
  if (folder && folder !== last) setLast(folder)
  const shown = folder ?? last
  async function go() {
    if (!folder?.id) return
    setBusy(true)
    try { await deleteFolder(folder.id); onDeleted() } finally { setBusy(false) }
  }
  return (
    <Sheet open={!!folder} onClose={onClose} title={`Delete “${shown?.name ?? ''}”?`} dismissible={!busy}
      footer={(
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button variant="danger" className="flex-1" disabled={busy} onClick={go}>Delete folder</Button>
        </div>
      )}>
      <p className="text-14 text-slate-600 dark:text-slate-300">
        {count > 0
          ? `The ${count === 1 ? 'note' : `${count} notes`} in it will stay, in All notes. Only the folder goes.`
          : 'It has no notes in it. Only the folder goes.'}
      </p>
    </Sheet>
  )
}

/**
 * Filing one note: which folder it is in, or none, or a new one.
 *
 * @param {{open: boolean, onClose: () => void, note: NoteRow, folders: NoteFolderRow[]}} props
 */
export function MoveToFolderSheet({ open, onClose, note, folders }) {
  const [creating, setCreating] = useState(false)
  const id = /** @type {number} */ (note.id)
  // However it ends, the next opening starts at the list of folders.
  const finish = () => { setCreating(false); onClose() }

  /** @param {string|null} folder */
  async function put(folder) {
    await moveNote(id, folder)
    finish()
  }

  if (creating) {
    return (
      <FolderNameSheet open={open} onClose={finish} title="New folder" confirmLabel="Create and move"
        onSubmit={async (name) => {
          const f = await createFolder(name)
          if (!f?.syncId) return 'Could not make the folder'
          await put(f.syncId)
        }} />
    )
  }
  return (
    <Sheet open={open} onClose={finish} title="Move to folder">
      <Card clip>
        <FolderRow label="No folder" on={!note.folder} onPress={() => put(null)}><IconFolder size={19} /></FolderRow>
        {folders.map(f => (
          <div key={f.syncId}>
            <Divider inset="row" />
            <FolderRow label={f.name} on={note.folder === f.syncId} onPress={() => put(f.syncId ?? null)}><IconFolder size={19} /></FolderRow>
          </div>
        ))}
        <Divider inset="row" />
        <FolderRow label="New folder…" accent onPress={() => setCreating(true)}><IconFolderPlus size={19} /></FolderRow>
      </Card>
    </Sheet>
  )
}

/** @param {{label: string, on?: boolean, accent?: boolean, danger?: boolean, onPress: () => void, children: import('react').ReactNode}} props */
function FolderRow({ label, on = false, accent = false, danger = false, onPress, children }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={`press press-fade w-full flex items-center gap-3 px-4 py-3.5 text-left text-14 font-medium active:bg-slate-50 dark:active:bg-white/[0.04]
        ${accent ? 'text-primary' : danger ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}
    >
      <span className={accent || danger ? '' : 'text-slate-500 dark:text-slate-400'}>{children}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {on && <span className="text-primary"><IconTick size={18} /></span>}
    </button>
  )
}

/**
 * One note's tags: the ones it has, with a way to take each off; a field to
 * add one; and the tags the other notes use, to add with a tap. Every change
 * is saved as it is made.
 *
 * @param {{open: boolean, onClose: () => void, note: NoteRow, all: NoteRow[]}} props  `all`: every note, for the tags in use
 */
export function TagsSheet({ open, onClose, note, all }) {
  const id = /** @type {number} */ (note.id)
  const tags = useMemo(() => note.tags ?? [], [note.tags])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(/** @type {string|null} */ (null))
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setDraft(''); setError(null) }
  }
  const suggestions = useMemo(() => tagCounts(all).filter(t => !tags.includes(t.tag)).slice(0, 12), [all, tags])

  /** @param {string} raw one tag, or several with commas */
  async function add(raw) {
    const made = raw.split(/[,\n]/).map(normalizeTag).filter(Boolean)
    if (!made.length) { setError(raw.trim() ? 'Use letters and numbers' : null); return }
    const next = [...tags]
    for (const t of made) if (!next.includes(t)) next.push(t)
    if (next.length > MAX_TAGS) { setError(`A note holds ${MAX_TAGS} tags at most`); return }
    await setNoteTags(id, next)
    setDraft(''); setError(null)
  }
  /** @param {string} tag */
  const remove = (tag) => setNoteTags(id, tags.filter(t => t !== tag))

  return (
    <Sheet open={open} onClose={onClose} title="Tags" footer={<Button block onClick={onClose}>Done</Button>}>
      <Field
        label="Add a tag"
        value={draft}
        maxLength={TAG_MAX + 8}
        placeholder="payday, ideas, to-buy"
        error={error}
        hint={error ? null : `${tags.length} of ${MAX_TAGS}`}
        right={draft.trim() ? <button type="button" className="text-13 font-semibold text-primary" onClick={() => add(draft)}>Add</button> : null}
        onChange={(/** @type {any} */ e) => { setDraft(e.target.value); setError(null) }}
        onKeyDown={(/** @type {import('react').KeyboardEvent} */ e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft) } }}
      />
      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="On this note">
          {tags.map(t => (
            <button key={t} type="button" onClick={() => remove(t)} aria-label={`Remove ${t}`}
              className="press press-fade inline-flex items-center gap-1.5 h-8 pl-3 pr-2.5 rounded-full text-13 font-semibold bg-primary text-on-primary">
              #{t} <IconClose size={13} />
            </button>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-12 font-semibold text-slate-500 dark:text-slate-400">Your tags</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map(s => (
              <button key={s.tag} type="button" onClick={() => add(s.tag)} aria-label={`Add ${s.tag}`}
                className="press press-fade inline-flex items-center gap-1.5 h-8 pl-3 pr-2.5 rounded-full text-13 font-semibold bg-slate-100 text-slate-600 dark:bg-white/[0.07] dark:text-slate-300">
                #{s.tag} <IconAdd size={13} />
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  )
}

/**
 * Where an open note is filed, under its date: its folder and its tags, each
 * opening the sheet that changes it. Nothing at all for a note with neither.
 *
 * @param {{folderName: string|null, tags: string[], onFolder: () => void, onTags: () => void}} props
 */
export function FilingPills({ folderName, tags, onFolder, onTags }) {
  if (!folderName && !tags.length) return null
  const pill = 'press press-fade inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-12 font-semibold'
  return (
    <div className="px-5 mb-3 flex flex-wrap justify-center gap-1.5">
      {folderName && (
        <button type="button" onClick={onFolder} className={`${pill} bg-primary/[0.08] text-primary dark:bg-primary/[0.14]`}>
          <IconFolder size={13} /> {folderName}
        </button>
      )}
      {tags.map(t => (
        <button key={t} type="button" onClick={onTags} className={`${pill} bg-slate-100 text-slate-600 dark:bg-white/[0.07] dark:text-slate-300`}>
          #{t}
        </button>
      ))}
    </div>
  )
}

