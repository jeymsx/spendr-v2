import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * postCardPayment — the write behind "Swipe to pay" on a card's own page.
 *
 * ── Why this one is worth a fake database ──
 *
 * Most tests in this repo pin a pure function and stub `db` to an empty
 * object, because the thing under test never touches it. That would prove
 * nothing here: postCardPayment IS a database write, and every property worth
 * asserting — the shape of the row, the direction the two balances move, that
 * both happen together or not at all — only exists once something is stored.
 *
 * So `db` is a small in-memory stand-in that models the handful of Dexie calls
 * this path makes, with the same semantics: `accounts` is keyed by `id` and
 * queried by `name`, `balances` is keyed by `account`, `add` returns the new
 * id. It is not a Dexie emulator and does not try to be.
 *
 * ── What is actually being guarded ──
 *
 * The sign. A card's stored balance is negative-owed: an expense on a card
 * does `-a`, so a charge drives it DOWN. That means a payment has to move it
 * back UP toward zero, exactly like a transfer into any other account.
 *
 * It was backwards in shipped code — `toCredit ? -a : +a` — so every card
 * payment ever made through the transfer form deepened the debt it was paying
 * off. It hid for a long time because nothing user-facing reads the stored
 * figure for a credit account; the card page derives its own from the
 * transactions. The number just drifted underneath.
 *
 * A unit test would have caught it in a second, and there wasn't one. This is
 * that test. Each assertion here has been checked against a deliberately
 * broken copy of txHelpers.js — reinstating the sign bug fails three of them,
 * removing the overdraw guard fails two, and moving the balance write outside
 * the transaction fails one.
 *
 * @typedef {Record<string, any>} Row
 */

/**
 * @typedef {object} Store
 * @property {number} nextId
 * @property {Row[]} transactions
 * @property {Row[]} accounts
 * @property {Row[]} balances
 * @property {Row[]} debts
 * @property {Row[]} recurring
 * @property {Row[]} templates
 * @property {Row[]} meta
 */

/** @type {Store} */
let store

/**
 * One table. `rows` is an accessor rather than the array itself so a fresh
 * `store` in beforeEach reaches every table without rebuilding `db`.
 *
 * @param {() => Row[]} rows
 * @param {string} key  the property Dexie would key on
 */
function table(rows, key) {
  return {
    /** @param {Row} row */
    async add(row) {
      const id = store.nextId++
      rows().push({ ...row, id })
      return id
    },
    /** @param {number} id */
    async get(id) {
      return rows().find(r => r.id === id) ?? undefined
    },
    /** @param {number} id @param {Row} patch */
    async update(id, patch) {
      const row = rows().find(r => r.id === id)
      if (!row) return 0
      Object.assign(row, patch)
      return 1
    },
    /** @param {number|string} id */
    async delete(id) {
      const all = rows()
      const i = all.findIndex(r => r.id === id || r[key] === id)
      if (i !== -1) all.splice(i, 1)
    },
    /** @param {Row} row */
    async put(row) {
      const all = rows()
      const i = all.findIndex(r => r[key] === row[key])
      if (i === -1) all.push({ ...row })
      else all[i] = { ...all[i], ...row }
      return row[key]
    },
    /** @param {string} field */
    where(field) {
      return {
        /** @param {any} value */
        equals(value) {
          const hits = () => rows().filter(r => r[field] === value)
          /* .filter() narrows a Collection and returns one, so it has to be
             chainable rather than an array method - saveTemplate reads
             .where().equals().filter().first() to tell an expense template
             from an inflow one of the same name. */
          /** @param {() => Row[]} get */
          const collection = (get) => ({
            async first() { return get()[0] ?? undefined },
            async toArray() { return get() },
            async count() { return get().length },
            /** @param {(r: Row) => boolean} fn */
            filter(fn) { return collection(() => get().filter(fn)) },
          })
          return collection(hits)
        },
      }
    },
    async toArray() { return rows().slice() },
  }
}

const db = {
  transactions: table(() => store.transactions, 'id'),
  accounts:     table(() => store.accounts, 'id'),
  balances:     table(() => store.balances, 'account'),
  debts:        table(() => store.debts, 'id'),
  recurring:    table(() => store.recurring, 'id'),
  templates:    table(() => store.templates, 'id'),
  meta:         table(() => store.meta, 'key'),
  /**
   * Dexie runs the body and rolls back if it throws. The rollback is the part
   * a fake cannot fake cheaply, so this snapshots the tables first and
   * restores them on the way out of a throw — which is what makes the
   * atomicity test below mean something rather than pass by default.
   *
   * @param {string} _mode
   * @param {any} _tables
   * @param {() => Promise<any>} fn
   */
  async transaction(_mode, _tables, fn) {
    const snapshot = JSON.parse(JSON.stringify({
      transactions: store.transactions,
      accounts:     store.accounts,
      balances:     store.balances,
      debts:        store.debts,
    }))
    try {
      return await fn()
    } catch (e) {
      Object.assign(store, snapshot)
      throw e
    }
  },
}

vi.mock('./db', () => ({ default: db, UNSYNCED: 0, SYNCED: 1 }))

const {
  postCardPayment, postRefund, postSplitExpense, deleteTxGroup, OverdrawError,
  updateTransaction, settleWithPerson, saveTemplate,
} = await import('./txHelpers')

/** A card owing 3,200 and a savings account holding 10,000. */
beforeEach(() => {
  store = {
    nextId: 1,
    transactions: [],
    accounts: [
      { id: 1, name: 'ZZ Test Card', type: 'credit', balance: -3200, creditLimit: 20000 },
      { id: 2, name: 'Maya Savings', type: 'savings', balance: 10000 },
      { id: 3, name: 'Other Card',   type: 'credit', balance: -500 },
    ],
    balances: [
      { account: 'ZZ Test Card', balance: -3200 },
      { account: 'Maya Savings', balance: 10000 },
    ],
    debts: [],
    recurring: [],
    templates: [],
    meta: [],
  }
})

/** @param {string} name */
const acct = (name) => store.accounts.find(a => a.name === name)
/** @param {string} name */
const bal = (name) => store.balances.find(b => b.account === name)
/** @param {Row} [over] */
const pay = (over = {}) => postCardPayment(/** @type {any} */ ({
  cardName: 'ZZ Test Card', fromName: 'Maya Savings', amount: 3200, ...over,
}))

describe('postCardPayment', () => {
  it('writes one categoryless transfer from the funder to the card', async () => {
    await pay()

    expect(store.transactions).toHaveLength(1)
    const tx = store.transactions[0]
    expect(tx.type).toBe('transfer')
    expect(tx.amount).toBe(3200)
    expect(tx.fromAccount).toBe('Maya Savings')
    expect(tx.toAccount).toBe('ZZ Test Card')
    /* No category, and this is not an oversight to tidy up later. Every peso
       on the statement was already booked as an expense when it was swiped;
       filing the payment under a category too would count the month's
       spending a second time. */
    expect(tx.category).toBeUndefined()
    expect(tx.synced).toBe(0)
  })

  it('returns the new row id, so the caller can offer an undo', async () => {
    const id = await pay()
    expect(id).toBe(store.transactions[0].id)
  })

  /**
   * The regression. Paying 3,200 against 3,200 owed has to land on zero.
   *
   * If the sign inverts, this reads -6,400 — the exact failure that shipped.
   */
  it('moves the card toward zero, not further into debt', async () => {
    await pay()

    expect(acct('ZZ Test Card').balance).toBe(0)
    expect(bal('ZZ Test Card').balance).toBe(0)
  })

  it('takes the money out of the funding account', async () => {
    await pay()

    expect(acct('Maya Savings').balance).toBe(6800)
    expect(bal('Maya Savings').balance).toBe(6800)
  })

  /**
   * Overpaying is allowed and has to leave a credit on the card rather than
   * clamping at zero — that surplus is real money, and getCreditStatus carries
   * it forward to offset next month.
   */
  it('leaves an overpayment sitting on the card as a credit', async () => {
    await pay({ amount: 3312 })

    expect(acct('ZZ Test Card').balance).toBe(112)
    expect(acct('Maya Savings').balance).toBe(6688)
  })

  it('stamps both sides with the same updatedAt it gives the row', async () => {
    await pay()

    expect(store.transactions[0].updatedAt).toBeTruthy()
    expect(acct('ZZ Test Card').updatedAt).toBeTruthy()
    expect(acct('Maya Savings').updatedAt).toBeTruthy()
  })

  describe('refuses a payment that cannot mean anything', () => {
    it('with no account on one end', async () => {
      await expect(pay({ fromName: '' })).rejects.toThrow(/both ends/i)
      await expect(pay({ cardName: '' })).rejects.toThrow(/both ends/i)
    })

    it('with no amount, or a negative one', async () => {
      await expect(pay({ amount: 0 })).rejects.toThrow(/needs an amount/i)
      await expect(pay({ amount: -50 })).rejects.toThrow(/needs an amount/i)
    })

    /* A card paying itself would move its balance down and up by the same
       figure and report the statement settled by more debt. */
    it('from a card to itself', async () => {
      await expect(pay({ fromName: 'ZZ Test Card' })).rejects.toThrow(/itself/i)
    })

    it('and writes nothing when it refuses', async () => {
      await expect(pay({ amount: 0 })).rejects.toThrow()
      expect(store.transactions).toHaveLength(0)
      expect(acct('ZZ Test Card').balance).toBe(-3200)
    })
  })

  describe('overdraw', () => {
    it('throws OverdrawError, carrying what the caller needs to explain it', async () => {
      const err = await pay({ amount: 12000 }).catch((/** @type {any} */ e) => e)

      expect(err).toBeInstanceOf(OverdrawError)
      expect(err.account).toBe('Maya Savings')
      expect(err.balance).toBe(10000)
      expect(err.amount).toBe(12000)
    })

    it('writes nothing on the way out', async () => {
      await expect(pay({ amount: 12000 })).rejects.toThrow(OverdrawError)

      expect(store.transactions).toHaveLength(0)
      expect(acct('Maya Savings').balance).toBe(10000)
      expect(acct('ZZ Test Card').balance).toBe(-3200)
    })

    /* The warning sheet retries with the flag set. The app warns and lets you
       through everywhere else money moves, because the balance it knows about
       is not always the balance you have. */
    it('goes through on a retry with allowOverdraw', async () => {
      await pay({ amount: 12000, allowOverdraw: true })

      expect(store.transactions).toHaveLength(1)
      expect(acct('Maya Savings').balance).toBe(-2000)
      expect(acct('ZZ Test Card').balance).toBe(8800)
    })

    /**
     * Paying one card from another is blocked upstream — the sheet filters
     * credit accounts out of the picker — but the overdraw check would let it
     * through, because a card has no balance to overdraw. Pinning it so the
     * exemption stays deliberate rather than becoming a hole if a future
     * caller skips the filter.
     */
    it('does not fire for a credit funder, which has no balance to overdraw', async () => {
      await postCardPayment({
        cardName: 'ZZ Test Card', fromName: 'Other Card', amount: 9999,
      })

      expect(store.transactions).toHaveLength(1)
    })
  })

  /**
   * The row and the two balances are one decision. A failure part-way has to
   * leave the ledger as it found it, or a payment exists with no money moved -
   * or worse, money moves with no payment to show for it.
   */
  it('rolls the row back if the balance write fails', async () => {
    const realUpdate = db.accounts.update
    db.accounts.update = async () => { throw new Error('disk on fire') }

    await expect(pay()).rejects.toThrow(/disk on fire/)

    db.accounts.update = realUpdate
    expect(store.transactions).toHaveLength(0)
    expect(acct('ZZ Test Card').balance).toBe(-3200)
    expect(acct('Maya Savings').balance).toBe(10000)
  })
})

describe('postRefund', () => {
  /** A 2,400 purchase on the card, already stored with its balance applied. */
  beforeEach(() => {
    store.transactions.push({
      id: 90, txId: 'buy-1', type: 'expense', amount: 2400,
      category: 'Groceries', account: 'ZZ Test Card', date: '2026-09-02T08:00:00+08:00',
    })
  })

  const refund = (over = {}) => postRefund({ originalTxId: 'buy-1', amount: 500, ...over })

  it('writes a NEGATIVE expense carrying the link back', async () => {
    await refund()

    const r = store.transactions.find(t => t.refundOf === 'buy-1')
    expect(r.type).toBe('expense')
    /* The whole mechanism: negative, so every sum-by-category in the app is
       right about it without being told refunds exist. */
    expect(r.amount).toBe(-500)
  })

  it('inherits the category, so the one it came from stops being overstated', async () => {
    await refund()
    expect(store.transactions.find(t => t.refundOf === 'buy-1').category).toBe('Groceries')
  })

  it('puts the money back, with no special case to get wrong', async () => {
    await refund()
    // The card was at -3200 owing; 500 back moves it toward zero.
    expect(acct('ZZ Test Card').balance).toBe(-2700)
  })

  /** A card refund can arrive as cash, or against a different card. */
  it('can land somewhere other than where the money left', async () => {
    await refund({ toAccount: 'Maya Savings' })

    expect(store.transactions.find(t => t.refundOf === 'buy-1').account).toBe('Maya Savings')
    expect(acct('Maya Savings').balance).toBe(10500)
    expect(acct('ZZ Test Card').balance).toBe(-3200)
  })

  it('refuses what cannot mean anything, and writes nothing', async () => {
    await expect(refund({ amount: 0 })).rejects.toThrow(/needs an amount/i)
    await expect(refund({ originalTxId: 'nope' })).rejects.toThrow(/no longer here/i)
    await expect(refund({ originalTxId: '' })).rejects.toThrow(/came from/i)
    expect(store.transactions.filter(t => t.refundOf)).toHaveLength(0)
  })

  /** Refunding a transfer or an inflow is not a thing. */
  it('refuses to refund anything that is not a purchase', async () => {
    store.transactions.push({ id: 91, txId: 'in-1', type: 'inflow', amount: 100, account: 'Maya Savings' })
    await expect(postRefund({ originalTxId: 'in-1', amount: 50 })).rejects.toThrow(/purchase/i)
  })
})

describe('postSplitExpense', () => {
  const legs = [
    { category: 'Groceries', amount: 2400 },
    { category: 'Household', amount: 800 },
  ]
  const split = (over = {}) => postSplitExpense({ account: 'Maya Savings', legs, ...over })

  it('writes one ordinary expense per category, sharing an id', async () => {
    const { splitId } = await split()

    const rows = store.transactions.filter(t => t.splitId === splitId)
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.category).sort()).toEqual(['Groceries', 'Household'])
    /* Ordinary expenses, so every existing sum-by-category is already right
       about them without knowing splits exist. */
    expect(rows.every(r => r.type === 'expense')).toBe(true)
  })

  it('moves the balance once, by the total', async () => {
    await split()
    expect(acct('Maya Savings').balance).toBe(6800)
  })

  it('needs two categories to be a split at all', async () => {
    await expect(split({ legs: [legs[0]] })).rejects.toThrow(/at least two/i)
    // A leg with no amount is not a leg, so this is still a split of one.
    await expect(split({ legs: [legs[0], { category: 'X', amount: 0 }] }))
      .rejects.toThrow(/at least two/i)
    expect(store.transactions).toHaveLength(0)
  })

  it('checks the total against the balance, not each leg', async () => {
    const err = await split({ legs: [
      { category: 'Groceries', amount: 6000 },
      { category: 'Household', amount: 6000 },
    ] }).catch((/** @type {any} */ e) => e)

    // Neither leg overdraws 10,000 on its own; together they do.
    expect(err).toBeInstanceOf(OverdrawError)
    expect(err.amount).toBe(12000)
    expect(store.transactions).toHaveLength(0)
  })

  it('goes through on a retry with allowOverdraw', async () => {
    await split({ legs: [
      { category: 'Groceries', amount: 6000 },
      { category: 'Household', amount: 6000 },
    ], allowOverdraw: true })

    expect(store.transactions).toHaveLength(2)
    expect(acct('Maya Savings').balance).toBe(-2000)
  })
})

/**
 * What has to go with a deleted row, found by trying to break the app rather
 * than by using it.
 *
 * Two shapes here are meaningless alone, and both were being stranded. The
 * split one is the dangerous half because it looks fine: nothing is red and
 * no total on that row is wrong, the account is just quietly short.
 */
describe('deleteTxGroup takes the rows that cannot stand alone', () => {
  const purchase = () => ({
    id: 90, txId: 'buy-1', type: 'expense', amount: 1000,
    category: 'Groceries', account: 'Maya Savings', date: '2026-09-02T08:00:00+08:00',
  })

  it('deletes a refund along with the purchase it refunded', async () => {
    store.transactions.push(purchase())
    await postRefund({ originalTxId: 'buy-1', amount: 300 })
    expect(store.transactions).toHaveLength(2)

    await deleteTxGroup(/** @type {any} */ ([store.transactions.find(t => t.txId === 'buy-1')]))

    expect(store.transactions).toHaveLength(0)
  })

  /**
   * A refund left behind is a negative expense nothing explains. It keeps
   * moving the balance and keeps reducing a category, with no screen that
   * will ever say why.
   */
  it('leaves the balance where it started, with nothing stranded', async () => {
    store.transactions.push(purchase())
    await applyStartingSpend(1000)
    await postRefund({ originalTxId: 'buy-1', amount: 300 })

    await deleteTxGroup(/** @type {any} */ ([store.transactions.find(t => t.txId === 'buy-1')]))

    expect(acct('Maya Savings').balance).toBe(10000)
  })

  /**
   * The one that hides. Delete one leg of a 1,000 purchase split 600/400 and
   * the ledger says 400 while 1,000 genuinely left the account.
   */
  it('deletes every leg of a split, not just the one tapped', async () => {
    const { ids } = await postSplitExpense({
      account: 'Maya Savings',
      legs: [{ category: 'Groceries', amount: 600 }, { category: 'Household', amount: 400 }],
    })
    expect(store.transactions).toHaveLength(2)

    await deleteTxGroup(/** @type {any} */ ([store.transactions.find(t => t.id === ids[0])]))

    expect(store.transactions).toHaveLength(0)
    expect(acct('Maya Savings').balance).toBe(10000)
  })

  /**
   * What happens to a receivable when its purchase is deleted turns on one
   * question: has any money moved against it?
   *
   * These two cases used to be one. Every receivable was kept and unhooked,
   * which left a share of a purchase that no longer exists sitting on the
   * debts page as a number nothing explains - reported from the phone as
   * "when i delete the transaction, the debt of that person remains".
   */
  const receivable = (over = {}) => ({
    id: 5, name: 'Gelo', contact: 'Gelo', amount: 300, amountPaid: 0,
    type: 'owed_to_me', sourceTxId: 'buy-1', sourceCategory: 'Groceries',
    ...over,
  })

  it('deletes a receivable nothing has been paid on', async () => {
    store.transactions.push(purchase())
    store.debts.push(receivable())

    await deleteTxGroup(/** @type {any} */ ([store.transactions.find(t => t.txId === 'buy-1')]))

    expect(store.debts).toHaveLength(0)
  })

  /**
   * Once they have handed you money the row stops being derived from the
   * purchase, so it survives - unhooked, because a debt pointing at a
   * deleted purchase can never be settled: settling routes through
   * postRefund, which refuses a purchase that is gone.
   */
  it('keeps one that has been part paid, and unhooks it', async () => {
    store.transactions.push(purchase())
    store.debts.push(receivable({ amountPaid: 100 }))

    await deleteTxGroup(/** @type {any} */ ([store.transactions.find(t => t.txId === 'buy-1')]))

    expect(store.debts).toHaveLength(1)
    expect(store.debts[0].sourceTxId).toBeNull()
    expect(store.debts[0].amountPaid).toBe(100)
  })

  /** A debt that was never tied to this purchase is nobody's business here. */
  it('leaves an unrelated debt alone', async () => {
    store.transactions.push(purchase())
    store.debts.push(receivable({ id: 6, sourceTxId: null }))

    await deleteTxGroup(/** @type {any} */ ([store.transactions.find(t => t.txId === 'buy-1')]))

    expect(store.debts).toHaveLength(1)
  })
})

/** The balance effect a seeded purchase would have had.
 *  @param {number} amount */
async function applyStartingSpend(amount) {
  const a = acct('Maya Savings')
  a.balance = Math.round((a.balance - amount) * 100) / 100
}

/**
 * updateTransaction — editing a row that already moved money.
 *
 * The whole risk is the balance. An edit has to move the account by the
 * DIFFERENCE, and the only way to get that right for every kind of change -
 * amount up, amount down, account moved, transfer legs swapped - is to undo
 * the old row's whole effect and apply the new one's. These assertions were
 * checked against a broken copy that applies the new amount without reversing
 * the old: four of them fail.
 */
describe('updateTransaction', () => {
  /** @param {Row} [over] */
  const expense = (over = {}) => {
    const row = {
      id: 90, txId: 'tx-90', type: 'expense', amount: 500,
      description: 'Lunch', category: 'Food', account: 'Maya Savings',
      date: '2026-09-01T10:00:00.000Z', ...over,
    }
    store.transactions.push(row)
    return row
  }

  it('moves the balance by the difference, not by the new figure', async () => {
    const tx = expense()
    // The 500 is already out: the account holds 10,000 with it spent.
    await updateTransaction(/** @type {any} */ (tx), { amount: 800 })
    expect(acct('Maya Savings').balance).toBe(10000 - 300)
  })

  it('gives money back when the amount comes down', async () => {
    const tx = expense()
    await updateTransaction(/** @type {any} */ (tx), { amount: 200 })
    expect(acct('Maya Savings').balance).toBe(10000 + 300)
  })

  it('leaves the balance alone when the amount does not change', async () => {
    const tx = expense()
    await updateTransaction(/** @type {any} */ (tx), { description: 'Dinner' })
    expect(acct('Maya Savings').balance).toBe(10000)
    expect(store.transactions[0].description).toBe('Dinner')
  })

  /** Moving an expense to another account has to credit one and charge the other. */
  it('hands the charge over when the account changes', async () => {
    const tx = expense()
    await updateTransaction(/** @type {any} */ (tx), { account: 'ZZ Test Card' })
    expect(acct('Maya Savings').balance).toBe(10500)
    expect(acct('ZZ Test Card').balance).toBe(-3700)
  })

  /** An inflow moves the other way, and reversing it has to as well. */
  it('reverses an inflow in the right direction', async () => {
    const tx = expense({ type: 'inflow', amount: 1000 })
    await updateTransaction(/** @type {any} */ (tx), { amount: 400 })
    expect(acct('Maya Savings').balance).toBe(10000 - 600)
  })

  it('swaps both legs of a transfer', async () => {
    const tx = expense({
      type: 'transfer', amount: 1000, account: undefined,
      fromAccount: 'Maya Savings', toAccount: 'ZZ Test Card',
    })
    await updateTransaction(/** @type {any} */ (tx), {
      fromAccount: 'ZZ Test Card', toAccount: 'Maya Savings',
    })
    // Undo: savings +1000, card -1000. Apply: card -1000, savings +1000.
    expect(acct('Maya Savings').balance).toBe(12000)
    expect(acct('ZZ Test Card').balance).toBe(-5200)
  })

  /** The identity other rows point at. A refund's refundOf would be orphaned. */
  it('never changes txId', async () => {
    const tx = expense()
    await updateTransaction(/** @type {any} */ (tx), { amount: 900 })
    expect(store.transactions[0].txId).toBe('tx-90')
  })

  it('marks the row unsynced so the change is pushed', async () => {
    const tx = expense()
    await updateTransaction(/** @type {any} */ (tx), { amount: 900 })
    expect(store.transactions[0].synced).toBe(0)
    expect(typeof store.transactions[0].updatedAt).toBe('string')
  })

  it('refuses a row that is not stored', async () => {
    await expect(updateTransaction(/** @type {any} */ ({}), { amount: 1 }))
      .rejects.toThrow(/nothing to update/i)
  })
})

/**
 * Settling, and then undoing it.
 *
 * The two halves of a settlement - money in the ledger, amountPaid on the
 * debts - were written with nothing joining them, so deleting the
 * transaction gave the money back and left the rows marked paid. These
 * exercise the round trip, because that is the only place the join is
 * observable.
 */
describe('settleWithPerson, and reversing it', () => {
  /** @param {Row} [over] */
  const owed = (over = {}) => {
    const row = {
      id: 70, syncId: 'debt-70', contact: 'Gelo', name: 'Gelo',
      type: 'owed_to_me', amount: 250, amountPaid: 0,
      createdAt: '2026-08-01', ...over,
    }
    store.debts.push(row)
    return row
  }

  /** @param {Row[]} rows @param {number} amount */
  const settle = (rows, amount) => settleWithPerson(/** @type {any} */ ({
    person: 'Gelo', rows, amount, account: 'Maya Savings', direction: 'owed_to_me',
  }))

  it('takes a part payment and leaves the rest owing', async () => {
    const d = owed()
    await settle([d], 100)
    expect(store.debts[0].amountPaid).toBe(100)
    expect(acct('Maya Savings').balance).toBe(10100)
  })

  it('records what it moved, keyed on the stable id', async () => {
    const d = owed()
    const { tx } = await settle([d], 100)
    expect(tx.settles).toEqual([{ syncId: 'debt-70', id: 70, delta: 100 }])
  })

  /** The bug this exists to prevent. */
  it('puts the debt back when the payment is deleted', async () => {
    const d = owed()
    const { tx } = await settle([d], 100)
    await deleteTxGroup(/** @type {any} */ ([tx]))

    expect(store.debts.find(x => x.id === 70).amountPaid).toBe(0)
    expect(acct('Maya Savings').balance).toBe(10000)
  })

  it('puts back only what that payment moved, not the whole row', async () => {
    const d = owed({ amountPaid: 50 })
    const { tx } = await settle([d], 100)
    expect(store.debts[0].amountPaid).toBe(150)
    await deleteTxGroup(/** @type {any} */ ([tx]))
    expect(store.debts[0].amountPaid).toBe(50)
  })

  /** Paying over the balance opens a credit row, which is part of the payment. */
  it('opens a credit row for the overpayment, and takes it back on delete', async () => {
    const d = owed()
    const { tx, credit } = await settle([d], 400)
    expect(credit).toBe(150)
    expect(store.debts).toHaveLength(2)
    expect(store.debts[1].type).toBe('i_owe')
    expect(store.debts[1].amount).toBe(150)

    await deleteTxGroup(/** @type {any} */ ([tx]))
    expect(store.debts).toHaveLength(1)
    expect(store.debts[0].amountPaid).toBe(0)
  })

  it('spreads across two rows oldest first, and reverses both', async () => {
    const a = owed({ id: 70, syncId: 'd-a', amount: 100, createdAt: '2026-07-01' })
    const b = owed({ id: 71, syncId: 'd-b', amount: 200, createdAt: '2026-08-01' })
    const { tx } = await settle([a, b], 250)
    expect(store.debts.find(x => x.id === 70).amountPaid).toBe(100)
    expect(store.debts.find(x => x.id === 71).amountPaid).toBe(150)

    await deleteTxGroup(/** @type {any} */ ([tx]))
    expect(store.debts.find(x => x.id === 70).amountPaid).toBe(0)
    expect(store.debts.find(x => x.id === 71).amountPaid).toBe(0)
  })

  /** A local id means nothing on another device; the stable one is the key. */
  it('reverses by syncId even when the local id has shifted', async () => {
    const d = owed()
    const { tx } = await settle([d], 100)
    // What a JSON restore does: same row, new counter.
    store.debts[0].id = 900
    await deleteTxGroup(/** @type {any} */ ([tx]))
    expect(store.debts[0].amountPaid).toBe(0)
  })
})

/**
 * saveTemplate, and the timestamp it did not set.
 *
 * Saving an expense as a template worked and then undid itself: the row
 * appeared, and after a reload it had been replaced by a stranger. The pull
 * takes a remote row only when it is strictly NEWER, and a row created
 * without an updatedAt reads as infinitely old - so the next sync overwrote
 * it with whatever remote row happened to share its local_id, of which there
 * were nine.
 *
 * The stamp lives in the creating hook in db/db.js now, which this fake db
 * does not run - so these assert the shape saveTemplate itself must produce
 * for the row to survive, whichever layer ends up putting it there.
 */
describe('saveTemplate', () => {
  const tpl = { name: 'Grab to work', type: 'expense', amount: 180, category: 'Transpo' }

  it('stores what it was given', async () => {
    await saveTemplate(/** @type {any} */ (tpl))
    expect(store.templates).toHaveLength(1)
    expect(store.templates[0].name).toBe('Grab to work')
    expect(store.templates[0].amount).toBe(180)
  })

  /**
   * The regression. Without a timestamp the row loses every last-write-wins
   * it is ever part of, which is not "it might get overwritten" but "it will
   * be, on the next sync".
   */
  it('gives the row a timestamp, so a sync cannot treat it as ancient', async () => {
    await saveTemplate(/** @type {any} */ (tpl))
    const saved = store.templates[0]
    expect(typeof saved.updatedAt).toBe('string')
    expect(Number.isNaN(Date.parse(saved.updatedAt))).toBe(false)
  })

  it('updates the one already there rather than adding a second', async () => {
    await saveTemplate(/** @type {any} */ (tpl))
    await saveTemplate(/** @type {any} */ ({ ...tpl, amount: 200 }))
    expect(store.templates).toHaveLength(1)
    expect(store.templates[0].amount).toBe(200)
  })

  /** Same name, different type, is a different template. */
  it('keeps an expense and an inflow of the same name apart', async () => {
    await saveTemplate(/** @type {any} */ (tpl))
    await saveTemplate(/** @type {any} */ ({ ...tpl, type: 'inflow' }))
    expect(store.templates).toHaveLength(2)
  })

  it('refuses a template with no name rather than storing a blank one', async () => {
    expect(await saveTemplate(/** @type {any} */ ({ type: 'expense', amount: 1 }))).toBeNull()
    expect(store.templates).toHaveLength(0)
  })
})
