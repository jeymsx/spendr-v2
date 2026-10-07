import { useSyncExternalStore } from 'react'

/**
 * Which part of the notes the list is showing: the folders themselves
 * (`screen: 'folders'`), or notes - all of them or one folder
 * (`folder`: 'all' or a folder's syncId), a tag narrowing either. `screen`
 * is null until the person has gone one way or the other, and then the way
 * the list was set up to open decides (notesPrefs.js, screenOf).
 *
 * Kept for the session, outside the page, because more than the list wants
 * to know: the computer's New note button sits in the page's header, not in
 * the list, and a note started while a folder is open begins in it. The same
 * shape as the Insights period (pages/insights/period.js): sessionStorage, so
 * a reload keeps it and a new visit starts from the beginning.
 *
 * @typedef {{folder: string, tag: string|null, screen: 'folders'|'notes'|null}} NotesView
 */

const KEY = 'spendr-notes-view'

/** @returns {NotesView} */
function read() {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
    return {
      folder: typeof v?.folder === 'string' && v.folder ? v.folder : 'all',
      tag: typeof v?.tag === 'string' && v.tag ? v.tag : null,
      screen: v?.screen === 'folders' || v?.screen === 'notes' ? v.screen : null,
    }
  } catch {
    return { folder: 'all', tag: null, screen: null }
  }
}

let view = read()
const listeners = new Set()

/** @param {() => void} fn */
const subscribe = (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }

export const getNotesView = () => view

/** @param {Partial<NotesView>} patch */
export function setNotesView(patch) {
  const next = { ...view, ...patch }
  if (next.folder === view.folder && next.tag === view.tag && next.screen === view.screen) return
  view = next
  try { sessionStorage.setItem(KEY, JSON.stringify(view)) } catch { /* storage off: it lasts as long as the page */ }
  for (const fn of listeners) fn()
}

/** The view, and a way to change it; every user of it moves together. */
export function useNotesView() {
  return /** @type {const} */ ([useSyncExternalStore(subscribe, getNotesView, getNotesView), setNotesView])
}

/**
 * The screen the list is on: always notes when it is set up to open on them,
 * and otherwise the folders until one is opened.
 *
 * @param {NotesView} v @param {{start: 'notes'|'folders'}} prefs
 * @returns {'folders'|'notes'}
 */
export const screenOf = (v, prefs) => (prefs.start === 'folders' ? v.screen ?? 'folders' : 'notes')

/**
 * What a new note starts with in this view: the open folder, and the tag
 * being looked at - nothing, on the screen of folders, where none is open.
 *
 * @param {{folder: string, tag: string|null}} v @param {'folders'|'notes'} [screen]
 * @returns {{folder: string|null, tags: string[]}}
 */
export const filingOf = (v, screen = 'notes') => (
  screen === 'folders'
    ? { folder: null, tags: [] }
    : { folder: v.folder === 'all' ? null : v.folder, tags: v.tag ? [v.tag] : [] }
)
