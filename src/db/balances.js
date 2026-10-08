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
