import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * What the small tables send, and when a row counts as sent.
 *
 * Accounts, categories, debts, bills, templates, goals, badges, challenges and
 * folders used to go up whole, every row on every push, with the device's own
 * stamps. Two things broke that and both are pinned here:
 *
 *   a rename (of an account, a category, a goal) made the push an INSERT that
 *   the stable id's unique index refused, and because each table awaits the one
 *   before it, nothing after it ever synced again
 *
 *   a device that had not looked at the cloud for a while sent its stale copies
 *   of rows another device had changed since, and won
 *
 * Now a row carries `syncedAt`, the stamp it had when the cloud last held the
 * same row, and only a row whose updatedAt is not that goes up. These tests run
 * the real sync.js against an in-memory stand-in for Dexie (with the updatedAt
 * hook of db/db.js, which is what makes an edit an edit) and a scripted cloud.
 */

// ── A clock that only moves when asked ──────────────────────────────────────

let ticks = 0
/** A new stamp, later than every one before it. */
const stamp = () => new Date(Date.UTC(2026, 9, 8, 10, 0, 0) + (++ticks) * 1000).toISOString()
/** A stamp from the past, earlier than any stamp() will be. @param {number} n */
const earlier = (n) => new Date(Date.UTC(2026, 9, 1, 10, 0, 0) + n * 1000).toISOString()

// ── An in-memory Dexie, as far as sync.js uses it ───────────────────────────

const BOOKKEEPING = new Set(['syncId', 'synced', 'pushed', 'syncedAt', 'balance', 'opening', 'balanceSent'])
const SYNCED_TABLES = ['accounts', 'categories', 'debts', 'recurring', 'templates', 'goals', 'challenges', 'trash', 'notes', 'note_folders']

/** @param {any} row */
const copy = (row) => (row ? structuredClone(row) : row)

/** What an answer with nothing in it is, typed so that it is not an implicit any. */
const none = /** @type {any} */ (undefined)

class MemTable {
  /** @param {string} name @param {string} [pk] */
  constructor(name, pk = 'id') {
    this.name = name
    this.pk = pk
    /** @type {Map<any, any>} */
    this.rows = new Map()
    this.next = 1
  }

  /** @param {any} row */
  async add(row) {
    const r = copy(row)
    if (SYNCED_TABLES.includes(this.name)) {
      if (!r.syncId) r.syncId = `minted-${this.name}-${this.next}`
      if (!r.updatedAt) r.updatedAt = stamp()
    }
    if (this.pk === 'id') r.id = r.id ?? this.next++
    this.rows.set(r[this.pk], r)
    return r[this.pk]
  }

  /** @param {any} row */
  async put(row) {
    const r = copy(row)
    if (this.pk === 'id') r.id = r.id ?? this.next++
    this.rows.set(r[this.pk], r)
    return r[this.pk]
  }

  /** @param {any[]} rows */
  async bulkAdd(rows) { for (const r of rows) await this.add(r); return rows.length }
  /** @param {any[]} rows */
  async bulkPut(rows) { for (const r of rows) await this.put(r); return rows.length }
  /** @param {any[]} keys */
  async bulkDelete(keys) { for (const k of keys) this.rows.delete(k) }

  /** @param {any} key */
  async get(key) { return copy(this.rows.get(key)) }
  /** @param {any[]} keys */
  async bulkGet(keys) { return keys.map(k => copy(this.rows.get(k))) }
  async toArray() { return [...this.rows.values()].map(copy) }
  async count() { return this.rows.size }
  async clear() { this.rows.clear() }
  /** @param {any} key */
  async delete(key) { this.rows.delete(key) }

  /**
   * db.js's updating hook, as it behaves: an edit moves updatedAt unless the
   * caller said what it should be, or all that changed is bookkeeping.
   *
   * @param {any} key @param {Record<string, any>} mods
   */
  async update(key, mods) {
    const row = this.rows.get(key)
    if (!row) return 0
    const keys = Object.keys(mods)
    const stamped = SYNCED_TABLES.includes(this.name) && !('updatedAt' in mods) && keys.length && !keys.every(k => BOOKKEEPING.has(k))
    for (const k of keys) { if (mods[k] === undefined) delete row[k]; else row[k] = copy(mods[k]) }
    if (stamped) row.updatedAt = stamp()
    return 1
  }

  /** @param {(row: any) => boolean} fn */
  filter(fn) { return new MemCollection(this, () => [...this.rows.values()].filter(fn)) }
  toCollection() { return new MemCollection(this, () => [...this.rows.values()]) }
  /** @param {string} index */
  where(index) {
    return {
      /** @param {any} v */
      equals: (v) => new MemCollection(this, () => [...this.rows.values()].filter(r => r[index] === v)),
      /** @param {any[]} vs */
      anyOf: (vs) => new MemCollection(this, () => [...this.rows.values()].filter(r => vs.includes(r[index]))),
      /** @param {any} v */
      below: (v) => new MemCollection(this, () => [...this.rows.values()].filter(r => r[index] < v)),
    }
  }
}

class MemCollection {
  /** @param {MemTable} table @param {() => any[]} read */
  constructor(table, read) { this.table = table; this.read = read }
  /** @param {(row: any) => boolean} fn */
  and(fn) { return new MemCollection(this.table, () => this.read().filter(fn)) }
  async first() {
    const row = copy(this.read()[0])
    // The pull has just read the row it is about to decide on: a person saving now is saving over what it saw.
    await afterFirst?.(this.table.name)
    return row
  }
  async toArray() { return this.read().map(copy) }
  async count() { return this.read().length }
  /** @param {any} changes */
  async modify(changes) {
    for (const row of this.read()) {
      if (typeof changes === 'function') changes(row)
      else for (const [k, v] of Object.entries(changes)) { if (v === undefined) delete row[k]; else row[k] = v }
    }
  }
}

/** Called after a table hands over the first row of a lookup: how a test acts between a pull's read and its write. @type {((table: string) => any)|null} */
let afterFirst = null

/** @type {Record<string, MemTable>} */
let tables = {}
const NAMES = ['transactions', 'accounts', 'categories', 'debts', 'recurring', 'templates', 'goals', 'challenges', 'trash', 'notes', 'note_folders', 'balances', 'notifications']
function freshTables() {
  tables = Object.fromEntries(NAMES.map(n => [n, new MemTable(n, n === 'balances' ? 'account' : 'id')]))
  tables.badges = new MemTable('badges', 'key')
  tables.meta = new MemTable('meta', 'key')
}
freshTables()

vi.mock('../db/db', () => {
  const db = new Proxy(/** @type {Record<string, any>} */ ({
    table: (/** @type {string} */ n) => tables[n],
    transaction: async (/** @type {any} */ _mode, /** @type {any} */ _tables, /** @type {() => Promise<any>} */ fn) => fn(),
  }), { get: (t, k) => (k in t ? t[/** @type {string} */ (k)] : tables[/** @type {string} */ (k)]) })
  return {
    default: db, dbReady: Promise.resolve(), SYNCED: 1, UNSYNCED: 0, TRASH_DAYS: 30, BOOKKEEPING, SYNCED_TABLES,
    getUnsyncedTxs: async () => (await tables.transactions.toArray()).filter(t => !t.synced),
  }
})

// ── A scripted cloud ────────────────────────────────────────────────────────

/** What the cloud holds, by table. @type {Record<string, any[]>} */
let server = {}
/** Every upsert it was sent. @type {Array<{table: string, onConflict: string, rows: any[]}>} */
let upserts = []
/** Every update of chosen columns, with what it was filtered by. @type {Array<{table: string, patch: any, match: Record<string, any>}>} */
let updates = []
/** Called with each upsert before it is answered: how a test acts in the middle of a push. @type {((table: string, rows: any[]) => any)|null} */
let duringPush = null
/** Called whenever a table is read: how a test acts in the middle of a pull. @type {((table: string) => any)|null} */
let duringRead = null
/** Called when rows are asked for without being paged - by their ids, or counted: the second request of a note pull. @type {((table: string) => any)|null} */
let duringBody = null
/** What the cloud answers an upsert with; null is success. @type {((table: string, rows: any[], opts: {onConflict: string}) => ({message: string}|null))|null} */
let refuse = null

vi.mock('./supabase', () => {
  const from = (/** @type {string} */ table) => {
    /** @type {any} */
    const builder = {
      select: () => builder, eq: () => builder, gt: () => builder, gte: () => builder, in: () => builder, order: () => builder, limit: () => builder, is: () => builder, not: () => builder,
      range: (/** @type {number} */ a, /** @type {number} */ z) => ({
        then: async (/** @type {any} */ res) => {
          await duringRead?.(table)
          res({ data: (server[table] ?? []).slice(a, z + 1), error: undefined })
        },
      }),
      single: async () => ({ data: none, error: { code: 'PGRST116' } }),
      upsert: async (/** @type {any[]} */ rows, /** @type {{onConflict: string}} */ opts) => {
        upserts.push({ table, onConflict: opts.onConflict, rows })
        await duringPush?.(table, rows)
        return { error: refuse?.(table, rows, opts) ?? undefined }
      },
      update: (/** @type {any} */ patch) => {
        const u = { table, patch, match: /** @type {Record<string, any>} */ ({}) }
        updates.push(u)
        /** @type {any} */
        const filtered = { ...builder, eq: (/** @type {string} */ col, /** @type {any} */ val) => { u.match[col] = val; return filtered } }
        return filtered
      },
      delete: () => builder,
      then: async (/** @type {any} */ res) => {
        await duringBody?.(table)
        res({ data: server[table] ?? [], count: (server[table] ?? []).length, error: undefined })
      },
    }
    return builder
  }
  return { supabase: { from, auth: { getSession: async () => ({ data: { session: {} }, error: none }) } }, isSupabaseConfigured: true }
})

const { syncToSupabase, pullChanges, fullSync, unsentTables, isUnsent, isSyncIdConflict, applyRemoteTransaction, accountPatch, accountToRow, rowToAccount, resetLedgerWatermark, FirstSyncChoiceNeeded } = await import('./sync')
const { isWritingRemote } = await import('./syncSignal')

const ERR_NAME = 'duplicate key value violates unique constraint "accounts_user_sync_id_key"'
const ERR_CATEGORY = 'duplicate key value violates unique constraint "categories_user_sync_id_key"'
const ERR_GOAL = 'duplicate key value violates unique constraint "goals_user_sync_id_key"'
const ERR_LOCAL_ID = 'duplicate key value violates unique constraint "accounts_user_id_local_id_key"'

beforeEach(() => {
  freshTables()
  ticks = 0
  server = {}
  upserts = []
  updates = []
  duringPush = null
  duringRead = null
  duringBody = null
  afterFirst = null
  refuse = null
  // The preferences read the theme from the browser, which a test in node has not got.
  vi.stubGlobal('localStorage', { getItem: () => none, setItem: () => {} })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

/** An account as the app writes one. @param {Record<string, any>} [over] */
const account = (over = {}) => {
  const row = { name: 'Cash', type: 'cash', balance: 100, currency: 'PHP', color: '#10b981', syncId: 'a-cash', ...over }
  // Its balance already in the cloud, unless a test says otherwise: see pushBalances.
  return { balanceSent: row.balance, ...row }
}
/** A remote account row. @param {Record<string, any>} [over] */
const remoteAccount = (over = {}) => ({ id: 1, user_id: 'u1', sync_id: 'a-cash', name: 'Cash', type: 'cash', balance: 100, currency: 'PHP', color: '#10b981', updated_at: earlier(5), ...over })

/** The upserts to one table. @param {string} table */
const sentTo = (table) => upserts.filter(u => u.table === table)
/** Names of the accounts in a table's upserts. @param {string} table */
const namesSentTo = (table) => sentTo(table).flatMap(u => u.rows.map(r => r.name))

describe('isUnsent', () => {
  it('is true for a row the cloud has never held, whatever else it says', () => {
    expect(isUnsent({ name: 'Cash', updatedAt: earlier(1) })).toBe(true)
    expect(isUnsent({ name: 'Cash' })).toBe(true)
  })

  it('is false while the row is as it was when it last went, and true the moment it is edited', () => {
    expect(isUnsent({ updatedAt: earlier(1), syncedAt: earlier(1) })).toBe(false)
    expect(isUnsent({ updatedAt: earlier(2), syncedAt: earlier(1) })).toBe(true)
  })

  it('is false for a row with no updatedAt of its own once it has been marked: a badge has only the day it was earned', () => {
    expect(isUnsent({ key: 'first-peso', earnedAt: earlier(1) })).toBe(true)
    expect(isUnsent({ key: 'first-peso', earnedAt: earlier(1), syncedAt: earlier(1) })).toBe(false)
  })
})

describe('isSyncIdConflict', () => {
  it('recognises the refusal a rename produces, on each table that has the index', () => {
    for (const t of ['accounts', 'categories', 'goals', 'debts']) {
      expect(isSyncIdConflict(`duplicate key value violates unique constraint "${t}_user_sync_id_key"`)).toBe(true)
    }
  })

  it('leaves every other unique violation alone: a duplicate name is a refusal the person has to see', () => {
    expect(isSyncIdConflict('duplicate key value violates unique constraint "accounts_user_id_name_key"')).toBe(false)
    expect(isSyncIdConflict('duplicate key value violates unique constraint "accounts_user_id_local_id_key"')).toBe(false)
    expect(isSyncIdConflict('23505')).toBe(false)
    expect(isSyncIdConflict(undefined)).toBe(false)
  })
})

describe('what a push of a small table sends', () => {
  it('is only the rows that have changed since they last went', async () => {
    await tables.accounts.add(account({ name: 'Cash', syncId: 'a1', updatedAt: earlier(1), syncedAt: earlier(1) }))
    await tables.accounts.add(account({ name: 'BPI', syncId: 'a2', updatedAt: earlier(3), syncedAt: earlier(2) }))
    await tables.accounts.add(account({ name: 'Maya', syncId: 'a3' }))
    await syncToSupabase('u1', { only: new Set(['accounts']) })
    expect(namesSentTo('accounts').sort()).toEqual(['BPI', 'Maya'])
  })

  it('is no request at all when nothing has changed', async () => {
    await tables.accounts.add(account({ syncId: 'a1', updatedAt: earlier(1), syncedAt: earlier(1) }))
    await tables.categories.add({ name: 'Food', type: 'expense', budget: 1, syncId: 'c1', updatedAt: earlier(1), syncedAt: earlier(1) })
    await syncToSupabase('u1', { only: new Set(['accounts', 'categories']) })
    expect(upserts).toEqual([])
  })

  it('sends every row of every table that has changed, when it is not told which tables: a full sync', async () => {
    await tables.accounts.add(account({ syncId: 'a1' }))
    await tables.debts.add({ name: 'Gelo', amount: 5, type: 'i_owe', syncId: 'd1' })
    await tables.goals.add({ name: 'Trip', target: 100, syncId: 'g1' })
    await tables.badges.put({ key: 'first-peso', earnedAt: earlier(1) })
    await tables.note_folders.add({ name: 'Work', syncId: 'f1' })
    await syncToSupabase('u1')
    for (const t of ['accounts', 'debts', 'goals', 'badges', 'note_folders']) expect(sentTo(t), t).toHaveLength(1)
  })

  it('every row a table has when none of them has ever been marked: the first push after this shipped sends them once', async () => {
    for (const n of ['Cash', 'BPI', 'Maya']) await tables.accounts.add(account({ name: n, syncId: `s-${n}` }))
    await syncToSupabase('u1', { only: new Set(['accounts']) })
    expect(namesSentTo('accounts').sort()).toEqual(['BPI', 'Cash', 'Maya'])
    upserts = []
    await syncToSupabase('u1', { only: new Set(['accounts']) })
    expect(upserts).toEqual([])
  })

  it('still sends only one of two rows that share a name, and the same one as ever: the first', async () => {
    await tables.accounts.add(account({ name: 'Cash', syncId: 'first', balance: 1, updatedAt: earlier(1), syncedAt: earlier(1) }))
    await tables.accounts.add(account({ name: 'Cash', syncId: 'second', balance: 2 }))
    await syncToSupabase('u1', { only: new Set(['accounts']) })
    // The first is the row the cloud holds and it has not changed; the duplicate must not go up in its place.
    expect(upserts).toEqual([])
  })

  it('does not send a row with no stable id on a table that resolves on it', async () => {
    const id = await tables.debts.add({ name: 'Gelo', amount: 5, type: 'i_owe', syncId: 'd1' })
    delete tables.debts.rows.get(id).syncId
    await syncToSupabase('u1', { only: new Set(['debts']) })
    expect(sentTo('debts')).toEqual([])
  })

  it('marks what it sent with the stamp it sent, and the row is then quiet', async () => {
    const id = await tables.accounts.add(account({ syncId: 'a1', updatedAt: earlier(4) }))
    await syncToSupabase('u1', { only: new Set(['accounts']) })
    const row = await tables.accounts.get(id)
    expect(row.syncedAt).toBe(earlier(4))
    expect(row.updatedAt).toBe(earlier(4))
    expect(isUnsent(row)).toBe(false)
  })

  it('leaves a row unmarked when the push fails, so the next one sends it', async () => {
    const id = await tables.accounts.add(account({ syncId: 'a1' }))
    refuse = () => ({ message: 'Failed to fetch' })
    await expect(syncToSupabase('u1', { only: new Set(['accounts']) })).rejects.toThrow('accounts push: Failed to fetch')
    expect((await tables.accounts.get(id)).syncedAt).toBeUndefined()
    refuse = null
    await syncToSupabase('u1', { only: new Set(['accounts']) })
    expect((await tables.accounts.get(id)).syncedAt).toBeDefined()
  })

  it('does not mark a row that was edited while the push was on its way, and does mark the others', async () => {
    const edited = await tables.accounts.add(account({ name: 'Cash', syncId: 'a1' }))
    const quiet = await tables.accounts.add(account({ name: 'BPI', syncId: 'a2' }))
    // The person changes Cash's colour after the request left and before the answer came.
    duringPush = async () => { await tables.accounts.update(edited, { color: '#999999' }) }
    await syncToSupabase('u1', { only: new Set(['accounts']) })
    const cash = await tables.accounts.get(edited)
    expect(cash.color).toBe('#999999')
    expect(isUnsent(cash)).toBe(true)
    expect(isUnsent(await tables.accounts.get(quiet))).toBe(false)
    // ...so the next push carries it.
    duringPush = null
    upserts = []
    await syncToSupabase('u1', { only: new Set(['accounts']) })
    expect(sentTo('accounts')).toHaveLength(1)
    expect(sentTo('accounts')[0].rows.map(r => [r.name, r.color])).toEqual([['Cash', '#999999']])
    expect(isUnsent(await tables.accounts.get(edited))).toBe(false)
  })

  it('marks a badge, which has no stamp of its own, and sends it no more', async () => {
    await tables.badges.put({ key: 'first-peso', earnedAt: earlier(1), synced: 0 })
    await syncToSupabase('u1', { only: new Set(['badges']) })
    expect(sentTo('badges')).toHaveLength(1)
    expect((await tables.badges.get('first-peso')).syncedAt).toBeDefined()
    upserts = []
    await syncToSupabase('u1', { only: new Set(['badges']) })
    expect(upserts).toEqual([])
  })

  it('does not count its own marking as an edit: the stamp does not move', async () => {
    const id = await tables.accounts.add(account({ syncId: 'a1' }))
    const before = (await tables.accounts.get(id)).updatedAt
    await syncToSupabase('u1', { only: new Set(['accounts']) })
    expect((await tables.accounts.get(id)).updatedAt).toBe(before)
  })
})

/**
 * The rename that stopped every table after it from syncing.
 *
 * `accounts_user_sync_id_key` (016) refuses the INSERT a rename makes, and
 * because the refusal is a different constraint from the one the upsert
 * resolves on, no upsert on the NAME can get past it.
 */
describe('a rename', () => {
  /** The cloud as the real one is: a name that matches nothing is an insert, and the stable id's index refuses it.
   *  Only for the table the message is about; every other upsert goes through.
   *  @param {string} table @param {string} message */
  const refusesByName = (table, message) => {
    refuse = (t, _rows, opts) => (t === table && opts.onConflict !== 'user_id,sync_id' ? { message } : null)
  }

  it('is pushed on the stable id when the name finds no row, and the push does not throw', async () => {
    const id = await tables.accounts.add(account({ name: 'GCash', syncId: 'a-gcash', updatedAt: earlier(1), syncedAt: earlier(1) }))
    await tables.accounts.update(id, { name: 'GCash Main' })
    refusesByName('accounts', ERR_NAME)
    await syncToSupabase('u1', { only: new Set(['accounts']) })
    expect(sentTo('accounts').map(u => u.onConflict)).toEqual(['user_id,name', 'user_id,sync_id'])
    expect(sentTo('accounts')[1].rows.map(r => [r.sync_id, r.name])).toEqual([['a-gcash', 'GCash Main']])
    expect(isUnsent(await tables.accounts.get(id))).toBe(false)
  })

  it('does not stop the tables after it: they still go up', async () => {
    const id = await tables.accounts.add(account({ name: 'GCash', syncId: 'a-gcash', updatedAt: earlier(1), syncedAt: earlier(1) }))
    await tables.accounts.update(id, { name: 'GCash Main' })
    await tables.categories.add({ name: 'Food', type: 'expense', budget: 5, syncId: 'c1' })
    await tables.goals.add({ name: 'Trip', target: 5, syncId: 'g1' })
    refusesByName('accounts', ERR_NAME)
    await syncToSupabase('u1')
    expect(sentTo('categories')).toHaveLength(1)
    expect(sentTo('goals')).toHaveLength(1)
  })

  it('works the same for a category, whose conflict target is its name and type', async () => {
    const id = await tables.categories.add({ name: 'Food', type: 'expense', budget: 5, syncId: 'c1', updatedAt: earlier(1), syncedAt: earlier(1) })
    await tables.categories.update(id, { name: 'Groceries' })
    refusesByName('categories', ERR_CATEGORY)
    await syncToSupabase('u1', { only: new Set(['categories']) })
    expect(sentTo('categories').map(u => u.onConflict)).toEqual(['user_id,name,type', 'user_id,sync_id'])
    expect(isUnsent(await tables.categories.get(id))).toBe(false)
  })

  it('works the same for a goal', async () => {
    const id = await tables.goals.add({ name: 'Trip', target: 5, syncId: 'g1', updatedAt: earlier(1), syncedAt: earlier(1) })
    await tables.goals.update(id, { name: 'Japan trip' })
    refusesByName('goals', ERR_GOAL)
    await syncToSupabase('u1', { only: new Set(['goals']) })
    expect(sentTo('goals').map(u => u.onConflict)).toEqual(['user_id,name', 'user_id,sync_id'])
    expect(isUnsent(await tables.goals.get(id))).toBe(false)
  })

  it('throws, as before, when the retry on the stable id is refused too', async () => {
    await tables.accounts.add(account({ name: 'GCash Main', syncId: 'a-gcash' }))
    refuse = (_t, _rows, opts) => ({ message: opts.onConflict === 'user_id,sync_id' ? 'permission denied for table accounts' : ERR_NAME })
    await expect(syncToSupabase('u1', { only: new Set(['accounts']) })).rejects.toThrow('accounts push: permission denied for table accounts')
  })

  it('leaves the row unmarked when it throws, so it is not forgotten', async () => {
    const id = await tables.accounts.add(account({ name: 'GCash Main', syncId: 'a-gcash' }))
    refuse = () => ({ message: ERR_NAME })
    await expect(syncToSupabase('u1', { only: new Set(['accounts']) })).rejects.toThrow()
    expect(isUnsent(await tables.accounts.get(id))).toBe(true)
  })

  it('does not retry a duplicate NAME on the stable id: that refusal reaches the person', async () => {
    await tables.accounts.add(account({ name: 'Cash', syncId: 'a1' }))
    refuse = () => ({ message: 'duplicate key value violates unique constraint "accounts_user_id_name_key"' })
    await expect(syncToSupabase('u1', { only: new Set(['accounts']) })).rejects.toThrow('accounts_user_id_name_key')
    expect(sentTo('accounts')).toHaveLength(1)
  })

  it('does not use the stable id on a table that already resolves on it', async () => {
    await tables.debts.add({ name: 'Gelo', amount: 5, type: 'i_owe', syncId: 'd1' })
    refuse = () => ({ message: 'duplicate key value violates unique constraint "debts_user_sync_id_key"' })
    await expect(syncToSupabase('u1', { only: new Set(['debts']) })).rejects.toThrow('debts push')
    expect(sentTo('debts')).toHaveLength(1)
  })

  it('sends only the rows that have a stable id on that retry, and keeps the others for the next push', async () => {
    const stable = await tables.accounts.add(account({ name: 'GCash Main', syncId: 'a-gcash' }))
    const loose = await tables.accounts.add(account({ name: 'Old', syncId: 'a-old' }))
    delete tables.accounts.rows.get(loose).syncId
    refusesByName('accounts', ERR_NAME)
    await syncToSupabase('u1', { only: new Set(['accounts']) })
    expect(sentTo('accounts')[1].rows.map(r => r.name)).toEqual(['GCash Main'])
    expect(isUnsent(await tables.accounts.get(stable))).toBe(false)
    expect(isUnsent(await tables.accounts.get(loose))).toBe(true)
  })

  it('gets there through the local_id refusal first, on a database that has not had 008 - the one a rename trips first', async () => {
    // Goals send their local_id and resolve on their name, so a rename meets both indexes.
    const id = await tables.goals.add({ name: 'Japan trip', target: 5, syncId: 'g1' })
    refuse = (_t, rows, opts) => {
      if (opts.onConflict === 'user_id,sync_id') return null
      return { message: 'local_id' in rows[0] ? ERR_LOCAL_ID.replace('accounts', 'goals') : ERR_GOAL }
    }
    await syncToSupabase('u1', { only: new Set(['goals']) })
    expect(sentTo('goals').map(u => u.onConflict)).toEqual(['user_id,name', 'user_id,name', 'user_id,sync_id'])
    // The last one is without the local_id that collided.
    expect('local_id' in sentTo('goals')[2].rows[0]).toBe(false)
    expect(isUnsent(await tables.goals.get(id))).toBe(false)
  })

  it('still retries without local_id alone when that is all that was refused', async () => {
    const id = await tables.goals.add({ name: 'Japan trip', target: 5, syncId: 'g1' })
    refuse = (_t, rows) => ('local_id' in rows[0] ? { message: ERR_LOCAL_ID.replace('accounts', 'goals') } : null)
    await syncToSupabase('u1', { only: new Set(['goals']) })
    expect(sentTo('goals').map(u => u.onConflict)).toEqual(['user_id,name', 'user_id,name'])
    expect(isUnsent(await tables.goals.get(id))).toBe(false)
  })

  it('gets there through an unknown column first, on a database a migration behind', async () => {
    const id = await tables.accounts.add(account({ name: 'GCash Main', syncId: 'a-gcash', design: 'mosaic' }))
    refuse = (_t, rows, opts) => {
      if ('design' in rows[0]) return { message: "Could not find the 'design' column of 'accounts' in the schema cache" }
      return opts.onConflict === 'user_id,sync_id' ? null : { message: ERR_NAME }
    }
    await syncToSupabase('u1', { only: new Set(['accounts']) })
    const last = sentTo('accounts').at(-1)
    expect(last?.onConflict).toBe('user_id,sync_id')
    // Still without the column the table does not have.
    expect('design' in (last?.rows[0] ?? {})).toBe(false)
    expect(isUnsent(await tables.accounts.get(id))).toBe(false)
  })
})

describe('a push that meets a column the table does not have yet', () => {
  it('leaves out the category and bill columns of 032 and sends the rest, and marks the rows sent', async () => {
    const cat = await tables.categories.add({ name: 'Food', type: 'expense', budget: 5, syncId: 'c1', rollover: true, rolloverFrom: '2026-09' })
    const bill = await tables.recurring.add({ name: 'Rent', amount: 9, category: 'Bills', account: 'Cash', frequency: 'monthly', nextDate: '2026-10-31', active: true, syncId: 'r1', dueDay: 31 })
    refuse = (_t, rows) => {
      for (const col of ['rollover', 'rollover_from', 'due_day']) {
        if (col in rows[0]) return { message: `Could not find the '${col}' column of '${_t}' in the schema cache` }
      }
      return null
    }
    await syncToSupabase('u1', { only: new Set(['categories', 'recurring']) })
    const lastCategory = sentTo('categories').at(-1)?.rows[0] ?? {}
    expect(lastCategory.name).toBe('Food')
    expect('rollover' in lastCategory || 'rollover_from' in lastCategory).toBe(false)
    const lastBill = sentTo('recurring').at(-1)?.rows[0] ?? {}
    expect(lastBill.name).toBe('Rent')
    expect('due_day' in lastBill).toBe(false)
    expect(isUnsent(await tables.categories.get(cat))).toBe(false)
    expect(isUnsent(await tables.recurring.get(bill))).toBe(false)
  })

  it('sends the columns of 032 when the table has them', async () => {
    await tables.categories.add({ name: 'Food', type: 'expense', budget: 5, syncId: 'c1', rollover: true, rolloverFrom: '2026-09' })
    await tables.recurring.add({ name: 'Rent', amount: 9, category: 'Bills', account: 'Cash', frequency: 'monthly', nextDate: '2026-10-31', active: true, syncId: 'r1', dueDay: 31 })
    await syncToSupabase('u1', { only: new Set(['categories', 'recurring']) })
    expect(sentTo('categories')[0].rows[0]).toMatchObject({ rollover: true, rollover_from: '2026-09' })
    expect(sentTo('recurring')[0].rows[0]).toMatchObject({ due_day: 31 })
  })
})

describe('what a pull writes', () => {
  it('arrives as the cloud\'s own: not sent straight back', async () => {
    server.accounts = [remoteAccount({ sync_id: 'a-cash', name: 'Cash', balance: 250, updated_at: earlier(5) })]
    server.categories = [{ id: 1, user_id: 'u1', sync_id: 'c1', name: 'Food', type: 'expense', icon: 'x', color: 'y', budget: 8, updated_at: earlier(6) }]
    await pullChanges('u1', { only: new Set(['accounts', 'categories']) })
    const [cash] = await tables.accounts.toArray()
    expect(cash).toMatchObject({ name: 'Cash', balance: 250, updatedAt: earlier(5), syncedAt: earlier(5) })
    expect(isUnsent(cash)).toBe(false)
    expect(isUnsent((await tables.categories.toArray()).find(c => c.name === 'Food'))).toBe(false)
    await syncToSupabase('u1', { only: new Set(['accounts']) })
    expect(upserts).toEqual([])
  })

  it('marks a row it updates, when the cloud\'s copy is the newer', async () => {
    const id = await tables.accounts.add(account({ balance: 100, updatedAt: earlier(2), syncedAt: earlier(2) }))
    server.accounts = [remoteAccount({ balance: 175, updated_at: earlier(9) })]
    await pullChanges('u1', { only: new Set(['accounts']) })
    const row = await tables.accounts.get(id)
    expect(row).toMatchObject({ balance: 175, updatedAt: earlier(9), syncedAt: earlier(9) })
    expect(isUnsent(row)).toBe(false)
  })

  it('leaves a row alone that this device changed since, and still unsent: the cloud\'s copy is older', async () => {
    const id = await tables.accounts.add(account({ balance: 100, updatedAt: earlier(2), syncedAt: earlier(2) }))
    await tables.accounts.update(id, { color: '#321321' })
    server.accounts = [remoteAccount({ balance: 100, updated_at: earlier(2) })]
    await pullChanges('u1', { only: new Set(['accounts']) })
    const row = await tables.accounts.get(id)
    expect(row.color).toBe('#321321')
    expect(isUnsent(row)).toBe(true)
  })

  it('marks a template, a bill, a debt and a folder it brings in, as it does an account', async () => {
    server.templates = [{ id: 1, user_id: 'u1', sync_id: 't1', name: 'Rent', type: 'expense', updated_at: earlier(3) }]
    server.recurring = [{ id: 1, user_id: 'u1', sync_id: 'r1', name: 'Netflix', amount: 5, frequency: 'monthly', next_date: '2026-10-05', active: true, updated_at: earlier(3), due_day: 5 }]
    server.debts = [{ id: 1, user_id: 'u1', sync_id: 'd1', name: 'Gelo', amount: 5, type: 'i_owe', updated_at: earlier(3) }]
    server.note_folders = [{ id: 1, user_id: 'u1', sync_id: 'f1', name: 'Work', updated_at: earlier(3) }]
    await pullChanges('u1', { only: new Set(['templates', 'recurring', 'debts', 'note_folders']) })
    for (const t of ['templates', 'recurring', 'debts', 'note_folders']) {
      const rows = await tables[t].toArray()
      expect(rows, t).toHaveLength(1)
      expect(rows[0].syncedAt, t).toBe(earlier(3))
    }
    expect((await tables.recurring.toArray())[0].dueDay).toBe(5)
  })

  it('marks a badge it brings in, quietly: it was celebrated where it was earned', async () => {
    server.badges = [{ id: 1, user_id: 'u1', key: 'first-peso', earned_at: earlier(1), updated_at: earlier(1) }]
    await pullChanges('u1', { only: new Set(['badges']) })
    expect(await tables.badges.get('first-peso')).toMatchObject({ earnedAt: earlier(1), silent: true, syncedAt: earlier(1) })
  })

  it('takes the cloud\'s day when it is the earlier, and is then the cloud\'s own', async () => {
    server.badges = [{ id: 1, user_id: 'u1', key: 'green-month', earned_at: earlier(1), updated_at: earlier(1) }]
    await tables.badges.put({ key: 'green-month', earnedAt: earlier(5), synced: 1, syncedAt: earlier(5) })
    await pullChanges('u1', { only: new Set(['badges']) })
    const green = await tables.badges.get('green-month')
    expect(green).toMatchObject({ earnedAt: earlier(1), syncedAt: earlier(1) })
    expect(isUnsent(green)).toBe(false)
  })

  it('keeps its own day when it is the earlier, and puts the badge back to unsent so the cloud\'s later one is corrected', async () => {
    server.badges = [{ id: 1, user_id: 'u1', key: 'green-month', earned_at: earlier(50), updated_at: earlier(50) }]
    await tables.badges.put({ key: 'green-month', earnedAt: earlier(5), synced: 1, syncedAt: earlier(5) })
    await pullChanges('u1', { only: new Set(['badges']) })
    const green = await tables.badges.get('green-month')
    expect(green.earnedAt).toBe(earlier(5))
    expect(isUnsent(green)).toBe(true)
    await syncToSupabase('u1', { only: new Set(['badges']) })
    expect(sentTo('badges')[0].rows[0]).toMatchObject({ key: 'green-month', earned_at: earlier(5) })
  })

  it('does not read the same moment in the cloud\'s format as a difference: that would send every badge after every pull', async () => {
    const at = earlier(5)
    server.badges = [{ id: 1, user_id: 'u1', key: 'green-month', earned_at: at.replace('.000Z', '+00:00'), updated_at: at.replace('.000Z', '+00:00') }]
    await tables.badges.put({ key: 'green-month', earnedAt: at, synced: 1, syncedAt: at })
    await pullChanges('u1', { only: new Set(['badges']) })
    expect(isUnsent(await tables.badges.get('green-month'))).toBe(false)
  })

  it('is not the cloud\'s mark on a row the cloud has no stamp for: that one still goes up', async () => {
    server.accounts = [remoteAccount({ updated_at: null })]
    await pullChanges('u1', { only: new Set(['accounts']) })
    const [row] = await tables.accounts.toArray()
    expect(row.syncedAt).toBeUndefined()
    expect(isUnsent(row)).toBe(true)
  })
})

/**
 * The window the watcher of local changes cannot hear.
 *
 * A pull writes into the tables a person is using, and while it does the
 * watcher is told nothing (syncSignal.js is one counter for every write, the
 * cloud's or not). A person saving in that moment is therefore not pushed.
 * What is left is the row itself: changed, and marked as changed.
 */
describe('a save made while a pull is writing', () => {
  it('is made while the cloud\'s writes are open - which is why nobody was told', async () => {
    const id = await tables.accounts.add(account({ balance: 100, updatedAt: earlier(2), syncedAt: earlier(2) }))
    server.accounts = [remoteAccount({ balance: 100, updated_at: earlier(2) })]
    /** @type {boolean|null} */
    let open = null
    duringRead = async (table) => {
      if (table !== 'accounts') return
      open = isWritingRemote()
      await tables.accounts.update(id, { color: '#555555' })
    }
    await pullChanges('u1', { only: new Set(['accounts']) })
    expect(open).toBe(true)
  })

  it('leaves the row marked unsent, which is what the look at the end of the pull finds', async () => {
    const id = await tables.accounts.add(account({ balance: 100, updatedAt: earlier(2), syncedAt: earlier(2) }))
    await tables.categories.add({ name: 'Food', type: 'expense', budget: 5, syncId: 'c1', updatedAt: earlier(2), syncedAt: earlier(2) })
    server.accounts = [remoteAccount({ balance: 100, updated_at: earlier(2) })]
    duringRead = async (table) => { if (table === 'accounts') await tables.accounts.update(id, { color: '#555555' }) }
    await pullChanges('u1', { only: new Set(['accounts']) })
    duringRead = null
    expect(await unsentTables('u1')).toEqual(new Set(['accounts']))
  })

  it('goes up in the push that follows, and nothing is left after it', async () => {
    const id = await tables.accounts.add(account({ balance: 100, updatedAt: earlier(2), syncedAt: earlier(2) }))
    server.accounts = [remoteAccount({ balance: 100, updated_at: earlier(2) })]
    duringRead = async (table) => { if (table === 'accounts') await tables.accounts.update(id, { color: '#555555' }) }
    await pullChanges('u1', { only: new Set(['accounts']) })
    duringRead = null
    // What SyncManager does: ask which tables are unsent and push those.
    await syncToSupabase('u1', { only: await unsentTables('u1') })
    expect(sentTo('accounts')[0].rows.map(r => r.color)).toEqual(['#555555'])
    expect((await unsentTables('u1')).size).toBe(0)
  })

  it('is not overwritten by the cloud\'s newer copy that was decided on before it: the pull checks the row again as it writes', async () => {
    const id = await tables.accounts.add(account({ balance: 100, updatedAt: earlier(2), syncedAt: earlier(2) }))
    server.accounts = [remoteAccount({ balance: 175, updated_at: earlier(9) })]
    // After the pull has read this row and found the cloud's copy newer, and before it writes.
    let saved = false
    afterFirst = async (table) => {
      if (table !== 'accounts' || saved) return
      saved = true
      await tables.accounts.update(id, { color: '#555555' })
    }
    await pullChanges('u1', { only: new Set(['accounts']) })
    afterFirst = null
    expect(saved).toBe(true)
    const row = await tables.accounts.get(id)
    expect(row.color).toBe('#555555')
    expect(isUnsent(row)).toBe(true)
    expect(await unsentTables('u1')).toEqual(new Set(['accounts']))
  })

  it('does the same for a note, which the pull reads a whole request before it writes', async () => {
    const doc = /** @type {Record<string, any>} */ ({ type: 'doc', content: [] })
    const id = await tables.notes.add({ syncId: 'n1', title: 'Payday', text: 'Payday', doc, updatedAt: earlier(2), synced: 1, pushed: true })
    server.notes = [{ id: 1, user_id: 'u1', sync_id: 'n1', title: 'Payday', content: doc, pinned: false, updated_at: earlier(9) }]
    // The note is typed in while the request for the newer copy is out.
    duringBody = async (table) => {
      if (table !== 'notes') return
      duringBody = null
      await tables.notes.update(id, { text: 'Payday, then rent', title: 'Payday, then rent', updatedAt: stamp(), synced: 0 })
    }
    await pullChanges('u1', { only: new Set(['notes']) })
    duringBody = null
    const note = await tables.notes.get(id)
    expect(note.text).toBe('Payday, then rent')
    expect(note.synced).toBe(0)
    expect(await unsentTables('u1')).toEqual(new Set(['notes']))
  })

  it('applies the cloud\'s copy as ever when nothing was written in between', async () => {
    const id = await tables.accounts.add(account({ balance: 100, updatedAt: earlier(2), syncedAt: earlier(2) }))
    server.accounts = [remoteAccount({ balance: 175, updated_at: earlier(9) })]
    await pullChanges('u1', { only: new Set(['accounts']) })
    expect((await tables.accounts.get(id)).balance).toBe(175)
  })

  it('finds a row made in that moment too: it has no mark at all', async () => {
    server.accounts = [remoteAccount({ updated_at: earlier(2) })]
    duringRead = async (table) => { if (table === 'accounts') await tables.goals.add({ name: 'Trip', target: 1 }) }
    await pullChanges('u1', { only: new Set(['accounts']) })
    duringRead = null
    expect(await unsentTables('u1')).toEqual(new Set(['goals']))
  })
})

describe('unsentTables', () => {
  it('is empty when everything has been sent', async () => {
    await tables.accounts.add(account({ updatedAt: earlier(1), syncedAt: earlier(1) }))
    expect((await unsentTables('u1')).size).toBe(0)
  })

  it('names each table that has something to send, and only those', async () => {
    await tables.accounts.add(account({ updatedAt: earlier(2), syncedAt: earlier(1) }))
    await tables.categories.add({ name: 'Food', type: 'expense', budget: 5, syncId: 'c1', updatedAt: earlier(1), syncedAt: earlier(1) })
    await tables.badges.put({ key: 'first-peso', earnedAt: earlier(1) })
    expect(await unsentTables('u1')).toEqual(new Set(['accounts', 'badges']))
  })

  it('does not name a row a push would turn away: a duplicate, or one with no stable id', async () => {
    await tables.accounts.add(account({ name: 'Cash', syncId: 'first', updatedAt: earlier(1), syncedAt: earlier(1) }))
    await tables.accounts.add(account({ name: 'Cash', syncId: 'second' }))
    const id = await tables.debts.add({ name: 'Gelo', amount: 5, type: 'i_owe', syncId: 'd1' })
    delete tables.debts.rows.get(id).syncId
    expect((await unsentTables('u1')).size).toBe(0)
  })

  it('names the two tables that keep their own marks', async () => {
    await tables.notes.add({ syncId: 'n1', text: 'Payday', synced: 0, doc: { type: 'doc', content: [] }, title: 'Payday' })
    await tables.trash.add({ syncId: 't1', deletedAt: earlier(1), synced: 0 })
    expect(await unsentTables('u1')).toEqual(new Set(['notes', 'trash']))
  })

  it('leaves a blank note out, which is never sent', async () => {
    await tables.notes.add({ syncId: 'n1', text: '  ', synced: 0, doc: { type: 'doc', content: [] }, title: '' })
    expect((await unsentTables('u1')).size).toBe(0)
  })

  it('stops naming a table the cloud has not got, once a push has found that out', async () => {
    await tables.goals.add({ name: 'Trip', target: 5, syncId: 'g1' })
    expect(await unsentTables('u1')).toEqual(new Set(['goals']))
    refuse = () => ({ message: 'relation "public.goals" does not exist' })
    await syncToSupabase('u1', { only: new Set(['goals']) })
    expect((await unsentTables('u1')).size).toBe(0)
    // And names it again once a push of it has gone through: the migration was run while the app was open.
    refuse = null
    await syncToSupabase('u1', { only: new Set(['goals']) })
    await tables.goals.add({ name: 'Car', target: 5, syncId: 'g2' })
    expect(await unsentTables('u1')).toEqual(new Set(['goals']))
  })
})

/**
 * A device's first sync with an account that already has data.
 *
 * The pull marks what it brings in as the account's own, and what is left
 * unmarked is what only this device has - which is what goes up. A device that
 * last synced with another account carries marks for that one.
 */
describe('a first sync', () => {
  /** Setup as a fresh install that meets an account with a history. */
  async function meetAccount() {
    server.accounts = [
      remoteAccount({ id: 1, sync_id: 's-maya', name: 'Maya', balance: 500, updated_at: earlier(3) }),
      remoteAccount({ id: 2, sync_id: 's-bpi', name: 'BPI', balance: 900, updated_at: earlier(3) }),
    ]
    server.transactions = [{ id: 1, user_id: 'u1', tx_id: 't1', type: 'expense', transaction_date: '2026-09-01T00:00:00.000Z', description: 'x', category: 'Food', from_account: 'Maya', amount: 5, updated_at: earlier(3) }]
    // This device: a Cash of its own and a Maya the account also has, both marked sent - to somebody else's account.
    await tables.accounts.add(account({ name: 'Cash', syncId: 'l-cash', updatedAt: earlier(40), syncedAt: earlier(40) }))
    await tables.accounts.add(account({ name: 'Maya', syncId: 'l-maya', balance: 7, updatedAt: earlier(41), syncedAt: earlier(41) }))
    await tables.meta.put({ key: 'syncedWith', value: 'somebody-else' })
    await tables.meta.put({ key: 'lastSync', value: earlier(40) })
  }

  it('"keep both": the account\'s rows arrive marked, and what only this device has goes up', async () => {
    await meetAccount()
    const { first } = await fullSync('u1', { choice: 'both' })
    expect(first).toBe(true)
    // Cash is this device's alone: it was marked sent to the other account, and goes up to this one.
    expect(namesSentTo('accounts')).toEqual(['Cash'])
    const rows = await tables.accounts.toArray()
    const byName = Object.fromEntries(rows.map(r => [r.name, r]))
    // Maya and BPI are the account's own now, and quiet.
    expect(byName.Maya).toMatchObject({ balance: 500, syncId: 's-maya', syncedAt: earlier(3), updatedAt: earlier(3) })
    expect(byName.BPI).toMatchObject({ balance: 900, syncedAt: earlier(3) })
    expect(rows.filter(isUnsent)).toEqual([])
  })

  it('"use the account\'s": everything arrives marked, and nothing of this device\'s is sent', async () => {
    await meetAccount()
    await fullSync('u1', { choice: 'account' })
    expect(sentTo('accounts')).toEqual([])
    const rows = await tables.accounts.toArray()
    expect(rows.map(r => r.name).sort()).toEqual(['BPI', 'Maya'])
    expect(rows.filter(isUnsent)).toEqual([])
  })

  it('an ordinary sync after it sends only what has changed since', async () => {
    await meetAccount()
    await fullSync('u1', { choice: 'both' })
    upserts = []
    const maya = (await tables.accounts.toArray()).find(a => a.name === 'Maya')
    await tables.accounts.update(maya.id, { color: '#640640' })
    await fullSync('u1')
    expect(namesSentTo('accounts')).toEqual(['Maya'])
  })
})

/**
 * "Over-deleting is safe because the push that follows re-uploads every
 * surviving local row" - the sentence the queued deletes were written under.
 * A push no longer sends every row, so the table a delete landed in is put
 * back to unsent: the delete may have matched more than the row it was for.
 */
describe('a delete that landed', () => {
  const clean = { updatedAt: earlier(1), syncedAt: earlier(1) }

  beforeEach(async () => {
    await tables.meta.put({ key: 'syncedWith', value: 'u1' })
  })

  it('has the table it was in sent again, whole, so a survivor it took from the cloud is put back', async () => {
    await tables.accounts.add(account({ name: 'Cash', syncId: 'a1', ...clean }))
    await tables.accounts.add(account({ name: 'BPI', syncId: 'a2', ...clean }))
    await tables.categories.add({ name: 'Food', type: 'expense', budget: 1, syncId: 'c1', ...clean })
    await tables.meta.put({ key: 'pendingDeletes', value: [{ table: 'accounts', match: { name: 'Old' } }] })
    await fullSync('u1')
    expect(namesSentTo('accounts').sort()).toEqual(['BPI', 'Cash'])
    // Only that table: nothing was deleted from the others.
    expect(namesSentTo('categories').filter(n => n === 'Food')).toEqual([])
  })

  it('is not a reason to send anything when no delete was waiting', async () => {
    await tables.accounts.add(account({ name: 'Cash', syncId: 'a1', ...clean }))
    await fullSync('u1')
    expect(sentTo('accounts')).toEqual([])
  })

  it('and a delete that has to wait leaves the table as it is', async () => {
    await tables.accounts.add(account({ name: 'Cash', syncId: 'a1', ...clean }))
    await tables.meta.put({ key: 'pendingDeletes', value: [{ table: 'accounts', match: { name: 'Old' } }] })
    const { supabase } = await import('./supabase')
    /** @type {any} */
    const client = supabase
    const real = client.from
    // The delete cannot be made: every answer to it is an error.
    /** @type {any} */
    const refused = { eq: () => refused, then: (/** @type {any} */ res) => res({ error: { message: 'offline' } }) }
    client.from = (/** @type {string} */ t) => {
      const b = real(t)
      return t === 'accounts' ? { ...b, delete: () => refused } : b
    }
    try {
      await fullSync('u1')
    } finally {
      client.from = real
    }
    expect(sentTo('accounts')).toEqual([])
    expect((await tables.meta.get('pendingDeletes')).value).toHaveLength(1)
  })
})

describe('a pull is still a pull', () => {
  it('writes nothing to the cloud, whatever is unsent here', async () => {
    await tables.accounts.add(account({ syncId: 'a1' }))
    server.accounts = [remoteAccount({ sync_id: 'other', name: 'BPI', updated_at: earlier(2) })]
    await pullChanges('u1', { only: new Set(['accounts']) })
    expect(upserts).toEqual([])
  })
})

/**
 * A balance is what the account opened with plus every transaction in it, on
 * each device (db/balances.js reconcileBalances) - not a total copied from
 * whichever device wrote the account's row last.
 *
 * The copied total is what went wrong once changes arrived live: the account
 * row and the transactions it counted came by different roads, in any order,
 * and every way they could cross left the balance higher than the list. Each
 * test here is one of those crossings, done the way it really happened.
 */
describe('balances, worked out from the ledger', () => {
  const clean = { updatedAt: earlier(1), syncedAt: earlier(1) }
  /** A transaction on this device. @param {Record<string, any>} over */
  const localTx = (over) => tables.transactions.add({ type: 'expense', category: 'Food', account: 'Cash', date: '2026-10-08T00:00:00.000Z', synced: 1, updatedAt: earlier(2), ...over })
  /** A transaction as the cloud has it. @param {Record<string, any>} over */
  const remoteTx = (over) => ({ id: 1, user_id: 'u1', type: 'expense', transaction_date: '2026-10-08T00:00:00.000Z', description: 'x', category: 'Food', from_account: 'Cash', updated_at: earlier(4), ...over })
  const cash = async () => (await tables.accounts.toArray()).find(a => a.name === 'Cash')

  it('takes a deletion off once, when the deleting device\'s account row arrives first', async () => {
    await tables.accounts.add(account({ opening: 1000, balance: 900, ...clean }))
    await localTx({ txId: 't1', amount: 100 })
    // The device that deleted it sends its account row, which already has it taken off...
    server.accounts = [remoteAccount({ balance: 1000, opening_balance: 1000, updated_at: earlier(6) })]
    await pullChanges('u1', { only: new Set(['accounts']) })
    expect((await cash()).balance).toBe(900)
    // ...and then the deletion itself.
    server.deletions = [{ id: 1, user_id: 'u1', table_name: 'transactions', row_key: 't1', deleted_at: earlier(5) }]
    await pullChanges('u1', { only: new Set(['deletions']) })
    expect((await cash()).balance).toBe(1000)
  })

  it('and once when the deletion arrives first', async () => {
    await tables.accounts.add(account({ opening: 1000, balance: 900, ...clean }))
    await localTx({ txId: 't1', amount: 100 })
    server.deletions = [{ id: 1, user_id: 'u1', table_name: 'transactions', row_key: 't1', deleted_at: earlier(5) }]
    await pullChanges('u1', { only: new Set(['deletions']) })
    expect((await cash()).balance).toBe(1000)
    server.accounts = [remoteAccount({ balance: 1000, opening_balance: 1000, updated_at: earlier(6) })]
    await pullChanges('u1', { only: new Set(['accounts']) })
    expect((await cash()).balance).toBe(1000)
  })

  it('counts an expense made on each device in the same moment, both of them', async () => {
    await tables.accounts.add(account({ opening: 1000, balance: 900, ...clean }))
    await localTx({ txId: 'here', amount: 100 })
    // The other device's expense, and its account row, which knew only of its own.
    server.transactions = [remoteTx({ tx_id: 'there', amount: 50 })]
    server.accounts = [remoteAccount({ balance: 950, opening_balance: 1000, updated_at: earlier(6) })]
    await pullChanges('u1')
    expect((await cash()).balance).toBe(850)
  })

  it('moves the balance the moment a transaction is heard, without waiting for the account\'s row', async () => {
    await tables.accounts.add(account({ opening: 1000, balance: 1000, ...clean }))
    await applyRemoteTransaction(remoteTx({ tx_id: 'live', amount: 40 }))
    const row = await cash()
    expect(row.balance).toBe(960)
    // Worked out the same on every device, so it is nothing to send.
    expect(isUnsent(row)).toBe(false)
  })

  it('gives an account that has no opening one, from the balance it has, which it keeps - and sends nothing for it', async () => {
    await tables.accounts.add(account({ balance: 700, ...clean }))
    await localTx({ txId: 't1', amount: 300 })
    await pullChanges('u1', { only: new Set(['accounts']) })
    expect(await cash()).toMatchObject({ opening: 1000, balance: 700 })
    expect(isUnsent(await cash())).toBe(false)
    await syncToSupabase('u1', { only: new Set(['accounts']) })
    expect(upserts).toEqual([])
  })

  it('takes the cloud\'s opening over its own, and the balance follows from it', async () => {
    await tables.accounts.add(account({ opening: 1000, balance: 900, ...clean }))
    await localTx({ txId: 't1', amount: 100 })
    server.accounts = [remoteAccount({ balance: 1234, opening_balance: 1200, updated_at: earlier(6) })]
    await pullChanges('u1', { only: new Set(['accounts']) })
    expect(await cash()).toMatchObject({ opening: 1200, balance: 1100 })
  })

  it('sends an opening the cloud has a place for and no figure in, once', async () => {
    await tables.accounts.add(account({ opening: 1000, balance: 1000, ...clean }))
    server.accounts = [remoteAccount({ opening_balance: null, updated_at: earlier(1) })]
    await pullChanges('u1', { only: new Set(['accounts']) })
    expect(isUnsent(await cash())).toBe(true)
    await syncToSupabase('u1', { only: new Set(['accounts']) })
    expect(sentTo('accounts')[0].rows[0]).toMatchObject({ name: 'Cash', opening_balance: 1000 })
  })

  it('asks nothing of a cloud that has no place for it (033 not run)', async () => {
    await tables.accounts.add(account({ opening: 1000, balance: 1000, ...clean }))
    server.accounts = [remoteAccount({ updated_at: earlier(1) })]
    await pullChanges('u1', { only: new Set(['accounts']) })
    expect(isUnsent(await cash())).toBe(false)
  })

  it('works the opening out on a first sync from the account\'s balance and the account\'s ledger', async () => {
    await tables.meta.put({ key: 'syncedWith', value: 'somebody-else' })
    await tables.meta.put({ key: 'lastSync', value: earlier(40) })
    await tables.accounts.add(account({ opening: 7, balance: 7, ...clean }))
    server.accounts = [remoteAccount({ balance: 500, updated_at: earlier(3) })]
    server.transactions = [remoteTx({ tx_id: 't1', amount: 5, updated_at: earlier(3) })]
    await fullSync('u1', { choice: 'account' })
    expect(await cash()).toMatchObject({ opening: 505, balance: 500 })
  })
})

describe('accountPatch', () => {
  const patch = { name: 'Cash', balance: 950, opening: 1000, syncedAt: earlier(6) }

  it('drops the balance when the cloud has the opening: the balance is worked out here', () => {
    expect(accountPatch(patch, { opening: 900 }, { opening_balance: 1000 })).toEqual({ name: 'Cash', opening: 1000, syncedAt: earlier(6) })
  })

  it('drops the balance when this device has an opening and the cloud has none', () => {
    const { opening: _none, ...noOpening } = patch
    expect(accountPatch(noOpening, { opening: 900 }, { opening_balance: null })).toEqual({ name: 'Cash', syncedAt: earlier(6) })
  })

  it('takes the balance when neither has one: it is what an opening is worked out from', () => {
    const { opening: _none, ...noOpening } = patch
    expect(accountPatch(noOpening, {}, {})).toEqual(noOpening)
  })

  it('on a first sync with no opening in the cloud, clears this device\'s, to be worked out again', () => {
    const { opening: _none, ...noOpening } = patch
    expect(accountPatch(noOpening, { opening: 7 }, {}, true)).toEqual({ ...noOpening, opening: null })
  })
})

describe('the opening, between here and the cloud', () => {
  it('goes up as opening_balance, and null when this device has none', () => {
    expect(accountToRow(/** @type {any} */ (account({ opening: 1000 })), 'u1').opening_balance).toBe(1000)
    expect(accountToRow(/** @type {any} */ (account()), 'u1').opening_balance).toBeNull()
  })

  it('comes down only when the cloud has one, so a null never blanks this device\'s', () => {
    expect(rowToAccount(remoteAccount({ opening_balance: '1000.50' })).opening).toBe(1000.5)
    expect('opening' in rowToAccount(remoteAccount({ opening_balance: null }))).toBe(false)
    expect('opening' in rowToAccount(remoteAccount())).toBe(false)
  })
})

/**
 * The races a second device found, each one a change that was silently
 * dropped: made while a push was on its way, or a pull was deciding.
 */
describe('a change made while the ledger is being sent', () => {
  /** A transaction on this device. @param {Record<string, any>} over */
  const tx = (over) => tables.transactions.add({ txId: 't1', type: 'expense', category: 'Food', account: 'Cash', amount: 10, date: '2026-10-08T00:00:00.000Z', synced: 0, updatedAt: earlier(1), ...over })

  it('an edit made while the push is on its way stays unsent, and goes next time', async () => {
    await tx({})
    duringPush = async (table) => {
      if (table !== 'transactions') return
      const [row] = await tables.transactions.toArray()
      await tables.transactions.update(row.id, { amount: 99, updatedAt: earlier(2), synced: 0 })
    }
    await syncToSupabase('u1', { only: new Set(['transactions']) })
    let [row] = await tables.transactions.toArray()
    expect(row).toMatchObject({ amount: 99, synced: 0 })
    duringPush = null
    upserts = []
    await syncToSupabase('u1', { only: new Set(['transactions']) })
    expect(sentTo('transactions')[0].rows[0].amount).toBe(99)
    ;[row] = await tables.transactions.toArray()
    expect(row.synced).toBe(1)
  })

  it('a transaction deleted while another delete is on its way is not forgotten', async () => {
    await tables.meta.put({ key: 'deletedTxIds', value: ['gone-1'] })
    let once = false
    duringBody = async (table) => {
      if (table !== 'transactions' || once) return
      once = true
      await tables.meta.put({ key: 'deletedTxIds', value: ['gone-1', 'gone-2'] })
    }
    await syncToSupabase('u1', { only: new Set(['transactions']) })
    expect((await tables.meta.get('deletedTxIds')).value).toEqual(['gone-2'])
  })

  it('a row deleted while other deletes are on their way stays queued', async () => {
    await tables.meta.put({ key: 'syncedWith', value: 'u1' })
    await tables.meta.put({ key: 'pendingDeletes', value: [{ table: 'categories', match: { sync_id: 'c1' } }] })
    let once = false
    duringBody = async (table) => {
      if (table !== 'categories' || once) return
      once = true
      const now = (await tables.meta.get('pendingDeletes')).value
      await tables.meta.put({ key: 'pendingDeletes', value: [...now, { table: 'categories', match: { sync_id: 'c2' } }] })
    }
    await fullSync('u1')
    expect((await tables.meta.get('pendingDeletes')).value).toEqual([{ table: 'categories', match: { sync_id: 'c2' } }])
  })
})

describe('a pull never lands on a change not yet sent', () => {
  const remote = (over = {}) => ({ id: 1, user_id: 'u1', tx_id: 't1', type: 'expense', transaction_date: '2026-10-08T00:00:00.000Z', description: 'x', category: 'Food', from_account: 'Cash', amount: 10, updated_at: earlier(9), ...over })

  it('keeps an unsent edit over the cloud\'s newer copy, wherever the clocks stand', async () => {
    await tables.transactions.add({ txId: 't1', type: 'expense', category: 'Food', account: 'Cash', amount: 99, date: '2026-10-08T00:00:00.000Z', synced: 0, updatedAt: earlier(1) })
    server.transactions = [remote()]
    await pullChanges('u1', { only: new Set(['transactions']) })
    expect((await tables.transactions.toArray())[0].amount).toBe(99)
  })

  it('and so does a row heard live', async () => {
    await tables.transactions.add({ txId: 't1', type: 'expense', category: 'Food', account: 'Cash', amount: 99, date: '2026-10-08T00:00:00.000Z', synced: 0, updatedAt: earlier(1) })
    await applyRemoteTransaction(remote())
    expect((await tables.transactions.toArray())[0].amount).toBe(99)
  })

  it('takes the cloud\'s newer copy over one already sent', async () => {
    await tables.transactions.add({ txId: 't1', type: 'expense', category: 'Food', account: 'Cash', amount: 99, date: '2026-10-08T00:00:00.000Z', synced: 1, updatedAt: earlier(1) })
    server.transactions = [remote()]
    await pullChanges('u1', { only: new Set(['transactions']) })
    expect((await tables.transactions.toArray())[0].amount).toBe(10)
  })
})

describe('a device that changes hands', () => {
  beforeEach(async () => {
    await tables.meta.put({ key: 'syncedWith', value: 'somebody-else' })
    await tables.meta.put({ key: 'lastSync', value: earlier(40) })
    await tables.meta.put({ key: 'displayName', value: 'Xena' })
    await tables.transactions.add({ txId: 'x1', type: 'expense', category: 'Food', account: 'Cash', amount: 5, date: '2026-10-08T00:00:00.000Z', synced: 1, updatedAt: earlier(1) })
    await tables.notes.add({ syncId: 'n1', text: 'Owe Ben 4,200', updatedAt: earlier(1) })
    await tables.notifications.put({ id: 'budget:Therapy', at: earlier(1), read: 0 })
  })

  it('asks a new, empty account before taking the last person\'s ledger as its own', async () => {
    const err = await fullSync('u1').catch(e => e)
    expect(err).toBeInstanceOf(FirstSyncChoiceNeeded)
    expect(err.info).toMatchObject({ previousUser: true, remote: { transactions: 0, accounts: 0 }, local: { transactions: 1 } })
    expect(upserts).toEqual([])
  })

  it('"Start fresh" leaves nothing of theirs: entries, notes, notifications, their name - and sends none of it', async () => {
    await fullSync('u1', { choice: 'account' })
    expect(await tables.transactions.count()).toBe(0)
    expect(await tables.notes.count()).toBe(0)
    expect(await tables.notifications.count()).toBe(0)
    expect(await tables.meta.get('displayName')).toBeUndefined()
    expect(sentTo('transactions')).toEqual([])
    expect(sentTo('notes')).toEqual([])
  })
})

describe('a restore', () => {
  it('reads the ledger again from the start, but keeps the deletions already applied', async () => {
    await tables.meta.put({ key: 'syncWatermark', value: { transactions: earlier(5), deletions: earlier(6) } })
    await resetLedgerWatermark()
    expect((await tables.meta.get('syncWatermark')).value).toEqual({ deletions: earlier(6) })
  })
})

describe('a balance, on its own', () => {
  /** The balance-only updates sent, as [sync_id, balance]. */
  const patches = () => updates.filter(u => u.table === 'accounts').map(u => [u.match.sync_id, u.patch.balance])

  it('sends a balance that moved as that one column, and nothing of the rest of the row', async () => {
    await tables.accounts.add(account({ syncId: 'a1', balance: 850, balanceSent: 1000, updatedAt: earlier(1), syncedAt: earlier(1) }))
    await syncToSupabase('u1', { only: new Set(['transactions']) })
    expect(patches()).toEqual([['a1', 850]])
    expect(sentTo('accounts')).toEqual([])
    const [row] = await tables.accounts.toArray()
    expect(row).toMatchObject({ balanceSent: 850, updatedAt: earlier(1) })
    expect(isUnsent(row)).toBe(false)
  })

  it('sends nothing when the balance has not moved', async () => {
    await tables.accounts.add(account({ syncId: 'a1', balance: 850, balanceSent: 850, updatedAt: earlier(1), syncedAt: earlier(1) }))
    await syncToSupabase('u1', { only: new Set(['transactions']) })
    expect(patches()).toEqual([])
  })

  it('counts a balance a pull worked out, and has not yet sent, as something left to send', async () => {
    await tables.accounts.add(account({ syncId: 'a1', balance: 850, balanceSent: 1000, updatedAt: earlier(1), syncedAt: earlier(1) }))
    expect(await unsentTables('u1')).toEqual(new Set(['accounts']))
  })
})

describe('a deletion that arrives after an Undo', () => {
  it('does not take back a row put back here and not yet sent', async () => {
    await tables.transactions.add({ txId: 't1', type: 'expense', category: 'Food', account: 'Cash', amount: 150, date: '2026-10-08T00:00:00.000Z', synced: 0, updatedAt: earlier(3) })
    server.deletions = [{ id: 1, user_id: 'u1', table_name: 'transactions', row_key: 't1', deleted_at: earlier(2) }]
    await pullChanges('u1', { only: new Set(['deletions']) })
    expect(await tables.transactions.count()).toBe(1)
  })

  it('still removes a row this device has nothing unsent about', async () => {
    await tables.transactions.add({ txId: 't1', type: 'expense', category: 'Food', account: 'Cash', amount: 150, date: '2026-10-08T00:00:00.000Z', synced: 1, updatedAt: earlier(1) })
    server.deletions = [{ id: 1, user_id: 'u1', table_name: 'transactions', row_key: 't1', deleted_at: earlier(2) }]
    await pullChanges('u1', { only: new Set(['deletions']) })
    expect(await tables.transactions.count()).toBe(0)
  })
})
