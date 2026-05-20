import db from './db'

async function adjustBalance(accountName, delta) {
  if (!accountName || !delta) return
  const acct = await db.accounts.where('name').equals(accountName).first()
  if (!acct) return
  const newBal = (acct.balance ?? 0) + delta
  await db.accounts.update(acct.id, { balance: newBal })
  await db.balances.put({ account: accountName, balance: newBal })
}

/** Returns true if the named account is a credit card. */
async function isCredit(accountName) {
  if (!accountName) return false
  const acct = await db.accounts.where('name').equals(accountName).first()
  return acct?.type === 'credit'
}

/** Undo the balance effects of a saved transaction. */
export async function reverseBalanceEffect(tx) {
  const a = tx.amount ?? 0
  if (tx.type === 'expense')  await adjustBalance(tx.account, +a)
  if (tx.type === 'inflow')   await adjustBalance(tx.account, -a)
  if (tx.type === 'transfer') {
    await adjustBalance(tx.fromAccount, +a)
    // Credit toAccount: payment reduced balance, so reversal adds it back
    const toCredit = await isCredit(tx.toAccount)
    await adjustBalance(tx.toAccount, toCredit ? +a : -a)
  }
}

/** Apply the balance effects of a (new or edited) transaction. */
export async function applyBalanceEffect(tx) {
  const a = tx.amount ?? 0
  if (tx.type === 'expense')  await adjustBalance(tx.account, -a)
  if (tx.type === 'inflow')   await adjustBalance(tx.account, +a)
  if (tx.type === 'transfer') {
    await adjustBalance(tx.fromAccount, -a)
    // Credit toAccount: transfer is a payment — it reduces the amount owed
    const toCredit = await isCredit(tx.toAccount)
    await adjustBalance(tx.toAccount, toCredit ? -a : +a)
  }
}
