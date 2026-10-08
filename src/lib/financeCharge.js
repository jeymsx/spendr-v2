import { EXPENSE_PRESETS } from './phCategories'

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

/**
 * What a posted charge is filed under, so Insights can separate it.
 *
 * It was 'Bank charges', which no list in the app ever offered and nothing
 * created: the row got a grey fallback tile, could not be budgeted, and sat
 * outside every picker. "Fees & Charges" is a preset people already have, and
 * postFinanceCharge (db/accountWrites.js) creates it for anyone who does not.
 */
export const FINANCE_CHARGE_CATEGORY = 'Fees & Charges'

/** What charges were filed under before - still read, never written. */
export const LEGACY_FINANCE_CHARGE_CATEGORY = 'Bank charges'

/** What a charge is called when nobody says otherwise. */
export const FINANCE_CHARGE_DESCRIPTION = 'Finance charge'

/**
 * The category row to create when a user does not have FINANCE_CHARGE_CATEGORY:
 * the preset's own icon and colour, with no budget.
 */
export function financeChargeCategory() {
  const preset = EXPENSE_PRESETS.find(p => p.name === FINANCE_CHARGE_CATEGORY)
  return {
    name: FINANCE_CHARGE_CATEGORY,
    icon: preset?.icon ?? '⚠️',
    color: preset?.color ?? '#FF6B6B',
    type: 'expense',
    budget: 0,
  }
}

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
    description: description || FINANCE_CHARGE_DESCRIPTION,
    category:    FINANCE_CHARGE_CATEGORY,
    /* What makes it a finance charge, kept apart from the category: the
       category is the user's to change - re-filing a charge under Bills is an
       ordinary thing to do - and used to be the only thing the "already
       logged" check looked at, so re-filing it brought the offer back. */
    financeCharge: true,
    account:     accountName,
    date:        iso,
    updatedAt:   iso,
  }
}

/**
 * Is this row a finance charge the app wrote?
 *
 * The marker is the answer on the device that wrote it. Two things carry it
 * where the marker cannot:
 *
 *   rows from before the marker, which were all filed under 'Bank charges';
 *   the other devices, which get the row without the field - transactions sync
 *   a fixed set of columns - and recognise it by the description the app gave
 *   it, which survives a re-filing.
 *
 * Neither is the category the charge is filed under NOW - that is the
 * user's - and "Fees & Charges" in particular is where annual fees go too.
 *
 * @param {Partial<Transaction>|null|undefined} t
 */
export function isFinanceCharge(t) {
  if (!t || t.type !== 'expense') return false
  if (/** @type {any} */ (t).financeCharge) return true
  if (t.category === LEGACY_FINANCE_CHARGE_CATEGORY) return true
  return String(t.description ?? '').trim().toLowerCase() === FINANCE_CHARGE_DESCRIPTION.toLowerCase()
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
 * statement's due date is the whole of it. Recognised by isFinanceCharge, not
 * by the category it is filed under: a charge you re-filed or edited still
 * counts, and a charge you deleted correctly brings the offer back.
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
    isFinanceCharge(t)
    && t.account === accountName
    && new Date(t.date ?? 0).getTime() >= from)
}
