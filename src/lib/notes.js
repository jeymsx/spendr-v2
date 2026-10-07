import db, { TRASH_DAYS, UNSYNCED } from '../db/db'
import { queueRemoteDelete } from './sync'
import { NEW_NOTE_DOC, docText, noteTitle } from './noteText'
import { cleanTags } from './noteFiling'

/**
 * Writing notes: made, saved as you type, pinned, put in Recently deleted,
 * put back, and gone for good (pages/Notes.jsx, pages/notes/NoteEditor.jsx).
 *
 * ── Saved, never "saved" ──
 *
 * There is no Save button, as there is none in iOS Notes: the editor writes
 * the note a moment after each change (saveNote). What is stored is the
 * editor's document, with the title and text read off it (lib/noteText.js) so
 * the list and search never open a document to show a row.
 *
 * ── An empty note is not kept ──
 *
 * Opening a new note and leaving it blank leaves nothing behind (discardIfBlank)
 * - iOS does the same - and a blank note is never sent to another device
 * (lib/sync.js pushNotes), so a note started on the phone does not appear on
 * the laptop as "New note" before it has a word in it.
 *
 * ── Deleting ──
 *
 * First into Recently deleted, for thirty days, as a mark on the note
 * (`deletedAt`), which syncs like any edit: delete it on the phone and it
 * waits in the laptop's Recently deleted too. Only deleting it from there - or
 * thirty days - removes the row, and that removal travels as a tombstone
 * (014_deletions.sql, pullDeletions).
 */

/** A note as the editor left it: its document, and what the list reads off it. @param {Record<string, any>} doc */
export function readNote(doc) {
  return { doc, title: noteTitle(doc), text: docText(doc) }
}

/**
 * A new, empty note. Returns its id.
 *
 * @param {Record<string, any>} [doc]  what it starts with; one empty title line if not given
 * @param {{folder?: string|null, tags?: string[]}} [filing]  the folder it starts in (a syncId) and its tags -
 *   a note started while a folder is open begins in it
 */
export async function createNote(doc = NEW_NOTE_DOC, { folder = null, tags = [] } = {}) {
  const now = new Date().toISOString()
  // A copy: the frozen starting document must not be the one the editor holds.
  const start = JSON.parse(JSON.stringify(doc))
  return /** @type {Promise<number>} */ (db.notes.add({
    ...readNote(start),
    pinned: false,
    folder: folder ?? null,
    tags: cleanTags(tags),
    createdAt: now,
    editedAt: now,
    deletedAt: null,
    synced: UNSYNCED,
  }))
}

/**
 * The editor's document, written down. Returns the `updatedAt` it was stamped
 * with, so the editor can tell its own saves from a copy synced in from
 * another device (NoteEditor).
 *
 * @param {number} id
 * @param {Record<string, any>} doc
 */
export async function saveNote(id, doc) {
  const at = new Date().toISOString()
  await db.notes.update(id, { ...readNote(doc), editedAt: at, updatedAt: at, synced: UNSYNCED })
  return at
}

/** @param {number} id @param {boolean} pinned */
export async function setPinned(id, pinned) {
  await db.notes.update(id, { pinned: !!pinned, synced: UNSYNCED })
}

/**
 * Filed in a folder, or - with null - taken out of the one it is in.
 * Filing is not writing: the note keeps the place the list gives it.
 *
 * @param {number} id @param {string|null} folder  a folder's syncId
 */
export async function moveNote(id, folder) {
  await db.notes.update(id, { folder: folder || null, synced: UNSYNCED })
}

/**
 * Its tags, replaced - each tidied, none twice, as many as a note may hold
 * (lib/noteFiling.js). Returns what was kept.
 *
 * @param {number} id @param {string[]} tags
 */
export async function setNoteTags(id, tags) {
  const kept = cleanTags(tags)
  await db.notes.update(id, { tags: kept, synced: UNSYNCED })
  return kept
}

/** Into Recently deleted. @param {number} id */
export async function trashNote(id) {
  await db.notes.update(id, { deletedAt: new Date().toISOString(), synced: UNSYNCED })
}

/** Out of Recently deleted, where it was. @param {number} id */
export async function restoreNote(id) {
  await db.notes.update(id, { deletedAt: null, synced: UNSYNCED })
}

/**
 * Gone, here and - once it has been there - on the server.
 *
 * A note that never went up has nothing to delete there, and queueing the
 * delete anyway would leave it in the queue of a device that never signs in.
 *
 * @param {number} id
 */
export async function deleteNoteForever(id) {
  const note = await db.notes.get(id)
  if (!note) return
  await db.notes.delete(id)
  if (note.syncId && note.pushed) await queueRemoteDelete('notes', { sync_id: note.syncId })
}

/**
 * A note left without a word in it, not kept. Returns whether it went.
 *
 * @param {number} id
 */
export async function discardIfBlank(id) {
  const note = await db.notes.get(id)
  if (!note || note.deletedAt) return false
  if ((note.text ?? '').trim() || docText(note.doc).trim()) return false
  await deleteNoteForever(id)
  return true
}

/**
 * What has been in Recently deleted past thirty days, gone for good.
 * Returns how many.
 *
 * @param {Date} [now]
 */
export async function purgeNotes(now = new Date()) {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * 86_400_000).toISOString()
  const old = await db.notes.where('deletedAt').below(cutoff).toArray()
  for (const n of old) if (n.id != null) await deleteNoteForever(n.id)
  return old.length
}

/** Everything in the notes' Recently deleted, gone for good. */
export async function emptyNotesTrash() {
  const all = await db.notes.filter(n => !!n.deletedAt).toArray()
  for (const n of all) if (n.id != null) await deleteNoteForever(n.id)
  return all.length
}

/** Whole days a deleted note has left before it goes. @param {string} deletedAt @param {Date} [now] */
export function daysLeft(deletedAt, now = new Date()) {
  const gone = new Date(deletedAt).getTime() + TRASH_DAYS * 86_400_000
  return Math.max(0, Math.ceil((gone - now.getTime()) / 86_400_000))
}
