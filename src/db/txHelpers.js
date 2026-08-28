import db, { UNSYNCED } from './db'
import { advanceNextDate } from '../utils/recurring'

async function adjustBalance(accountName, delta) {
  if (!accountName || !delta) return
  const acct = await db.accounts.where('name').equals(accountName).first()
  if (!acct) return
  const newBal = (acct.balance ?? 0) + delta
  const now = new Date().toISOString()
  await db.accounts.update(acct.id, { balance: newBal, updatedAt: now })
  await db.balances.put({ account: accountName, balance: newBal })
}

export async function syncParentBalance(parentName) {
  const children = await db.accounts.where('parentName').equals(parentName).toArray()
  const total = children.reduce((s, a) => s + (a.balance ?? 0), 0)
  const parent = await db.accounts.where('name').equals(parentName).first()
  if (parent) {
    await db.accounts.update(parent.id, { balance: total, updatedAt: new Date().toISOString() })
  }
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

/**
 * Post one occurrence of a recurring bill: write the charge, apply the balance
 * effect, and advance nextDate — all inside one transaction, so a failure can't
 * leave the bill advanced without a matching charge.
 *
 * Both the Dashboard widget and the Recurring page call this. They previously
 * had their own copies and had drifted: the Dashboard's transaction scope left
 * out db.balances, which applyBalanceEffect writes to, so Dexie rejected every
 * post from the home screen and rolled the whole thing back. Its copy also
 * stored a date-only string instead of a full ISO timestamp, and omitted the
 * `payment` field.
 *
 * @returns the new nextDate
 */
export async function postRecurringCharge(rec) {
  const nowISO      = new Date().toISOString()
  const newNextDate = advanceNextDate(rec.nextDate, rec.frequency)

  await db.transaction('rw', [db.transactions, db.accounts, db.balances, db.recurring], async () => {
    await db.transactions.add({
      txId:              crypto.randomUUID(),
      type:              'expense',
      amount:            rec.amount,
      description:       rec.name,
      category:          rec.category,
      payment:           rec.account,
      account:           rec.account,
      date:              nowISO,
      synced:            UNSYNCED,
      updatedAt:         nowISO,
      recurringId:       rec.id,
      recurringPrevDate: rec.nextDate,
    })
    await applyBalanceEffect({ type: 'expense', amount: rec.amount, account: rec.account })
    await db.recurring.update(rec.id, { nextDate: newNextDate })
  })

  return newNextDate
}
