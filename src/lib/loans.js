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

import { storedRow } from '../utils/installments'

const round2 = (/** @type {number} */ n) => Math.round(n * 100) / 100

/** The category a loan payment's interest is filed under, created on first use. */
export const LOAN_INTEREST = 'Loan interest'
/** @param {string} loan */
export const loanPaymentNote = (loan) => `Loan payment · ${loan}`
/** @param {string} loan */
export const loanInterestNote = (loan) => `Interest · ${loan}`

/**
 * The other half of a loan payment: the interest for a principal transfer,
 * or the transfer for an interest row. Null when `tx` is neither, or its
 * partner is gone.
 *
 * A payment is written as two rows in one Dexie transaction, with the same
 * date to the millisecond, so that date, the paying account and the two notes
 * are what tie them - no column of their own, so nothing new to sync. A pair
 * whose loan was renamed afterwards no longer matches, and deleting one half
 * then leaves the other, as a transfer's fee is left today.
 *
 * @param {Record<string, any>} tx
 * @param {Array<Record<string, any>>} all
 * @returns {Record<string, any>|null}
 */
export function loanPairOf(tx, all) {
  if (!tx?.date) return null
  // A copy of the row counts as the row: a sheet is handed one.
  const other = (/** @type {Record<string, any>} */ r) => r !== tx && (tx.id == null || r.id !== tx.id)
  if (isLoanPayment(tx)) {
    return all.find(r => other(r) && interestLoanOf(r) === tx.toAccount
      && r.date === tx.date && r.account === tx.fromAccount) ?? null
  }
  const loan = interestLoanOf(tx)
  if (loan) {
    return all.find(r => other(r) && isLoanPayment(r) && r.toAccount === loan
      && r.date === tx.date && r.fromAccount === tx.account) ?? null
  }
  return null
}

/**
 * The part of a loan payment that goes to the loan: the transfer into it.
 * @param {Record<string, any>|null|undefined} tx
 */
export function isLoanPayment(tx) {
  return tx?.type === 'transfer' && !!tx.toAccount && tx.description === loanPaymentNote(tx.toAccount)
}

/**
 * The loan an interest row was paid on, or null when it is not one.
 * @param {Record<string, any>|null|undefined} tx
 * @returns {string|null}
 */
export function interestLoanOf(tx) {
  if (tx?.type !== 'expense' || tx.category !== LOAN_INTEREST || typeof tx.description !== 'string') return null
  const prefix = loanInterestNote('')
  return tx.description.startsWith(prefix) ? tx.description.slice(prefix.length) : null
}

/**
 * A list with each loan payment as the one row it was: you paid ₱12,850
 * once, and the list showed two rows - the interest in red, the rest as a
 * blue transfer that read like money you had only moved.
 *
 * The payment is still two rows underneath (see the note at the top), and
 * every total still reads those. This is only what a list draws: the
 * transfer stands for both, carrying its interest row as `loanInterest`,
 * in the transfer's place. A half whose partner is not in `txs` - filtered
 * out, or on another account's page - stays as it is, so a list of
 * expenses still shows the interest and a loan's own page the principal.
 *
 * Hand a row back to anything that reads or writes it through
 * unfoldLoanPayment: `loanInterest` is for drawing, not for storing.
 *
 * @template {Record<string, any>} T
 * @param {T[]} txs
 * @returns {Array<T & {loanInterest?: T}>}
 */
export function foldLoanPayments(txs) {
  /** @type {Map<string, T>} */
  const interest = new Map()
  for (const t of txs) {
    const loan = interestLoanOf(t)
    if (loan) interest.set(`${t.date}\u001f${t.account}\u001f${loan}`, t)
  }
  if (!interest.size) return txs
  const folded = new Set()
  /** @type {Array<T & {loanInterest?: T}>} */
  const out = []
  for (const t of txs) {
    const i = isLoanPayment(t) ? interest.get(`${t.date}\u001f${t.fromAccount}\u001f${t.toAccount}`) : null
    if (i && !folded.has(i)) {
      folded.add(i)
      out.push({ ...t, loanInterest: i })
    } else {
      out.push(t)
    }
  }
  return folded.size ? out.filter(t => !folded.has(t)) : out
}

/**
 * What a folded row carries on top of its own amount - the interest - so
 * the figure a list shows is the whole payment. 0 for any other row.
 *
 * @param {Record<string, any>|null|undefined} row
 */
export function interestCarried(row) {
  return row?.loanInterest ? Math.abs(Number(row.loanInterest.amount) || 0) : 0
}

/**
 * A row from foldLoanPayments as the transaction it stands for - the
 * transfer - for a sheet to open, or a delete to take (which takes its
 * interest with it: db/txHelpers.js expandDeletion).
 *
 * An installment plan's drawn row too (utils/installments: foldPlans,
 * spendingRows): the stored payment it stands for, without the `plan` it
 * was drawn with, so nothing drawn is ever written back.
 *
 * @template {Record<string, any>} T
 * @param {T & {loanInterest?: any}} row
 * @returns {T}
 */
export function unfoldLoanPayment(row) {
  if (row?.planOf || (row && 'plan' in row)) return storedRow(row)
  if (!row?.loanInterest) return row
  const tx = { ...row }
  delete tx.loanInterest
  return tx
}

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
 * How a payment made now splits - what the ledger writes and the pay sheet
 * previews, so the two cannot disagree.
 *
 *   - A month's interest once per installment: `interestDue` is false for a
 *     second payment before the next due date (matchInstallments), and all
 *     of that comes off what is owed.
 *   - Paying it off, whatever is over what is owed is the interest, never
 *     more than a month's. A lender's payoff figure is the balance plus the
 *     interest so far, which is rarely a whole month; charging the whole
 *     month anyway would leave a phantom balance on a loan that is done.
 *
 * @param {number} owed
 * @param {number} amount
 * @param {number} ratePct
 * @param {boolean} [interestDue]
 * @returns {{interest: number, principal: number}}
 */
export function splitLoanPayment(owed, amount, ratePct, interestDue = true) {
  const month = interestDue ? splitPayment(owed, amount, ratePct).interest : 0
  const interest = amount >= owed - 0.005 ? round2(Math.min(month, Math.max(0, amount - owed))) : month
  return { interest, principal: round2(Math.max(0, Math.min(amount - interest, Math.max(0, owed)))) }
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

/** Midnight at the start of `d`'s local day. @param {Date} d */
const dayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/**
 * Which installment the payments have reached, matched one to one.
 *
 * ── Why they are matched rather than "paid since the last due date" ──
 *
 * The first version counted any payment after the previous due date as
 * paying the next one. That cannot tell late from early: September's
 * installment paid on the 17th, two days late, read as October paid in
 * advance, so October was never asked for - on the page, in the forecast
 * or in a reminder. And an installment nobody paid simply vanished once its
 * date passed.
 *
 * So each payment pays the oldest installment still open, provided it came
 * after the due date before that one. A second payment in the same window
 * is money off what you owe, not next month paid early; a late one settles
 * the month it was late for.
 *
 * Where the matching starts is the one guess: the first installment is the
 * first due date on or after the first payment Spendr has seen. Before
 * that, it has no idea what was paid, and a loan added today must not open
 * with a year of missed payments.
 *
 * @param {number} day            due day of the month, 1-31
 * @param {Date[]} payments       money paid into the loan, dated up to `now`
 * @param {Date} now
 * @returns {{nextDue: Date, overdue: boolean, paidThisCycle: boolean, interestDue: boolean}}
 */
export function matchInstallments(day, payments, now) {
  const today = dayOf(now)
  const upcoming = dueAfter(day, new Date(today.getTime() - 1))
  const sorted = payments.map(dayOf).sort((a, b) => a.getTime() - b.getTime())
  let due = sorted.length ? dueAfter(day, new Date(sorted[0].getTime() - 1)) : upcoming
  for (const p of sorted) {
    const before = dueOn(due.getFullYear(), due.getMonth() - 1, day)
    if (p > before) due = dueOn(due.getFullYear(), due.getMonth() + 1, day)
  }
  const before = dueOn(due.getFullYear(), due.getMonth() - 1, day)
  return {
    nextDue: due,
    overdue: due < today,
    paidThisCycle: due > upcoming,
    /* Whether a payment made today would pay an installment - and so carry
       that month's interest - or is extra, which all comes off what is owed. */
    interestDue: today > before,
  }
}

/**
 * Everything the loan's page and the forecast need, from the account and the
 * ledger.
 *
 * `nextDue` is the oldest installment still open (matchInstallments): the
 * coming one normally, a month later once that is paid, and a past date when
 * one was missed - `overdue` says which.
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
  /** @type {Date[]} */
  const payments = []
  for (const t of transactions ?? []) {
    if (t?.type !== 'transfer') continue
    if (t.toAccount === name) {
      paidIn += Math.abs(t.toAmount ?? t.amount ?? 0)
      const d = new Date(t.date)
      if (!Number.isNaN(d.getTime()) && d <= now) payments.push(d)
    } else if (t.fromAccount === name) {
      paidIn -= Math.abs(t.amount ?? 0)
    }
  }
  paidIn = round2(Math.max(0, paidIn))

  let nextDue = null
  let paidThisCycle = false
  let overdue = false
  // With no due day there are no cycles to tell apart, so every payment carries interest.
  let interestDue = true
  if (day >= 1 && day <= 31) {
    ;({ nextDue, paidThisCycle, overdue, interestDue } = matchInstallments(day, payments, now))
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
    overdue,
    interestDue,
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
 * A missed installment comes first, once, marked overdue - the way a bill
 * that should have posted is - and the walk carries on from the next due
 * date ahead rather than listing every month that was missed.
 *
 * @param {Date} until
 * @returns {Array<{date: Date, amount: number, overdue: boolean}>}
 */
export function upcomingLoanPayments(account, transactions, now, until) {
  const s = loanStatus(account, transactions, now)
  if (!s.nextDue || !(s.payment > 0) || !(s.owed > 0.005)) return []
  const r = s.ratePct / 100
  const day = Number(account.dueDate)
  const out = []
  let owed = s.owed
  let d = s.nextDue
  const pay = () => {
    const amount = round2(Math.min(s.payment, owed * (1 + r)))
    owed = round2(owed * (1 + r) - amount)
    return amount
  }
  if (s.overdue) {
    out.push({ date: d, amount: pay(), overdue: true })
    d = dueAfter(day, new Date(dayOf(now).getTime() - 1))
  }
  for (let i = 0; i < 600 && owed > 0.005 && d <= until; i++) {
    out.push({ date: d, amount: pay(), overdue: false })
    d = dueOn(d.getFullYear(), d.getMonth() + 1, day)
  }
  return out
}
