import db, { UNSYNCED } from './db'
import { applyBalanceEffect, reverseBalanceEffect } from './balances'
import { advanceNextDate } from '../utils/recurring'
import { resolveBillShares } from '../lib/splitModes'
import { applyPayment } from '../lib/people'
import { deleteDebtRemote } from '../lib/sync'

/* Re-exported: they used to live here and ten files import them from
   here. See db/balances.js for why they moved. */
export { applyBalanceEffect, reverseBalanceEffect }

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
      /* And the bill's STABLE id, which is the one that survives.
         recurringId is a local Dexie key: it changes if the bill is deleted
         and re-made, and it is never sent to Supabase - so on any device that
         got its transactions from a pull, it is simply absent. See 017. */
      recurringSyncId:   rec.syncId ?? null,
      recurringPrevDate: rec.nextDate,
    })
    await applyBalanceEffect(/** @type {Transaction} */ (
      { type: 'expense', amount: rec.amount, account: rec.account, date: nowISO }))
    await db.recurring.update(rec.id, { nextDate: newNextDate })
  })

  const tx = addedId ? await db.transactions.get(addedId) : null

  /* A bill that is shared opens its receivables the moment it posts.
 
     This is the case that made bills need splits at all: a subscription is
     the same division every month, and re-entering it twelve times a year is
     a chore with a UI on it. The split is stored as what was TYPED - a mode
     and some values - so it re-resolves against this month's amount rather
     than against whatever the price was when it was set up.
 
     Outside the transaction above for the same reason AddExpense does it:
     that block does not name `debts`, and widening its scope would make the
     charge itself fail if a receivable did. The charge is the fact. */
  if (tx?.txId) {
    const owed = resolveBillShares(rec, rec.amount)
    for (const person of owed) {
      await db.debts.add(/** @type {any} */ ({
        name:           person.name,
        contact:        person.name,
        amount:         person.amount,
        amountPaid:     0,
        type:           'owed_to_me',
        dueDate:        null,
        notes:          rec.name,
        createdAt:      nowISO,
        sourceTxId:     tx.txId,
        sourceCategory: rec.category,
        synced:         UNSYNCED,
        updatedAt:      nowISO,
      }))
    }
  }

  return { nextDate: newNextDate, tx }
}

/**
 * Change a transaction that already exists, and move the balance by the
 * DIFFERENCE rather than by the new figure.
 *
 * Reverse then apply, in that order and in one Dexie transaction. Anything
 * else has to special-case what changed: an amount that went up, an account
 * that moved, a transfer whose two legs swapped. Undoing the old row's whole
 * effect and applying the new one's is the same arithmetic for every one of
 * those, and it cannot drift because it never looks at what changed.
 *
 * txId is deliberately untouched. It is the identity other rows point at - a
 * refund's refundOf, a receivable's sourceTxId - so an edit that minted a new
 * one would orphan them silently.
 *
 * @param {Record<string, any>} tx     the row as it is now
 * @param {Record<string, any>} patch  the fields to change
 */
export async function updateTransaction(tx, patch) {
  if (!tx?.id) throw new Error('There is nothing to update.')
  const next = { ...patch, updatedAt: new Date().toISOString(), synced: UNSYNCED }

  await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
    await reverseBalanceEffect(/** @type {any} */ (tx))
    await applyBalanceEffect(/** @type {any} */ ({ ...tx, ...next }))
    await db.transactions.update(tx.id, next)
  })

  return next
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
  const list = await expandDeletion((txs ?? []).filter(Boolean))
  if (!list.length) return 0

  await db.transaction('rw',
    [db.transactions, db.accounts, db.balances, db.recurring, db.meta, db.debts],
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

        /* A settlement puts money back and marks rows paid. Deleting it has
           to do both in reverse, or the money returns and the debt stays
           settled - somebody owes you again and nothing on the debts page
           says so. `settles` is written by settleWithPerson precisely so
           this is possible; before it existed the two writes had nothing
           joining them. */
        for (const part of tx.settles ?? []) {
          /* syncId first, because it is the one that survives a restore and a
             second device; the local id is the fast path for the row this
             very device wrote. */
          const d = (part.syncId
            ? await db.debts.where('syncId').equals(part.syncId).first()
            : null) ?? (part.id ? await db.debts.get(part.id) : null)
          if (!d) continue
          await db.debts.update(d.id, {
            amountPaid: Math.max(0, Math.round(((d.amountPaid ?? 0) - (part.delta ?? 0)) * 100) / 100),
          })
        }

        /* And the credit row it opened, if paying more than was owed left
           one. That row is not history - it is the leftover of this exact
           payment, so it goes with it. */
        if (tx.creditSyncId || tx.creditDebtId) {
          const credit = (tx.creditSyncId
            ? await db.debts.where('syncId').equals(tx.creditSyncId).first()
            : null) ?? (tx.creditDebtId ? await db.debts.get(tx.creditDebtId) : null)
          if (credit) {
            await db.debts.delete(credit.id)
            await deleteDebtRemote(null, credit.id, credit.syncId)
          }
        }
      }

      /* A receivable this purchase OPENED, once the purchase is gone.
         Whether it should go too turns on one question: has any money moved
         against it?

         NOTHING PAID - it goes. The row exists only because you split this
         expense, so deleting the expense is saying the expense never
         happened, and a share of something that never happened is not a
         debt. Keeping it stranded a number on the debts page that no screen
         explains and nothing can close, which is what this used to do.

         SOMETHING PAID - it stays, unhooked. Now there is real history: they
         handed you money, and that is true whatever became of the purchase.
         Left pointing at a deleted row it would be unsettleable, because
         settleWithPerson routes through postRefund and postRefund refuses to
         refund a purchase that is gone. So the link is cut and the balance
         survives, to be settled or deleted by hand. */
      /* Filtered in JS, not with where(): sourceTxId is a plain property with
         no Dexie index, and where() on an unindexed key throws. A first
         version caught that and carried on, which is the worst outcome - the
         unhooking silently never happened and nothing said so. */
      const gone = new Set(list.map(t => t.txId).filter(Boolean))
      if (gone.size) {
        const stamp = new Date().toISOString()
        for (const d of await db.debts.toArray()) {
          if (!d.sourceTxId || !gone.has(d.sourceTxId)) continue
          if ((d.amountPaid ?? 0) <= 0.005) {
            await db.debts.delete(d.id)
            await deleteDebtRemote(null, d.id, d.syncId)
          } else {
            await db.debts.update(d.id, { sourceTxId: null, updatedAt: stamp })
          }
        }
      }

      await db.meta.put({ key: 'deletedTxIds', value: [...tombstones] })
    })

  return list.length
}

/**
 * Everything that has to go with what you asked to delete.
 *
 * ── Why this is not the caller's job ──
 *
 * Two rows in this app are meaningless on their own, and both were being left
 * behind. Found by trying to break it rather than by using it:
 *
 *   A REFUND of a purchase that no longer exists is not a transaction, it is
 *   a negative expense nothing explains. It keeps moving the balance and keeps
 *   reducing a category, and there is no screen that will ever show you why.
 *
 *   A LEG of a split is worse, because it looks fine. Delete one leg of a
 *   1,000 purchase split 600/400 and the ledger says 400 while 1,000 genuinely
 *   left the account. Nothing is red, no total looks wrong on that row, and
 *   the account is quietly out by 600.
 *
 * Installments already solved this at the CALL SITE - TxDetailSheet expands
 * the plan before handing it over. That works and it is the wrong place: it
 * has to be repeated by every caller, and the two new shapes were added
 * without anybody repeating it. Doing it here means there is one answer.
 *
 * Ids are de-duplicated, so passing a whole group in is harmless.
 *
 * @param {Transaction[]} list
 * @returns {Promise<Transaction[]>}
 */
async function expandDeletion(list) {
  if (!list.length) return list
  const byId = new Map(list.map(t => [t.id, t]))
  const all = await db.transactions.toArray()

  for (const tx of list) {
    if (tx.txId) {
      for (const r of all) {
        if (r.refundOf === tx.txId && !byId.has(r.id)) byId.set(r.id, r)
      }
    }
    if (tx.splitId) {
      for (const leg of all) {
        if (leg.splitId === tx.splitId && !byId.has(leg.id)) byId.set(leg.id, leg)
      }
    }
  }

  return [...byId.values()]
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

  /* updatedAt, not just createdAt. The pull takes a remote row only when it
     is strictly newer, so a template saved without one read as infinitely old
     and was overwritten on the next sync by whatever remote row shared its
     local_id - you saved an expense as a template, it appeared, and a reload
     replaced it with a stranger.

     The creating hook in db/db.js stamps this too, and belt-and-braces is the
     right call for the one function that shipped the bug: it makes this
     correct on its own rather than correct because of something two files
     away. */
  const nowISO = new Date().toISOString()
  const payload = { ...row, createdAt: nowISO, updatedAt: nowISO, synced: UNSYNCED }
  if (existing) {
    await db.templates.update(existing.id, payload)
    return existing.id
  }
  return db.templates.add(payload)
}

/**
 * Money coming back on a purchase.
 *
 * ── Not a delete, and not an edit ──
 *
 * A refund is two events at two times. The money genuinely left on the 2nd
 * and genuinely came back on the 20th, and both of those are true of your
 * balance on every day in between. Deleting the original erases the seven
 * weeks you were actually out of pocket; editing its amount down rewrites a
 * statement your bank has already billed you for, which is the one thing
 * getCreditStatus cannot survive - a charge has to stay in the cycle it
 * happened in.
 *
 * Editing is for "I typed 240 instead of 2,400", where the event was always
 * 2,400. This is for "it came back".
 *
 * ── The shape ──
 *
 * An ordinary expense with a NEGATIVE amount, carrying `refundOf`. See
 * lib/txMoney.js for why that beats a fourth transaction type: every existing
 * sum-by-category is already right about it, because they all add.
 *
 * It inherits the original's category on purpose - a refund that landed
 * somewhere else would leave the category it came from overstated forever.
 * The ACCOUNT can differ, because a card refund sometimes arrives as cash or
 * as store credit against a different card.
 *
 * @param {{originalTxId: string, amount: number, toAccount?: string,
 *          description?: string, date?: string}} input
 * @returns {Promise<number|null>} the new row's id, for an undo
 */
export async function postRefund({ originalTxId, amount, toAccount, description, date }) {
  if (!originalTxId) throw new Error('A refund needs the purchase it came from.')
  if (!(amount > 0)) throw new Error('A refund needs an amount.')

  const original = await db.transactions.where('txId').equals(originalTxId).first()
  if (!original) throw new Error('That purchase is no longer here.')
  if (original.type !== 'expense') throw new Error('Only a purchase can be refunded.')

  const account = toAccount || original.account
  if (!account) throw new Error('A refund needs an account to land in.')

  const nowISO = date ?? new Date().toISOString()
  let addedId = null

  await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
    addedId = await db.transactions.add({
      txId:        crypto.randomUUID(),
      type:        'expense',
      // Negative: this is the whole mechanism. See lib/txMoney.js.
      amount:      -Math.abs(amount),
      description: description || `Refund · ${original.description || original.category || 'purchase'}`,
      category:    original.category,
      account,
      date:        nowISO,
      refundOf:    originalTxId,
      synced:      UNSYNCED,
      updatedAt:   nowISO,
    })
    /* An expense applies `-a`, and `a` is negative here, so the balance goes
       UP by the refund. No special case, which is the point. */
    await applyBalanceEffect(/** @type {Transaction} */ (
      { type: 'expense', amount: -Math.abs(amount), account }))
  })

  return addedId
}

/**
 * One purchase, filed under more than one category.
 *
 * Written as N ordinary expenses sharing a `splitId` rather than one row with
 * an array on it. Every sum-by-category in the app is then already correct
 * about a split without knowing splits exist, because each leg is simply an
 * expense - the same reason installments are N rows sharing an installmentId.
 *
 * The id exists so the UI can present them as one purchase and delete them as
 * a unit. Nothing derives a total from it.
 *
 * The legs share a date and a description so they read as one thing in the
 * ledger, and the balance moves once for the total rather than once per leg.
 *
 * @param {{account: string, date?: string, description?: string,
 *          legs: Array<{category: string, amount: number}>,
 *          allowOverdraw?: boolean}} input
 * @returns {Promise<{splitId: string, ids: number[]}>}
 */
export async function postSplitExpense({ account, date, description, legs, allowOverdraw = false }) {
  if (!account) throw new Error('A purchase needs an account.')
  const clean = (legs ?? []).filter(l => l?.category && l.amount > 0)
  if (clean.length < 2) throw new Error('A split needs at least two categories.')

  const total = Math.round(clean.reduce((s, l) => s + l.amount, 0) * 100) / 100
  if (!(total > 0)) throw new Error('A purchase needs an amount.')

  if (!allowOverdraw) {
    const over = await checkOverdraw(account, total)
    if (over) throw new OverdrawError(over.name, over.balance ?? 0, total)
  }

  const nowISO = date ?? new Date().toISOString()
  const splitId = crypto.randomUUID()
  /** @type {number[]} */
  const ids = []

  await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
    for (const leg of clean) {
      const id = await db.transactions.add({
        txId:        crypto.randomUUID(),
        type:        'expense',
        amount:      Math.round(leg.amount * 100) / 100,
        description: description || leg.category,
        category:    leg.category,
        account,
        date:        nowISO,
        splitId,
        synced:      UNSYNCED,
        updatedAt:   nowISO,
      })
      ids.push(/** @type {number} */ (id))
    }
    /* One adjustment for the whole purchase. Same net effect as applying each
       leg, without re-reading the account once per category. */
    await applyBalanceEffect(/** @type {Transaction} */ (
      { type: 'expense', amount: total, account }))
  })

  return { splitId, ids }
}

/**
 * Money moving between you and one person, whatever they owed at the time.
 *
 * ── Why it takes a PERSON and not a debt ──
 *
 * Paying somebody back is not an operation on a row. Gelo hands you 500 and it
 * covers two old loans and leaves a bit over; Gelo hands you 175 for a bill
 * that has not posted yet and it covers nothing at all. Both are the same
 * gesture, and a form that makes you pick which debt it belongs to is asking a
 * question the money does not have an answer to.
 *
 * So this takes the person and the amount, spreads it across their open rows
 * oldest first, and turns anything left into CREDIT - a row in the other
 * direction, because until it is used up you are holding their money. The next
 * bill nets against it on its own. That is what makes the order of events stop
 * mattering.
 *
 * ── What it writes to the ledger ──
 *
 * A repayment on a shared expense is a REFUND, not income - the money is
 * coming back to the category it left from. With no category to name (a plain
 * loan repaid), it is an ordinary inflow, because that money genuinely is
 * arriving from outside your own ledger.
 *
 * @param {{person: string, rows: Array<Record<string, any>>, amount: number,
 *          account: string, direction?: 'owed_to_me'|'i_owe',
 *          category?: string|null, sourceTxId?: string|null,
 *          description?: string}} input
 * @returns {Promise<{credit: number, settled: number, tx: any}>}
 */
export async function settleWithPerson({
  person, rows, amount, account, direction = 'owed_to_me',
  category = null, sourceTxId = null, description,
}) {
  if (!person) throw new Error('Who is this with?')
  if (!(amount > 0)) throw new Error('A payment needs an amount.')
  if (!account) throw new Error('A payment needs an account.')

  const { updates, credit } = applyPayment(rows, amount, direction)
  const nowISO = new Date().toISOString()
  const receiving = direction === 'owed_to_me'
  const note = description || (receiving ? `Repaid by ${person}` : `Paid to ${person}`)

  /* What this payment MOVES on each row, kept so it can be moved back.

     The debt update and the ledger row were two writes with nothing joining
     them, so deleting the transaction left every row it had settled still
     marked paid - the money came back and the debt did not. Recording the
     deltas on the transaction is what lets deleteTxGroup undo the whole
     gesture, and it is also what the Undo on the toast runs: one reversal,
     two ways in. */
  const before = new Map((rows ?? []).map(r => [r.id, r.amountPaid ?? 0]))
  const syncOf = new Map((rows ?? []).map(r => [r.id, r.syncId ?? null]))
  /* Keyed on syncId, with the local id only as a fast path. A local id is a
     Dexie counter and means nothing on another device - see migration 011 -
     so a settlement recorded on the phone and deleted on the laptop would
     reverse nothing at all if this were the id alone. */
  const settles = updates.map(u => ({
    syncId: syncOf.get(u.id) ?? null,
    id: u.id,
    delta: Math.round((u.amountPaid - (before.get(u.id) ?? 0)) * 100) / 100,
  })).filter(x => x.delta > 0.005)

  /* The ledger side first, because it is the part that must not be lost. A
     debt row that says "paid" with no money behind it is worse than money
     with no debt updated - one is a wrong balance, the other is a reminder
     that outlived its usefulness. */
  /** @type {number|null} */
  let txLocalId = null
  if (receiving && sourceTxId) {
    txLocalId = /** @type {any} */ (
      await postRefund({ originalTxId: sourceTxId, amount, toAccount: account, description: note }))
  } else {
    await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
      txLocalId = /** @type {any} */ (await db.transactions.add({
        txId:       crypto.randomUUID(),
        type:       receiving ? 'inflow' : 'expense',
        amount,
        description: note,
        category:   category ?? (receiving ? 'Debt Collection' : 'Debt Payment'),
        account,
        date:       nowISO,
        synced:     UNSYNCED,
        updatedAt:  nowISO,
      }))
      await applyBalanceEffect(/** @type {Transaction} */ (
        { type: receiving ? 'inflow' : 'expense', amount, account }))
    })
  }

  for (const u of updates) {
    await db.debts.update(u.id, { amountPaid: u.amountPaid, updatedAt: nowISO })
  }

  /* Whatever is left over becomes a row in the OTHER direction. Not an error,
     not a warning - it is what a round number looks like, and what paying
     early looks like when there is nothing to pay yet. */
  /** @type {number|null} */
  let creditDebtId = null
  if (credit > 0.005) {
    creditDebtId = /** @type {any} */ (await db.debts.add(/** @type {any} */ ({
      name:       person,
      contact:    person,
      amount:     credit,
      amountPaid: 0,
      type:       receiving ? 'i_owe' : 'owed_to_me',
      dueDate:    null,
      notes:      receiving ? `Paid ahead${category ? ` · ${category}` : ''}` : 'Overpaid',
      createdAt:  nowISO,
      sourceCategory: category,
      synced:     UNSYNCED,
      updatedAt:  nowISO,
    })))
  }

  /* Stamped after the fact rather than passed in, because the credit row does
     not exist until the payment has been spread and postRefund owns the
     shape of the row it writes. */
  if (txLocalId && (settles.length || creditDebtId)) {
    const creditRow = creditDebtId ? await db.debts.get(creditDebtId) : null
    await db.transactions.update(txLocalId, {
      settles,
      ...(creditDebtId ? { creditDebtId } : {}),
      ...(creditRow?.syncId ? { creditSyncId: creditRow.syncId } : {}),
      updatedAt: nowISO,
    })
  }

  const txRow = txLocalId ? await db.transactions.get(txLocalId) : null
  return { credit, settled: updates.length, tx: txRow }
}
