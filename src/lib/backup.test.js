import { describe, it, expect, vi } from 'vitest'

/**
 * The gate in front of a destructive restore.
 *
 * restoreBackup CLEARS every table it is given data for. So inspectBackup is
 * the only thing standing between a mistyped file picker and somebody's whole
 * ledger - and every branch in it ends in a thrown message the user has to be
 * able to act on. It had no tests.
 *
 * db is stubbed because importing backup.js reaches Dexie and IndexedDB, which
 * do not exist in a node test. Nothing here calls a db method: inspectBackup is
 * pure, which is exactly why it is the part worth pinning.
 */
vi.mock('../db/db', () => ({
  default: {},
  UNSYNCED: 0,
  SYNCED: 1,
}))
vi.mock('./sync', () => ({ queueRemoteDelete: vi.fn() }))

const { inspectBackup, BACKUP_VERSION } = await import('./backup')

/** @type {Record<string, any>} */
const good = {
  version: 1,
  exportedAt: '2026-09-12T00:00:00.000Z',
  transactions: [{ id: 1, amount: 100 }],
  accounts: [{ id: 1, name: 'Cash' }],
  categories: [],
  templates: [],
  recurring: [],
  debts: [],
  goals: [],
  badges: [],
}

describe('inspectBackup', () => {
  it('accepts a file it wrote itself', () => {
    const out = inspectBackup(good)
    expect(out.counts.transactions).toBe(1)
    expect(out.counts.accounts).toBe(1)
    expect(out.exportedAt).toBe('2026-09-12T00:00:00.000Z')
    expect(out.missing).toEqual([])
  })

  it('takes the file as a string, which is how it arrives from a picker', () => {
    expect(inspectBackup(JSON.stringify(good)).counts.transactions).toBe(1)
  })

  it('names the problem when the file is not JSON at all', () => {
    expect(() => inspectBackup('not json')).toThrow(/valid JSON/i)
  })

  it('rejects JSON that is not an object', () => {
    expect(() => inspectBackup('[1,2,3]')).toThrow(/Not a Spendr backup/i)
    expect(() => inspectBackup('null')).toThrow(/Not a Spendr backup/i)
    expect(() => inspectBackup('"a string"')).toThrow(/Not a Spendr backup/i)
  })

  it('rejects an object with none of its tables in it', () => {
    expect(() => inspectBackup({ hello: 'world' })).toThrow(/No Spendr data/i)
  })

  /**
   * A section of nulls or numbers would reach bulkAdd and throw there - after
   * the clear(). The whole point of failing here is that nothing has been
   * deleted yet.
   */
  it('rejects a malformed section, and says which one', () => {
    expect(() => inspectBackup({ accounts: [null] })).toThrow(/"accounts" section is malformed/)
    expect(() => inspectBackup({ transactions: [1, 2] })).toThrow(/"transactions" section is malformed/)
  })

  /* Written against BACKUP_VERSION rather than a literal. It used to say 2,
     which meant the day the writer moved to 2 this test was asserting that
     the app refuses its own backups. */
  it('refuses a backup from a newer version of the app', () => {
    expect(() => inspectBackup({ ...good, version: BACKUP_VERSION + 1 }))
      .toThrow(/newer than this app understands/)
  })

  it('accepts a file with no version at all, which older exports had', () => {
    const { version, ...noVersion } = good
    expect(() => inspectBackup(noVersion)).not.toThrow()
  })

  it('reports which sections were absent rather than treating them as empty', () => {
    const out = inspectBackup({ accounts: [{ name: 'Cash' }] })
    expect(out.missing).toContain('transactions')
    expect(out.missing).not.toContain('accounts')
    expect(out.counts.transactions).toBe(0)
  })

  /**
   * balances is derived from accounts, and meta holds device-local state -
   * onboarded, the display name, the migration flags - that has to survive a
   * restore rather than be overwritten by another device's values. Neither is
   * a backup table, and a file that happens to contain them is not thereby a
   * valid backup.
   */
  it('does not count balances or meta as Spendr data', () => {
    expect(() => inspectBackup({ balances: [{ account: 'Cash' }], meta: [{ key: 'x' }] }))
      .toThrow(/No Spendr data/i)
  })
})

/**
 * The two tables that were missing from this list for two schema versions.
 *
 * goals arrived in v9 and badges in v10, both sync to Supabase, and neither
 * was ever written to a backup file or cleared by a restore. The visible
 * symptom was a full restore that left seeded goals behind - it had nothing
 * to replace them with, so it left them alone.
 */
describe('goals and badges', () => {
  it('counts them like any other table', () => {
    const out = inspectBackup({ ...good, goals: [{ id: 1, name: 'Japan trip' }], badges: [{ key: 'first-peso' }] })
    expect(out.counts.goals).toBe(1)
    expect(out.counts.badges).toBe(1)
    expect(out.missing).toEqual([])
  })

  /**
   * An older file is still restorable - every table is guarded on its own -
   * and reporting what it does NOT carry is the whole point of `missing`.
   * A restore from one of these leaves goals exactly where they were, which
   * is correct and needs saying out loud.
   */
  it('reports them missing from a file written before they existed', () => {
    const { goals, badges, ...old } = good
    const out = inspectBackup(old)
    expect(out.missing).toEqual(['goals', 'badges'])
    expect(out.counts.goals).toBe(0)
  })

  it('still rejects a malformed section', () => {
    expect(() => inspectBackup({ ...good, goals: [null] }))
      .toThrow(/"goals" section is malformed/)
  })
})

/**
 * Version 2: the settings a backup used to leave behind.
 *
 * Restoring onto a clean phone gave you your money back and none of the
 * things that make it look like yours - your name, your currency, the theme,
 * the accent, whether budgets carry over. Theme and accent were never even in
 * Dexie; they are localStorage, because they have to be readable before the
 * database opens or the first paint is the wrong colour.
 */
describe('backup version 2', () => {
  it('writes 2, and accepts its own files', () => {
    expect(BACKUP_VERSION).toBe(2)
    expect(() => inspectBackup({ ...good, version: BACKUP_VERSION })).not.toThrow()
  })

  /* The bug this nearly shipped as: the writer moved to 2 while the reader
     still refused anything above 1, so the app rejected its own backup. */
  it('does not refuse the version it writes', () => {
    const out = inspectBackup({ ...good, version: 2, meta: [], prefs: {} })
    expect(out.data.version).toBe(2)
  })

  it('still reads a version 1 file, which has neither section', () => {
    const out = inspectBackup({ ...good, version: 1 })
    expect(out.data.meta).toBeUndefined()
    expect(out.data.prefs).toBeUndefined()
  })

  it('still refuses a file from a future version', () => {
    expect(() => inspectBackup({ ...good, version: BACKUP_VERSION + 1 }))
      .toThrow(/newer than this app understands/)
  })

  /* meta and prefs are not tables, so they must not be counted as one or
     reported as missing - inspectBackup drives the "what is in this file"
     summary the restore screen shows. */
  it('does not treat the new sections as tables', () => {
    const out = inspectBackup({ ...good, version: 2, meta: [{ key: 'currency', value: 'PHP' }] })
    expect(out.counts.meta).toBeUndefined()
    expect(out.missing).not.toContain('meta')
    expect(out.missing).not.toContain('prefs')
  })
})
