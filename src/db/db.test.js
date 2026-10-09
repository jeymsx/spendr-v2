import { describe, it, expect } from 'vitest'
import db, { BOOKKEEPING, SYNCED_TABLES, changedKeys } from './db'

/**
 * The hooks that stamp a row on its way into a synced table, called the way
 * Dexie calls them but without a database: each subscriber is a plain function,
 * and what it returns is what Dexie would merge into the change.
 *
 * What is pinned here is which writes count as an EDIT. An edit moves
 * updatedAt, and updatedAt is what a row's syncedAt is compared with (lib/sync.js
 * isUnsent) - so a write of syncedAt that counted as one would move the stamp
 * it had just been set to match, and every push would make its rows look
 * changed again, for ever.
 */

/** What the updating hooks of a table say about a change.
 *  @param {string} name @param {Record<string, any>} mods */
function updatingHooks(name, mods) {
  const event = /** @type {any} */ (db.table(name).hook('updating'))
  return /** @type {Array<(mods: any, key: any, row: any, tx: any) => any>} */ (event.subscribers)
    .map(f => f(mods, 1, {}, {}))
    .filter(r => r !== undefined)
}

describe('bookkeeping', () => {
  it('is how a row is filed, not what it says - and that includes the stamp the cloud last had of it', () => {
    for (const k of ['syncId', 'synced', 'pushed', 'syncedAt']) expect(BOOKKEEPING.has(k), k).toBe(true)
  })

  it('does not make updatedAt move when only syncedAt is written, on any table that syncs', () => {
    for (const name of SYNCED_TABLES) {
      expect(updatingHooks(name, { syncedAt: '2026-10-08T04:00:00.000Z' }), name).toEqual([])
    }
  })

  it('moves updatedAt for a real edit, even one that carries syncedAt along', () => {
    const [moved] = updatingHooks('accounts', { name: 'Wallet', syncedAt: '2026-10-08T04:00:00.000Z' })
    expect(typeof moved?.updatedAt).toBe('string')
    expect(Number.isNaN(Date.parse(moved.updatedAt))).toBe(false)
  })

  it('does not move updatedAt for a balance or an opening: they are worked out on every device, not sent', () => {
    // Stamping these let a device's stale copy of an account overwrite a rename made on another.
    expect(updatingHooks('accounts', { balance: 10 })).toEqual([])
    expect(updatingHooks('accounts', { opening: 1000 })).toEqual([])
    expect(updatingHooks('accounts', { balance: 10, opening: 1000, syncedAt: '2026-10-08T04:00:00.000Z' })).toEqual([])
  })

  it('leaves an explicit updatedAt alone: that is what a pull writes beside syncedAt', () => {
    expect(updatingHooks('categories', { name: 'Food', updatedAt: '2026-10-08T04:00:00.000Z', syncedAt: '2026-10-08T04:00:00.000Z' })).toEqual([])
  })
})

describe('changedKeys', () => {
  it('counts a field only when its value is different, lists and objects by their contents', () => {
    const row = { accounts: ['Maya Savings'], target: 5000, meta: { a: 1 }, syncedAt: 'x' }
    expect(changedKeys({ accounts: ['Maya Savings'], syncedAt: 'y' }, row)).toEqual(['syncedAt'])
    expect(changedKeys({ accounts: ['Maya Savings', 'BPI'] }, row)).toEqual(['accounts'])
    expect(changedKeys({ meta: { a: 1 }, target: 5000 }, row)).toEqual([])
    expect(changedKeys({ target: 6000 }, row)).toEqual(['target'])
  })

  it('treats everything as changed when there is no row to compare with', () => {
    expect(changedKeys({ name: 'Trip' }, undefined)).toEqual(['name'])
  })

  it('does not stamp updatedAt for a syncedAt write that Dexie reports with an unchanged list beside it (the goal loop)', () => {
    const event = /** @type {any} */ (db.table('goals').hook('updating'))
    const row = { id: 1, accounts: ['Maya Savings'], updatedAt: 'u', syncedAt: 'old' }
    const results = event.subscribers
      .map((/** @type {any} */ f) => f({ accounts: ['Maya Savings'], syncedAt: 'u' }, 1, row, {}))
      .filter((/** @type {any} */ r) => r !== undefined)
    expect(results).toEqual([])
  })
})
