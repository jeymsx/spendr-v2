/**
 * What a card is about to charge you for paying late.
 *
 * ── Why this ESTIMATES and does not decide ──
 *
 * A finance charge is not a number this app is entitled to invent. It is a
 * real line the bank posts to your card, and every issuer computes it
 * differently - most on average daily balance, some on the closing balance,
 * some from the transaction date of each charge rather than from the due date.
 * Any formula written here would be a guess dressed up as arithmetic.
 *
 * So the app estimates, says it is estimating, and writes the figure only when
 * you tell it to - at which point you can correct it to whatever your
 * statement actually says. What gets written is an ordinary expense on the
 * card, which is exactly what the bank does, and which means the balance, the
 * available credit and the category breakdown all pick it up with no new
 * machinery anywhere.
 *
 * ── The two parts ──
 *
 * Interest is a monthly rate on what is still owed. A late fee is a flat
 * amount, charged once for missing the date, and in the Philippines it is
 * usually the smaller of a fixed fee and the minimum due - a ₱500 late fee on
 * a ₱300 minimum is not a thing any issuer does.
 */

/** Categories a posted charge is filed under, so Insights can separate them. */
export const FINANCE_CHARGE_CATEGORY = 'Bank charges'

/**
 * @param {object} input
 * @param {Partial<Account>} input.account
 * @param {number} input.outstanding  what the closed statement still wants
 * @param {number} input.minimumDue
 * @param {number|null} input.daysLate  negative or null means not late yet
 * @returns {{interest: number, lateFee: number, total: number, isLate: boolean, canEstimate: boolean}}
 */
export function estimateFinanceCharge({ account, outstanding, minimumDue, daysLate }) {
  const isLate = (daysLate ?? 0) > 0 && outstanding > 0

  const rate = Number(account?.interestRate ?? 0)
  const fee  = Number(account?.lateFee ?? 0)

  // Nothing configured on the card: the app has no basis for a figure and
  // says so rather than showing a confident zero.
  const canEstimate = rate > 0 || fee > 0

  if (!isLate || !canEstimate) {
    return { interest: 0, lateFee: 0, total: 0, isLate, canEstimate }
  }

  // A monthly rate, applied once. Not compounded across however many months
  // the statement has been sitting: each month's charge is a separate line the
  // bank posts, and this offers to write one of them.
  const interest = round2(outstanding * (rate / 100))
  // Never more than the minimum it is punishing you for missing.
  const lateFee = minimumDue > 0 ? round2(Math.min(fee, minimumDue)) : round2(fee)

  return { interest, lateFee, total: round2(interest + lateFee), isLate, canEstimate }
}

/** @param {number} n */
function round2(n) {
  return Math.round(n * 100) / 100
}

/**
 * The transaction a posted finance charge becomes.
 *
 * An ordinary expense on the card, because that is what it is. Dated now
 * rather than back-dated to the due date: the bank posts it when it posts it,
 * and back-dating would drop it into a statement that has already closed.
 *
 * @param {object} input
 * @param {string} input.accountName
 * @param {number} input.amount
 * @param {string} [input.description]
 * @param {Date} [input.now]
 * @returns {Partial<Transaction>}
 */
export function financeChargeRow({ accountName, amount, description, now = new Date() }) {
  const iso = now.toISOString()
  return {
    type:        'expense',
    amount:      round2(amount),
    description: description || 'Finance charge',
    category:    FINANCE_CHARGE_CATEGORY,
    account:     accountName,
    date:        iso,
    updatedAt:   iso,
  }
}

/**
 * Has a finance charge already been logged for this statement?
 *
 * Without this the offer never goes away, and worse, it compounds: logging a
 * charge raises the outstanding balance, which keeps the statement late and
 * makes the NEXT estimate larger than the last. Tapping the button four times
 * writes four charges, each bigger than the one before.
 *
 * A bank posts one finance charge per cycle, so one logged after this
 * statement's due date is the whole of it. Matched on the category rather
 * than a flag on the row: a charge you later edited or renamed still counts,
 * and a charge you deleted correctly brings the offer back.
 *
 * @param {object} input
 * @param {Array<Partial<Transaction>>} [input.transactions]
 * @param {string} input.accountName
 * @param {Date|null} input.since  the statement's due date
 * @returns {boolean}
 */
export function financeChargeLogged({ transactions = [], accountName, since }) {
  if (!since) return false
  const from = since.getTime()
  return transactions.some(t =>
    t.type === 'expense'
    && t.account === accountName
    && t.category === FINANCE_CHARGE_CATEGORY
    && new Date(t.date ?? 0).getTime() >= from)
}
