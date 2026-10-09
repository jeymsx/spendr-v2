import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A restore, and what the small tables make of the rows it writes.
 *
 * Accounts, categories, debts, bills, templates, goals, badges, challenges and
 * folders send only the rows that have changed since the cloud last held them:
 * a row whose updatedAt is not its syncedAt (lib/sync.js isUnsent). A backup is
 * a dump of the rows as they sat on the device that made it, syncedAt and all -
 * so a restore that left the note in place would mark every row as already
 * sent, to a cloud that has never seen the restored copy, and nothing would
 * ever go up. Restored rows have to come in without it.
 */

/** What was written, by table: [method, rows]. @type {Record<string, Array<[string, any[]]>>} */
let writes = {}

vi.mock('../db/db', () => {
  /** @param {string} name */
  const table = (name) => ({
    toArray: async () => /** @type {any[]} */ ([]),
    clear: async () => {},
    bulkAdd: async (/** @type {any[]} */ rows) => { (writes[name] ??= []).push(['bulkAdd', rows]); return rows.length },
    bulkPut: async (/** @type {any[]} */ rows) => { (writes[name] ??= []).push(['bulkPut', rows]); return rows.length },
    put: async () => {},
    get: async () => /** @type {any} */ (undefined),
    delete: async () => {},
  })
  const db = new Proxy(/** @type {Record<string, any>} */ ({
    transaction: async (/** @type {any} */ _mode, /** @type {any} */ _tables, /** @type {() => Promise<any>} */ fn) => fn(),
  }), { get: (t, k) => (k in t ? t[/** @type {string} */ (k)] : (t[/** @type {string} */ (k)] = table(/** @type {string} */ (k)))) })
  return { default: db, UNSYNCED: 0, SYNCED: 1 }
})
vi.mock('./sync', () => ({ queueRemoteDelete: vi.fn(), resetWatermarks: vi.fn(async () => {}), resetLedgerWatermark: vi.fn(async () => {}) }))
vi.mock('./achievements', () => ({ PRIMED_META: 'achievementsPrimed' }))

const { restoreBackup } = await import('./backup')

const MARK = '2026-09-01T00:00:00.000Z'

/** A backup whose rows carry the mark of the device that made it. */
const backup = () => ({
  version: 2,
  accounts: [{ id: 1, name: 'Cash', syncId: 'a1', balance: 5, updatedAt: MARK, syncedAt: MARK }],
  categories: [{ id: 1, name: 'Food', type: 'expense', syncId: 'c1', updatedAt: MARK, syncedAt: MARK }],
  debts: [{ id: 1, name: 'Gelo', amount: 5, type: 'i_owe', syncId: 'd1', updatedAt: MARK, syncedAt: MARK }],
  recurring: [{ id: 1, name: 'Rent', syncId: 'r1', updatedAt: MARK, syncedAt: MARK }],
  templates: [{ id: 1, name: 'Lunch', syncId: 't1', updatedAt: MARK, syncedAt: MARK }],
  goals: [{ id: 1, name: 'Trip', target: 5, syncId: 'g1', updatedAt: MARK, syncedAt: MARK }],
  badges: [{ key: 'first-peso', earnedAt: MARK, synced: 1, syncedAt: MARK }],
  challenges: [{ id: 1, key: 'no-spend', syncId: 'ch1', updatedAt: MARK, syncedAt: MARK }],
  note_folders: [{ id: 1, name: 'Work', syncId: 'f1', updatedAt: MARK, syncedAt: MARK }],
  transactions: [{ id: 1, txId: 'tx1', type: 'expense', amount: 5, updatedAt: MARK }],
})

beforeEach(() => { writes = {} })

describe('restoreBackup', () => {
  it('writes every small table\'s rows without the note of what the cloud last had, so each goes up once', async () => {
    await restoreBackup(backup())
    for (const t of ['accounts', 'categories', 'debts', 'recurring', 'templates', 'goals', 'challenges', 'note_folders']) {
      const rows = writes[t].flatMap(([, r]) => r)
      expect(rows, t).toHaveLength(1)
      expect(rows[0], t).not.toHaveProperty('syncedAt')
    }
    // A badge is merged rather than replaced, and is marked the same way.
    expect(writes.badges[0][1][0]).not.toHaveProperty('syncedAt')
  })

  it('stamps them as changed now, which is the other half of being sent: updatedAt is no longer anything the cloud held', async () => {
    const before = Date.now()
    await restoreBackup(backup())
    const [account] = writes.accounts[0][1]
    expect(Date.parse(account.updatedAt)).toBeGreaterThanOrEqual(before - 1000)
    expect(account.updatedAt).not.toBe(MARK)
  })

  it('keeps everything else about a row', async () => {
    await restoreBackup(backup())
    expect(writes.accounts[0][1][0]).toMatchObject({ id: 1, name: 'Cash', syncId: 'a1', balance: 5, synced: 0 })
    expect(writes.badges[0][1][0]).toMatchObject({ key: 'first-peso', earnedAt: MARK, synced: 0 })
  })

  it('reads a backup from before the mark existed as it always did', async () => {
    const old = backup()
    for (const rows of [old.accounts, old.categories]) for (const r of rows) delete r.syncedAt
    await restoreBackup(old)
    expect(writes.accounts[0][1][0]).not.toHaveProperty('syncedAt')
    expect(writes.accounts[0][1][0].name).toBe('Cash')
  })
})
