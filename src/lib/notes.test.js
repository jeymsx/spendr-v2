import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Writing notes (lib/notes.js): what a save stores, what is thrown away, and
 * what a deletion asks the server to do.
 *
 * `db` is a small in-memory stand-in for the one table these calls touch,
 * with Dexie's semantics for the handful of calls they make. It is not a
 * Dexie emulator and does not try to be; the browser tests drive the real
 * one.
 */

const rows = new Map()
let nextId = 1
const table = {
  add: async (/** @type {any} */ row) => { const id = nextId++; rows.set(id, { ...row, id }); return id },
  get: async (/** @type {number} */ id) => (rows.has(id) ? { ...rows.get(id) } : undefined),
  update: async (/** @type {number} */ id, /** @type {any} */ mods) => { if (!rows.has(id)) return 0; rows.set(id, { ...rows.get(id), ...mods }); return 1 },
  delete: async (/** @type {number} */ id) => { rows.delete(id) },
  where: (/** @type {string} */ key) => ({
    below: (/** @type {string} */ v) => ({ toArray: async () => [...rows.values()].filter(r => r[key] != null && r[key] < v) }),
  }),
  filter: (/** @type {(r: any) => boolean} */ fn) => ({ toArray: async () => [...rows.values()].filter(fn) }),
}
vi.mock('../db/db', () => ({ default: { notes: table }, UNSYNCED: 0, SYNCED: 1, TRASH_DAYS: 30 }))
const queue = vi.fn()
vi.mock('./sync', () => ({ queueRemoteDelete: (/** @type {any[]} */ ...a) => queue(...a) }))

const {
  createNote, saveNote, discardIfBlank, deleteNoteForever, purgeNotes, trashNote, restoreNote,
  setPinned, emptyNotesTrash, daysLeft,
} = await import('./notes')
const { NEW_NOTE_DOC } = await import('./noteText')

const docOf = (/** @type {string} */ title, /** @type {string} */ line = '') => ({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: title ? [{ type: 'text', text: title }] : [] },
    ...(line ? [{ type: 'paragraph', content: [{ type: 'text', text: line }] }] : []),
  ],
})

beforeEach(() => { rows.clear(); nextId = 1; queue.mockClear() })

describe('createNote / saveNote', () => {
  it('starts a note as one empty title line, unsent', async () => {
    const id = await createNote()
    const n = rows.get(id)
    expect(n).toMatchObject({ title: '', text: '', pinned: false, deletedAt: null, synced: 0 })
    expect(n.doc).toEqual(NEW_NOTE_DOC)
    // Its own copy: the frozen starting document is never the one edited.
    expect(n.doc).not.toBe(NEW_NOTE_DOC)
    expect(n.createdAt).toBe(n.editedAt)
  })

  it('saves the document with its title and text read off it, and says when', async () => {
    const id = await createNote()
    const at = await saveNote(id, docOf('Payday', 'Rent first'))
    expect(rows.get(id)).toMatchObject({ title: 'Payday', text: 'Payday\nRent first', editedAt: at, updatedAt: at, synced: 0 })
  })

  it('pins without calling it an edit', async () => {
    const id = await createNote()
    const { editedAt } = rows.get(id)
    await setPinned(id, true)
    expect(rows.get(id)).toMatchObject({ pinned: true, editedAt, synced: 0 })
  })
})

describe('discardIfBlank', () => {
  it('throws away a note left without a word in it', async () => {
    const id = await createNote()
    expect(await discardIfBlank(id)).toBe(true)
    expect(rows.has(id)).toBe(false)
  })

  it('keeps a note with something in it', async () => {
    const id = await createNote()
    await saveNote(id, docOf('Groceries'))
    expect(await discardIfBlank(id)).toBe(false)
    expect(rows.has(id)).toBe(true)
  })

  it('leaves one in Recently deleted where it is', async () => {
    const id = await createNote()
    await trashNote(id)
    expect(await discardIfBlank(id)).toBe(false)
  })
})

describe('deleting', () => {
  it('puts a note in Recently deleted and back', async () => {
    const id = await createNote()
    await trashNote(id)
    expect(rows.get(id).deletedAt).toEqual(expect.any(String))
    await restoreNote(id)
    expect(rows.get(id).deletedAt).toBeNull()
  })

  it('asks the server to delete only a note that has been there', async () => {
    const a = await createNote()
    await table.update(a, { syncId: 'n-a', pushed: true })
    const b = await createNote()
    await table.update(b, { syncId: 'n-b', pushed: false })
    await deleteNoteForever(a)
    await deleteNoteForever(b)
    expect(queue).toHaveBeenCalledTimes(1)
    expect(queue).toHaveBeenCalledWith('notes', { sync_id: 'n-a' })
    expect(rows.size).toBe(0)
  })

  it('lets thirty days go by, then deletes for good', async () => {
    const now = new Date('2026-09-30T12:00:00.000Z')
    const old = await createNote()
    await table.update(old, { deletedAt: '2026-08-30T11:00:00.000Z' })
    const recent = await createNote()
    await table.update(recent, { deletedAt: '2026-09-20T12:00:00.000Z' })
    const kept = await createNote()
    expect(await purgeNotes(now)).toBe(1)
    expect([...rows.keys()].sort()).toEqual([recent, kept].sort())
  })

  it('empties Recently deleted, and only it', async () => {
    const a = await createNote(); await trashNote(a)
    const b = await createNote(); await trashNote(b)
    const c = await createNote()
    expect(await emptyNotesTrash()).toBe(2)
    expect([...rows.keys()]).toEqual([c])
  })

  it('counts the days a deleted note has left', () => {
    const now = new Date('2026-09-30T12:00:00.000Z')
    expect(daysLeft('2026-09-30T11:00:00.000Z', now)).toBe(30)
    expect(daysLeft('2026-09-01T11:00:00.000Z', now)).toBe(1)
    expect(daysLeft('2026-08-01T12:00:00.000Z', now)).toBe(0)
  })
})
