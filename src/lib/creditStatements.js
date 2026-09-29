import { getCycleRange } from '../utils/creditCycle'
import { receivedAmount } from './transferLegs'
import { statementDueDate } from './creditBills'

/**
 * Every statement a card has closed, newest first, and what paid each one.
 *
 * ── The same arithmetic as getCreditStatus, kept per statement ──
 *
 * getCreditStatus (utils/creditCycle.js) answers one question - where the
 * card stands now - from two running totals: everything ever billed and
 * everything ever paid. This keeps those totals as they stood at every
 * statement close, so each old statement can say what it asked for and
 * whether it was settled. For the newest closed statement the two agree by
 * construction: its `remaining` is getCreditStatus's `stmtOutstanding`.
 *
 * ── Which payments belong to which statement ──
 *
 * A payment settles the statement that closed most recently before it - the
 * rule getCreditStatus uses, because a card is paid once its statement has
 * come, by a transfer after the cutoff. So a statement's payments are the
 * ones made during the cycle after it, and for the newest statement every
 * payment made since it closed.
 *
 * A statement's balance is what was owed when it closed: this cycle's
 * charges, plus whatever the earlier ones left unpaid, less anything paid
 * during the cycle itself. That is the figure a bank prints, and it is what
 * "paid in full" is measured against.
 *
 * @typedef {object} Statement
 * @property {string} key          the close, as an ISO string: stable, and unique per card
 * @property {Date} cycleStart
 * @property {Date} cycleEnd
 * @property {Date|null} due       when it had to be paid by (none without a due day)
 * @property {Array<Record<string, any>>} charges   newest first
 * @property {number} total        this cycle's charges
 * @property {number} carriedIn    left unpaid by the statements before it; below zero, a credit
 * @property {number} balance      what it asked for when it closed; below zero, a credit
 * @property {Array<Record<string, any>>} payments  what paid it, newest first
 * @property {number} paid
 * @property {number} remaining    still owed on it; below zero, paid over
 * @property {'none'|'paid'|'due'|'overdue'|'carried'} status
 *   none: nothing asked for. carried: an older statement left partly unpaid,
 *   its rest now on a later one.
 * @property {Date|null} paidOn    when it was settled, for a paid statement
 * @property {boolean} latest      the statement that closed most recently
 */

/** Below this a figure is a rounding crumb, not money owed. */
const EPS = 0.005

/**
 * @param {Record<string, any>|null|undefined} account  the card
 * @param {Array<Record<string, any>>} txs  any list; filtered to the card here
 * @param {Date} [today]
 * @returns {Statement[]}
 */
export function creditStatements(account, txs, today = new Date()) {
  const name = account?.name
  if (!name) return []
  const cutoff = Number(account?.cutoffDate) || 0
  const dueDay = Number(account?.dueDate) || undefined

  /** @type {Array<{tx: Record<string, any>, at: number, amount: number}>} */
  const charges = []
  /** @type {Array<{tx: Record<string, any>, at: number, amount: number}>} */
  const payments = []
  for (const tx of txs ?? []) {
    const isCharge = (tx.type === 'expense' && tx.account === name)
      || (tx.type === 'transfer' && tx.fromAccount === name)
    const isPayment = (tx.type === 'inflow' && tx.account === name)
      || (tx.type === 'transfer' && tx.toAccount === name)
    const at = new Date(tx.date).getTime()
    if (!Number.isFinite(at)) continue
    // What reached the card, for a transfer from another currency (lib/transferLegs.js).
    if (isCharge) charges.push({ tx, at, amount: tx.amount ?? 0 })
    else if (isPayment) payments.push({ tx, at, amount: tx.type === 'transfer' ? receivedAmount(tx) : (tx.amount ?? 0) })
  }
  if (!charges.length && !payments.length) return []

  const earliest = Math.min(...charges.map(c => c.at), ...payments.map(p => p.at))

  /* The closed cycles, newest first, back to the one the card's first entry
     falls in. getCycleRange asked as of a cycle's first day answers with the
     cycle before it. Bounded, so a nonsense date cannot spin this. */
  /** @type {Array<{cycleStart: Date, cycleEnd: Date}>} */
  const cycles = []
  let range = getCycleRange(cutoff, today)
  while (cycles.length < 600 && range.cycleEnd.getTime() >= earliest) {
    cycles.push(range)
    range = getCycleRange(cutoff, range.cycleStart)
  }
  if (!cycles.length) return []
  cycles.reverse()

  const within = (/** @type {{at: number}} */ e, /** @type {number} */ from, /** @type {number} */ to) => e.at > from && e.at <= to
  const sum = (/** @type {Array<{amount: number}>} */ list) => list.reduce((s, e) => s + e.amount, 0)
  const newestFirst = (/** @type {Array<{tx: any, at: number}>} */ list) => [...list].sort((a, b) => b.at - a.at).map(e => e.tx)

  /** @type {Statement[]} */
  const out = []
  let billed = 0
  let paidSoFar = 0
  let carried = 0
  const todayMs = today.getTime()

  for (let i = 0; i < cycles.length; i++) {
    const { cycleStart, cycleEnd } = cycles[i]
    const endMs = cycleEnd.getTime()
    const prevEnd = i === 0 ? -Infinity : cycles[i - 1].cycleEnd.getTime()
    const nextEnd = i === cycles.length - 1 ? Infinity : cycles[i + 1].cycleEnd.getTime()
    const latest = i === cycles.length - 1

    const own = charges.filter(c => within(c, prevEnd, endMs))
    const paidDuring = payments.filter(p => within(p, prevEnd, endMs))
    const settling = payments.filter(p => within(p, endMs, nextEnd)).sort((a, b) => a.at - b.at)

    /* Running totals, as at this close. A cycle's `settling` payments are the
       next cycle's payments made during it, so they join `paidSoFar` on the
       next pass and are never counted twice. */
    const total = sum(own)
    billed += total
    paidSoFar += sum(paidDuring)
    const balance = billed - paidSoFar
    const paid = sum(settling)
    const remaining = balance - paid

    /* A month the card sat in a drawer: nothing charged, nothing paid toward
       it, and nothing owed - a credit sitting on the card does not need a
       statement a month to say so. Money still owed does, idle or not. A
       payment made during the month is not activity of its own: it paid the
       statement before, and is listed there. */
    const idle = Math.abs(total) < EPS && !settling.length && balance <= EPS
    if (!idle) {
      /** @type {Statement['status']} */
      let status
      /** @type {Date|null} */
      let paidOn = null
      const due = statementDueDate(cycleEnd, dueDay)
      if (balance <= EPS) status = 'none'
      else if (remaining <= EPS) {
        status = 'paid'
        // The payment that brought it to nothing.
        let run = 0
        for (const p of settling) {
          run += p.amount
          if (run >= balance - EPS) { paidOn = new Date(p.at); break }
        }
      } else if (latest) status = due && todayMs > due.getTime() ? 'overdue' : 'due'
      else status = 'carried'

      out.push({
        key: cycleEnd.toISOString(),
        cycleStart, cycleEnd, due,
        charges: newestFirst(own),
        total,
        carriedIn: carried,
        balance,
        payments: newestFirst(settling),
        paid,
        remaining,
        status,
        paidOn,
        latest,
      })
    }
    // What this one leaves for the next: negative is a credit the card holds.
    carried = remaining
  }

  return out.reverse()
}
