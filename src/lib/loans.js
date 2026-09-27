/**
 * Loans: what you owe, what the next payment is, and when it ends.
 *
 * ── How a loan is stored ──
 *
 * As an account of type 'loan' whose balance is what you owe, NEGATIVE - so
 * every balance sum, the net-worth sweep and sync treat it correctly with no
 * special case, the way a card's charges already are. The UI shows the
 * figure as a positive "Owed".
 *
 * It reuses the columns a card already has, rather than adding a set of its
 * own:
 *
 *   minimumPayment   the monthly amortization - what the lender asks for
 *   dueDate          the day of the month it is due
 *   interestRate     monthly %, on the balance still owed
 *
 * ── Entered the way lenders quote it ──
 *
 * A Pag-IBIG statement, a car loan's disclosure, a bank app: all of them
 * show the monthly payment and the months left. Very few people know their
 * effective rate, and add-on rates quoted by banks are not the rate a
 * diminishing balance is charged. So the rate is optional: given the amount
 * owed, the payment and the months left, it is worked out here, and that is
 * the rate that splits each payment into principal and interest.
 *
 * ── A payment is two ordinary rows ──
 *
 * A transfer of the principal into the loan (it moves money, it is not
 * spending) and an expense for the interest (which is). See
 * db/accountWrites.js (payLoan). Nothing here writes anything.
 */

const round2 = (/** @type {number} */ n) => Math.round(n * 100) / 100

/**
 * The monthly rate (a fraction, 0.01 = 1%) at which `months` payments of
 * `payment` pay off `owed` exactly - the standard annuity, solved by
 * bisection because it has no closed form.
 *
 * 0 when the payments would clear it with no interest at all (or would not
 * clear it even then, in which case there is no rate to find).
 *
 * @param {number} owed
 * @param {number} payment
 * @param {number} months
 * @returns {number}
 */
export function solveMonthlyRate(owed, payment, months) {
  if (!(owed > 0) || !(payment > 0) || !(months > 0)) return 0
  if (payment * months <= owed + 0.005) return 0
  const pv = (/** @type {number} */ r) => payment * (1 - Math.pow(1 + r, -months)) / r
  let lo = 1e-9
  let hi = 1
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    // A higher rate means the same payments are worth less today.
    if (pv(mid) > owed) lo = mid
    else hi = mid
    if (hi - lo < 1e-12) break
  }
  return (lo + hi) / 2
}

/**
 * How many more payments of `payment` clear `owed` at monthly rate `r`
 * (a fraction). Infinity when the payment does not even cover the interest.
 *
 * @param {number} owed
 * @param {number} payment
 * @param {number} r
 */
export function monthsToClear(owed, payment, r) {
  if (!(owed > 0.005)) return 0
  if (!(payment > 0)) return Infinity
  if (!(r > 0)) return Math.ceil(owed / payment - 1e-9)
  if (owed * r >= payment) return Infinity
  const n = -Math.log(1 - (owed * r) / payment) / Math.log(1 + r)
  /* A hundredth of a payment is the rate's rounding, not another month: a
     rate solved from "24 months left" and stored to four places comes back
     as 24.0006, and the form would answer the 24 you typed with 25. */
  return Math.ceil(n - 0.01)
}

/**
 * A monthly rate for reading: "1.51", "0.9". The stored figure keeps four
 * places so the split stays exact; nobody needs to read all four.
 * @param {number|string} pct
 */
export function rateLabel(pct) {
  const n = Number(pct)
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : ''
}

/**
 * One payment, split: interest on what is owed first, the rest off the
 * principal - never more principal than is owed, never below zero.
 *
 * @param {number} owed
 * @param {number} amount
 * @param {number} ratePct  monthly %, as stored on the account
 * @returns {{interest: number, principal: number}}
 */
export function splitPayment(owed, amount, ratePct) {
  const r = (Number(ratePct) || 0) / 100
  const interest = round2(Math.max(0, owed) * r)
  const principal = round2(Math.max(0, Math.min(amount - interest, Math.max(0, owed))))
  return { interest: round2(Math.min(interest, amount)), principal }
}

/**
 * The due date in a given month, clamped to the month's length - a loan due
 * on the 31st falls on the 28th in February, not on the 3rd of March.
 *
 * @param {number} year
 * @param {number} month  0-11
 * @param {number} day
 */
export function dueOn(year, month, day) {
  const last = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(Math.max(1, day), last))
}

/**
 * The first due date strictly after `after`.
 *
 * @param {number} day
 * @param {Date} after
 */
function dueAfter(day, after) {
  let d = dueOn(after.getFullYear(), after.getMonth(), day)
  if (d <= after) d = dueOn(after.getFullYear(), after.getMonth() + 1, day)
  return d
}

/**
 * Everything the loan's page and the forecast need, from the account and the
 * ledger.
 *
 * `nextDue` skips ahead a month once this cycle is paid: a payment dated
 * after the previous due date counts for the coming one, so paying early
 * does not leave the page asking for it again.
 *
 * @param {Record<string, any>} account  a loan account
 * @param {Array<Record<string, any>>} [transactions]
 * @param {Date} [now]
 */
export function loanStatus(account, transactions = [], now = new Date()) {
  const owed = round2(Math.max(0, -(account?.balance ?? 0)))
  const payment = Number(account?.minimumPayment) || 0
  const ratePct = Number(account?.interestRate) || 0
  const r = ratePct / 100
  const day = Number(account?.dueDate) || 0
  const name = account?.name

  // Money that went into the loan (principal) and out of it (borrowed more).
  let paidIn = 0
  let lastPaid = null
  for (const t of transactions ?? []) {
    if (t?.type !== 'transfer') continue
    if (t.toAccount === name) {
      paidIn += Math.abs(t.toAmount ?? t.amount ?? 0)
      const d = new Date(t.date)
      if (!Number.isNaN(d.getTime()) && d <= now && (!lastPaid || d > lastPaid)) lastPaid = d
    } else if (t.fromAccount === name) {
      paidIn -= Math.abs(t.amount ?? 0)
    }
  }
  paidIn = round2(Math.max(0, paidIn))

  let nextDue = null
  let paidThisCycle = false
  if (day >= 1 && day <= 31) {
    const upcoming = dueAfter(day, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59))
    const previous = dueOn(upcoming.getFullYear(), upcoming.getMonth() - 1, day)
    /* Paid on the previous due date itself was paying THAT one; only a
       payment from the day after it counts for the one coming up. */
    const cycleStart = new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 1)
    paidThisCycle = !!lastPaid && lastPaid >= cycleStart
    nextDue = paidThisCycle ? dueOn(upcoming.getFullYear(), upcoming.getMonth() + 1, day) : upcoming
  }

  const months = owed > 0.005 ? monthsToClear(owed, payment, r) : 0
  const paidOffBy = nextDue && Number.isFinite(months) && months > 0
    ? dueOn(nextDue.getFullYear(), nextDue.getMonth() + months - 1, day)
    : null
  const next = owed > 0.005 && payment > 0
    ? { amount: round2(Math.min(payment, owed * (1 + r))), ...splitPayment(owed, Math.min(payment, owed * (1 + r)), ratePct) }
    : null

  return {
    owed,
    payment,
    ratePct,
    monthsLeft: months,
    paidOffBy,
    nextDue,
    paidThisCycle,
    next,
    /** Principal paid since Spendr started tracking this loan. */
    paidIn,
    /** paid / (paid + owed): how far along, as far as the ledger knows. */
    progress: paidIn + owed > 0 ? paidIn / (paidIn + owed) : 0,
  }
}

/**
 * The payments still to come, soonest first, up to `until` - what the
 * forecast lays out. Each one is the monthly amount, and the last is
 * whatever is left of the balance with its interest.
 *
 * @param {Record<string, any>} account
 * @param {Array<Record<string, any>>} transactions
 * @param {Date} now
 * @param {Date} until
 * @returns {Array<{date: Date, amount: number}>}
 */
export function upcomingLoanPayments(account, transactions, now, until) {
  const s = loanStatus(account, transactions, now)
  if (!s.nextDue || !(s.payment > 0) || !(s.owed > 0.005)) return []
  const r = s.ratePct / 100
  const day = Number(account.dueDate)
  const out = []
  let owed = s.owed
  let d = s.nextDue
  for (let i = 0; i < 600 && owed > 0.005 && d <= until; i++) {
    const amount = round2(Math.min(s.payment, owed * (1 + r)))
    out.push({ date: d, amount })
    owed = round2(owed * (1 + r) - amount)
    d = dueOn(d.getFullYear(), d.getMonth() + 1, day)
  }
  return out
}
