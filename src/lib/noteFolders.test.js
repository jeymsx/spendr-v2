import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Folders for notes (lib/noteFolders.js): unique names, a rename that moves
 * nothing, and a delete that keeps the notes in it. `db` is a small in-memory
 * stand-in for the two tables these calls touch, with Dexie's semantics for
 * the handful of calls they make.
 */

/** @param {Map<number, any>} rows @param {{n: number}} seq */
function fakeTable(rows, seq) {
  return {
    add: async (/** @type {any} */ row) => { const id = seq.n++; rows.set(id, { ...row, id, syncId: row.syncId ?? `sync-${id}` }); return id },
    get: async (/** @type {number} */ id) => (rows.has(id) ? { ...rows.get(id) } : undefined),
    update: async (/** @type {number} */ id, /** @type {any} */ mods) => { if (!rows.has(id)) return 0; rows.set(id, { ...rows.get(id), ...mods }); return 1 },
    delete: async (/** @type {number} */ id) => { rows.delete(id) },
    toArray: async () => [...rows.values()].map(r => ({ ...r })),
    filter: (/** @type {(r: any) => boolean} */ fn) => ({ toArray: async () => [...rows.values()].filter(fn).map(r => ({ ...r })) }),
  }
}
const folderRows = new Map()
const noteRows = new Map()
const folderSeq = { n: 1 }
const noteSeq = { n: 1 }
vi.mock('../db/db', () => ({
  default: {
    note_folders: fakeTable(folderRows, folderSeq),
    notes: fakeTable(noteRows, noteSeq),
    transaction: async (/** @type {any} */ _mode, /** @type {any} */ _tables, /** @type {() => Promise<any>} */ fn) => fn(),
  },
  UNSYNCED: 0,
}))
const queue = vi.fn()
vi.mock('./sync', () => ({ queueRemoteDelete: (/** @type {any[]} */ ...a) => queue(...a) }))

const { createFolder, renameFolder, deleteFolder } = await import('./noteFolders')

beforeEach(() => { folderRows.clear(); noteRows.clear(); folderSeq.n = 1; noteSeq.n = 1; queue.mockClear() })

describe('createFolder', () => {
  it('makes a folder with its name tidied, unsent', async () => {
    const f = await createFolder('  Work   notes ')
    expect(f).toMatchObject({ name: 'Work notes', synced: 0 })
    expect(f?.syncId).toBeTruthy()
  })

  it('gives back the folder of that name when there is one, whatever the case', async () => {
    const a = await createFolder('Work')
    const b = await createFolder('work')
    expect(b?.id).toBe(a?.id)
    expect(folderRows.size).toBe(1)
  })

  it('makes nothing from a name with nothing in it', async () => {
    expect(await createFolder('   ')).toBeNull()
    expect(folderRows.size).toBe(0)
  })
})

describe('renameFolder', () => {
  it('renames it and marks it unsent', async () => {
    const f = await createFolder('Work')
    folderRows.set(f?.id, { ...folderRows.get(f?.id), synced: 1 })
    expect(await renameFolder(/** @type {number} */ (f?.id), ' Office ')).toBe(true)
    expect(folderRows.get(f?.id)).toMatchObject({ name: 'Office', synced: 0 })
  })

  it('refuses a name another folder has, and an empty one', async () => {
    const a = await createFolder('Work')
    await createFolder('Ideas')
    expect(await renameFolder(/** @type {number} */ (a?.id), 'ideas')).toBe(false)
    expect(await renameFolder(/** @type {number} */ (a?.id), '  ')).toBe(false)
    expect(folderRows.get(a?.id).name).toBe('Work')
  })

  it('lets a folder keep its own name in another case', async () => {
    const a = await createFolder('work')
    expect(await renameFolder(/** @type {number} */ (a?.id), 'Work')).toBe(true)
    expect(folderRows.get(a?.id).name).toBe('Work')
  })
})

describe('deleteFolder', () => {
  it('removes the folder, keeps its notes and unfiles them, and asks the server to drop it', async () => {
    const work = await createFolder('Work')
    const other = await createFolder('Ideas')
    noteRows.set(1, { id: 1, folder: work?.syncId, synced: 1 })
    noteRows.set(2, { id: 2, folder: work?.syncId, synced: 1 })
    noteRows.set(3, { id: 3, folder: other?.syncId, synced: 1 })
    noteRows.set(4, { id: 4, folder: null, synced: 1 })

    expect(await deleteFolder(/** @type {number} */ (work?.id))).toBe(2)

    expect(folderRows.has(work?.id)).toBe(false)
    expect(folderRows.has(other?.id)).toBe(true)
    expect(noteRows.get(1)).toMatchObject({ folder: null, synced: 0 })
    expect(noteRows.get(2)).toMatchObject({ folder: null, synced: 0 })
    expect(noteRows.get(3)).toMatchObject({ folder: other?.syncId, synced: 1 })
    expect(queue).toHaveBeenCalledWith('note_folders', { sync_id: work?.syncId })
  })

  it('does nothing for a folder that is not there', async () => {
    expect(await deleteFolder(99)).toBe(0)
    expect(queue).not.toHaveBeenCalled()
  })
})
