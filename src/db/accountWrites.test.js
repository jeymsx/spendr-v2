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

/** @type {{ accounts: Row[], transactions: Row[], categories: Row[], balances: Row[] }} */
let store

const db = {
  /** @param {string} _mode @param {any} _tables @param {() => Promise<any>} fn */
  async transaction(_mode, _tables, fn) { return fn() },
  accounts: {
    /** @param {number} id */
    async get(id) { return store.accounts.find(a => a.id === id) },
    /** @param {Row} row */
    async add(row) { store.accounts.push({ id: store.accounts.length + 1, ...row }); return store.accounts.length },
  },
  balances: {
    /** @param {Row} row */
    async put(row) { store.balances = store.balances.filter(b => b.account !== row.account).concat(row) },
  },
  transactions: {
    /** @param {number} id @param {Row} patch */
    async update(id, patch) { Object.assign(store.transactions.find(t => t.id === id), patch) },
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
  // No rows name a new card in these tests, so it opens with what it is given.
  async openingFor(/** @type {string} */ _name, /** @type {number} */ balance) { return balance },
}))

const {
  payLoan, cardOwedChange, cardOwedRow, recordCardOwed, createCard,
  renameAccountInTransactions, postFinanceCharge,
} = await import('./accountWrites')

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
    balances: [],
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

/**
 * What a card already owes, written as the card's first entry. A card's
 * balance is its charges against its payments, so it cannot be typed in -
 * setup always wrote a correction for it, and the rest of the app now does
 * the same through these.
 */
describe('cardOwedChange', () => {
  it('is what the card has to be moved by to owe the amount', () => {
    expect(cardOwedChange({ want: 12000, status: { signedBalance: 5000 } })).toBe(7000)
    expect(cardOwedChange({ want: 2000, status: { signedBalance: 5000 } })).toBe(-3000)
  })

  it('is the whole amount for a card with no history', () => {
    expect(cardOwedChange({ want: 8500, status: null })).toBe(8500)
    expect(cardOwedChange({ want: 8500 })).toBe(8500)
  })

  it('is nothing when the amount is what the card already shows', () => {
    expect(cardOwedChange({ want: 5000, status: { signedBalance: 5000 } })).toBe(0)
    expect(cardOwedChange({ want: 0, status: null })).toBe(0)
  })

  /** Stored figures carry float noise; saving an untouched form must not write a correction for it. */
  it('ignores noise below the centavo', () => {
    expect(cardOwedChange({ want: 5000, status: { signedBalance: 5000.0000001 } })).toBe(0)
  })

  /**
   * An overpaid card reads as 0 owed while holding a credit. Saving it
   * untouched writes nothing; asking it to owe something lands it on exactly
   * that, with the credit taken into account.
   */
  it('leaves an overpaid card alone until it is asked to owe something', () => {
    expect(cardOwedChange({ want: 0, status: { signedBalance: -300 } })).toBe(0)
    expect(cardOwedChange({ want: 500, status: { signedBalance: -300 } })).toBe(800)
  })

  it('never makes a card owe less than nothing, and shrugs off junk', () => {
    expect(cardOwedChange({ want: -50, status: { signedBalance: 100 } })).toBe(-100)
    expect(cardOwedChange({ want: NaN, status: null })).toBe(0)
  })
})

describe('cardOwedRow', () => {
  const nowIso = at(9, 28)

  it('owing more is an expense on the card, filed under Others, that is not spending', () => {
    const r = cardOwedRow({ accountName: 'Visa', change: 12000, nowIso })
    expect(r).toMatchObject({
      type: 'expense', account: 'Visa', amount: 12000, category: 'Others',
      description: 'Balance adjustment', adjust: 'correction', date: nowIso, synced: 0,
    })
    expect(typeof r?.txId).toBe('string')
  })

  it('owing less is an inflow on the card, filed under Income, that is not income', () => {
    expect(cardOwedRow({ accountName: 'Visa', change: -3000, nowIso }))
      .toMatchObject({ type: 'inflow', amount: 3000, category: 'Income', adjust: 'correction' })
  })

  it('writes nothing for no change', () => {
    expect(cardOwedRow({ accountName: 'Visa', change: 0 })).toBeNull()
    expect(cardOwedRow({ accountName: 'Visa', change: NaN })).toBeNull()
  })

  it('rounds to the currency', () => {
    expect(cardOwedRow({ accountName: 'Visa', change: 100.005, nowIso })?.amount).toBe(100.01)
    expect(cardOwedRow({ accountName: 'Visa', change: 100.4, currency: 'JPY', nowIso })?.amount).toBe(100)
  })
})

describe('recordCardOwed and createCard', () => {
  const VISA = { id: 9, name: 'Visa', type: 'credit', balance: 0, currency: 'PHP' }

  it('writes the correction and moves the stored balance like any charge on the card', async () => {
    store.accounts.push({ ...VISA })
    const row = await recordCardOwed('Visa', 12000)
    expect(store.transactions.at(-1)).toMatchObject({ txId: row?.txId, type: 'expense', amount: 12000, adjust: 'correction' })
    expect(store.accounts.find(a => a.name === 'Visa')?.balance).toBe(-12000)
  })

  it('writes nothing for a zero change', async () => {
    store.accounts.push({ ...VISA })
    expect(await recordCardOwed('Visa', 0)).toBeNull()
    expect(store.transactions).toHaveLength(1)
  })

  it('adds a card together with what it owes', async () => {
    await createCard({ name: 'Visa', type: 'credit', currency: 'PHP' }, 8500)
    const card = store.accounts.find(a => a.name === 'Visa')
    expect(card?.balance).toBe(-8500)
    expect(store.balances).toEqual([{ account: 'Visa', balance: 0 }])
    expect(store.transactions.at(-1)).toMatchObject({ account: 'Visa', type: 'expense', amount: 8500, adjust: 'correction' })
  })

  it('adds a new card with no row at all when it owes nothing', async () => {
    await createCard({ name: 'Visa', type: 'credit', currency: 'PHP' })
    await createCard({ name: 'Amex', type: 'credit', currency: 'PHP' }, 0)
    expect(store.accounts.map(a => a.name)).toEqual(['Car Loan', 'BPI', 'Visa', 'Amex'])
    expect(store.transactions).toHaveLength(1)   // only the loan payment the suite starts with
  })
})

/**
 * Transactions have no updating hook, so a rename that only changed the name
 * left the rows marked as already synced: no other device ever heard of it.
 */
describe('renameAccountInTransactions', () => {
  it('renames every place a transaction names the account, and marks each row to sync', async () => {
    store.transactions = [
      { id: 1, type: 'expense', account: 'BPI', amount: 1, synced: 1, updatedAt: 'old' },
      { id: 2, type: 'transfer', fromAccount: 'BPI', toAccount: 'Cash', amount: 1, synced: 1, updatedAt: 'old' },
      { id: 3, type: 'transfer', fromAccount: 'Cash', toAccount: 'BPI', amount: 1, synced: 1, updatedAt: 'old' },
      { id: 4, type: 'expense', account: 'Cash', amount: 1, synced: 1, updatedAt: 'old' },
    ]
    await renameAccountInTransactions('BPI', 'BPI Payroll', '2026-10-08T01:00:00.000Z')
    const [a, b, c, d] = store.transactions
    expect(a).toMatchObject({ account: 'BPI Payroll', synced: 0, updatedAt: '2026-10-08T01:00:00.000Z' })
    expect(b).toMatchObject({ fromAccount: 'BPI Payroll', toAccount: 'Cash', synced: 0, updatedAt: '2026-10-08T01:00:00.000Z' })
    expect(c).toMatchObject({ fromAccount: 'Cash', toAccount: 'BPI Payroll', synced: 0, updatedAt: '2026-10-08T01:00:00.000Z' })
    // Untouched: nothing to push.
    expect(d).toMatchObject({ account: 'Cash', synced: 1, updatedAt: 'old' })
  })
})

describe('postFinanceCharge', () => {
  const VISA = { id: 9, name: 'Visa', type: 'credit', balance: 0, currency: 'PHP' }

  it('files the charge under Fees & Charges, creating the category when the ledger has none', async () => {
    store.accounts.push({ ...VISA })
    const row = await postFinanceCharge({ accountName: 'Visa', amount: 635 })
    expect(row).toMatchObject({ type: 'expense', category: 'Fees & Charges', account: 'Visa', amount: 635, financeCharge: true })
    expect(store.categories).toHaveLength(1)
    expect(store.categories[0]).toMatchObject({ name: 'Fees & Charges', type: 'expense', budget: 0 })
    expect(store.transactions.at(-1)).toMatchObject({ category: 'Fees & Charges', synced: 0 })
    expect(typeof store.transactions.at(-1)?.txId).toBe('string')
    expect(store.accounts.find(a => a.name === 'Visa')?.balance).toBe(-635)
  })

  it('uses the category the ledger already has', async () => {
    store.accounts.push({ ...VISA })
    store.categories.push({ name: 'Fees & Charges', icon: 'x', color: '#000', type: 'expense', budget: 500 })
    await postFinanceCharge({ accountName: 'Visa', amount: 100 })
    expect(store.categories).toHaveLength(1)
    expect(store.categories[0].budget).toBe(500)
  })

  it('refuses an empty charge', async () => {
    await expect(postFinanceCharge({ accountName: 'Visa', amount: 0 })).rejects.toThrow()
    await expect(postFinanceCharge({ accountName: '', amount: 5 })).rejects.toThrow()
  })
})
