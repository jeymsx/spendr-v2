import db, { UNSYNCED } from './db'
import { advanceNextDate } from '../utils/recurring'

/** Thrown when a spend would take a non-credit account below zero. */
export class OverdrawError extends Error {
  constructor(account, balance, amount) {
    super(`Insufficient balance in ${account}`)
    this.name    = 'OverdrawError'
    this.account = account
    this.balance = balance
    this.amount  = amount
  }
}

/**
 * Returns the account row when spending `amount` from it would overdraw it,
 * otherwise null. Credit accounts are exempt — they're bounded by their limit,
 * which getCreditStatus tracks, not by a stored balance.
 */
export async function checkOverdraw(accountName, amount) {
  if (!accountName || !(amount > 0)) return null
  const acct = await db.accounts.where('name').equals(accountName).first()
  if (!acct || acct.type === 'credit') return null
  if (amount <= (acct.balance ?? 0)) return null
  return acct
}

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
export async function postRecurringCharge(rec, { allowOverdraw = false } = {}) {
  // Pay Now is a single tap with no confirm step, so this is the only place an
  // overdraw can be caught. Callers surface OverdrawError as a sheet and retry
  // with allowOverdraw when the user confirms.
  if (!allowOverdraw) {
    const over = await checkOverdraw(rec.account, rec.amount)
    if (over) throw new OverdrawError(over.name, over.balance ?? 0, rec.amount)
  }

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

/**
 * Undo a transaction deletion, reversing everything the delete did: re-insert
 * the row, re-apply its balance effect, roll the recurring bill it came from
 * forward again, and drop the sync tombstone.
 *
 * The txId is preserved deliberately. Supabase upserts transactions on
 * (user_id, tx_id), so pushing the restored row recreates the original remote
 * row rather than a duplicate — and that holds whether or not a sync has
 * already deleted it. Nothing here needs the network.
 *
 * Safe to call more than once: if the row is already back it returns false
 * without touching anything, so a double-tapped Undo cannot double-apply the
 * balance.
 *
 * @returns true if this call restored it, false if it was already present.
 */
export async function restoreDeletedTx(tx) {
  if (!tx) return false
  let restored = false

  await db.transaction('rw',
    [db.transactions, db.accounts, db.balances, db.recurring, db.meta],
    async () => {
      // Idempotence guard — by local id and by txId, since either could
      // identify an already-restored row.
      if (tx.id != null && await db.transactions.get(tx.id)) return
      if (tx.txId && await db.transactions.where('txId').equals(tx.txId).first()) return

      // Keeps the original id and txId; marked unsynced so the next push
      // recreates the remote row.
      await db.transactions.add({
        ...tx,
        synced:    UNSYNCED,
        updatedAt: new Date().toISOString(),
      })
      await applyBalanceEffect(tx)

      // The delete rolled this bill's nextDate back to the posted date; roll it
      // forward again — but only if nothing else has moved it since, so a bill
      // re-posted in the meantime isn't clobbered.
      if (tx.recurringId && tx.recurringPrevDate) {
        const rec = await db.recurring.get(tx.recurringId)
        if (rec && rec.nextDate === tx.recurringPrevDate) {
          await db.recurring.update(tx.recurringId, {
            nextDate: advanceNextDate(tx.recurringPrevDate, rec.frequency),
          })
        }
      }

      // Critical: leaving the tombstone in place would make the next sync
      // delete the row we just restored.
      if (tx.txId) {
        const meta = await db.meta.get('deletedTxIds')
        const list = meta?.value ?? []
        if (list.includes(tx.txId)) {
          await db.meta.put({
            key:   'deletedTxIds',
            value: list.filter(id => id !== tx.txId),
          })
        }
      }

      restored = true
    })

  return restored
}

/**
 * Delete several transactions as one unit — used for installment plans, where
 * removing a single month would leave a broken schedule behind.
 *
 * Everything happens in one Dexie transaction, so a failure part-way cannot
 * leave some months deleted and others not. Tombstones are merged in the same
 * write, so the next sync removes exactly this set remotely.
 */
export async function deleteTxGroup(txs) {
  const list = (txs ?? []).filter(Boolean)
  if (!list.length) return 0

  await db.transaction('rw',
    [db.transactions, db.accounts, db.balances, db.recurring, db.meta],
    async () => {
      const meta = await db.meta.get('deletedTxIds')
      const tombstones = new Set(meta?.value ?? [])

      for (const tx of list) {
        if (tx.txId) tombstones.add(tx.txId)
        await reverseBalanceEffect(tx)
        await db.transactions.delete(tx.id)
        if (tx.recurringId && tx.recurringPrevDate) {
          await db.recurring.update(tx.recurringId, { nextDate: tx.recurringPrevDate })
        }
      }

      await db.meta.put({ key: 'deletedTxIds', value: [...tombstones] })
    })

  return list.length
}

/**
 * Undo a group deletion. Restores whatever is still missing and reports the
 * count, so a double-tapped Undo is harmless — rows already back are skipped
 * by restoreDeletedTx's own guard.
 */
export async function restoreDeletedTxs(txs) {
  let restored = 0
  for (const tx of (txs ?? [])) {
    if (await restoreDeletedTx(tx)) restored++
  }
  return restored
}
