import { getCreditStatus } from '../utils/creditCycle'

/**
 * A credit card's statement, as a bill.
 *
 * ── Why this is derived and not a row in `recurring` ──
 *
 * The obvious implementation is to write a real recurring record per card and
 * let the Bills page render it like any other. It does not work, and the
 * reason is worth writing down so nobody tries it again: `postRecurringCharge`
 * posts an EXPENSE. A card statement is not an expense - every peso in it was
 * already booked as one when you swiped - so paying it that way would count
 * the whole month's spending a second time and charge it to whatever category
 * the fake bill carried.
 *
 * A card payment is a TRANSFER, which is a different verb with different
 * arithmetic, so the row is computed on read and its action opens the transfer
 * form instead. Nothing is stored, nothing syncs, and a card that owes nothing
 * simply does not appear.
 *
 * ── What "due" means here ──
 *
 * The statement that has already CLOSED, not the charges still accumulating.
 * Those are on next month's bill and asking for them now would be wrong. So
 * the figure is `stmtOutstanding` - what the closed statement still wants -
 * and not `currentBalance`, which includes everything charged since the cutoff.
 */

/**
 * The date a closed statement has to be paid by.
 *
 * The due day falls in the month AFTER the cycle closes, which is what every
 * PH issuer does and what the PDF report already assumed. Returning a real
 * past date when it has passed is the point - `nextDueDate()` always answers
 * with a future occurrence, which would make an overdue card look punctual.
 *
 * @param {Date} cycleEnd
 * @param {number} [dueDay]
 * @returns {Date|null}
 */
export function statementDueDate(cycleEnd, dueDay) {
  if (!dueDay || dueDay < 1 || dueDay > 31) return null
  const y = cycleEnd.getFullYear()
  const m = cycleEnd.getMonth() + 1
  // Clamped, so a card due on the 31st still lands in February.
  const last = new Date(y, m + 1, 0).getDate()
  return new Date(y, m, Math.min(dueDay, last), 23, 59, 59, 999)
}

/**
 * Whole days from `today` to `due`; negative once it has passed.
 *
 * @param {Date|null} due
 * @param {Date} today
 * @returns {number|null}
 */
export function daysToDue(due, today) {
  if (!due) return null
  const a = new Date(today); a.setHours(0, 0, 0, 0)
  const b = new Date(due);   b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/**
 * One virtual bill per credit card that still owes something.
 *
 * @param {object} input
 * @param {Array<Partial<Account>>} [input.accounts]
 * @param {Array<Partial<Transaction>>} [input.transactions]
 * @param {Date} [input.today]
 * @returns {Array<Record<string, any>>}
 */
export function creditCardBills({ accounts = [], transactions = [], today = new Date() } = {}) {
  const out = []

  for (const acct of accounts) {
    if (acct.type !== 'credit') continue
    const s = getCreditStatus(/** @type {any} */ (acct), transactions, today)
    // Nothing closed, or the closed statement is settled: no bill to show.
    if (s.stmtOutstanding <= 0) continue

    const due  = statementDueDate(s.cycleEnd, acct.dueDate)
    const days = daysToDue(due, today)

    out.push({
      /* `kind` is what the Bills page branches on. A real bill has none, so
         an older row cannot be mistaken for a card. */
      kind:        'card',
      id:          `card:${acct.name}`,
      account:     acct,
      name:        acct.name,
      /** What the closed statement still wants. */
      amount:      s.stmtOutstanding,
      minimumDue:  s.minimumDue,
      /** Everything the card holds, including charges since the cutoff -
       *  shown as context, never as the amount due. */
      totalBalance: s.currentBalance,
      dueDate:     due ? due.toISOString() : null,
      daysUntil:   days,
      overdue:     days != null && days < 0,
      cycleEnd:    s.cycleEnd,
    })
  }

  // Soonest first, and a card with no due date set goes last - it cannot be
  // ordered against the others and it is not urgent by omission.
  return out.sort((a, b) => {
    if (a.daysUntil == null) return 1
    if (b.daysUntil == null) return -1
    return a.daysUntil - b.daysUntil
  })
}
