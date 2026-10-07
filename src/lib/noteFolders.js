import db, { UNSYNCED } from '../db/db'
import { queueRemoteDelete } from './sync'
import { normalizeFolderName } from './noteFiling'

/**
 * Folders for notes: made, renamed and deleted (pages/Notes.jsx). A note is
 * filed in one by holding its syncId (lib/notes.js moveNote), so a folder
 * keeps its name on every device and a rename moves nothing.
 *
 * Names are unique, ignoring case - two "Work" folders would be one choice in
 * a list that cannot tell them apart - so making one that is there gives back
 * the one that is there.
 *
 * Deleting a folder deletes the folder, not what is in it: its notes are kept,
 * unfiled. Not into Recently deleted - a note is only ever put there on its
 * own account.
 */

/** @param {string} a @param {string} b */
const same = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0

/**
 * A new folder, or the one of that name already there. Returns it - or null
 * for a name with nothing in it.
 *
 * @param {string} name
 * @returns {Promise<NoteFolderRow|null>}
 */
export async function createFolder(name) {
  const clean = normalizeFolderName(name)
  if (!clean) return null
  const have = (await db.note_folders.toArray()).find(f => same(f.name, clean))
  if (have) return have
  const now = new Date().toISOString()
  const id = await db.note_folders.add({ name: clean, createdAt: now, updatedAt: now, synced: UNSYNCED })
  return (await db.note_folders.get(id)) ?? null
}

/**
 * Renamed. False - and nothing changed - for an empty name, or one another
 * folder has.
 *
 * @param {number} id @param {string} name
 */
export async function renameFolder(id, name) {
  const clean = normalizeFolderName(name)
  if (!clean) return false
  const all = await db.note_folders.toArray()
  if (all.some(f => f.id !== id && same(f.name, clean))) return false
  await db.note_folders.update(id, { name: clean, synced: UNSYNCED })
  return true
}

/**
 * Gone - here and, once it has been there, on the server - with its notes
 * kept and taken out of it. Returns how many notes that was.
 *
 * @param {number} id
 */
export async function deleteFolder(id) {
  const folder = await db.note_folders.get(id)
  if (!folder) return 0
  const key = folder.syncId
  let moved = 0
  await db.transaction('rw', [db.notes, db.note_folders], async () => {
    if (key) {
      const filed = await db.notes.filter(n => n.folder === key).toArray()
      for (const n of filed) {
        await db.notes.update(/** @type {number} */ (n.id), { folder: null, synced: UNSYNCED })
        moved++
      }
    }
    await db.note_folders.delete(id)
  })
  if (key) await queueRemoteDelete('note_folders', { sync_id: key })
  return moved
}
