import db, { UNSYNCED } from '../db/db'

/**
 * Everything that points at a category, by name.
 *
 * The schema keys on names, not ids, and four tables hold one:
 *
 *   transactions.category      what was spent, and where
 *   recurring.category         the bill that posts itself next month
 *   templates.category         the one-tap entry on Home
 *   debts.sourceCategory       where a repayment lands when it settles
 *
 * Renaming or deleting a category has to move all four, or the ones it leaves
 * behind keep the old name. A bill is the one that hurts: it goes on posting
 * under a name no category has any more, outside the renamed category's budget,
 * and the month's total quietly stops including it. Only transactions were
 * moved, and the other three were found by a bill that kept landing under
 * "Food" after Food became "Groceries".
 *
 * All of it happens in one transaction with the category row itself, so a
 * failure part-way leaves the old name everywhere rather than a half-moved
 * ledger.
 */

/** The tables that hold a category by name, for a transaction to list. */
export const categoryRefTables = () => [db.transactions, db.recurring, db.templates, db.debts]

/**
 * How many rows of each kind point at a category.
 *
 * @param {string} name
 * @returns {Promise<{transactions: number, bills: number, templates: number, debts: number, total: number}>}
 */
export async function categoryUsage(name) {
  const [transactions, bills, templates, debts] = await Promise.all([
    db.transactions.where('category').equals(name).count(),
    db.recurring.where('category').equals(name).count(),
    db.templates.where('category').equals(name).count(),
    // Not indexed, so a filter: a ledger has tens of debts, not thousands.
    db.debts.filter(d => d.sourceCategory === name).count(),
  ])
  return { transactions, bills, templates, debts, total: transactions + bills + templates + debts }
}

/**
 * What uses a category, in a sentence: "12 transactions and 2 bills use this
 * category". Only the kinds that are there are named.
 *
 * @param {{transactions: number, bills: number, templates: number, debts: number}} usage
 */
export function usageWords(usage) {
  /** @param {number} n @param {string} one @param {string} many */
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`
  const parts = [
    usage.transactions && count(usage.transactions, 'transaction', 'transactions'),
    usage.bills && count(usage.bills, 'bill', 'bills'),
    usage.templates && count(usage.templates, 'template', 'templates'),
    usage.debts && count(usage.debts, 'debt', 'debts'),
  ].filter(Boolean)
  const total = usage.transactions + usage.bills + usage.templates + usage.debts
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? 'Nothing')
  return `${list} ${total === 1 ? 'uses' : 'use'} this category`
}

/**
 * Point everything that names `from` at `to` instead. Run it INSIDE a
 * transaction that includes categoryRefTables().
 *
 * Transactions are marked for the next push (`synced`) and stamped, which is
 * what makes the change travel; the other three tables are pushed whole and
 * only need the stamp (db/db.js stamps it too, and an explicit one here is the
 * same value, so the four agree to the millisecond).
 *
 * @param {string} from
 * @param {string} to
 * @param {string} [at]  the moment of the change, as an ISO string
 */
export async function retargetCategory(from, to, at = new Date().toISOString()) {
  await db.transactions.where('category').equals(from).modify({ category: to, synced: UNSYNCED, updatedAt: at })
  await db.recurring.where('category').equals(from).modify({ category: to, updatedAt: at })
  await db.templates.where('category').equals(from).modify({ category: to, updatedAt: at })
  await db.debts.filter(d => d.sourceCategory === from).modify({ sourceCategory: to, updatedAt: at })
}

/**
 * Save an edited category, and carry a rename to everything that names it.
 *
 * @param {number} id
 * @param {string} oldName  the name it had when the form opened
 * @param {Record<string, any>} data  the new fields, name included
 */
export async function saveCategoryEdit(id, oldName, data) {
  const at = new Date().toISOString()
  await db.transaction('rw', [db.categories, ...categoryRefTables()], async () => {
    await db.categories.update(id, data)
    if (oldName !== data.name) await retargetCategory(oldName, data.name, at)
  })
}

/**
 * Delete a category after moving everything that used it to another.
 *
 * @param {{id?: number, name: string}} category  the one going
 * @param {string} targetName  the one that takes over its transactions, bills, templates and debts
 */
export async function reassignAndDeleteCategory(category, targetName) {
  await db.transaction('rw', [db.categories, ...categoryRefTables()], async () => {
    await retargetCategory(category.name, targetName)
    await db.categories.delete(/** @type {number} */ (category.id))
  })
}
