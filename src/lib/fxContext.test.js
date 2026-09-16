import { describe, it, expect, afterEach } from 'vitest'
import { parseRates } from './fx'
import {
  accountOf, currencyOfTx, getFxContext, resetFxContext, setFxContext,
  stampTxCurrency, sumTxIn, txAmountIn, txBase,
} from './fxContext'

/**
 * The stamp a transaction gets on the way in, and the figure it gives back.
 *
 * The single most important assertion in this file is the boring one: a peso
 * transaction in a peso ledger comes back as the number it went in as, bit
 * for bit, with no arithmetic performed on it. Every existing ledger is
 * single-currency, and 1,137 rows are riding on that being true.
 */

const RATES = parseRates({
  result: 'success',
  base_code: 'PHP',
  time_last_update_unix: 1789000000,
  rates: { PHP: 1, USD: 0.016, EUR: 0.015 },
}, '2026-09-16T00:00:00.000Z')

/** A ledger in pesos, holding one dollar account. */
const MIXED = {
  base: 'PHP',
  rates: RATES,
  accounts: [
    { name: 'Cash', currency: 'PHP' },
    { name: 'BDO Dollar', currency: 'USD' },
    { name: 'Old Account' },   // written before the column existed
  ],
}

afterEach(() => resetFxContext())

describe('the snapshot', () => {
  it('starts at pesos with nothing in it', () => {
    const ctx = getFxContext()
    expect(ctx.base).toBe('PHP')
    expect(ctx.rates).toBeNull()
    expect(ctx.byAccount.size).toBe(0)
  })

  it('reads an account with no currency as the ledger own currency', () => {
    setFxContext({ base: 'PHP', accounts: [{ name: 'Old Account' }] })
    expect(getFxContext().byAccount.get('Old Account')).toBe('PHP')
  })

  it('normalises the case, because a hand-edited row will not', () => {
    setFxContext({ base: 'php', accounts: [{ name: 'A', currency: 'usd' }] })
    expect(getFxContext().base).toBe('php')
    expect(getFxContext().byAccount.get('A')).toBe('USD')
  })
})

describe('which account an amount belongs to', () => {
  it('is the account for a one-sided entry and the SOURCE for a transfer', () => {
    expect(accountOf({ account: 'Cash' })).toBe('Cash')
    expect(accountOf({ fromAccount: 'BDO Dollar', toAccount: 'Cash' })).toBe('BDO Dollar')
    expect(accountOf({ toAccount: 'Cash' })).toBe('Cash')
    expect(accountOf({})).toBeNull()
  })

  it('prefers a row own currency over the currency of its account', () => {
    setFxContext(MIXED)
    // The account was switched to dollars LAST WEEK; this row is from before.
    expect(currencyOfTx({ account: 'BDO Dollar', currency: 'PHP' })).toBe('PHP')
    expect(currencyOfTx({ account: 'BDO Dollar' })).toBe('USD')
    expect(currencyOfTx({ account: 'Nowhere' })).toBe('PHP')
  })
})

describe('stamping', () => {
  it('records the same number, not a converted one, in a single-currency ledger', () => {
    setFxContext(MIXED)
    const odd = 0.1 + 0.2
    const row = /** @type {any} */ ({ type: 'expense', account: 'Cash', amount: odd })
    stampTxCurrency(row)
    expect(row.currency).toBe('PHP')
    expect(row.baseCurrency).toBe('PHP')
    expect(row.baseAmount).toBe(odd)
  })

  it('prices a dollar row in pesos on the day', () => {
    setFxContext(MIXED)
    const row = /** @type {any} */ ({ type: 'expense', account: 'BDO Dollar', amount: 40 })
    stampTxCurrency(row)
    expect(row.currency).toBe('USD')
    expect(row.baseCurrency).toBe('PHP')
    expect(row.baseAmount).toBeCloseTo(40 / 0.016, 6)
  })

  it('records the currency but no price when there is no rate', () => {
    // Offline, or a currency the provider does not carry. A null baseAmount
    // is read as "not priced"; a number here would be one nobody computed.
    setFxContext({ base: 'PHP', rates: null, accounts: [{ name: 'BDO Dollar', currency: 'USD' }] })
    const row = /** @type {any} */ ({ type: 'expense', account: 'BDO Dollar', amount: 40 })
    stampTxCurrency(row)
    expect(row.currency).toBe('USD')
    expect(row.baseAmount).toBeUndefined()
    expect(row.baseCurrency).toBeUndefined()
  })

  it('leaves a row that already carries one alone', () => {
    // A restore and a sync pull both arrive with their own history, and
    // re-pricing them at today's rate would rewrite it on the way in.
    setFxContext(MIXED)
    const row = { account: 'BDO Dollar', amount: 40, currency: 'USD', baseAmount: 2000, baseCurrency: 'PHP' }
    stampTxCurrency(row)
    expect(row.baseAmount).toBe(2000)
  })

  it('does not throw on something that is not a row', () => {
    expect(() => stampTxCurrency(null)).not.toThrow()
    expect(() => stampTxCurrency('nope')).not.toThrow()
  })
})

describe('reading it back', () => {
  it('uses the stored figure over any rate, so a closed month cannot move', () => {
    setFxContext({ ...MIXED, rates: null })
    const tx = { amount: 40, currency: 'USD', baseAmount: 2000, baseCurrency: 'PHP' }
    // No rate table at all, and it still answers - because it was priced.
    expect(txAmountIn(tx, 'PHP')).toBe(2000)
  })

  it('converts a stored figure onward when asked for a third currency', () => {
    setFxContext(MIXED)
    const tx = { amount: 40, currency: 'USD', baseAmount: 2500, baseCurrency: 'PHP' }
    expect(txAmountIn(tx, 'EUR', RATES)).toBeCloseTo(2500 * 0.015, 6)
  })

  it('falls back to the rate today for a row written before the column existed', () => {
    setFxContext(MIXED)
    const tx = { amount: 40, account: 'BDO Dollar' }
    expect(txAmountIn(tx, 'PHP', RATES)).toBeCloseTo(40 / 0.016, 6)
  })

  it('returns the amount itself for a row already in the currency asked for', () => {
    setFxContext(MIXED)
    const odd = 0.1 + 0.2
    expect(txAmountIn({ amount: odd, account: 'Cash' }, 'PHP', RATES)).toBe(odd)
    // And with no rate table whatsoever, which is every offline ledger.
    expect(txAmountIn({ amount: odd, account: 'Cash' }, 'PHP', null)).toBe(odd)
  })

  it('says null when it genuinely cannot price a row', () => {
    setFxContext({ base: 'PHP', rates: RATES, accounts: [{ name: 'Krone', currency: 'NOK' }] })
    expect(txAmountIn({ amount: 100, account: 'Krone' }, 'PHP', RATES)).toBeNull()
    expect(txAmountIn(null, 'PHP')).toBeNull()
  })
})

describe('txBase', () => {
  it('is the amount itself for every row in a single-currency ledger', () => {
    setFxContext({ base: 'PHP', rates: null, accounts: [{ name: 'Cash', currency: 'PHP' }] })
    const odd = 0.1 + 0.2
    expect(txBase({ amount: odd, account: 'Cash' })).toBe(odd)
  })

  it('works before the snapshot has been set at all', () => {
    // Which is what a test, a server render, or the first paint of a cold
    // start looks like.
    expect(txBase({ amount: 1234.56, account: 'Cash' })).toBe(1234.56)
  })

  it('falls back to FACE VALUE rather than nought when it cannot price', () => {
    // Nought would delete somebody's spending from their own total, which is
    // worse than showing it unconverted. See the note on txBase.
    setFxContext({ base: 'PHP', rates: RATES, accounts: [{ name: 'Krone', currency: 'NOK' }] })
    expect(txBase({ amount: 100, account: 'Krone' })).toBe(100)
  })

  it('converts a dollar expense into pesos for the ledger', () => {
    setFxContext(MIXED)
    expect(txBase({ amount: 40, account: 'BDO Dollar' })).toBeCloseTo(40 / 0.016, 6)
  })
})

describe('sumTxIn', () => {
  it('adds a dollar expense to peso ones at the rate', () => {
    setFxContext(MIXED)
    const txs = [
      { amount: 500, account: 'Cash' },
      { amount: 40, account: 'BDO Dollar' },
    ]
    const { total, missing } = sumTxIn(txs, 'PHP', RATES)
    expect(total).toBeCloseTo(500 + 40 / 0.016, 6)
    expect(missing).toEqual([])
  })

  it('names what it had to leave out', () => {
    setFxContext({ base: 'PHP', rates: RATES, accounts: [{ name: 'Krone', currency: 'NOK' }] })
    const { total, missing } = sumTxIn(
      [{ amount: 500, currency: 'PHP' }, { amount: 100, account: 'Krone' }], 'PHP', RATES)
    expect(total).toBe(500)
    expect(missing).toEqual(['NOK'])
  })
})
