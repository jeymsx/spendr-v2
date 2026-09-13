import db, { UNSYNCED } from './db'
import { advanceNextDate } from '../utils/recurring'

/** Thrown when a spend would take a non-credit account below zero. */
export class OverdrawError extends Error {
  /** @param {string} account @param {number} balance @param {number} amount */
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
 *
 * @param {string} accountName
 * @param {number} amount
 */
export async function checkOverdraw(accountName, amount) {
  if (!accountName || !(amount > 0)) return null
  const acct = await db.accounts.where('name').equals(accountName).first()
  if (!acct || acct.type === 'credit') return null
  if (amount <= (acct.balance ?? 0)) return null
  return acct
}

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
 *
 * @param {Recurring} rec
 * @param {{allowOverdraw?: boolean}} [opts]
 */
export async function postRecurringCharge(rec, { allowOverdraw = false } = {}) {
  /* The overdraw check lives here rather than in the caller because it has to
     happen inside the same decision as the write. There IS a review sheet in
     front of this now, but it shows what the charge is, not whether the
     account can take it - and a balance can change between the two. Callers
     surface OverdrawError as a sheet and retry with allowOverdraw. */
  if (!allowOverdraw) {
    const over = await checkOverdraw(rec.account, rec.amount)
    if (over) throw new OverdrawError(over.name, over.balance ?? 0, rec.amount)
  }

  const nowISO      = new Date().toISOString()
  const newNextDate = advanceNextDate(rec.nextDate, rec.frequency)

  /* Returned to the caller so it can offer an Undo. deleteTxGroup already
     reverses everything this does - the balance, the row, and the bill's
     nextDate via recurringPrevDate below - so undoing a post needs no new
     code, only the row it wrote. */
  let addedId = null

  await db.transaction('rw', [db.transactions, db.accounts, db.balances, db.recurring], async () => {
    addedId = await db.transactions.add({
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
    await applyBalanceEffect(/** @type {Transaction} */ (
      { type: 'expense', amount: rec.amount, account: rec.account, date: nowISO }))
    await db.recurring.update(rec.id, { nextDate: newNextDate })
  })

  return { nextDate: newNextDate, tx: addedId ? await db.transactions.get(addedId) : null }
}

/**
 * Pay a credit card.
 *
 * ── A transfer, not an expense, and this is the one place it matters most ──
 *
 * Every peso on a card statement was already booked as an expense when you
 * swiped. Paying the statement moves money between two accounts you own; it
 * buys nothing. Writing it as an expense would count the month's spending a
 * second time and charge it to whatever category the payment carried, which
 * is the whole reason lib/creditBills.js refuses to model a statement as a
 * recurring bill. So: one transfer row, from the funding account to the card,
 * with no category on it.
 *
 * Nothing else is needed for the maths to work. getCreditStatus already reads
 * every transfer INTO the card as a payment and nets it against what has been
 * billed, so a row written here lands in the statement, the carried balance
 * and the available credit at once.
 *
 * The overdraw check is here rather than in the caller for the same reason it
 * is inside postRecurringCharge: it has to happen in the same decision as the
 * write, because a balance can change between a review sheet and a commit.
 * Callers catch OverdrawError and retry with allowOverdraw.
 *
 * @param {{cardName: string, fromName: string, amount: number,
 *          allowOverdraw?: boolean}} input
 * @returns {Promise<number|null>} the new row's id, for an undo
 */
export async function postCardPayment({ cardName, fromName, amount, allowOverdraw = false }) {
  if (!cardName || !fromName) throw new Error('A payment needs an account on both ends.')
  if (!(amount > 0)) throw new Error('A payment needs an amount.')
  if (cardName === fromName) throw new Error('A card cannot pay itself.')

  if (!allowOverdraw) {
    const over = await checkOverdraw(fromName, amount)
    if (over) throw new OverdrawError(over.name, over.balance ?? 0, amount)
  }

  const nowISO = new Date().toISOString()
  let addedId = null

  await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
    addedId = await db.transactions.add({
      txId:        crypto.randomUUID(),
      type:        'transfer',
      amount,
      fromAccount: fromName,
      toAccount:   cardName,
      date:        nowISO,
      synced:      UNSYNCED,
      updatedAt:   nowISO,
    })
    await applyBalanceEffect(/** @type {Transaction} */ (
      { type: 'transfer', amount, fromAccount: fromName, toAccount: cardName }))
  })

  return addedId
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
 *
 * @param {Transaction} tx
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
            value: list.filter((/** @type {string} */ id) => id !== tx.txId),
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
 *
 * @param {Transaction[]} txs
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
 *
 * @param {Transaction[]} txs
 */
export async function restoreDeletedTxs(txs) {
  let restored = 0
  for (const tx of (txs ?? [])) {
    if (await restoreDeletedTx(tx)) restored++
  }
  return restored
}

/**
 * Write a quick-transaction template, replacing one of the same name and type.
 *
 * It upserts rather than adds because the name is no longer typed - it is
 * derived from the record being saved (its note, or the two accounts, or the
 * category), so saving the same transfer twice used to mean two identical
 * "Metrobank → Maya" rows in the picker with nothing to tell them apart.
 * Replacing keeps the newest amount, which is the one you just confirmed.
 *
 * `name` is a plain index, not a unique one, so this is a lookup and a
 * decision rather than a caught constraint error.
 *
 * @param {Template} row
 */
export async function saveTemplate(row) {
  if (!row?.name) return null
  const existing = await db.templates
    .where('name').equals(row.name)
    .filter(t => t.type === row.type)
    .first()

  const payload = { ...row, createdAt: new Date().toISOString() }
  if (existing) {
    await db.templates.update(existing.id, payload)
    return existing.id
  }
  return db.templates.add(payload)
}
