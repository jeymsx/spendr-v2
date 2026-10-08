import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A stand-in for Dexie's tables: a hook can be added, and removed, and the
 * test fires them the way Dexie would around a write.
 */
const tables = new Map()
function fakeTable() {
  /** @type {Record<string, Set<(...a: any[]) => any>>} */
  const hooks = { creating: new Set(), updating: new Set(), deleting: new Set() }
  const hook = (/** @type {string} */ name, /** @type {any} */ fn) => {
    if (fn) { hooks[name].add(fn); return undefined }
    return { unsubscribe: (/** @type {any} */ f) => hooks[name].delete(f) }
  }
  return { hook, hooks, fire: (/** @type {string} */ name, /** @type {any[]} */ ...args) => { for (const f of [...hooks[name]]) f(...args) } }
}

/**
 * A write as Dexie runs it: the hook is called with a context whose onsuccess
 * is told the new row's key, and a transaction that says when it has been
 * committed. `commit` is that moment.
 */
function fakeWrite() {
  /** @type {Array<() => void>} */
  const onComplete = []
  const transaction = { on: (/** @type {string} */ event, /** @type {() => void} */ fn) => { if (event === 'complete') onComplete.push(fn) } }
  /** @type {{onsuccess?: (key: any) => void}} */
  const context = {}
  return {
    transaction,
    context,
    created: (/** @type {any} */ table, /** @type {any} */ key, /** @type {any} */ row = {}) => {
      for (const f of [...table.hooks.creating]) f.call(context, undefined, row, transaction)
      context.onsuccess?.(key)
    },
    updated: (/** @type {any} */ table, /** @type {any} */ key, /** @type {any} */ mods) => {
      for (const f of [...table.hooks.updating]) f.call(context, mods, key, {}, transaction)
    },
    commit: () => { for (const fn of onComplete.splice(0)) fn() },
  }
}

vi.mock('../db/db', () => {
  const names = ['transactions', 'accounts', 'categories', 'debts', 'recurring', 'templates', 'goals', 'badges', 'challenges', 'trash', 'notes', 'note_folders', 'meta']
  for (const n of names) tables.set(n, fakeTable())
  return {
    default: { table: (/** @type {string} */ n) => tables.get(n), meta: tables.get('meta') },
    SYNCED_TABLES: ['accounts', 'categories', 'debts', 'recurring', 'templates', 'goals', 'challenges', 'trash', 'notes', 'note_folders'],
    BOOKKEEPING: new Set(['syncId', 'synced', 'pushed', 'syncedAt']),
  }
})

const { watchLocalChanges, SYNCED_META_KEYS } = await import('./localChanges')
const { beginRemoteWrites, endRemoteWrites } = await import('./syncSignal')

beforeEach(() => { for (const t of tables.values()) for (const set of Object.values(t.hooks)) set.clear() })

describe('a transaction, once it is saved', () => {
  it('is told of when the write has been committed, with its key - not when it is made', () => {
    const onTransaction = vi.fn()
    watchLocalChanges(vi.fn(), onTransaction)
    const write = fakeWrite()
    write.created(tables.get('transactions'), 41, { txId: 't41' })
    expect(onTransaction).not.toHaveBeenCalled()
    write.commit()
    expect(onTransaction).toHaveBeenCalledTimes(1)
    expect(onTransaction).toHaveBeenCalledWith(41)
  })

  it('is not told of a write that is rolled back', () => {
    const onTransaction = vi.fn()
    watchLocalChanges(vi.fn(), onTransaction)
    const write = fakeWrite()
    write.created(tables.get('transactions'), 41)
    // No commit.
    expect(onTransaction).not.toHaveBeenCalled()
  })

  it('is told of an edit, by its key', () => {
    const onTransaction = vi.fn()
    watchLocalChanges(vi.fn(), onTransaction)
    const write = fakeWrite()
    write.updated(tables.get('transactions'), 7, { amount: 20 })
    write.commit()
    expect(onTransaction).toHaveBeenCalledWith(7)
  })

  it('is not told of a row being marked sent', () => {
    const onTransaction = vi.fn()
    watchLocalChanges(vi.fn(), onTransaction)
    const write = fakeWrite()
    write.updated(tables.get('transactions'), 7, { synced: 1 })
    write.commit()
    expect(onTransaction).not.toHaveBeenCalled()
  })

  it('is not told of what the cloud wrote, which would send it straight back', () => {
    const onTransaction = vi.fn()
    watchLocalChanges(vi.fn(), onTransaction)
    beginRemoteWrites()
    const write = fakeWrite()
    write.created(tables.get('transactions'), 41)
    write.updated(tables.get('transactions'), 41, { amount: 5 })
    endRemoteWrites()
    write.commit()
    expect(onTransaction).not.toHaveBeenCalled()
  })

  it('is only for the ledger: an account written to is not a transaction', () => {
    const onTransaction = vi.fn()
    watchLocalChanges(vi.fn(), onTransaction)
    const write = fakeWrite()
    write.created(tables.get('accounts'), 3)
    write.updated(tables.get('accounts'), 3, { balance: 10 })
    write.commit()
    expect(onTransaction).not.toHaveBeenCalled()
  })

  it('still tells the push about the table, as before', () => {
    const onChange = vi.fn()
    watchLocalChanges(onChange, vi.fn())
    fakeWrite().created(tables.get('transactions'), 41)
    expect(onChange).toHaveBeenCalledWith('transactions')
  })
})

describe('watchLocalChanges', () => {
  it('tells you about a transaction you add, edit or delete', () => {
    const onChange = vi.fn()
    watchLocalChanges(onChange)
    tables.get('transactions').fire('creating', 1, { type: 'expense' })
    tables.get('transactions').fire('updating', { amount: 20 }, 1)
    tables.get('transactions').fire('deleting', 1)
    expect(onChange).toHaveBeenCalledTimes(3)
    expect(onChange).toHaveBeenCalledWith('transactions')
  })

  it('says which table was written to, so only that one need be sent', () => {
    const onChange = vi.fn()
    watchLocalChanges(onChange)
    tables.get('accounts').fire('updating', { balance: 10 }, 1)
    tables.get('goals').fire('creating', 1, {})
    tables.get('meta').fire('updating', { value: 'x' }, 'displayName')
    expect(onChange.mock.calls.map(c => c[0])).toEqual(['accounts', 'goals', 'meta'])
  })

  it('watches every table that syncs', () => {
    const onChange = vi.fn()
    watchLocalChanges(onChange)
    for (const name of ['accounts', 'categories', 'debts', 'recurring', 'templates', 'goals', 'badges', 'challenges', 'trash', 'notes', 'note_folders']) {
      tables.get(name).fire('creating', 1, {})
    }
    expect(onChange).toHaveBeenCalledTimes(11)
  })

  it('does not count a row being marked sent, or given its stable id: that is what a push itself does', () => {
    const onChange = vi.fn()
    watchLocalChanges(onChange)
    tables.get('transactions').fire('updating', { synced: 1 }, 1)
    tables.get('notes').fire('updating', { pushed: true, synced: 1 }, 1)
    tables.get('accounts').fire('updating', { syncId: 'abc' }, 1)
    expect(onChange).not.toHaveBeenCalled()
    tables.get('accounts').fire('updating', { balance: 10, synced: 1 }, 1)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  /* A small table's push writes syncedAt on every row it sends. Counted, each
     push would start another and none would ever end. */
  it('does not count a row being marked with the stamp the cloud last had of it', () => {
    const onChange = vi.fn()
    watchLocalChanges(onChange)
    for (const name of ['accounts', 'categories', 'debts', 'recurring', 'templates', 'goals', 'badges', 'challenges', 'note_folders']) {
      tables.get(name).fire('updating', { syncedAt: '2026-10-08T04:00:00.000Z' }, 1)
    }
    expect(onChange).not.toHaveBeenCalled()
    // An edit that carries it along is still an edit.
    tables.get('accounts').fire('updating', { balance: 10, syncedAt: '2026-10-08T04:00:00.000Z' }, 1)
    expect(onChange).toHaveBeenCalledWith('accounts')
  })

  it('does not count what the cloud writes, so a pull cannot start a push', () => {
    const onChange = vi.fn()
    watchLocalChanges(onChange)
    beginRemoteWrites()
    tables.get('transactions').fire('creating', 1, {})
    tables.get('accounts').fire('updating', { balance: 5 }, 1)
    endRemoteWrites()
    expect(onChange).not.toHaveBeenCalled()
    tables.get('transactions').fire('creating', 2, {})
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('counts a preference, and nothing else in meta', () => {
    const onChange = vi.fn()
    watchLocalChanges(onChange)
    for (const key of SYNCED_META_KEYS) tables.get('meta').fire('creating', key, { key })
    tables.get('meta').fire('updating', { value: 1 }, 'displayName')
    expect(onChange).toHaveBeenCalledTimes(SYNCED_META_KEYS.size + 1)
    onChange.mockClear()
    for (const key of ['lastSync', 'pendingDeletes', 'syncWatermarks', 'whatsNewSeen']) {
      tables.get('meta').fire('creating', key, { key })
      tables.get('meta').fire('updating', { value: 1 }, key)
    }
    expect(onChange).not.toHaveBeenCalled()
  })

  it('has the preferences the cloud keeps', () => {
    for (const k of ['displayName', 'currency', 'skipConfirm', 'budgetRollover', 'dailyNudge', 'forecastSettings', 'forecastFloor', 'trendSettings']) {
      expect(SYNCED_META_KEYS.has(k), k).toBe(true)
    }
  })

  it('never returns anything from a hook, which Dexie would take for a key or a change', () => {
    watchLocalChanges(() => {})
    for (const t of tables.values()) {
      for (const [name, set] of Object.entries(t.hooks)) {
        for (const f of set) expect(f(1, { key: 'displayName' }, { key: 'x' }), name).toBeUndefined()
      }
    }
  })

  it('stops watching, leaving no hook behind', () => {
    const onChange = vi.fn()
    const stop = watchLocalChanges(onChange)
    stop()
    for (const t of tables.values()) for (const set of Object.values(t.hooks)) expect(set.size).toBe(0)
    tables.get('transactions').fire('creating', 1, {})
    expect(onChange).not.toHaveBeenCalled()
  })
})
