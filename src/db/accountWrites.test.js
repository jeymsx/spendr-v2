import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Paying a loan: what payLoan writes.
 *
 * `db` is a small in-memory stand-in for the Dexie calls this module makes,
 * the way balances.test.js and txHelpers.test.js do it - not an emulator.
 * Balance effects are the real rule, reduced to the three shapes a payment
 * can take.
 *
 * @typedef {Record<string, any>} Row
 */

/** @type {{ accounts: Row[], transactions: Row[], categories: Row[] }} */
let store

const db = {
  /** @param {string} _mode @param {any} _tables @param {() => Promise<any>} fn */
  async transaction(_mode, _tables, fn) { return fn() },
  accounts: {
    /** @param {number} id */
    async get(id) { return store.accounts.find(a => a.id === id) },
  },
  transactions: {
    /** @param {string} field */
    where(field) {
      return { equals: (/** @type {any} */ v) => ({ async toArray() { return store.transactions.filter(t => t[field] === v) } }) }
    },
    /** @param {Row} row */
    async add(row) { store.transactions.push({ id: store.transactions.length + 1, ...row }); return store.transactions.length },
  },
  categories: {
    /** @param {string} field */
    where(field) {
      return { equals: (/** @type {any} */ v) => ({ async first() { return store.categories.find(c => c[field] === v) } }) }
    },
    /** @param {Row} row */
    async add(row) { store.categories.push(row) },
  },
}

vi.mock('./db', () => ({ default: db, UNSYNCED: 0 }))
vi.mock('./balances', () => ({
  /** @param {Row} t */
  async applyBalanceEffect(t) {
    const acct = (/** @type {string} */ name) => store.accounts.find(a => a.name === name)
    if (t.type === 'transfer') { acct(t.fromAccount).balance -= t.amount; acct(t.toAccount).balance += t.amount }
    else if (t.type === 'expense') acct(t.account).balance -= t.amount
    else if (t.type === 'inflow') acct(t.account).balance += t.amount
  },
}))

const { payLoan } = await import('./accountWrites')

const LOAN = { id: 7, name: 'Car Loan', type: 'loan', balance: -96000, minimumPayment: 5000, interestRate: 1, dueDate: 15 }
const at = (/** @type {number} */ m, /** @type {number} */ d) => new Date(2026, m - 1, d, 12).toISOString()
const loan = () => store.accounts.find(a => a.name === 'Car Loan')
const bpi = () => store.accounts.find(a => a.name === 'BPI')
const interestRows = () => store.transactions.filter(t => t.category === 'Loan interest')

beforeEach(() => {
  store = {
    accounts: [{ ...LOAN }, { id: 1, name: 'BPI', type: 'bank', balance: 200000 }],
    // September's installment, paid on the 10th.
    transactions: [{ id: 1, type: 'transfer', amount: 4000, fromAccount: 'BPI', toAccount: 'Car Loan', date: at(9, 10) }],
    categories: [],
  }
})

describe('payLoan', () => {
  it('splits an installment into principal and a month of interest', async () => {
    const r = await payLoan({ loan: LOAN, from: 'BPI', amount: 5000, dateIso: at(9, 20) })
    expect(r).toEqual({ principal: 4040, interest: 960 })
    expect(loan().balance).toBe(-91960)
    expect(bpi().balance).toBe(195000)
    expect(store.categories.map(c => c.name)).toEqual(['Loan interest'])
  })

  /* Found in review: the lender's payoff figure, paid five days after an
     installment, was booked with a full month of interest and left ₱960 owed
     on a loan that was done. */
  it('clears the loan when paid off, charging only what is over the balance', async () => {
    await payLoan({ loan: LOAN, from: 'BPI', amount: 96160, dateIso: at(9, 20) })
    expect(loan().balance).toBe(0)
    expect(interestRows().map(t => t.amount)).toEqual([160])
  })

  it('charges no interest on a second payment before the next due date', async () => {
    await payLoan({ loan: LOAN, from: 'BPI', amount: 5000, dateIso: at(9, 20) })
    await payLoan({ loan: { ...loan() }, from: 'BPI', amount: 3000, dateIso: at(9, 25) })
    expect(interestRows()).toHaveLength(1)
    expect(loan().balance).toBe(-88960)
  })

  it('writes both halves with the same date, so they delete together', async () => {
    await payLoan({ loan: LOAN, from: 'BPI', amount: 5000, dateIso: at(9, 20) })
    const [principal, interest] = store.transactions.slice(-2)
    expect(principal).toMatchObject({ type: 'transfer', toAccount: 'Car Loan', description: 'Loan payment · Car Loan' })
    expect(interest).toMatchObject({ type: 'expense', account: 'BPI', description: 'Interest · Car Loan' })
    expect(principal.date).toBe(interest.date)
  })
})
