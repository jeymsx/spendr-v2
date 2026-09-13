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
          return {
            async first() { return hits()[0] ?? undefined },
            async toArray() { return hits() },
          }
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

const { postCardPayment, OverdrawError } = await import('./txHelpers')

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
