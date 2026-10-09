import db from './db'
import { advanceNextDate } from '../utils/recurring'

/**
 * Which due date of a bill has been paid, from the charges themselves.
 *
 * A charge posted from a bill carries the due date it paid (recurringPrevDate)
 * and the bill's stable id (recurringSyncId), and since 035 both travel, so
 * any device can tell that a due date is paid - not only the one that paid it.
 *
 * ── Why it is needed ──
 *
 * A bill is one row, and the newest copy of it wins whole. So an amount edited
 * on a laptop that had not yet heard of the payment made on the phone sent the
 * bill back with its old next date: every device then showed the bill due
 * today, beside today's charge for it, asking to be paid twice. And two
 * devices could each pay the same due date. A leaf module, importing nothing
 * but the database, so the sync can call it without a cycle (see balances.js).
 *
 * @typedef {{id?: number, syncId?: string|null, nextDate?: string, frequency?: string, dueDay?: number|null, active?: boolean}} BillRef
 */

/**
 * The charge that paid this due date of this bill, if there is one.
 *
 * @param {BillRef} rec
 * @param {string} [dueDate]  the bill's next date by default
 * @returns {Promise<Record<string, any>|undefined>}
 */
export async function chargeFor(rec, dueDate = rec?.nextDate) {
  if (!rec || !dueDate) return undefined
  return db.transactions
    .filter(t => t.recurringPrevDate === dueDate
      && ((rec.id != null && t.recurringId === rec.id) || (!!rec.syncId && t.recurringSyncId === rec.syncId)))
    .first()
}

/**
 * Every active bill whose next date has already been paid, moved on past it:
 * a bill sent back by another device's older copy puts itself right, and the
 * corrected date goes up like any edit.
 *
 * @returns {Promise<number>} how many bills it moved
 */
export async function settlePaidBills() {
  const bills = await db.recurring.toArray()
  const charges = await db.transactions.filter(t => !!t.recurringPrevDate).toArray()
  if (!charges.length) return 0
  let moved = 0
  for (const rec of bills) {
    if (rec.active === false || !rec.nextDate) continue
    const paid = (/** @type {string} */ date) => charges.some(t => t.recurringPrevDate === date
      && ((rec.id != null && t.recurringId === rec.id) || (!!rec.syncId && t.recurringSyncId === rec.syncId)))
    let next = rec.nextDate
    // At most a couple of years of periods: a bill is never that far behind its own charges.
    for (let i = 0; i < 60 && paid(next); i++) next = advanceNextDate(next, rec.frequency, rec.dueDay)
    if (next !== rec.nextDate) {
      await db.recurring.update(/** @type {number} */ (rec.id), { nextDate: next })
      moved++
    }
  }
  return moved
}
