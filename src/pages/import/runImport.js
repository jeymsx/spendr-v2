import db, { UNSYNCED } from '../../db/db'
import { roundMoney } from '../../lib/currency'
import { applyBalanceEffects } from '../../db/balances'
import { PRIMED_META } from '../../lib/achievements'

/**
 * Writing an import: the rows, the accounts and categories they need, and what
 * the rows do to the balances - all or nothing.
 *
 * ── Balances: each new row moves them once, and nothing else does ──
 *
 * The first version rebuilt EVERY account's balance from scratch, replaying
 * every transaction in the database from the opening balances typed into step
 * 3. That step only listed the accounts the file named, pre-filled with each
 * one's CURRENT balance - which already contains its existing transactions -
 * so the replay counted them twice. And an account the file did not name
 * started again from zero, losing the starting balance it was created with
 * (accounts are created with a balance and no transaction to explain it).
 * With a BPI account at 45,000 and a file of two September rows it came out
 * at 62,000, GCash fell to -1,000 and a paid-off card to -6,000.
 *
 * So the balances are no longer rebuilt. A row that is imported does what a
 * row saved from the form does - moves the accounts it names, by the same
 * arithmetic (db/balances.js balanceMoves), once - and nothing already in the
 * wallet is touched. The opening balance is asked for only where there is
 * nothing to build on: an account the import creates.
 */

/** The colour a created account or category gets, as it always has. */
const NEW_COLOR = '#6b7280'

/** The fields a row can carry beyond the core columns - see csv.js. */
const CARRIED = [
  'refundOf', 'splitId', 'installmentId', 'toAmount', 'toCurrency',
  'currency', 'baseAmount', 'baseCurrency', 'adjust',
]

/**
 * Which rows are new, and what they need that the wallet does not have yet.
 *
 * A row is skipped when its txId is already stored - or already seen earlier
 * in the same file, which would otherwise insert one transaction twice. A row
 * with no txId cannot be told from another, so it is always new.
 *
 * Accounts and categories are asked for by the rows that will be written
 * only: a skipped row naming an account that is gone must not bring it back.
 *
 * @param {Array<Record<string, any>>} rows
 * @param {{txIds: Iterable<string>, accountNames: Set<string>, categoryNames: Set<string>}} existing
 */
export function planImport(rows, existing) {
  const seen = new Set(existing.txIds)
  /** @type {Array<Record<string, any>>} */
  const toInsert = []
  for (const r of rows) {
    if (r.txId) {
      if (seen.has(r.txId)) continue
      seen.add(r.txId)
    }
    toInsert.push(r)
  }

  const newAccounts = new Set()
  const newCategories = new Set()
  for (const r of toInsert) {
    for (const name of [r.account, r.fromAccount, r.toAccount]) {
      if (name && !existing.accountNames.has(name)) newAccounts.add(name)
    }
    if (r.category && !existing.categoryNames.has(r.category)) newCategories.add(r.category)
  }

  return {
    toInsert,
    skipped: rows.length - toInsert.length,
    newAccounts: [...newAccounts],
    newCategories: [...newCategories],
  }
}

/**
 * A parsed row as it is stored.
 *
 * A row with no txId is given one. Sync pushes only rows that have a stable
 * id and then marks everything it looked at as synced, so an imported row
 * without one stayed on this device for good while looking as if it had
 * gone up.
 *
 * @param {Record<string, any>} r
 * @param {string} now
 */
export function recordOf(r, now) {
  /** @type {Record<string, any>} */
  const record = {
    txId:        r.txId || crypto.randomUUID(),
    type:        r.type,
    date:        r.date,
    description: r.description,
    category:    r.category,
    payment:     r.payment ?? null,   // present in Spendr's own export, null otherwise
    account:     r.account ?? null,
    fromAccount: r.fromAccount ?? null,
    toAccount:   r.toAccount ?? null,
    amount:      r.amount,
  }
  for (const key of CARRIED) if (r[key] != null) record[key] = r[key]
  record.synced = UNSYNCED
  record.updatedAt = now
  return record
}

/**
 * Write the import. One database transaction, so a failure leaves the wallet
 * exactly as it was rather than with half the rows and none of the balance.
 *
 * @param {{
 *   rows: Array<Record<string, any>>,
 *   openingBalances?: Record<string, number|string>,
 *   creditLimits?: Record<string, number|string>,
 * }} args
 *   openingBalances  what each account the import CREATES held before the
 *                    file's first row; absent means nothing
 *   creditLimits     a limit to set on a credit account already in the wallet
 * @returns {Promise<{imported: number, skipped: number, createdAccounts: string[], createdCategories: string[]}>}
 */
export async function runImport({ rows, openingBalances = {}, creditLimits = {} }) {
  const now = new Date().toISOString()

  return db.transaction('rw', [db.transactions, db.accounts, db.categories, db.balances, db.meta], async () => {
    const stored = await db.transactions.toArray()
    const accounts = await db.accounts.toArray()
    const categories = await db.categories.toArray()

    const plan = planImport(rows, {
      txIds: stored.map(t => t.txId).filter(Boolean),
      accountNames: new Set(accounts.map(a => a.name)),
      categoryNames: new Set(categories.map(c => c.name)),
    })

    // Accounts the file names that the wallet lacks. Each starts at the
    // opening balance the person gave it; the rows then move it from there.
    for (const name of plan.newAccounts) {
      const opening = roundMoney(parseFloat(String(openingBalances[name] ?? 0)) || 0, 'PHP')
      await db.accounts.add({ name, type: 'cash', balance: opening, currency: 'PHP', color: NEW_COLOR })
      await db.balances.put({ account: name, balance: opening })
    }

    for (const name of plan.newCategories) {
      await db.categories.add({ name, type: 'expense', icon: '📦', color: NEW_COLOR, budget: 0 })
    }

    if (plan.toInsert.length > 0) {
      const records = plan.toInsert.map(r => recordOf(r, now))
      await db.transactions.bulkAdd(/** @type {any[]} */ (records))
      /* History arriving, so the next look at achievements writes what it
         earns without a celebration for each - see PRIMED_META. In this same
         transaction, so no look can see the rows without the flag. */
      await db.meta.delete(PRIMED_META)
      // The balances, last: the accounts they land on exist by now.
      await applyBalanceEffects(/** @type {any[]} */ (records))
    }

    // A credit limit is set on a card that is already there; an account this
    // import made is a cash account and has none.
    for (const [name, limit] of Object.entries(creditLimits)) {
      const value = parseFloat(String(limit)) || 0
      if (!value) continue
      const card = accounts.find(a => a.name === name && a.type === 'credit')
      if (card) await db.accounts.update(card.id, { creditLimit: value })
    }

    return {
      imported: plan.toInsert.length,
      skipped: plan.skipped,
      createdAccounts: plan.newAccounts,
      createdCategories: plan.newCategories,
    }
  })
}
