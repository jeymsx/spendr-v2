import db from './db'
import { roundMoney } from '../lib/currency'
import { receivedAmount } from '../lib/transferLegs'

/**
 * Moving an account's stored balance, and undoing it.
 *
 * ── Why these left txHelpers ──
 *
 * The sync layer has to reverse a balance too: when a transaction deleted on
 * another device arrives as a tombstone, this device has to take the money
 * back off the account or it drifts by the amount of the row. But txHelpers
 * imports the sync layer - deleteDebtRemote - so importing the other way
 * round made a cycle, and a cycle between two modules that both run at import
 * time is how a half-initialised binding becomes a TDZ crash on the first
 * paint.
 *
 * A leaf that imports nothing but the database has no such problem. txHelpers
 * re-exports both, so the ten files that already import them from there are
 * untouched.
 */

/**
 * @param {string|null|undefined} accountName
 * @param {number} delta
 */
async function adjustBalance(accountName, delta) {
  if (!accountName || !delta) return
  const acct = await db.accounts.where('name').equals(accountName).first()
  if (!acct) return
  /* Rounded to the account's own currency, which stops float noise from
     accumulating across every transaction a balance is ever built from. Exact
     rather than lossy, because every delta is already a whole number of
     cents - see roundMoney. A yen account rounds to the yen. */
  const newBal = roundMoney((acct.balance ?? 0) + delta, acct.currency)
  const now = new Date().toISOString()
  await db.accounts.update(acct.id, { balance: newBal, updatedAt: now })
  await db.balances.put({ account: accountName, balance: newBal })
}

/**
 * One account's share of a transaction: how far its stored balance moves.
 *
 * @typedef {{account: string|null|undefined, delta: number}} BalanceMove
 */

/**
 * What a transaction does to account balances, as the moves it makes - the ONE
 * place that says so.
 *
 * Applying a transaction, undoing it, and posting a whole file of them at
 * once all read this, so they cannot come to disagree about which way money
 * moves. (The CSV import once replayed its own copy of this arithmetic, with
 * the credit-card sign flipped that the comment below documents as a fixed
 * bug.)
 *
 * @param {Transaction} tx
 * @returns {BalanceMove[]}
 */
export function balanceMoves(tx) {
  const a = tx.amount ?? 0
  if (tx.type === 'expense') return [{ account: tx.account, delta: -a }]
  if (tx.type === 'inflow') return [{ account: tx.account, delta: +a }]
  if (tx.type === 'transfer') {
    /* No credit-card special case, and removing it is the fix.
       There was one: `toCredit ? -a : +a`, on the reasoning that a payment
       "reduces the amount owed". It had the sign backwards. The convention is
       set by the expense above - an expense on a card does `-a`, so a charge
       drives the balance DOWN and a card's debt is stored negative - which
       means a payment moves it back up toward zero, which is `+a`, which is
       exactly what every other destination account does. A transfer adds to
       where it lands; a card is not an exception to that.
       Getting it backwards meant every card payment ever made through the
       transfer form deepened the debt it was paying off. It hid because
       nothing user-facing reads this figure for a credit account - the card
       page and the accounts list both use getCreditStatus().currentBalance,
       derived from the transactions and always right - so the stored number
       drifted quietly underneath. */
    return [
      { account: tx.fromAccount, delta: -a },
      /* What ARRIVED, which is `a` unless the two accounts hold different
         currencies - see lib/transferLegs.js. A row with no received leg is
         read as `a`, which is what was applied to it when it was written, so
         reversing an old transfer still takes off exactly what it put on. */
      { account: tx.toAccount, delta: +receivedAmount(tx) },
    ]
  }
  return []
}

/** Undo the balance effects of a saved transaction.
 *
 * @param {Transaction} tx
 */
export async function reverseBalanceEffect(tx) {
  for (const { account, delta } of balanceMoves(tx)) await adjustBalance(account, -delta)
}

/** Apply the balance effects of a (new or edited) transaction.
 *
 * @param {Transaction} tx
 */
export async function applyBalanceEffect(tx) {
  for (const { account, delta } of balanceMoves(tx)) await adjustBalance(account, delta)
}

/**
 * Apply the balance effects of many transactions - an import - with one write
 * per account instead of three per row.
 *
 * The same moves applyBalanceEffect makes, summed per account first. The sum
 * is rounded once, in adjustBalance, to the account's own currency, and every
 * delta is a whole number of cents, so it lands on exactly the figure applying
 * the rows one by one would. Accounts that are not found are skipped, as
 * there.
 *
 * @param {Transaction[]} txs
 */
export async function applyBalanceEffects(txs) {
  /** @type {Map<string, number>} */
  const totals = new Map()
  for (const tx of txs) {
    for (const { account, delta } of balanceMoves(tx)) {
      if (account) totals.set(account, (totals.get(account) ?? 0) + delta)
    }
  }
  for (const [account, delta] of totals) await adjustBalance(account, delta)
}

/**
 * Every account's total move across a ledger, by name.
 *
 * @param {Iterable<Transaction>} txs
 * @returns {Map<string, number>}
 */
export function ledgerMoves(txs) {
  /** @type {Map<string, number>} */
  const totals = new Map()
  for (const tx of txs) {
    for (const { account, delta } of balanceMoves(tx)) {
      if (account && delta) totals.set(account, (totals.get(account) ?? 0) + delta)
    }
  }
  return totals
}

/**
 * What one account should hold, and what it should have opened with, given
 * the ledger's total move on it.
 *
 * `opening` is the part of a balance no transaction explains - what the
 * account held when it was added. It is worked out once, from the balance as
 * it stands, and from then on the balance is worked out from it: an account
 * with no opening yet keeps its balance and gets one; an account with one gets
 * the balance it and the ledger add up to.
 *
 * @param {{balance?: number, opening?: number|null, currency?: string}} account
 * @param {number} moved  ledgerMoves for it; 0 for none
 * @returns {{opening: number, balance: number, openingIsNew: boolean}}
 */
export function settleAccount(account, moved = 0) {
  const known = typeof account.opening === 'number' && Number.isFinite(account.opening)
  if (!known) {
    const balance = roundMoney(Number(account.balance) || 0, account.currency)
    return { opening: roundMoney(balance - moved, account.currency), balance, openingIsNew: true }
  }
  return {
    opening: /** @type {number} */ (account.opening),
    balance: roundMoney(/** @type {number} */ (account.opening) + moved, account.currency),
    openingIsNew: false,
  }
}

/**
 * Every account's balance, worked out again from its opening and the ledger.
 *
 * ── Why a balance is not taken from another device ──
 *
 * An account's balance used to be a running total, moved by each transaction
 * written here and copied whole between devices on the account's row, newest
 * row winning. Transactions travel on their own, on another road. Once
 * changes started arriving live (2026-10-08), the two roads stopped arriving
 * together, and a total that is copied cannot be merged:
 *
 *   an expense added on each device in the same moment: each total missed the
 *     other's, and whichever row went last won - one expense gone from the
 *     balance, while both stayed in the list;
 *   a transaction added and deleted within a second: the deletion was taken
 *     off a total that already had it taken off - the balance went UP by it;
 *   a deletion undone: the restored row arrived, the total that knew of it
 *     lost to one that did not.
 *
 * Each left the balance higher than the ledger, by exactly a transaction, and
 * that is how it was noticed, the day after. So the balance is now the one
 * thing that cannot disagree with the list beside it: what the account
 * opened with, plus every row in it. Whatever order rows arrive in, once they
 * have arrived the balance is right, on every device.
 *
 * Run after anything the cloud writes into the ledger or the accounts - the
 * sync calls it. Nothing written here is news to send, so every write keeps
 * the row's stamp and nothing is pushed back: a balance is worked out the same
 * way on every device, and an opening worked out here for an account that had
 * none is the figure it already had. That one is sent once the cloud has a
 * place for it (lib/sync.js sendOpeningsTheCloudLacks).
 *
 * @returns {Promise<number>} how many accounts it changed
 */
export async function reconcileBalances() {
  let changed = 0
  await db.transaction('rw', [db.accounts, db.balances, db.transactions], async () => {
    const accounts = await db.accounts.toArray()
    if (!accounts.length) return
    const moved = ledgerMoves(await db.transactions.toArray())
    for (const a of accounts) {
      const next = settleAccount(a, moved.get(a.name) ?? 0)
      const keep = { updatedAt: a.updatedAt }
      if (next.openingIsNew) {
        await db.accounts.update(/** @type {number} */ (a.id), { opening: next.opening, ...keep })
        changed++
      } else if (next.balance !== a.balance) {
        await db.accounts.update(/** @type {number} */ (a.id), { balance: next.balance, ...keep })
        await db.balances.put({ account: a.name, balance: next.balance })
        changed++
      }
    }
  })
  return changed
}

/**
 * The ledger's total move on one account, from the rows that name it.
 *
 * @param {string} accountName
 */
async function movedOn(accountName) {
  /** @type {Map<any, Transaction>} */
  const rows = new Map()
  for (const field of ['account', 'fromAccount', 'toAccount']) {
    for (const t of await db.transactions.where(field).equals(accountName).toArray()) rows.set(t.id, t)
  }
  return ledgerMoves(rows.values()).get(accountName) ?? 0
}

/**
 * What an account being made with `balance` in it opens with: all of it, less
 * whatever the ledger already moves on its name. That is nothing, unless an
 * account of the same name was deleted - its transactions stay - and without
 * this they would be counted into the new one's balance.
 *
 * Given at the moment it is made, so the account's first push carries it and
 * no other device has to work one out (see reconcileBalances). Call it inside
 * the transaction that adds the account, with db.transactions in it.
 *
 * @param {string} accountName
 * @param {number} balance
 * @param {string} [currency]
 */
export async function openingFor(accountName, balance, currency) {
  return roundMoney((Number(balance) || 0) - await movedOn(accountName), currency)
}

/**
 * Set what an account holds now, without a transaction to explain it: the
 * opening moves so the two still add up. For setup, where the balance you
 * type IS where the account starts.
 *
 * @param {string} accountName
 * @param {number} balance
 */
export async function setOpeningBalance(accountName, balance) {
  await db.transaction('rw', [db.accounts, db.balances, db.transactions], async () => {
    const acct = await db.accounts.where('name').equals(accountName).first()
    if (!acct) return
    const value = roundMoney(Number(balance) || 0, acct.currency)
    await db.accounts.update(/** @type {number} */ (acct.id), { balance: value, opening: await openingFor(accountName, value, acct.currency) })
    await db.balances.put({ account: accountName, balance: value })
  })
}
