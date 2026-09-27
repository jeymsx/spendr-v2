import db, { UNSYNCED } from './db'
import { applyBalanceEffect } from './balances'
import { valueRow } from '../lib/investments'
import { getFxContext, stampTxCurrency } from '../lib/fxContext'
import { LOAN_INTEREST, loanInterestNote, loanPaymentNote, loanStatus, splitLoanPayment } from '../lib/loans'

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
