import db, { UNSYNCED } from './db'
import { queueRemoteDelete, cancelRemoteDelete } from '../lib/sync'
import { getBaseCurrency } from '../lib/money'
import { cleanLink, coolDaysFor, coolUntilFrom } from '../lib/wishes'

/**
 * The wishlist's writes. What a wish is, and the rules for how long it waits,
 * are lib/wishes.js; this is only putting them in the database.
 */

/**
 * Park a wish.
 *
 * @param {{name: string, price: number, link?: string|null, note?: string|null, coolDays?: number, coolUntil?: string|null}} input
 * @param {Date} [now]
 * @returns {Promise<number>}  its id
 */
export async function addWish({ name, price, link = null, note = null, coolDays, coolUntil = null }, now = new Date()) {
  const currency = getBaseCurrency()
  const days = coolDays ?? coolDaysFor(price, currency)
  const stamp = now.toISOString()
  return db.wishes.add({
    name: String(name ?? '').trim(),
    price: Number(price) || 0,
    currency,
    link: cleanLink(link),
    note: note ? String(note).trim() || null : null,
    coolUntil: coolUntil ?? coolUntilFrom(days, now),
    status: 'waiting',
    decidedAt: null,
    txId: null,
    goalName: null,
    createdAt: stamp,
    updatedAt: stamp,
    synced: UNSYNCED,
  })
}

/**
 * Change what a wish says, or when it is asked about.
 *
 * @param {number} id
 * @param {Partial<WishRow>} patch
 */
export async function updateWish(id, patch) {
  const next = { ...patch, synced: UNSYNCED }
  if ('link' in patch) next.link = cleanLink(patch.link)
  if ('name' in patch) next.name = String(patch.name ?? '').trim()
  await db.wishes.update(id, next)
}

/**
 * Answer "Still want it?". Returns what it was before, for an Undo.
 *
 * @param {number} id
 * @param {'bought'|'skipped'|'saving'} status
 * @param {{txId?: string|null, goalName?: string|null}} [extra]
 * @param {Date} [now]
 */
export async function decideWish(id, status, extra = {}, now = new Date()) {
  const before = await db.wishes.get(id)
  if (!before) return null
  await db.wishes.update(id, {
    status,
    decidedAt: now.toISOString(),
    txId: extra.txId ?? before.txId ?? null,
    goalName: extra.goalName ?? before.goalName ?? null,
    synced: UNSYNCED,
  })
  return { status: before.status ?? 'waiting', decidedAt: before.decidedAt ?? null, txId: before.txId ?? null, goalName: before.goalName ?? null }
}

/**
 * Put a decision back as it was (Undo).
 *
 * @param {number} id
 * @param {{status: string, decidedAt: string|null, txId: string|null, goalName: string|null}} before
 */
export async function undoDecision(id, before) {
  await db.wishes.update(id, { ...before, synced: UNSYNCED })
}

/**
 * Bought, through Add expense: the wish named by its stable id is marked with
 * the expense that bought it.
 *
 * @param {string} syncId
 * @param {string|null} txId
 */
export async function markBought(syncId, txId) {
  if (!syncId) return
  const wish = await db.wishes.where('syncId').equals(syncId).first()
  if (wish?.id == null || wish.status === 'bought') return
  await decideWish(wish.id, 'bought', { txId })
}

/**
 * Gone, from this device and the cloud. Returns the row, for an Undo.
 *
 * @param {number} id
 */
export async function deleteWish(id) {
  const row = await db.wishes.get(id)
  if (!row) return null
  await db.wishes.delete(id)
  if (row.syncId) await queueRemoteDelete('wishes', { sync_id: row.syncId })
  return row
}

/**
 * Back as it was (Undo of a delete). Unsent, so it goes up again whether or
 * not the delete had reached the cloud.
 *
 * @param {WishRow} row
 */
export async function restoreWish(row) {
  if (!row) return
  if (row.syncId) await cancelRemoteDelete('wishes', { sync_id: row.syncId })
  const { syncedAt: _sent, ...rest } = row
  await db.wishes.put({ ...rest, synced: UNSYNCED, updatedAt: new Date().toISOString() })
}
