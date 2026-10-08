import db, { UNSYNCED } from './db'
import { applyBalanceEffect } from './balances'
import { valueRow } from '../lib/investments'
import { getFxContext, stampTxCurrency } from '../lib/fxContext'
import { LOAN_INTEREST, loanInterestNote, loanPaymentNote, loanStatus, splitLoanPayment } from '../lib/loans'
import { CORRECTION_DESC } from '../lib/flows'
import { roundMoney } from '../lib/currency'
import { FINANCE_CHARGE_CATEGORY, financeChargeCategory, financeChargeRow } from '../lib/financeCharge'

/**
 * The writes an investment and a loan need, each one all-or-nothing.
 *
 * Both compose ordinary rows rather than inventing a kind of their own - see
 * lib/flows.js for why - so every balance, trend, sync and trash path already
 * knows what to do with what they write.
 */

/**
 * Record what an investment is worth now.
 *
 * Writes the difference as a value row (an inflow when it rose, an expense
 * when it fell, never income or spending) and stamps the day it was
 * confirmed - even when the figure had not moved, since "I checked and it is
 * the same" is what makes the next reading trustworthy.
 *
 * @param {Record<string, any>} account  the investment account, as stored
 * @param {number} value                 what it is worth
 * @param {string} dateIso               when it was worth that
 * @returns {Promise<{delta: number}>}
 */
export async function recordValue(account, value, dateIso) {
  if (!account?.id) throw new Error('Which investment is this?')
  if (!Number.isFinite(value) || value < 0) throw new Error('A value cannot be below zero.')
  let delta = 0
  await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
    // Read inside the transaction, so a value typed against a stale balance
    // still lands on the right total.
    const fresh = await db.accounts.get(account.id)
    if (!fresh) throw new Error('That investment no longer exists.')
    const nowIso = new Date().toISOString()
    const row = valueRow({ account: fresh.name, current: fresh.balance ?? 0, value, dateIso })
    if (row) {
      delta = row.type === 'inflow' ? row.amount : -row.amount
      await db.transactions.add({
        ...row,
        txId: crypto.randomUUID(),
        synced: UNSYNCED,
        updatedAt: nowIso,
      })
      await applyBalanceEffect(/** @type {any} */ (row))
    }
    /* The later of the two, so backdating a figure to last month's statement
       does not make a value confirmed yesterday look older than it is. */
    const prev = fresh.valuedAt ? Date.parse(fresh.valuedAt) : NaN
    const at = Date.parse(dateIso)
    const valuedAt = Number.isFinite(prev) && prev > at ? fresh.valuedAt : dateIso
    await db.accounts.update(fresh.id, { valuedAt, updatedAt: nowIso })
  })
  return { delta }
}

/**
 * Add an investment account, with the value it has today.
 *
 * The opening value is written as a value row dated now, rather than set as
 * a starting balance. A starting balance has no date, so the net-worth line
 * would draw it as money you had always had; a dated row puts the step on
 * the day you added it.
 *
 * @param {Record<string, any>} row   from buildAccountRow
 * @param {number} value
 */
export async function createInvestment(row, value) {
  const nowIso = new Date().toISOString()
  await db.transaction('rw', [db.accounts, db.balances, db.transactions], async () => {
    const id = await db.accounts.add(/** @type {any} */ ({ ...row, balance: 0, valuedAt: value > 0 ? nowIso : null }))
    await db.balances.put({ account: row.name, balance: 0 })
    const vr = valueRow({ account: row.name, current: 0, value: Number(value) || 0, dateIso: nowIso })
    if (vr) {
      /* Priced here rather than by the creating hook: the hook's picture of
         which account holds which currency is refreshed after this commits,
         so it would take a US$ fund's opening value for pesos. */
      const fx = getFxContext()
      const known = new Map(fx.byAccount)
      known.set(row.name, String(row.currency || fx.base).toUpperCase())
      const priced = stampTxCurrency({ ...vr }, { ...fx, byAccount: known })
      await db.transactions.add({ ...priced, txId: crypto.randomUUID(), synced: UNSYNCED, updatedAt: nowIso })
      await applyBalanceEffect(/** @type {any} */ (vr))
    }
    return id
  })
}

/**
 * Pay a loan: the principal as a transfer into it, the interest as an
 * expense from the account paying - both or neither.
 *
 * The split comes from what is owed now and the loan's monthly rate. Only
 * the interest is spending; the principal moves your money into paying
 * down what you owe, which leaves net worth where it was.
 *
 * @param {object} input
 * @param {Record<string, any>} input.loan   the loan account
 * @param {string} input.from                the account paying
 * @param {number} input.amount              the whole payment
 * @param {string} input.dateIso
 * @returns {Promise<{principal: number, interest: number}>}
 */
export async function payLoan({ loan, from, amount, dateIso }) {
  if (!loan?.id) throw new Error('Which loan is this?')
  if (!from) throw new Error('Pay from which account?')
  if (!(amount > 0)) throw new Error('A payment needs an amount.')
  let result = { principal: 0, interest: 0 }
  await db.transaction('rw', [db.transactions, db.accounts, db.balances, db.categories], async () => {
    const fresh = await db.accounts.get(loan.id)
    if (!fresh) throw new Error('That loan no longer exists.')
    const owed = Math.max(0, -(fresh.balance ?? 0))
    /* Interest once per installment, and a payoff never leaves a phantom
       balance - see splitLoanPayment. Whether this payment pays an
       installment turns on the payments already in (matchInstallments). */
    const paidInto = await db.transactions.where('toAccount').equals(fresh.name).toArray()
    const { interestDue } = loanStatus(fresh, paidInto, new Date(dateIso))
    const { interest, principal } = splitLoanPayment(owed, amount, fresh.interestRate, interestDue)
    // Anything past what is owed and its interest still goes to the loan -
    // an overpayment is money the lender holds for you.
    const toLoan = Math.round((amount - interest) * 100) / 100
    const nowIso = new Date().toISOString()
    if (toLoan > 0.005) {
      const t = {
        type: 'transfer', amount: toLoan, fromAccount: from, toAccount: fresh.name,
        description: loanPaymentNote(fresh.name),
      }
      await db.transactions.add({ ...t, txId: crypto.randomUUID(), date: dateIso, synced: UNSYNCED, updatedAt: nowIso })
      await applyBalanceEffect(/** @type {any} */ (t))
    }
    if (interest > 0.005) {
      const existing = await db.categories.where('name').equals(LOAN_INTEREST).first()
      if (!existing) {
        await db.categories.add({ name: LOAN_INTEREST, icon: '🏦', color: '#f97316', type: 'expense', budget: 0 })
      }
      const e = {
        type: 'expense', amount: interest, account: from, category: LOAN_INTEREST,
        description: loanInterestNote(fresh.name),
      }
      await db.transactions.add({ ...e, txId: crypto.randomUUID(), date: dateIso, synced: UNSYNCED, updatedAt: nowIso })
      await applyBalanceEffect(/** @type {any} */ (e))
    }
    result = { principal: Math.min(principal, toLoan), interest }
  })
  return result
}

/**
 * What it takes to make a card owe `want`, as a signed amount: positive when
 * the card has to owe more, negative when it has to owe less, 0 for nothing to
 * write.
 *
 * Measured against what the card SHOWS - its current balance, never below
 * zero - so opening a card that has been overpaid (it owes you a credit, which
 * reads as 0 owed) and saving without touching the field does not write a
 * correction. When there is something to write it is measured against the
 * signed balance, so the card lands on exactly `want` owed and the credit it
 * was holding is not left on top of it.
 *
 * @param {object} input
 * @param {number} input.want                   what the card should owe
 * @param {{signedBalance?: number}|null} [input.status]   getCreditStatus; none for a card with no history
 * @param {string} [input.currency]
 * @returns {number}
 */
export function cardOwedChange({ want, status = null, currency }) {
  const signed = Number(status?.signedBalance) || 0
  const target = Math.max(0, Number(want) || 0)
  if (roundMoney(target - Math.max(0, signed), currency) === 0) return 0
  return roundMoney(target - signed, currency)
}

/**
 * The row that puts what a card owes on the books: a correction, the way a
 * balance typed over on any other account is.
 *
 * A card's balance is not stored for it to be set - it is its charges against
 * its payments (utils/creditCycle.js) - so the only honest way to say "it owes
 * 12,000 already" is a movement that explains it. Owing more is an expense on
 * the card; owing less is an inflow (a payment would be a transfer, and this
 * is not money that moved). `adjust: 'correction'` keeps both out of spending
 * and income (lib/flows.js) while the card and net worth still pick them up.
 *
 * @param {object} input
 * @param {string} input.accountName
 * @param {number} input.change      signed: positive owes more, negative owes less
 * @param {string} [input.currency]
 * @param {string} [input.nowIso]
 * @returns {Record<string, any>|null}  null when there is nothing to write
 */
export function cardOwedRow({ accountName, change, currency, nowIso = new Date().toISOString() }) {
  const amount = roundMoney(Math.abs(Number(change) || 0), currency)
  if (!(amount > 0)) return null
  const owes = change > 0
  return {
    txId:        crypto.randomUUID(),
    type:        owes ? 'expense' : 'inflow',
    date:        nowIso,
    description: CORRECTION_DESC,
    category:    owes ? 'Others' : 'Income',
    account:     accountName,
    amount,
    adjust:      'correction',
    synced:      UNSYNCED,
    updatedAt:   nowIso,
  }
}

/**
 * Write a card's owed-amount correction, and move its stored balance with it
 * like any other charge on a card does.
 *
 * Call it inside a transaction that already has the card's tables, or on its
 * own - it opens one either way.
 *
 * @param {string} accountName
 * @param {number} change         signed - see cardOwedRow
 * @param {string} [currency]
 * @returns {Promise<Record<string, any>|null>}  the row, or null when there was nothing to write
 */
export async function recordCardOwed(accountName, change, currency) {
  const row = cardOwedRow({ accountName, change, currency })
  if (!row) return null
  await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
    await db.transactions.add(/** @type {any} */ (row))
    await applyBalanceEffect(/** @type {any} */ (row))
  })
  return row
}

/**
 * Add a credit card, with what it already owes.
 *
 * The card and its first correction land together or not at all: a card that
 * saved without its debt would read as fully available, and the error that
 * told you so would be about an account that was in fact made.
 *
 * @param {Record<string, any>} row   from buildAccountRow
 * @param {number} [owed]             what the card owes today; 0 or nothing for a new one
 */
export async function createCard(row, owed = 0) {
  await db.transaction('rw', [db.accounts, db.balances, db.transactions], async () => {
    await db.accounts.add(/** @type {any} */ ({ ...row, balance: 0 }))
    await db.balances.put({ account: row.name, balance: 0 })
    await recordCardOwed(row.name, Math.max(0, Number(owed) || 0), row.currency)
  })
}

/**
 * Follow an account's rename through the ledger: every transaction that names
 * it, as the account or either end of a transfer.
 *
 * Each row is stamped as changed. Transactions carry no updating hook - they
 * are identified by txId rather than syncId, and only the synced tables get
 * one (db/db.js) - so a bare `{ account: newName }` update left the row marked
 * as already pushed, and the rename never reached another device: they kept
 * the old name on every transaction and the account's history split in two.
 *
 * Run it inside the caller's transaction, after the account itself is renamed.
 *
 * @param {string} oldName
 * @param {string} newName
 * @param {string} [nowIso]
 */
export async function renameAccountInTransactions(oldName, newName, nowIso = new Date().toISOString()) {
  for (const field of ['account', 'fromAccount', 'toAccount']) {
    const rows = await db.transactions.where(field).equals(oldName).toArray()
    for (const tx of rows) {
      await db.transactions.update(tx.id, { [field]: newName, synced: UNSYNCED, updatedAt: nowIso })
    }
  }
}

/**
 * Post a card's finance charge: an expense on the card, filed under Fees &
 * Charges - which is created first when this ledger does not have it, the way
 * a transfer fee creates its own category, so the row never lands on a name
 * that nothing lists.
 *
 * @param {object} input
 * @param {string} input.accountName
 * @param {number} input.amount
 * @param {string} [input.description]
 * @param {Date} [input.now]
 * @returns {Promise<Record<string, any>>}  the row as written
 */
export async function postFinanceCharge({ accountName, amount, description, now = new Date() }) {
  if (!accountName) throw new Error('Which card is this?')
  if (!(amount > 0)) throw new Error('A charge needs an amount.')
  const row = financeChargeRow({ accountName, amount, description, now })
  await db.transaction('rw', [db.transactions, db.accounts, db.balances, db.categories], async () => {
    if (!(await db.categories.where('name').equals(FINANCE_CHARGE_CATEGORY).first())) {
      await db.categories.add(/** @type {any} */ (financeChargeCategory()))
    }
    await db.transactions.add(/** @type {any} */ ({ ...row, txId: crypto.randomUUID(), synced: UNSYNCED }))
    await applyBalanceEffect(/** @type {any} */ (row))
  })
  return row
}
