import db from './db'

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
 * @param {string} accountName
 * @param {number} delta
 */
async function adjustBalance(accountName, delta) {
  if (!accountName || !delta) return
  const acct = await db.accounts.where('name').equals(accountName).first()
  if (!acct) return
  const newBal = (acct.balance ?? 0) + delta
  const now = new Date().toISOString()
  await db.accounts.update(acct.id, { balance: newBal, updatedAt: now })
  await db.balances.put({ account: accountName, balance: newBal })
}

/** Undo the balance effects of a saved transaction.
 *
 * @param {Transaction} tx
 */
export async function reverseBalanceEffect(tx) {
  const a = tx.amount ?? 0
  if (tx.type === 'expense')  await adjustBalance(tx.account, +a)
  if (tx.type === 'inflow')   await adjustBalance(tx.account, -a)
  if (tx.type === 'transfer') {
    await adjustBalance(tx.fromAccount, +a)
    await adjustBalance(tx.toAccount, -a)
  }
}

/** Apply the balance effects of a (new or edited) transaction.
 *
 * @param {Transaction} tx
 */
export async function applyBalanceEffect(tx) {
  const a = tx.amount ?? 0
  if (tx.type === 'expense')  await adjustBalance(tx.account, -a)
  if (tx.type === 'inflow')   await adjustBalance(tx.account, +a)
  if (tx.type === 'transfer') {
    /* No credit-card special case, and removing it is the fix.
       There was one: `toCredit ? -a : +a`, on the reasoning that a payment
       "reduces the amount owed". It had the sign backwards. The convention is
       set one line up - an expense on a card does `-a`, so a charge drives
       the balance DOWN and a card's debt is stored negative - which means a
       payment moves it back up toward zero, which is `+a`, which is exactly
       what every other destination account does. A transfer adds to where it
       lands; a card is not an exception to that.
       Getting it backwards meant every card payment ever made through the
       transfer form deepened the debt it was paying off. It hid because
       nothing user-facing reads this figure for a credit account - the card
       page and the accounts list both use getCreditStatus().currentBalance,
       derived from the transactions and always right - so the stored number
       drifted quietly underneath. */
    await adjustBalance(tx.fromAccount, -a)
    await adjustBalance(tx.toAccount, +a)
  }
}
