import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * What another device's change does on this one.
 *
 * pullChanges is what the live stream calls. Three things matter about it and
 * each was a way to get it wrong:
 *
 *   it brings down what is new, and says which transactions those were - the
 *   toast is made from that, so a device never announces its own work
 *
 *   it writes nothing to the cloud: a full sync pushes every row of the small
 *   tables, the stream sends each of those writes to every device, and a
 *   device that answered each with a push of its own would start two devices
 *   passing the same rows back and forth for ever
 *
 *   what it writes to this device is marked as the cloud's, so the watcher of
 *   local changes does not take a pull for something you did, and push it
 */

/** What the fake server holds, by table. @type {Record<string, any[]>} */
let server = {}
/** Every call that would change the server. @type {string[]} */
let serverWrites = []
/** Whether the cloud's writes were open when a row went into the ledger. @type {boolean[]} */
let remoteWhileWriting = []
const metaStore = new Map()
/** @type {any[]} */
let localTxs = []

const { isWritingRemote } = await import('./syncSignal')

/** What an empty stand-in answers with, typed so the answer is not an implicit any. */
const none = /** @type {any} */ (undefined)
const noRows = () => /** @type {any[]} */ ([])

/** A table that is empty and takes whatever it is asked: any method not named is a call that does nothing. */
function emptyTable() {
  /** @type {any} */
  const chain = new Proxy(
    /** @type {Record<string, any>} */ ({ first: async () => none, toArray: async () => noRows(), count: async () => 0, modify: async () => 0, delete: async () => 0 }),
    { get: (t, k) => (k in t ? t[/** @type {string} */ (k)] : () => chain) },
  )
  const own = /** @type {Record<string, any>} */ ({
    toArray: async () => noRows(), get: async () => none, put: async () => 1, add: async () => 1, update: async () => 1,
    delete: async () => none, bulkAdd: async () => 0, bulkPut: async () => 0, bulkDelete: async () => none, count: async () => 0,
    where: () => chain, filter: () => chain, toCollection: () => chain,
  })
  return own
}

/** The folders on this device. @type {any[]} */
let localFolders = []
/** The accounts and goals on this device, for what a push sends. @type {any[]} */
let localAccounts = []
/** @type {any[]} */
let localGoals = []
/** The transactions not yet sent. @type {any[]} */
let unsyncedTxs = []

vi.mock('../db/db', () => {
  const base = /** @type {Record<string, any>} */ ({
    /* Indexed by syncId alone, like the real one (db.js): asking for any other
       key does not come back empty, it throws. */
    note_folders: {
      ...emptyTable(),
      toArray: async () => localFolders,
      get: async (/** @type {number} */ id) => localFolders.find(f => f.id === id),
      add: async (/** @type {any} */ row) => { const id = localFolders.length + 1; localFolders.push({ ...row, id }); return id },
      where: (/** @type {string} */ key) => {
        if (key !== 'syncId') throw Object.assign(new Error(`KeyPath ${key} on object store note_folders is not indexed`), { name: 'SchemaError' })
        return { equals: (/** @type {string} */ v) => ({ first: async () => localFolders.find(f => f.syncId === v) }) }
      },
    },
    accounts: { ...emptyTable(), toArray: async () => localAccounts },
    goals: { ...emptyTable(), toArray: async () => localGoals },
    meta: {
      get: async (/** @type {string} */ k) => metaStore.get(k),
      put: async (/** @type {any} */ r) => { metaStore.set(r.key, r); return r.key },
    },
    transactions: {
      ...emptyTable(),
      toArray: async () => localTxs,
      bulkAdd: async (/** @type {any[]} */ rows) => { remoteWhileWriting.push(isWritingRemote()); localTxs.push(...rows); return rows.length },
      bulkPut: async () => 0,
    },
  })
  /** @type {any} */
  const db = new Proxy(base, { get: (t, k) => (k in t ? t[/** @type {string} */ (k)] : (t[/** @type {string} */ (k)] = emptyTable())) })
  return { default: db, dbReady: Promise.resolve(), SYNCED: 1, UNSYNCED: 0, SYNCED_TABLES: ['accounts', 'categories', 'debts', 'recurring', 'templates', 'goals', 'challenges', 'trash', 'notes', 'note_folders'], TRASH_DAYS: 30, getUnsyncedTxs: async () => unsyncedTxs }
})

vi.mock('./supabase', () => {
  const from = (/** @type {string} */ table) => {
    /** @type {any} */
    const builder = {
      select: () => builder, eq: () => builder, gt: () => builder, gte: () => builder, in: () => builder, order: () => builder, limit: () => builder, is: () => builder, not: () => builder,
      range: (/** @type {number} */ from, /** @type {number} */ to) => ({ then: (/** @type {any} */ res) => res({ data: (server[table] ?? []).slice(from, to + 1), error: none }) }),
      single: async () => ({ data: none, error: { code: 'PGRST116' } }),
      maybeSingle: async () => ({ data: none, error: none }),
      upsert: async () => { serverWrites.push(`upsert ${table}`); return { error: none } },
      insert: async () => { serverWrites.push(`insert ${table}`); return { error: none } },
      update: () => { serverWrites.push(`update ${table}`); return builder },
      delete: () => { serverWrites.push(`delete ${table}`); return builder },
      then: (/** @type {any} */ res) => res({ data: server[table] ?? [], error: none }),
    }
    return builder
  }
  return { supabase: { from, auth: { getSession: async () => ({ data: { session: {} }, error: none }) } }, isSupabaseConfigured: true }
})

const { pullChanges, syncToSupabase, pushLedger } = await import('./sync')

const remoteTx = (/** @type {string} */ id, /** @type {any} */ extra = {}) => ({
  id: 1, user_id: 'u1', tx_id: id, type: 'expense', transaction_date: '2026-10-08T04:00:00.000Z', description: 'Lunch',
  category: 'Food', from_account: 'GCash', to_account: null, amount: 150, updated_at: '2026-10-08T04:00:01.000Z', ...extra,
})

beforeEach(() => {
  server = {}
  serverWrites = []
  remoteWhileWriting = []
  metaStore.clear()
  localTxs = []
  localFolders = []
  localAccounts = []
  localGoals = []
  unsyncedTxs = []
})

describe('pullChanges', () => {
  it('brings down a transaction another device added, and says which', async () => {
    server.transactions = [remoteTx('t1')]
    const { added } = await pullChanges('u1')
    expect(added.map(t => t.txId)).toEqual(['t1'])
    expect(added[0]).toMatchObject({ type: 'expense', description: 'Lunch', amount: 150, account: 'GCash' })
    expect(localTxs).toHaveLength(1)
  })

  it('does not announce a transaction this device already had', async () => {
    localTxs = [{ id: 7, txId: 't1', type: 'expense', amount: 150, updatedAt: '2026-10-08T04:00:01.000Z' }]
    server.transactions = [remoteTx('t1')]
    const { added } = await pullChanges('u1')
    expect(added).toEqual([])
    expect(localTxs).toHaveLength(1)
  })

  it('says nothing was added when nothing was new', async () => {
    expect((await pullChanges('u1')).added).toEqual([])
  })

  it('writes nothing to the cloud: no push, so the stream cannot echo it back', async () => {
    server.transactions = [remoteTx('t1')]
    await pullChanges('u1')
    expect(serverWrites.filter(w => /^(upsert|insert|delete)/.test(w))).toEqual([])
  })

  it('marks what it writes as the cloud\'s, and stops when it is done', async () => {
    server.transactions = [remoteTx('t1')]
    expect(isWritingRemote()).toBe(false)
    await pullChanges('u1')
    expect(remoteWhileWriting).toEqual([true])
    expect(isWritingRemote()).toBe(false)
  })

  it('stops marking even when the pull fails', async () => {
    server.transactions = [remoteTx('t1')]
    const { supabase } = await import('./supabase')
    const real = supabase.from
    supabase.from = () => { throw new Error('offline') }
    await expect(pullChanges('u1')).rejects.toThrow('offline')
    supabase.from = real
    expect(isWritingRemote()).toBe(false)
  })

  it('brings down a note folder it has never seen, without asking the table for an index it has not got', async () => {
    server.note_folders = [{ id: 1, user_id: 'u1', local_id: 5, sync_id: 'f1', name: 'Work', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' }]
    await pullChanges('u1')
    expect(localFolders.map(f => f.name)).toEqual(['Work'])
    expect(localFolders[0].syncId).toBe('f1')
  })

  it('recognises a folder it already has by its name, whatever the case, and does not add it twice', async () => {
    localFolders = [{ id: 1, name: 'work', syncId: 'older', updatedAt: '2026-09-01T00:00:00.000Z' }]
    server.note_folders = [{ id: 1, user_id: 'u1', local_id: 99, sync_id: 'f1', name: 'Work', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' }]
    await pullChanges('u1')
    expect(localFolders).toHaveLength(1)
  })

  it('says what is new the moment the ledger is in, not when the last table has been read', async () => {
    server.transactions = [remoteTx('t1')]
    server.note_folders = [{ id: 1, user_id: 'u1', local_id: 5, sync_id: 'f1', name: 'Work', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' }]
    /** @type {Array<{ids: string[], folders: number}>} */
    const calls = []
    await pullChanges('u1', { onAdded: added => calls.push({ ids: added.map(t => t.txId), folders: localFolders.length }) })
    // Called once, with the transaction, before the folders further down the list came in.
    expect(calls).toEqual([{ ids: ['t1'], folders: 0 }])
    expect(localFolders).toHaveLength(1)
  })

  it('does not call back when nothing was added', async () => {
    const onAdded = vi.fn()
    await pullChanges('u1', { onAdded })
    expect(onAdded).not.toHaveBeenCalled()
  })

  it('refuses without a user', async () => {
    await expect(pullChanges('')).rejects.toThrow('Not authenticated')
  })
})

describe('what a push sends', () => {
  const account = { id: 1, name: 'Cash', type: 'cash', role: 'spending', balance: 100, currency: 'PHP', syncId: 'a1' }
  const goal = { id: 1, name: 'Trip', target: 5000, saved: 0, syncId: 'g1' }

  // The preferences read the theme from the browser, which a test in node has not got.
  beforeEach(() => { vi.stubGlobal('localStorage', { getItem: () => none, setItem: () => {} }) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('is every small table when nothing says which changed', async () => {
    localAccounts = [account]; localGoals = [goal]
    await syncToSupabase('u1')
    expect(serverWrites).toContain('upsert accounts')
    expect(serverWrites).toContain('upsert goals')
  })

  it('is only the tables this device wrote to, when it is told which: the rest would be streamed to every device for nothing', async () => {
    localAccounts = [account]; localGoals = [goal]
    await syncToSupabase('u1', { only: new Set(['goals']) })
    expect(serverWrites).toContain('upsert goals')
    expect(serverWrites).not.toContain('upsert accounts')
  })

  it('always sends the transactions that are unsent, whichever tables were named', async () => {
    unsyncedTxs = [{ id: 3, txId: 't3', type: 'expense', amount: 20, date: '2026-10-08T04:00:00.000Z', category: 'Food', account: 'Cash', synced: 0 }]
    await syncToSupabase('u1', { only: new Set() })
    expect(serverWrites).toContain('upsert transactions')
  })

  it('has the ledger as a step of its own, which sends nothing else', async () => {
    localAccounts = [account]; localGoals = [goal]
    unsyncedTxs = [{ id: 3, txId: 't3', type: 'expense', amount: 20, date: '2026-10-08T04:00:00.000Z', category: 'Food', account: 'Cash', synced: 0 }]
    await pushLedger('u1')
    expect(serverWrites).toEqual(['upsert transactions'])
  })
})
