import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * What an import does to the balances.
 *
 * It rebuilt every account from scratch, replaying every transaction in the
 * database from opening balances the wizard had pre-filled with the CURRENT
 * balances - so existing transactions counted twice, an account the file did
 * not name restarted from zero, and a payment into a credit card went in with
 * the sign flipped. The fix is that a new row moves the accounts it names, once,
 * by the arithmetic the transaction forms use, and nothing else moves.
 *
 * `db` is a small in-memory stand-in for the Dexie calls the importer and
 * db/balances.js make, with a transaction that rolls back when it throws -
 * the same kind of stand-in balances.test.js and txHelpers.test.js use.
 *
 * @typedef {Record<string, any>} Row
 */

/** @type {Record<string, Row[]>} */
let store
let nextId = 1
/** Makes the next bulkAdd throw, to see what a failed write leaves behind. */
let failBulkAdd = false

/** @param {string} name */
function table(name) {
  return {
    async toArray() { return store[name].map(r => ({ ...r })) },
    /** @param {Row} row */
    async add(row) {
      const id = nextId++
      store[name].push({ ...row, id })
      return id
    },
    /** @param {Row[]} rows */
    async bulkAdd(rows) {
      if (failBulkAdd) throw new Error('disk full')
      for (const r of rows) store[name].push({ ...r, id: nextId++ })
    },
    /** @param {number} id @param {Row} patch */
    async update(id, patch) {
      const row = store[name].find(r => r.id === id)
      if (row) Object.assign(row, patch)
      return row ? 1 : 0
    },
    /** @param {Row} row  keyed by `account` or `key`, as the real tables are */
    async put(row) {
      const k = 'account' in row ? 'account' : 'key'
      store[name] = store[name].filter(r => r[k] !== row[k])
      store[name].push({ ...row })
    },
    /** @param {string} key */
    async delete(key) { store[name] = store[name].filter(r => r.key !== key) },
    /** @param {string} field */
    where(field) {
      return {
        /** @param {any} value */
        equals(value) {
          return {
            async first() { return store[name].find(r => r[field] === value) },
            async toArray() { return store[name].filter(r => r[field] === value).map(r => ({ ...r })) },
          }
        },
      }
    },
  }
}

const db = {
  transactions: table('transactions'),
  accounts: table('accounts'),
  categories: table('categories'),
  balances: table('balances'),
  meta: table('meta'),
  /** All or nothing, as Dexie's is: a throw puts everything back. */
  async transaction(/** @type {string} */ _mode, /** @type {any} */ _tables, /** @type {() => Promise<any>} */ fn) {
    const before = structuredClone(store)
    try {
      return await fn()
    } catch (e) {
      store = before
      throw e
    }
  },
}

vi.mock('../../db/db', () => ({ default: db, UNSYNCED: 0 }))
// A flag name and nothing else: the real module reaches a good deal of the app.
vi.mock('../../lib/achievements', () => ({ PRIMED_META: 'achievementsPrimedFor' }))

const { runImport, planImport, recordOf } = await import('./runImport')
const { parseCSV } = await import('./csv')
const { stripInvisible } = await import('./shared')
const { transactionsToCsv } = await import('./export')

/** @param {string} name */
const bal = (name) => store.accounts.find(a => a.name === name)?.balance
/** @param {string} name */
const mirror = (name) => store.balances.find(b => b.account === name)?.balance

/** A parsed file row, as csv.js hands it to the importer. @param {Row} r */
const row = (r) => ({
  txId: null, description: '', category: 'Food', payment: null,
  account: null, fromAccount: null, toAccount: null,
  date: '2026-09-10T04:00:00.000Z', ...r,
})

beforeEach(() => {
  nextId = 100
  failBulkAdd = false
  /* A wallet that has been in use, in the shape the bug needed: stored
     balances that ALREADY include the transactions listed beside them. The
     numbers are simply what is stored, and an import has to leave them alone
     except for the rows it writes. */
  store = {
    accounts: [
      { id: 1, name: 'BPI', type: 'bank', currency: 'PHP', balance: 45000 },
      { id: 2, name: 'GCash', type: 'ewallet', currency: 'PHP', balance: 3000 },
      // Paid off: nothing owed.
      { id: 3, name: 'Visa', type: 'credit', currency: 'PHP', balance: 0, creditLimit: 50000 },
      { id: 4, name: 'Dollar', type: 'bank', currency: 'USD', balance: 500 },
    ],
    categories: [{ id: 1, name: 'Food', type: 'expense' }, { id: 2, name: 'Salary', type: 'inflow' }],
    balances: [],
    meta: [{ key: 'achievementsPrimedFor', value: '2026-09' }],
    transactions: [
      { id: 1, txId: 'old-1', type: 'inflow', account: 'BPI', amount: 10000, category: 'Salary', date: '2026-08-15T04:00:00.000Z' },
      { id: 2, txId: 'old-2', type: 'expense', account: 'Visa', amount: 6000, category: 'Food', date: '2026-08-16T04:00:00.000Z' },
      { id: 3, txId: 'old-3', type: 'transfer', fromAccount: 'BPI', toAccount: 'Visa', amount: 6000, date: '2026-08-20T04:00:00.000Z' },
      { id: 4, txId: 'old-4', type: 'expense', account: 'GCash', amount: 500, category: 'Food', date: '2026-08-22T04:00:00.000Z' },
    ],
  }
})

describe('importing into a wallet that is already in use', () => {
  /** The worked example: two September rows into BPI, and a card paid off. */
  const september = [
    row({ txId: 'sep-1', type: 'inflow', account: 'BPI', amount: 20000, category: 'Salary' }),
    row({ txId: 'sep-2', type: 'expense', account: 'BPI', amount: 3000 }),
  ]

  it('moves only the accounts the rows name, by only what the rows did', async () => {
    const r = await runImport({ rows: september })
    expect(r.imported).toBe(2)
    expect(bal('BPI')).toBe(62000) // 45,000 + 20,000 - 3,000
    // Not in the file: untouched. It used to restart from 0 and fall to -500.
    expect(bal('GCash')).toBe(3000)
    // A paid-off card stays paid off. It used to go to -6,000.
    expect(bal('Visa')).toBe(0)
    expect(bal('Dollar')).toBe(500)
  })

  it('does not count the transactions that are already stored a second time', async () => {
    // BPI's stored 45,000 already includes old-1 (+10,000) and old-3 (-6,000).
    await runImport({ rows: september })
    expect(bal('BPI')).toBe(45000 + 20000 - 3000)
  })

  it('writes the mirror the Accounts list reads', async () => {
    await runImport({ rows: september })
    expect(mirror('BPI')).toBe(62000)
  })

  it('skips a row whose txId is already stored, with no effect on any balance', async () => {
    const r = await runImport({
      rows: [row({ txId: 'old-1', type: 'inflow', account: 'BPI', amount: 10000 }), ...september],
    })
    expect(r.imported).toBe(2)
    expect(r.skipped).toBe(1)
    expect(bal('BPI')).toBe(62000)
    expect(store.transactions.filter(t => t.txId === 'old-1')).toHaveLength(1)
  })

  it('is a no-op the second time the same file is imported', async () => {
    await runImport({ rows: september })
    const after = structuredClone(store.accounts)
    const again = await runImport({ rows: september })
    expect(again).toMatchObject({ imported: 0, skipped: 2 })
    expect(store.accounts).toEqual(after)
    expect(store.transactions).toHaveLength(4 + 2)
  })

  it('inserts one of two rows that share a txId inside the file', async () => {
    const r = await runImport({
      rows: [
        row({ txId: 'twin', type: 'expense', account: 'BPI', amount: 100 }),
        row({ txId: 'twin', type: 'expense', account: 'BPI', amount: 100 }),
      ],
    })
    expect(r).toMatchObject({ imported: 1, skipped: 1 })
    expect(bal('BPI')).toBe(44900)
  })

  it('pays a credit card down by a payment into it, not deeper into debt', async () => {
    // A charge, then the payment that settles it, both in the file. The old
    // replay flipped the payment's sign and left the card at -3,000.
    await runImport({
      rows: [
        row({ txId: 'c-1', type: 'expense', account: 'Visa', amount: 1500 }),
        row({ txId: 'c-2', type: 'transfer', fromAccount: 'BPI', toAccount: 'Visa', amount: 1500, category: '' }),
      ],
    })
    expect(bal('Visa')).toBe(0)
    expect(bal('BPI')).toBe(43500)
  })

  it('takes a refund - a negative expense - as money back', async () => {
    await runImport({ rows: [row({ txId: 'rf-1', type: 'expense', account: 'GCash', amount: -200, refundOf: 'old-4' })] })
    expect(bal('GCash')).toBe(3200)
  })

  it('credits a transfer between currencies with what arrived, not what left', async () => {
    await runImport({
      rows: [row({
        txId: 'fx-1', type: 'transfer', fromAccount: 'Dollar', toAccount: 'BPI', amount: 100, category: '',
        toAmount: 5800, toCurrency: 'PHP',
      })],
    })
    expect(bal('Dollar')).toBe(400)
    expect(bal('BPI')).toBe(50800)
  })

  it('stays exact over many small rows', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => row({ txId: `s-${i}`, type: 'expense', account: 'GCash', amount: 0.1 }))
    await runImport({ rows })
    expect(bal('GCash')).toBe(2900)
  })
})

describe('accounts the import creates', () => {
  it('start from the opening balance given, and then move by their rows', async () => {
    const r = await runImport({
      rows: [
        row({ txId: 'm-1', type: 'expense', account: 'Maya', amount: 250 }),
        row({ txId: 'm-2', type: 'inflow', account: 'Maya', amount: 1000, category: 'Salary' }),
      ],
      openingBalances: { Maya: 1000 },
    })
    expect(r.createdAccounts).toEqual(['Maya'])
    expect(bal('Maya')).toBe(1750) // 1,000 + 1,000 - 250
    expect(mirror('Maya')).toBe(1750)
    expect(store.accounts.find(a => a.name === 'Maya')).toMatchObject({ type: 'cash', currency: 'PHP' })
  })

  it('start from nothing when no opening balance was given', async () => {
    await runImport({ rows: [row({ txId: 'm-1', type: 'expense', account: 'Maya', amount: 250 })] })
    expect(bal('Maya')).toBe(-250)
  })

  it('ignore an opening balance offered for an account that already exists', async () => {
    // Step 3 no longer asks, but nothing may overwrite a stored balance if one
    // arrives anyway.
    await runImport({
      rows: [row({ txId: 'b-1', type: 'expense', account: 'BPI', amount: 100 })],
      openingBalances: { BPI: 0 },
    })
    expect(bal('BPI')).toBe(44900)
  })

  it('are made only for rows that are written, never for a skipped one', async () => {
    const r = await runImport({ rows: [row({ txId: 'old-1', type: 'inflow', account: 'Old Bank', amount: 10000 })] })
    expect(r.createdAccounts).toEqual([])
    expect(store.accounts.some(a => a.name === 'Old Bank')).toBe(false)
  })

  it('include the far end of a transfer', async () => {
    const r = await runImport({
      rows: [row({ txId: 't-1', type: 'transfer', fromAccount: 'BPI', toAccount: 'Maribank', amount: 500, category: '' })],
      openingBalances: { Maribank: 100 },
    })
    expect(r.createdAccounts).toEqual(['Maribank'])
    expect(bal('Maribank')).toBe(600)
    expect(bal('BPI')).toBe(44500)
  })
})

describe('the rest of what an import writes', () => {
  it('creates a missing category once', async () => {
    const r = await runImport({
      rows: [
        row({ txId: 'k-1', type: 'expense', account: 'BPI', amount: 10, category: 'Pets' }),
        row({ txId: 'k-2', type: 'expense', account: 'BPI', amount: 10, category: 'Pets' }),
      ],
    })
    expect(r.createdCategories).toEqual(['Pets'])
    expect(store.categories.filter(c => c.name === 'Pets')).toHaveLength(1)
  })

  it('sets a credit limit on a card that exists, and not on anything else', async () => {
    await runImport({
      rows: [row({ txId: 'l-1', type: 'expense', account: 'Visa', amount: 100 })],
      creditLimits: { Visa: 80000, BPI: 99999 },
    })
    expect(store.accounts.find(a => a.name === 'Visa')?.creditLimit).toBe(80000)
    expect(store.accounts.find(a => a.name === 'BPI')?.creditLimit).toBeUndefined()
  })

  it('clears the achievements flag, so history arriving is not celebrated row by row', async () => {
    await runImport({ rows: [row({ txId: 'p-1', type: 'expense', account: 'BPI', amount: 10 })] })
    expect(store.meta.some(m => m.key === 'achievementsPrimedFor')).toBe(false)
  })

  it('gives a row with no txId one, so it can sync, and counts it as new each time', async () => {
    await runImport({ rows: [row({ type: 'expense', account: 'BPI', amount: 10 })] })
    const added = store.transactions.at(-1)
    expect(added?.txId).toMatch(/^[0-9a-f-]{36}$/)
    expect(added?.synced).toBe(0)
    expect(typeof added?.updatedAt).toBe('string')
  })

  it('leaves the wallet exactly as it was if writing the rows fails', async () => {
    failBulkAdd = true
    const before = structuredClone(store)
    await expect(runImport({
      rows: [row({ txId: 'x-1', type: 'expense', account: 'Maya', amount: 10, category: 'Pets' })],
      openingBalances: { Maya: 500 },
    })).rejects.toThrow('disk full')
    expect(store).toEqual(before)
  })
})

describe('planImport', () => {
  const existing = { txIds: ['a'], accountNames: new Set(['BPI']), categoryNames: new Set(['Food']) }

  it('separates new rows from stored ones and counts what it skipped', () => {
    const plan = planImport([row({ txId: 'a' }), row({ txId: 'b' }), row({ txId: 'b' }), row({})], existing)
    expect(plan.toInsert.map(r => r.txId)).toEqual(['b', null])
    expect(plan.skipped).toBe(2)
  })

  it('asks for the accounts and categories the written rows need, in order, once each', () => {
    const plan = planImport([
      row({ txId: 'n-1', account: 'Maya', category: 'Pets' }),
      row({ txId: 'n-2', type: 'transfer', fromAccount: 'BPI', toAccount: 'GoTyme', category: 'Pets' }),
      row({ txId: 'n-3', account: 'Maya', category: 'Food' }),
    ], existing)
    expect(plan.newAccounts).toEqual(['Maya', 'GoTyme'])
    expect(plan.newCategories).toEqual(['Pets'])
  })
})

describe('what is stored for a row', () => {
  it('carries the links and the received amount through, and only when present', () => {
    const rec = recordOf(row({
      txId: 'r-1', type: 'expense', account: 'BPI', amount: -500,
      refundOf: 'buy-1', splitId: 'sp-1', installmentId: 'pl-1',
      toAmount: 5800, toCurrency: 'PHP', currency: 'USD', baseAmount: -29000, baseCurrency: 'PHP', adjust: 'correction',
    }), '2026-10-08T00:00:00.000Z')
    expect(rec).toMatchObject({
      refundOf: 'buy-1', splitId: 'sp-1', installmentId: 'pl-1',
      toAmount: 5800, toCurrency: 'PHP', currency: 'USD', baseAmount: -29000, baseCurrency: 'PHP', adjust: 'correction',
      synced: 0, updatedAt: '2026-10-08T00:00:00.000Z',
    })

    const plain = recordOf(row({ txId: 'r-2', type: 'expense', account: 'BPI', amount: 5 }), 'now')
    for (const k of ['refundOf', 'splitId', 'installmentId', 'toAmount', 'toCurrency', 'currency', 'baseAmount', 'baseCurrency', 'adjust']) {
      expect(plain).not.toHaveProperty(k)
    }
  })
})

describe('a round trip through Spendr s own export', () => {
  /* The file Settings > Reports & exports > Transactions as CSV writes, read
     back by the importer into an EMPTY wallet that has the accounts: refunds
     stay linked, a split stays one group, a plan stays one plan, and a
     transfer between currencies keeps what arrived. */
  const ledger = [
    { txId: 'buy-1', type: 'expense', date: '2026-09-05T04:00:00.000Z', description: 'Phone, "256 GB"', category: 'Shopping', payment: null, account: 'BPI', amount: 2400 },
    { txId: 'ref-1', type: 'expense', date: '2026-09-06T04:00:00.000Z', description: 'Refund', category: 'Shopping', account: 'BPI', amount: -500, refundOf: 'buy-1' },
    { txId: 'leg-1', type: 'expense', date: '2026-09-07T04:00:00.000Z', description: 'Dinner', category: 'Food', account: 'GCash', amount: 700, splitId: 'split-1' },
    { txId: 'leg-2', type: 'expense', date: '2026-09-07T04:00:00.000Z', description: 'Dinner', category: 'Drinks', account: 'GCash', amount: 300, splitId: 'split-1' },
    { txId: 'pl-1', type: 'expense', date: '2026-09-08T04:00:00.000Z', description: 'Laptop (1/3)', category: 'Shopping', account: 'Visa', amount: 3000, installmentId: 'plan-1' },
    { txId: 'pl-2', type: 'expense', date: '2026-10-08T04:00:00.000Z', description: 'Laptop (2/3)', category: 'Shopping', account: 'Visa', amount: 3000, installmentId: 'plan-1' },
    { txId: 'pl-3', type: 'expense', date: '2026-11-08T04:00:00.000Z', description: 'Laptop (3/3)', category: 'Shopping', account: 'Visa', amount: 3000, installmentId: 'plan-1' },
    { txId: 'fx-1', type: 'transfer', date: '2026-09-09T04:00:00.000Z', description: '', category: '', fromAccount: 'Dollar', toAccount: 'BPI', amount: 100, toAmount: 5800, toCurrency: 'PHP', currency: 'USD', baseAmount: 5800, baseCurrency: 'PHP' },
    { txId: 'adj-1', type: 'inflow', date: '2026-09-10T04:00:00.000Z', description: 'Balance adjustment', category: 'Adjustment', account: 'GCash', amount: 80, adjust: 'correction' },
  ]

  it('reads back as the same rows, and is Spendr s own export rather than an older one', () => {
    const { rows, format } = parseCSV(transactionsToCsv(ledger))
    expect(format).toBe('spendr')
    expect(rows).toHaveLength(ledger.length)
    for (const [i, original] of ledger.entries()) {
      expect(rows[i]).toMatchObject(original)
    }
    // The description with quotes and a comma survived the escaping.
    expect(rows[0].description).toBe('Phone, "256 GB"')
  })

  it('keeps every link when it is imported, and moves each balance once', async () => {
    store.transactions = []
    const { rows } = parseCSV(transactionsToCsv(ledger))
    await runImport({ rows })

    const stored = (/** @type {string} */ id) => store.transactions.find(t => t.txId === id)
    expect(stored('ref-1')).toMatchObject({ refundOf: 'buy-1', amount: -500 })
    expect(stored('leg-1')?.splitId).toBe('split-1')
    expect(stored('leg-2')?.splitId).toBe('split-1')
    expect(['pl-1', 'pl-2', 'pl-3'].map(id => stored(id)?.installmentId)).toEqual(['plan-1', 'plan-1', 'plan-1'])
    expect(stored('fx-1')).toMatchObject({ toAmount: 5800, toCurrency: 'PHP', currency: 'USD', baseAmount: 5800, baseCurrency: 'PHP' })
    expect(stored('adj-1')?.adjust).toBe('correction')

    // BPI: -2,400 purchase, +500 refund, +5,800 received from the dollar account.
    expect(bal('BPI')).toBe(45000 - 2400 + 500 + 5800)
    expect(bal('Dollar')).toBe(400)
    expect(bal('Visa')).toBe(-9000)
    expect(bal('GCash')).toBe(3000 - 700 - 300 + 80)
  })
})

describe('rows the parser found a problem with', () => {
  /* A tester's file of bad values: every one of these used to be written - as
     1.00, as 0, as type "debit", as 0.005, as 1e15 - and moved a balance. */
  const HEAD = 'tx_id,type,transaction_date,description,category,from_account,to_account,amount'
  const file = [
    HEAD,
    ',expense,2026-10-01,"AMT thousands, quoted",Food,BPI,,"1,234.50"',
    ',expense,2026-10-01,AMT peso sign,Food,BPI,,₱500',
    ',expense,2026-10-01,AMT negative expense,Food,BPI,,-250',
    ',expense,2026-10-01,AMT tiny,Food,BPI,,0.005',
    ',expense,2026-10-01,AMT huge,Food,BPI,,1e15',
    ',expense,2026-10-01,AMT words,Phantom,Ghost,,abc',
    ',debit,2026-10-01,AMT debit,Food,BPI,,100',
    ',expense,2026-10-01,AMT many decimals,Food,BPI,,12.345678',
    ',expense,2026-02-30,DATE feb 30,Food,BPI,,222',
    ',expense,,DATE none,Food,BPI,,444',
    ',expense,2026-13-01,DATE month 13,Food,BPI,,555',
    ',payment,2026-10-01,TYPE unknown,Food,BPI,,10',
  ].join('\n')

  it('are not written, while the good rows of the same file are', async () => {
    const { rows } = parseCSV(file)
    expect(rows).toHaveLength(12)
    expect(rows.filter(r => r.problem)).toHaveLength(6)

    const r = await runImport({ rows })
    expect(r).toMatchObject({ imported: 6, skipped: 0 })
    const written = store.transactions.filter(t => !t.txId.startsWith('old-')).map(t => t.description).sort()
    expect(written).toEqual([
      'AMT debit', 'AMT many decimals', 'AMT negative expense', 'AMT peso sign', 'AMT thousands, quoted', 'AMT tiny',
    ])
  })

  it('move no balance, and the good rows move it by what they say, to the cent', async () => {
    await runImport({ rows: parseCSV(file).rows })
    // 1,234.50 + 500 - 250 + 0.01 + 100 + 12.35 out of 45,000.
    expect(bal('BPI')).toBeCloseTo(45000 - 1234.5 - 500 + 250 - 0.01 - 100 - 12.35, 2)
    expect(mirror('BPI')).toBe(bal('BPI'))
    // Every amount that was stored is a whole number of cents.
    for (const t of store.transactions.filter(t => !t.txId.startsWith('old-'))) {
      expect(Math.abs(t.amount * 100 - Math.round(t.amount * 100))).toBeLessThan(1e-6)
    }
  })

  it('make no account or category of their own', async () => {
    const r = await runImport({ rows: parseCSV(file).rows })
    expect(r.createdAccounts).toEqual([])
    expect(r.createdCategories).toEqual([])
    expect(store.accounts.some(a => a.name === 'Ghost')).toBe(false)
    expect(store.categories.some(c => c.name === 'Phantom')).toBe(false)
  })

  it('store a debit as an expense on its account', async () => {
    await runImport({ rows: parseCSV(file).rows })
    expect(store.transactions.find(t => t.description === 'AMT debit')).toMatchObject({ type: 'expense', account: 'BPI', amount: 100 })
  })

  it('leave the wallet as it was when the whole file is bad', async () => {
    const before = structuredClone(store)
    const r = await runImport({
      rows: parseCSV([HEAD, ',expense,2026-10-01,A,Phantom,Ghost,,abc', ',expense,,B,Phantom,Ghost,,5'].join('\n')).rows,
    })
    expect(r).toMatchObject({ imported: 0, skipped: 0 })
    expect(store).toEqual(before)
  })

  it('are refused by the importer itself, whoever built the rows', async () => {
    const r = await runImport({
      rows: [
        row({ txId: 'p-1', type: 'expense', account: 'BPI', amount: 10, problem: 'Anything' }),
        row({ txId: 'p-2', type: 'debit', account: 'BPI', amount: 10 }),
        row({ txId: 'p-3', type: 'expense', account: 'BPI', amount: Number.NaN }),
        row({ txId: 'p-4', type: 'expense', account: 'BPI', amount: /** @type {any} */ ('12') }),
        row({ txId: 'p-5', type: 'expense', account: 'BPI', amount: 10, date: '2026-13-01' }),
        row({ txId: 'p-6', type: 'expense', account: 'BPI', amount: 10, date: '' }),
        row({ txId: 'ok-1', type: 'expense', account: 'BPI', amount: 10 }),
      ],
    })
    expect(r.imported).toBe(1)
    expect(bal('BPI')).toBe(44990)
  })
})

describe('names in a file against the names in the wallet', () => {
  const ZWSP = String.fromCodePoint(0x200B)
  const RLO = String.fromCodePoint(0x202E)

  it('land on the account the wallet has, however they are typed', async () => {
    const r = await runImport({
      rows: [
        row({ txId: 'n-1', type: 'expense', account: 'bpi', amount: 1 }),
        row({ txId: 'n-2', type: 'expense', account: '  BPI  ', amount: 1 }),
        row({ txId: 'n-3', type: 'expense', account: `B${ZWSP}PI`, amount: 1 }),
        row({ txId: 'n-4', type: 'expense', account: `${RLO}Bpi`, amount: 1, payment: 'bPi' }),
        row({ txId: 'n-5', type: 'transfer', fromAccount: 'gcash', toAccount: 'VISA', amount: 5, category: '' }),
      ],
    })
    expect(r.createdAccounts).toEqual([])
    expect(store.accounts.map(a => a.name)).toEqual(['BPI', 'GCash', 'Visa', 'Dollar'])
    expect(store.transactions.filter(t => t.txId.startsWith('n-') && t.type === 'expense').map(t => t.account)).toEqual(['BPI', 'BPI', 'BPI', 'BPI'])
    expect(store.transactions.find(t => t.txId === 'n-4')?.payment).toBe('BPI')
    expect(store.transactions.find(t => t.txId === 'n-5')).toMatchObject({ fromAccount: 'GCash', toAccount: 'Visa' })
    expect(bal('BPI')).toBe(44996)
    expect(bal('GCash')).toBe(2995)
    expect(bal('Visa')).toBe(5)
  })

  it('land on the category the wallet has', async () => {
    const r = await runImport({
      rows: [
        row({ txId: 'c-1', type: 'expense', account: 'BPI', amount: 1, category: 'food' }),
        row({ txId: 'c-2', type: 'expense', account: 'BPI', amount: 1, category: ' FOOD ' }),
        row({ txId: 'c-3', type: 'inflow', account: 'BPI', amount: 1, category: `Sal${ZWSP}ary` }),
      ],
    })
    expect(r.createdCategories).toEqual([])
    expect(store.categories.map(c => c.name)).toEqual(['Food', 'Salary'])
    expect(store.transactions.filter(t => t.txId.startsWith('c-')).map(t => t.category)).toEqual(['Food', 'Food', 'Salary'])
  })

  it('are made once when the wallet lacks them, as the file first spelled them', async () => {
    const r = await runImport({
      rows: [
        row({ txId: 'm-1', type: 'expense', account: 'Maya', amount: 10, category: 'Pets' }),
        row({ txId: 'm-2', type: 'expense', account: 'maya ', amount: 10, category: 'PETS' }),
        row({ txId: 'm-3', type: 'inflow', account: 'MAYA', amount: 50, category: 'pets' }),
      ],
      // Step 3 may show the name in another spelling than the one settled on.
      openingBalances: { MAYA: 1000 },
    })
    expect(r.createdAccounts).toEqual(['Maya'])
    expect(r.createdCategories).toEqual(['Pets'])
    expect(store.accounts.filter(a => a.name.toLowerCase().trim() === 'maya')).toHaveLength(1)
    expect(store.categories.filter(c => c.name.toLowerCase() === 'pets')).toHaveLength(1)
    expect(bal('Maya')).toBe(1030)
    expect(store.transactions.filter(t => t.txId.startsWith('m-')).map(t => t.account)).toEqual(['Maya', 'Maya', 'Maya'])
  })

  it('make no account from a name that is nothing but invisible characters', async () => {
    const r = await runImport({ rows: [row({ txId: 'i-1', type: 'expense', account: `${ZWSP}${ZWSP}`, amount: 10 })] })
    expect(r.createdAccounts).toEqual([])
    expect(store.transactions.find(t => t.txId === 'i-1')?.account).toBeNull()
  })

  it('are cut to what the forms allow when a row arrives that was not read by the parser', () => {
    const plan = planImport(
      [row({ txId: 'l-1', type: 'expense', account: 'L'.repeat(5000), category: 'C'.repeat(500), description: 'D'.repeat(6000) })],
      { txIds: [], accountNames: [], categoryNames: [] },
    )
    expect(plan.newAccounts).toEqual(['L'.repeat(40)])
    expect(plan.newCategories).toEqual(['C'.repeat(30)])
    expect(plan.toInsert[0]).toMatchObject({ account: 'L'.repeat(40), category: 'C'.repeat(30), description: 'D'.repeat(100) })
  })

  it('send a limit to the card they name, whatever the case', async () => {
    await runImport({
      rows: [row({ txId: 'l-1', type: 'expense', account: 'visa', amount: 100 })],
      creditLimits: { VISA: 80000 },
    })
    expect(store.accounts.find(a => a.name === 'Visa')?.creditLimit).toBe(80000)
  })

  it('a wallet with a name longer than the form allows is still matched', () => {
    const long = 'N'.repeat(60)
    const plan = planImport([row({ txId: 'x-1', account: long })], { txIds: [], accountNames: [long], categoryNames: [] })
    expect(plan.newAccounts).toEqual([])
    expect(plan.toInsert[0].account).toBe(long)
  })

  it('the whole of a file with long, hidden and lookalike names imports within the limits', async () => {
    store.accounts.push({ id: 9, name: 'Cash', type: 'cash', balance: 100, currency: 'PHP' })
    const head = 'tx_id,type,transaction_date,description,category,from_account,to_account,amount'
    const { rows } = parseCSV([
      head,
      `,expense,2026-10-04,"${'D'.repeat(6000)}","<img src=x onerror=alert(1)>",${'L'.repeat(5000)},,10`,
      `,expense,2026-10-04,NAME emoji acct,Food,"Wallet ${String.fromCodePoint(0x1F45B)} ${RLO}tlaw",,10`,
      ',expense,2026-10-04,NAME cash lower,Food,cash,,10',
      ',expense,2026-10-04,NAME cash space,Food,"Cash ",,10',
    ].join('\n'))
    const r = await runImport({ rows })
    expect(r.imported).toBe(4)
    expect(r.createdAccounts).toHaveLength(2)
    expect(store.accounts.filter(a => a.name.toLowerCase() === 'cash')).toHaveLength(1)
    expect(bal('Cash')).toBe(80)
    for (const a of store.accounts) expect(a.name.length).toBeLessThanOrEqual(40)
    for (const c of store.categories) expect(c.name.length).toBeLessThanOrEqual(30)
    for (const t of store.transactions) expect((t.description ?? '').length).toBeLessThanOrEqual(100)
    // The stored names carry nothing invisible.
    for (const a of store.accounts) expect(stripInvisible(a.name)).toBe(a.name)
  })
})
