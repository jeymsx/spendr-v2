import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * The arithmetic that moves every account balance in the app.
 *
 * ── Why this file exists ──
 *
 * applyBalanceEffect runs on every transaction written and reverseBalanceEffect
 * on every one deleted or edited. Until now nothing tested either directly.
 * The CI config says, in so many words, that a credit-card sign bug in exactly
 * this code "shipped for months" and would have passed every check it runs.
 * That is what these pin.
 *
 * `db` is a small in-memory stand-in for the three Dexie calls this module
 * makes - accounts looked up by name, updated by id, and the balances table
 * put by account name. The same shape txHelpers.test.js uses; not a Dexie
 * emulator and not trying to be.
 *
 * Every assertion below was checked against a deliberately broken copy of
 * balances.js - see the note at the bottom.
 *
 * @typedef {Record<string, any>} Row
 */

/** @type {{ accounts: Row[], balances: Row[] }} */
let store

const db = {
  accounts: {
    /** @param {string} field */
    where(field) {
      return {
        /** @param {any} value */
        equals(value) {
          return { async first() { return store.accounts.find(r => r[field] === value) } }
        },
      }
    },
    /** @param {number} id @param {Row} patch */
    async update(id, patch) {
      const row = store.accounts.find(r => r.id === id)
      if (row) Object.assign(row, patch)
      return row ? 1 : 0
    },
  },
  balances: {
    /** @param {Row} row */
    async put(row) {
      store.balances = store.balances.filter(r => r.account !== row.account)
      store.balances.push({ ...row })
    },
  },
}

vi.mock('./db', () => ({ default: db }))

const { applyBalanceEffect, reverseBalanceEffect, applyBalanceEffects, balanceMoves } = await import('./balances')

/**
 * A transaction literal. The type requires a date, which none of this
 * arithmetic reads - it moves balances by type, account and amount only.
 * @param {Row} r
 * @returns {Transaction}
 */
const tx = (r) => /** @type {Transaction} */ ({ date: '2026-09-25T00:00:00.000Z', ...r })

/** @param {string} name */
const bal = (name) => store.accounts.find(a => a.name === name)?.balance
/** @param {string} name */
const mirror = (name) => store.balances.find(b => b.account === name)?.balance

/** The accounts every test starts from. */
function resetStore() {
  store = {
    accounts: [
      { id: 1, name: 'Cash',   type: 'cash',   currency: 'PHP', balance: 1000 },
      { id: 2, name: 'BPI',    type: 'bank',   currency: 'PHP', balance: 5000 },
      // Owing 3,200: a card's debt is stored NEGATIVE.
      { id: 3, name: 'Card',   type: 'credit', currency: 'PHP', balance: -3200 },
      { id: 4, name: 'Yen',    type: 'bank',   currency: 'JPY', balance: 10000 },
      { id: 5, name: 'BDO Dollar', type: 'bank', currency: 'USD', balance: 500 },
    ],
    balances: [],
  }
}

beforeEach(resetStore)

describe('the direction each kind of transaction moves money', () => {
  it('takes an expense out and puts an inflow in', async () => {
    await applyBalanceEffect(tx({ type: 'expense', account: 'Cash', amount: 250 }))
    expect(bal('Cash')).toBe(750)
    await applyBalanceEffect(tx({ type: 'inflow', account: 'Cash', amount: 100 }))
    expect(bal('Cash')).toBe(850)
  })

  it('moves a transfer out of one account and into the other', async () => {
    await applyBalanceEffect(tx({ type: 'transfer', fromAccount: 'BPI', toAccount: 'Cash', amount: 400 }))
    expect(bal('BPI')).toBe(4600)
    expect(bal('Cash')).toBe(1400)
  })

  it('treats a refund - a negative expense - as money coming back', async () => {
    await applyBalanceEffect(tx({ type: 'expense', account: 'Cash', amount: -60 }))
    expect(bal('Cash')).toBe(1060)
  })
})

describe('credit cards, which is where this broke before', () => {
  /* A charge drives a card's balance further negative: more owed. */
  it('deepens the debt on a charge', async () => {
    await applyBalanceEffect(tx({ type: 'expense', account: 'Card', amount: 800 }))
    expect(bal('Card')).toBe(-4000)
  })

  /* THE shipped bug. It was `toCredit ? -a : +a`, so paying a card through
     the transfer form moved it to -6,400 - the payment added to the debt it
     was paying off. A transfer ADDS to where it lands, card or not. */
  it('reduces the debt on a payment, rather than adding to it', async () => {
    await applyBalanceEffect(tx({ type: 'transfer', fromAccount: 'BPI', toAccount: 'Card', amount: 3200 }))
    expect(bal('Card')).toBe(0)
    expect(bal('BPI')).toBe(1800)
  })

  it('can overpay into a credit balance', async () => {
    await applyBalanceEffect(tx({ type: 'transfer', fromAccount: 'BPI', toAccount: 'Card', amount: 3500 }))
    expect(bal('Card')).toBe(300)
  })
})

describe('reverse is exactly the inverse of apply', () => {
  /* Deleting or editing a transaction reverses it. Any asymmetry here is a
     balance that drifts every time somebody corrects a typo. */
  const rows = /** @type {Transaction[]} */ ([
    { type: 'expense',  account: 'Cash', amount: 199.99 },
    { type: 'inflow',   account: 'BPI',  amount: 14000 },
    { type: 'transfer', fromAccount: 'BPI', toAccount: 'Card', amount: 1234.56 },
    { type: 'expense',  account: 'Card', amount: 800 },
    { type: 'expense',  account: 'Cash', amount: -45.5 },
  ].map(tx))

  for (const tx of rows) {
    it(`restores the balances after a ${tx.type} of ${tx.amount}`, async () => {
      const before = store.accounts.map(a => a.balance)
      await applyBalanceEffect(tx)
      await reverseBalanceEffect(tx)
      expect(store.accounts.map(a => a.balance)).toEqual(before)
    })
  }
})

describe('float noise', () => {
  /* The account form prefilled "140.0000000123". Every screen hid it because
     fmt rounds on the way out; the stored figure was the thing that was
     wrong, and it got more wrong with every transaction. */
  it('adds 0.1 and 0.2 to exactly 0.3, not 0.30000000000000004', async () => {
    store.accounts[0].balance = 0
    await applyBalanceEffect(tx({ type: 'inflow', account: 'Cash', amount: 0.1 }))
    await applyBalanceEffect(tx({ type: 'inflow', account: 'Cash', amount: 0.2 }))
    expect(bal('Cash')).toBe(0.3)
  })

  it('stays exact across a thousand small transactions', async () => {
    store.accounts[0].balance = 0
    for (let i = 0; i < 1000; i++) {
      await applyBalanceEffect(tx({ type: 'inflow', account: 'Cash', amount: 0.07 }))
    }
    expect(bal('Cash')).toBe(70)
  })

  it('rounds to the account own currency places, so yen stays whole', async () => {
    // Not a realistic yen amount - the point is that a JPY balance is never
    // written with a fraction the currency does not have.
    await applyBalanceEffect(tx({ type: 'expense', account: 'Yen', amount: 0.4 }))
    expect(bal('Yen')).toBe(10000)
  })
})

describe('transfers between two currencies', () => {
  /* The bug this pins: $100 out of a dollar account put P100 into the peso
     one. The destination moves by what ARRIVED. */
  it('credits the destination with what arrived, not with what left', async () => {
    await applyBalanceEffect(tx({
      type: 'transfer', fromAccount: 'BDO Dollar', toAccount: 'BPI',
      amount: 100, toAmount: 5750, toCurrency: 'PHP',
    }))
    expect(bal('BDO Dollar')).toBe(400)
    expect(bal('BPI')).toBe(10750)
  })

  it('pays a peso card from a dollar account at the peso figure', async () => {
    await applyBalanceEffect(tx({
      type: 'transfer', fromAccount: 'BDO Dollar', toAccount: 'Card',
      amount: 55.65, toAmount: 3200, toCurrency: 'PHP',
    }))
    expect(bal('Card')).toBe(0)
    expect(bal('BDO Dollar')).toBe(444.35)
  })

  it('reverses both legs exactly', async () => {
    const row = tx({
      type: 'transfer', fromAccount: 'BDO Dollar', toAccount: 'BPI',
      amount: 100, toAmount: 5750, toCurrency: 'PHP',
    })
    await applyBalanceEffect(row)
    await reverseBalanceEffect(row)
    expect(bal('BDO Dollar')).toBe(500)
    expect(bal('BPI')).toBe(5000)
  })

  /* A transfer saved before the received leg existed was applied as its
     own amount on both ends. Deleting it has to take off THAT, not a
     converted figure it was never given - or fixing the bug going forward
     would corrupt every balance an old transfer ever touched. */
  it('reverses an old transfer with no received leg by the amount it applied', async () => {
    const old = tx({ type: 'transfer', fromAccount: 'BDO Dollar', toAccount: 'BPI', amount: 100 })
    await applyBalanceEffect(old)
    expect(bal('BPI')).toBe(5100)
    await reverseBalanceEffect(old)
    expect(bal('BPI')).toBe(5000)
    expect(bal('BDO Dollar')).toBe(500)
  })

  /* Editing an old transfer to say what really arrived is how the brother's
     existing rows get fixed: reverse the old row, apply the corrected one. */
  it('corrects an old transfer when it is edited to say what arrived', async () => {
    const old = tx({ type: 'transfer', fromAccount: 'BDO Dollar', toAccount: 'BPI', amount: 100 })
    await applyBalanceEffect(old)
    await reverseBalanceEffect(old)
    await applyBalanceEffect({ ...old, toAmount: 5750, toCurrency: 'PHP' })
    expect(bal('BPI')).toBe(10750)
    expect(bal('BDO Dollar')).toBe(400)
  })
})

describe('the balances mirror', () => {
  it('is written with the same figure as the account row', async () => {
    await applyBalanceEffect(tx({ type: 'expense', account: 'Cash', amount: 250 }))
    expect(mirror('Cash')).toBe(bal('Cash'))
  })
})

describe('what it declines to do', () => {
  it('does nothing for an account it cannot find', async () => {
    await expect(applyBalanceEffect(tx({ type: 'expense', account: 'Nowhere', amount: 50 })))
      .resolves.toBeUndefined()
    expect(store.balances).toEqual([])
  })

  it('does nothing for a zero amount', async () => {
    await applyBalanceEffect(tx({ type: 'expense', account: 'Cash', amount: 0 }))
    expect(bal('Cash')).toBe(1000)
    expect(store.balances).toEqual([])
  })

  it('does nothing for a type it does not know', async () => {
    await applyBalanceEffect(tx({ type: 'mystery', account: 'Cash', amount: 50 }))
    expect(bal('Cash')).toBe(1000)
  })
})

/* A whole file of transactions, as the importer posts it: summed per account,
   one write each, onto exactly the figure applying them one by one reaches. */
describe('applyBalanceEffects, for an import', () => {
  const batch = /** @type {Transaction[]} */ ([
    { type: 'expense',  account: 'Cash', amount: 199.99 },
    { type: 'inflow',   account: 'BPI',  amount: 14000 },
    { type: 'transfer', fromAccount: 'BPI', toAccount: 'Card', amount: 1234.56 },
    { type: 'expense',  account: 'Card', amount: 800 },
    { type: 'expense',  account: 'Cash', amount: -45.5 },
    { type: 'transfer', fromAccount: 'BDO Dollar', toAccount: 'BPI', amount: 100, toAmount: 5800, toCurrency: 'PHP' },
    { type: 'expense',  account: 'Nowhere', amount: 10 },
  ].map(tx))

  it('lands on the same balances as applying each one in turn', async () => {
    await applyBalanceEffects(batch)
    const together = store.accounts.map(a => [a.name, a.balance])

    resetStore()
    for (const t of batch) await applyBalanceEffect(t)
    expect(store.accounts.map(a => [a.name, a.balance])).toEqual(together)
  })

  it('pays a credit card down, and charges it, the way one transaction does', async () => {
    await applyBalanceEffects([
      tx({ type: 'expense', account: 'Card', amount: 800 }),
      tx({ type: 'transfer', fromAccount: 'BPI', toAccount: 'Card', amount: 4000 }),
    ])
    expect(bal('Card')).toBe(0) // -3,200 - 800 + 4,000
    expect(bal('BPI')).toBe(1000)
  })

  it('writes each account once, with the mirror, and none that nothing moved', async () => {
    const update = vi.spyOn(db.accounts, 'update')
    await applyBalanceEffects([
      tx({ type: 'expense', account: 'Cash', amount: 100 }),
      tx({ type: 'expense', account: 'Cash', amount: 50 }),
      tx({ type: 'expense', account: 'Cash', amount: 25 }),
    ])
    expect(update).toHaveBeenCalledTimes(1)
    expect(bal('Cash')).toBe(825)
    expect(mirror('Cash')).toBe(825)
    expect(store.balances.map(b => b.account)).toEqual(['Cash'])
    update.mockRestore()
  })

  it('does nothing for a batch that nets to zero, or an empty one', async () => {
    await applyBalanceEffects([])
    await applyBalanceEffects([
      tx({ type: 'expense', account: 'Cash', amount: 100 }),
      tx({ type: 'inflow', account: 'Cash', amount: 100 }),
    ])
    expect(bal('Cash')).toBe(1000)
    expect(store.balances).toEqual([])
  })

  it('stays exact over a thousand small rows', async () => {
    await applyBalanceEffects(Array.from({ length: 1000 }, () => tx({ type: 'inflow', account: 'Cash', amount: 0.1 })))
    expect(bal('Cash')).toBe(1100)
  })
})

describe('balanceMoves, the one definition', () => {
  it('names the accounts a transaction moves and by how much', () => {
    expect(balanceMoves(tx({ type: 'expense', account: 'Cash', amount: 5 }))).toEqual([{ account: 'Cash', delta: -5 }])
    expect(balanceMoves(tx({ type: 'inflow', account: 'Cash', amount: 5 }))).toEqual([{ account: 'Cash', delta: 5 }])
    expect(balanceMoves(tx({ type: 'transfer', fromAccount: 'BPI', toAccount: 'Card', amount: 5 })))
      .toEqual([{ account: 'BPI', delta: -5 }, { account: 'Card', delta: 5 }])
    expect(balanceMoves(tx({ type: 'mystery', amount: 5 }))).toEqual([])
  })
})

/*
 * Checked against broken copies of balances.js:
 *
 *   reinstating `toCredit ? -a : +a` on the transfer destination
 *     -> fails "reduces the debt", "can overpay", and the round-trip of the
 *        transfer into the card
 *   removing roundMoney from adjustBalance
 *     -> fails all three float-noise tests
 *   flipping the inflow sign in reverseBalanceEffect
 *     -> fails the inflow round-trip
 *   crediting the destination with `a` instead of receivedAmount(tx) in
 *   applyBalanceEffect
 *     -> fails "credits the destination", "pays a peso card", "reverses both
 *        legs" and "corrects an old transfer"
 */
