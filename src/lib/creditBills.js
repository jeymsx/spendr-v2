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
 * The date a closed statement has to be paid by: the first time the due day
 * comes round AFTER the statement closes.
 *
 * ── This used to be off by a month, in the dangerous direction ──
 *
 * It always put the due day in the month after the close, on the premise that
 * "every PH issuer" works that way. They do not. An issuer gives a grace
 * period of roughly twenty days from the statement, and whether that lands in
 * the same month or the next depends on the statement day:
 *
 *   closes Sep 15, due the 5th   ->  Oct 5    next month (5 comes before 15)
 *   closes Sep 5,  due the 25th  ->  Sep 25   SAME month (25 comes after 5)
 *
 * The old rule said Oct 25 for the second one. It told somebody they had a
 * month longer than they did, which is precisely how a card gets paid late -
 * a late fee and a month of interest, on the figure this app exists to get
 * right. Two plans in a row named it the highest-value fix on the list.
 *
 * "First occurrence after the close" is right for any grace period under a
 * month, which is every card; a period of a month or more would be the only
 * thing that could make a same-month due day mean next month instead.
 *
 * ── Clamped, on the candidate and not the input ──
 *
 * A due day of 31 is the 30th in a 30-day month and the 28th in February. The
 * comparison uses the CLAMPED day: a statement closing on 28 Feb with a due
 * day of 30 must not read as "the 28th, same month" - that is the closing day
 * itself - so it moves to 30 March.
 *
 * ── It may return a date in the past ──
 *
 * On purpose. `nextDueDate()` always answers with a future occurrence, which
 * would make an overdue card look punctual - the reason this is separate.
 *
 * utils/reportData.js had its own copy of the old rule, with no clamping at
 * all; it calls this now, so the PDF and the app cannot disagree again.
 *
 * @param {Date} cycleEnd
 * @param {number} [dueDay]
 * @returns {Date|null}
 */
export function statementDueDate(cycleEnd, dueDay) {
  if (!dueDay || dueDay < 1 || dueDay > 31) return null
  const y = cycleEnd.getFullYear()
  const m = cycleEnd.getMonth()
  const closedOn = cycleEnd.getDate()

  /** The due day, clamped into month `mm` of year `yy`. */
  const inMonth = (/** @type {number} */ yy, /** @type {number} */ mm) => {
    const last = new Date(yy, mm + 1, 0).getDate()
    return new Date(yy, mm, Math.min(dueDay, last), 23, 59, 59, 999)
  }

  const sameMonth = inMonth(y, m)
  return sameMonth.getDate() > closedOn ? sameMonth : inMonth(y, m + 1)
}

/**
 * The due date a card is working towards right now.
 *
 * The closed statement's while it still owes anything - even once that date
 * has passed, because that is the payment that is late - and otherwise the
 * statement now running. What it replaces, on the card faces and the payment
 * sheet, was the next time the due DAY comes round on the calendar: on the
 * due date itself that is already next month, so a card owing money today
 * said "Due Oct 25" on the one day it mattered most.
 *
 * @param {{stmtOutstanding?: number, cycleEnd?: Date, nextCycleEnd?: Date}|null|undefined} status
 *   what getCreditStatus returns
 * @param {number|null|undefined} dueDay
 * @returns {Date|null}
 */
export function upcomingDueDate(status, dueDay) {
  if (!status || !dueDay) return null
  const closed = (status.stmtOutstanding ?? 0) > 0
  const end = closed ? status.cycleEnd : status.nextCycleEnd
  return end ? statementDueDate(end, dueDay) : null
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
