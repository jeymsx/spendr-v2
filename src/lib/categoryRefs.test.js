import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Renaming or deleting a category, and everything that names it.
 *
 * `db` is a small in-memory stand-in with Dexie's semantics for the handful of
 * calls these make: where().equals() and filter() collections that count and
 * modify, a table that updates and deletes by id, and a transaction that
 * records which tables it was opened over - because a write to a table the
 * transaction does not list is a runtime error in the real thing, and that is
 * the mistake this file exists to keep out.
 */

/** @param {string} name @param {Map<number, any>} rows */
function fakeTable(name, rows) {
  /** @param {(r: any) => boolean} pick */
  const collection = (pick) => ({
    count: async () => [...rows.values()].filter(pick).length,
    modify: async (/** @type {Record<string, any>} */ changes) => {
      for (const [id, r] of rows) if (pick(r)) rows.set(id, { ...r, ...changes })
    },
  })
  return {
    name,
    where: (/** @type {string} */ field) => ({ equals: (/** @type {any} */ v) => collection(r => r[field] === v) }),
    filter: (/** @type {(r: any) => boolean} */ fn) => collection(fn),
    update: async (/** @type {number} */ id, /** @type {any} */ mods) => { if (rows.has(id)) rows.set(id, { ...rows.get(id), ...mods }) },
    delete: async (/** @type {number} */ id) => { rows.delete(id) },
  }
}

const data = {
  categories: new Map(), transactions: new Map(), recurring: new Map(), templates: new Map(), debts: new Map(),
}
const tables = Object.fromEntries(Object.entries(data).map(([k, rows]) => [k, fakeTable(k, rows)]))
/** @type {string[][]} */
const opened = []
vi.mock('../db/db', () => ({
  default: {
    ...tables,
    transaction: async (/** @type {any} */ _mode, /** @type {any[]} */ list, /** @type {() => Promise<any>} */ fn) => {
      opened.push(list.map(t => t.name))
      return fn()
    },
  },
  UNSYNCED: 0,
}))

const { categoryUsage, usageWords, saveCategoryEdit, reassignAndDeleteCategory } = await import('./categoryRefs')

/** The row, by table and id. @param {keyof typeof data} t @param {number} id */
const row = (t, id) => data[t].get(id)

beforeEach(() => {
  for (const rows of Object.values(data)) rows.clear()
  opened.length = 0
  data.categories.set(1, { id: 1, name: 'Food', type: 'expense', budget: 8000 })
  data.categories.set(2, { id: 2, name: 'Groceries', type: 'expense', budget: 0 })
  data.transactions.set(1, { id: 1, category: 'Food', amount: 100, synced: 1, updatedAt: 'old' })
  data.transactions.set(2, { id: 2, category: 'Transport', amount: 50, synced: 1, updatedAt: 'old' })
  data.recurring.set(1, { id: 1, name: 'Meal plan', category: 'Food', updatedAt: 'old' })
  data.recurring.set(2, { id: 2, name: 'Bus pass', category: 'Transport', updatedAt: 'old' })
  data.templates.set(1, { id: 1, name: 'Lunch', category: 'Food', updatedAt: 'old' })
  data.debts.set(1, { id: 1, name: 'Gelo', sourceCategory: 'Food', updatedAt: 'old' })
  data.debts.set(2, { id: 2, name: 'Ate', sourceCategory: null, updatedAt: 'old' })
})

describe('saveCategoryEdit: a rename', () => {
  it('moves transactions, bills, templates and debts to the new name', async () => {
    await saveCategoryEdit(1, 'Food', { name: 'Eating out', budget: 8000 })
    expect(row('categories', 1)).toMatchObject({ name: 'Eating out', budget: 8000 })
    expect(row('transactions', 1).category).toBe('Eating out')
    expect(row('recurring', 1).category).toBe('Eating out')
    expect(row('templates', 1).category).toBe('Eating out')
    expect(row('debts', 1).sourceCategory).toBe('Eating out')
  })

  /** The bug: a bill kept posting under the old name, outside the new budget. */
  it('leaves nothing under the old name', async () => {
    await saveCategoryEdit(1, 'Food', { name: 'Eating out' })
    for (const t of /** @type {const} */ (['transactions', 'recurring', 'templates'])) {
      expect([...data[t].values()].some(r => r.category === 'Food'), t).toBe(false)
    }
    expect([...data.debts.values()].some(d => d.sourceCategory === 'Food')).toBe(false)
  })

  it('leaves other categories\' rows alone', async () => {
    await saveCategoryEdit(1, 'Food', { name: 'Eating out' })
    expect(row('transactions', 2).category).toBe('Transport')
    expect(row('recurring', 2).category).toBe('Transport')
    expect(row('debts', 2).sourceCategory).toBeNull()
  })

  /** What makes a changed transaction travel: unsent, and newer than the server's copy. */
  it('marks transactions unsent and stamps all four tables', async () => {
    await saveCategoryEdit(1, 'Food', { name: 'Eating out' })
    expect(row('transactions', 1).synced).toBe(0)
    const stamps = [row('transactions', 1), row('recurring', 1), row('templates', 1), row('debts', 1)].map(r => r.updatedAt)
    expect(stamps.every(s => s !== 'old')).toBe(true)
    expect(new Set(stamps).size).toBe(1)
    // A row that was not renamed is not touched.
    expect(row('transactions', 2)).toMatchObject({ synced: 1, updatedAt: 'old' })
  })

  it('runs in one transaction that lists every table it writes', async () => {
    await saveCategoryEdit(1, 'Food', { name: 'Eating out' })
    expect(opened).toHaveLength(1)
    expect(opened[0].sort()).toEqual(['categories', 'debts', 'recurring', 'templates', 'transactions'])
  })

  it('moves nothing when only the limit or colour changed', async () => {
    await saveCategoryEdit(1, 'Food', { name: 'Food', budget: 9000 })
    expect(row('categories', 1).budget).toBe(9000)
    expect(row('transactions', 1)).toMatchObject({ category: 'Food', synced: 1, updatedAt: 'old' })
    expect(row('recurring', 1).updatedAt).toBe('old')
  })
})

describe('reassignAndDeleteCategory', () => {
  it('moves transactions, bills, templates and debts to the replacement, then deletes', async () => {
    await reassignAndDeleteCategory({ id: 1, name: 'Food' }, 'Groceries')
    expect(data.categories.has(1)).toBe(false)
    expect(row('transactions', 1).category).toBe('Groceries')
    expect(row('recurring', 1).category).toBe('Groceries')
    expect(row('templates', 1).category).toBe('Groceries')
    expect(row('debts', 1).sourceCategory).toBe('Groceries')
  })

  /** It did not: only the rename marked them, so the reassignment never left this device. */
  it('marks the moved transactions unsent and stamped, as a rename does', async () => {
    await reassignAndDeleteCategory({ id: 1, name: 'Food' }, 'Groceries')
    expect(row('transactions', 1).synced).toBe(0)
    expect(row('transactions', 1).updatedAt).not.toBe('old')
    expect(row('transactions', 2)).toMatchObject({ synced: 1, updatedAt: 'old' })
  })

  it('runs in one transaction that lists every table it writes', async () => {
    await reassignAndDeleteCategory({ id: 1, name: 'Food' }, 'Groceries')
    expect(opened).toHaveLength(1)
    expect(opened[0].sort()).toEqual(['categories', 'debts', 'recurring', 'templates', 'transactions'])
  })
})

describe('categoryUsage', () => {
  it('counts every kind of row that names the category', async () => {
    expect(await categoryUsage('Food')).toEqual({ transactions: 1, bills: 1, templates: 1, debts: 1, total: 4 })
    expect(await categoryUsage('Transport')).toEqual({ transactions: 1, bills: 1, templates: 0, debts: 0, total: 2 })
  })

  /** A category with no transactions but a bill used to be deleted outright, orphaning the bill. */
  it('counts a category only a bill uses', async () => {
    data.transactions.delete(1)
    data.templates.delete(1)
    data.debts.delete(1)
    expect((await categoryUsage('Food')).total).toBe(1)
  })

  it('is zero for a category nothing uses', async () => {
    expect((await categoryUsage('Groceries')).total).toBe(0)
  })
})

describe('usageWords', () => {
  const none = { transactions: 0, bills: 0, templates: 0, debts: 0 }

  /** The sentence the sheet always said, when transactions are all there is. */
  it('says what it always said for transactions alone', () => {
    expect(usageWords({ ...none, transactions: 12 })).toBe('12 transactions use this category')
    expect(usageWords({ ...none, transactions: 1 })).toBe('1 transaction uses this category')
  })

  it('names the other kinds that are there', () => {
    expect(usageWords({ ...none, transactions: 3, bills: 1 })).toBe('3 transactions and 1 bill use this category')
    expect(usageWords({ transactions: 3, bills: 2, templates: 1, debts: 4 }))
      .toBe('3 transactions, 2 bills, 1 template and 4 debts use this category')
  })

  it('is singular for a single thing of any kind', () => {
    expect(usageWords({ ...none, bills: 1 })).toBe('1 bill uses this category')
  })
})
