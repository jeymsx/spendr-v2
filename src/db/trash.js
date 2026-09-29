import db, { SYNCED, TRASH_DAYS, UNSYNCED } from './db'
import { deleteTxGroup, newJournal, restoreDeletedTxs } from './txHelpers'
import { cancelRemoteDelete, queueRemoteDelete } from '../lib/sync'
import { txBase } from '../lib/fxContext'

/**
 * Recently deleted: every deleted transaction, kept thirty days, to put back
 * or to get rid of for good.
 *
 * ── A deletion is kept whole ──
 *
 * Deleting one row often deletes several (txHelpers.js, expandDeletion): an
 * installment plan goes with all its months, a split purchase with all its
 * legs, a purchase with its refunds. And it can change debts: a share of a
 * split nobody had paid into goes, one somebody had is cut loose, a
 * settlement's payments come off what it settled. One entry holds all of
 * that, so putting it back puts back the purchase you remember, not a leg of
 * it with the rest still missing.
 *
 * ── Deleted means deleted - and the deletion is kept ──
 *
 * The rows really are gone: the balance is reversed, the tombstone is
 * written, and the next sync deletes them on every other device. The
 * deletion itself is a row of its own, synced (022_trash.sql) and in
 * backups, so Recently deleted reads the same on every device you are
 * signed in on - and putting one back anywhere is a new write that syncs
 * out again.
 *
 * ── Putting back has to beat the tombstone ──
 *
 * Deleting a transaction leaves a tombstone on the server (014), and every
 * device applies tombstones before it pulls. Put a row back after that
 * tombstone had gone up and the very next sync would delete it again - on
 * this device first. So putting back also takes the tombstone down (a
 * queued delete on `deletions`, landed before the next pull), for every
 * transaction and debt it brings back.
 */

export { TRASH_DAYS }
const DAY_MS = 86_400_000

/**
 * Forget a deletion here, and - if it ever went up - on the server, whose
 * trigger then drops it from every other device.
 *
 * @param {Record<string, any>} entry
 */
async function unsend(entry) {
  if (entry.syncId && entry.synced === SYNCED) await queueRemoteDelete('trash', { sync_id: entry.syncId })
}

/**
 * @typedef {import('./txHelpers').DeletionJournal & {id: number, deletedAt: string}} TrashEntry
 */

/**
 * Delete `txs`, and everything that has to go with them, into Recently
 * deleted - in one database transaction, so a deletion is never half
 * recorded: either the rows are gone and kept here, or nothing happened.
 *
 * @param {Array<Record<string, any>>} txs
 * @returns {Promise<{id: number, count: number}|null>} null when there was nothing to delete
 */
export async function moveToTrash(txs) {
  const journal = newJournal()
  /** @type {number|null} */
  let id = null
  await db.transaction('rw',
    [db.trash, db.transactions, db.accounts, db.balances, db.recurring, db.meta, db.debts],
    async () => {
      const n = await deleteTxGroup(/** @type {any} */ (txs), journal)
      if (!n) return
      id = /** @type {number} */ (await db.trash.add({ deletedAt: new Date().toISOString(), ...journal, synced: UNSYNCED }))
    })
  purgeTrash().catch(() => { /* next time */ })
  return id == null ? null : { id, count: journal.txs.length }
}

/** A debt by the id that survives a restore, or the local one. @param {{id?: number, syncId?: string|null}} ref */
async function findDebt(ref) {
  const bySync = ref.syncId ? await db.debts.where('syncId').equals(ref.syncId).first() : null
  return bySync ?? (ref.id != null ? await db.debts.get(ref.id) : null)
}

/** Put back refused: an account the rows were on has been deleted since. */
export class MissingAccountError extends Error {
  /** @param {string[]} names */
  constructor(names) {
    super(`No account named ${names.join(', ')}`)
    this.name = 'MissingAccountError'
    this.names = names
  }
}

/**
 * Put a deletion back: its rows, then what it did to debts, undone. Safe to
 * run twice - a row already back is skipped - so a double-tapped Put back or
 * an Undo after one is harmless.
 *
 * Not onto an account that has gone since. The row came back on no account
 * at all: in the lists and the budget, but in no balance and no net worth,
 * with no account page to fix it from. So it throws MissingAccountError,
 * naming them, and puts nothing back.
 *
 * @param {number} id
 * @returns {Promise<number>} how many rows came back
 */
export async function restoreFromTrash(id) {
  const entry = /** @type {TrashEntry|undefined} */ (await db.trash.get(id))
  if (!entry) return 0
  /** @type {Set<string>} */
  const named = new Set()
  for (const tx of entry.txs ?? []) {
    const row = /** @type {Record<string, any>} */ (tx)
    for (const k of ['account', 'fromAccount', 'toAccount']) if (row[k]) named.add(row[k])
  }
  if (named.size) {
    const have = new Set((await db.accounts.toArray()).map(a => a.name))
    const missing = [...named].filter(n => !have.has(n))
    if (missing.length) throw new MissingAccountError(missing)
  }
  /* A deletion made on another device names its charges' bill by the id
     that travels, not by this device's row number - find the bill here. */
  /** @type {Array<Record<string, any>>} */
  const txs = []
  for (const tx of entry.txs ?? []) {
    if (tx.recurringId == null && tx.recurringSyncId) {
      const bill = await db.recurring.where('syncId').equals(tx.recurringSyncId).first()
      txs.push(bill ? { ...tx, recurringId: bill.id } : tx)
    } else txs.push(tx)
  }
  const restored = await restoreDeletedTxs(/** @type {any} */ (txs))
  await db.transaction('rw', [db.debts, db.meta, db.trash], async () => {
    const now = new Date().toISOString()
    for (const d of entry.debts ?? []) {
      if (await findDebt(d)) continue
      /* By its own row number where that is still free - it was this
         device's - and a new one otherwise: a number from another device
         could already be somebody else's debt here. */
      const taken = d.id != null && await db.debts.get(d.id)
      const { id: _drop, ...rest } = d
      await db.debts.add(/** @type {any} */ ({ ...(taken ? rest : d), updatedAt: now }))
      // A delete still waiting to go out would remove it again...
      await cancelRemoteDelete('debts', { local_id: d.id, sync_id: d.syncId })
      // ...and one that went, left a tombstone the next pull would apply.
      if (d.syncId) await queueRemoteDelete('deletions', { table_name: 'debts', row_key: d.syncId })
    }
    for (const u of entry.unhooked ?? []) {
      const d = await findDebt(u)
      if (d && !d.sourceTxId) await db.debts.update(d.id, { sourceTxId: u.sourceTxId, updatedAt: now })
    }
    for (const p of entry.paid ?? []) {
      const d = await findDebt(p)
      if (d) await db.debts.update(d.id, { amountPaid: Math.round(((d.amountPaid ?? 0) + p.delta) * 100) / 100, updatedAt: now })
    }
    // The transactions' tombstones, likewise - see the note at the top.
    for (const tx of txs) {
      if (tx.txId) await queueRemoteDelete('deletions', { table_name: 'transactions', row_key: tx.txId })
    }
    await unsend(entry)
    await db.trash.delete(id)
  })
  return restored
}

/** Forget one deletion for good, everywhere. The rows were deleted when it was made. @param {number} id */
export async function deleteForever(id) {
  const entry = await db.trash.get(id)
  if (!entry) return
  await unsend(entry)
  await db.trash.delete(id)
}

/** Forget every deletion for good, everywhere. */
export async function emptyTrash() {
  for (const entry of await db.trash.toArray()) await unsend(entry)
  await db.trash.clear()
}

/**
 * Forget what is older than thirty days, everywhere.
 *
 * @param {Date} [now]
 */
export async function purgeTrash(now = new Date()) {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * DAY_MS).toISOString()
  const old = await db.trash.where('deletedAt').below(cutoff).toArray()
  for (const entry of old) await unsend(entry)
  if (old.length) await db.trash.where('deletedAt').below(cutoff).delete()
}

/**
 * How a deletion reads in the list: the row you deleted, and what went with
 * it.
 *
 * The first row is the one you acted on - expandDeletion keeps what it was
 * handed first - so a plan reads as its first month and a split as the leg
 * you swiped.
 *
 * @param {TrashEntry} entry
 * @param {Date} [now]
 */
export function describeEntry(entry, now = new Date()) {
  const txs = entry.txs ?? []
  const lead = /** @type {Record<string, any>} */ (txs[0] ?? {})
  const plan = txs.length > 1 && txs.every(t => t.installmentId && t.installmentId === lead.installmentId)
  const split = txs.length > 1 && !!lead.splitId && txs.every(t => t.splitId === lead.splitId)
  const sameKind = txs.filter(t => t.type === lead.type)
  const total = sameKind.reduce((s, t) => s + txBase(t), 0)
  const age = Math.max(0, now.getTime() - Date.parse(entry.deletedAt))
  const left = Math.max(0, TRASH_DAYS - Math.floor(age / DAY_MS))
  const more = txs.length - 1
  return {
    lead,
    count: txs.length,
    total: plan || split ? total : txBase(lead),
    /** What went with it, in words - "All 12 payments", "With 2 other parts". */
    extra: plan ? `All ${txs.length} payments`
      : split ? `With its ${more} other part${more === 1 ? '' : 's'}`
        : more > 0 ? `With ${more} linked row${more === 1 ? '' : 's'}` : '',
    daysLeft: left,
  }
}
