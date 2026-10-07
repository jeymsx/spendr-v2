import { useSyncExternalStore } from 'react'
import { setNotesView } from './notesView'

/**
 * How the Notes list is set up, to taste (the sliders beside New note):
 * whether it opens on the notes, newest first, with the folders along the
 * top, or on the folders themselves, to open one and see what is inside; and
 * whether the row of tags is shown.
 *
 * Kept on the device, like the layout choice (web/useViewMode.js): a phone
 * and a laptop may well want different ones, and it is a way of looking, not
 * a thing the ledger knows. Outside the page, so the phone's header button
 * and the computer's page header change the same list.
 *
 * @typedef {{start: 'notes'|'folders', tags: boolean}} NotesPrefs
 */

const KEY = 'spendr-notes-prefs'
/** @type {NotesPrefs} */
const DEFAULTS = { start: 'notes', tags: true }

/** @returns {NotesPrefs} */
function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return { start: v?.start === 'folders' ? 'folders' : 'notes', tags: v?.tags !== false }
  } catch {
    return { ...DEFAULTS }
  }
}

let prefs = read()
const listeners = new Set()

/** @param {() => void} fn */
const subscribe = (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }

export const getNotesPrefs = () => prefs

/** @param {Partial<NotesPrefs>} patch */
export function setNotesPrefs(patch) {
  const next = { ...prefs, ...patch }
  if (next.start === prefs.start && next.tags === prefs.tags) return
  const startChanged = next.start !== prefs.start
  prefs = next
  try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* storage off: it lasts as long as the page */ }
  // A new way to open starts from its own beginning, not from where the last one was.
  if (startChanged) setNotesView({ folder: 'all', tag: null, screen: null })
  for (const fn of listeners) fn()
}

/** The preferences, and a way to change them; every user of them moves together. */
export function useNotesPrefs() {
  return /** @type {const} */ ([useSyncExternalStore(subscribe, getNotesPrefs, getNotesPrefs), setNotesPrefs])
}
