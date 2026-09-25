import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseRates } from './fx'
import { resetFxContext, setFxContext } from './fxContext'
import {
  crossesCurrency, estimateConversion, impliedRate, legFor, receivedAmount,
  receivedCurrency, receivedLeg, rederiveReceived,
} from './transferLegs'
import { forwardDelta } from './trend'
import { getCreditStatus } from '../utils/creditCycle'
import { amountDisplay } from './txMoney'
import { toDexieRecord, toSupabaseRow } from './sync'

/**
 * The two ends of a transfer between two currencies.
 *
 * The bug: $100 from a dollar account put P100 into a peso one. What follows
 * pins the fix from each place that reads a transfer's destination - the
 * helpers themselves, the balance trend, the card's payments, the ledger row
 * and the sync mapping - because a fix in the balance arithmetic alone would
 * leave the card still saying it was owed P3,145 after being paid in full.
 */

// 1 PHP = 0.016 USD, so $100 is P6,250.
const RATES = parseRates({
  result: 'success',
  base_code: 'PHP',
  time_last_update_unix: 1789000000,
  rates: { PHP: 1, USD: 0.016, JPY: 2.5 },
}, '2026-09-16T00:00:00.000Z')

beforeEach(() => {
  setFxContext({
    base: 'PHP',
    rates: RATES,
    accounts: [
      { name: 'BPI', currency: 'PHP' },
      { name: 'Card', currency: 'PHP' },
      { name: 'BDO Dollar', currency: 'USD' },
      { name: 'Yen', currency: 'JPY' },
      { name: 'Old' },
    ],
  })
})
afterEach(() => resetFxContext())

const CROSS = {
  type: 'transfer', fromAccount: 'BDO Dollar', toAccount: 'BPI',
  amount: 100, toAmount: 5750, toCurrency: 'PHP', currency: 'USD',
  date: '2026-09-20T04:00:00.000Z',
}
const PLAIN = {
  type: 'transfer', fromAccount: 'BPI', toAccount: 'Old', amount: 400,
  date: '2026-09-20T04:00:00.000Z',
}

describe('reading a transfer', () => {
  it('says what arrived, and in which currency', () => {
    expect(receivedAmount(CROSS)).toBe(5750)
    expect(receivedCurrency(CROSS)).toBe('PHP')
  })

  /* Every same-currency transfer, and every transfer written before this
     existed, has no received leg. It arrived as its own amount. */
  it('reads a transfer with no received leg as its own amount', () => {
    expect(receivedAmount(PLAIN)).toBe(400)
    expect(receivedCurrency(PLAIN)).toBe('PHP')
  })

  it('shows each account its own side', () => {
    expect(legFor(CROSS, 'BDO Dollar')).toEqual({ amount: 100, currency: 'USD' })
    expect(legFor(CROSS, 'BPI')).toEqual({ amount: 5750, currency: 'PHP' })
  })

  it('works out the rate the transfer actually got', () => {
    expect(impliedRate(CROSS)).toEqual({ from: 'USD', to: 'PHP', rate: 57.5 })
    expect(impliedRate(PLAIN)).toBeNull()
  })

  it('knows which pairs change currency', () => {
    expect(crossesCurrency('BDO Dollar', 'BPI')).toBe(true)
    expect(crossesCurrency('BPI', 'Card')).toBe(false)
    // An account with no currency is in the ledger's.
    expect(crossesCurrency('BPI', 'Old')).toBe(false)
    expect(crossesCurrency('BPI', null)).toBe(false)
  })
})

describe('writing one', () => {
  it('estimates at today\'s rate, rounded to the target currency', () => {
    expect(estimateConversion(100, 'USD', 'PHP')).toBe(6250)
    expect(estimateConversion(1000, 'PHP', 'JPY')).toBe(2500)
    expect(estimateConversion(3, 'PHP', 'USD')).toBe(0.05)
  })

  it('gives no estimate without a rate', () => {
    expect(estimateConversion(100, 'USD', 'EUR')).toBeNull()
  })

  it('writes no leg for a same-currency transfer', () => {
    expect(receivedLeg({ fromAccount: 'BPI', toAccount: 'Card', amount: 500 }))
      .toEqual({ toAmount: null, toCurrency: null, ok: true, estimated: false })
  })

  it('keeps a typed figure over the estimate', () => {
    expect(receivedLeg({ fromAccount: 'BDO Dollar', toAccount: 'BPI', amount: 100, toAmount: 5750 }))
      .toEqual({ toAmount: 5750, toCurrency: 'PHP', ok: true, estimated: false })
  })

  it('falls back to the estimate when nothing was typed', () => {
    expect(receivedLeg({ fromAccount: 'BDO Dollar', toAccount: 'BPI', amount: 100 }))
      .toEqual({ toAmount: 6250, toCurrency: 'PHP', ok: true, estimated: true })
  })

  /* The one outcome it must not produce is the same number in the wrong
     currency - which is the bug. `ok: false` tells the caller to refuse. */
  it('reports that it cannot, rather than guessing, with no rate', () => {
    setFxContext({ base: 'PHP', rates: null, accounts: [{ name: 'BDO Dollar', currency: 'USD' }, { name: 'BPI', currency: 'PHP' }] })
    expect(receivedLeg({ fromAccount: 'BDO Dollar', toAccount: 'BPI', amount: 100 }))
      .toEqual({ toAmount: null, toCurrency: null, ok: false, estimated: true })
  })
})

describe('editing one', () => {
  /* The rate on a real transfer is the bank's. Changing only the amount
     keeps it, rather than swapping in today's mid-market figure. */
  it('scales the received leg at the rate it actually got', () => {
    expect(rederiveReceived(CROSS, { ...CROSS, amount: 200 }))
      .toEqual({ toAmount: 11500, toCurrency: 'PHP', ok: true, estimated: false })
  })

  it('leaves it alone when the amount did not change', () => {
    expect(rederiveReceived(CROSS, { ...CROSS, date: '2026-09-21T00:00:00.000Z' }).toAmount).toBe(5750)
  })

  it('re-estimates when an end changes', () => {
    expect(rederiveReceived(CROSS, { ...CROSS, toAccount: 'Yen' }))
      .toEqual({ toAmount: 15625, toCurrency: 'JPY', ok: true, estimated: true })
  })

  it('clears the leg when both ends now share a currency', () => {
    expect(rederiveReceived(CROSS, { ...CROSS, fromAccount: 'Card', toAmount: 5750 }))
      .toEqual({ toAmount: null, toCurrency: null, ok: true, estimated: false })
  })
})

describe('the places that read a destination', () => {
  it('moves the destination\'s balance trend by what arrived', () => {
    expect(forwardDelta(CROSS, 'BPI', false)).toBe(5750)
    expect(forwardDelta(CROSS, 'BDO Dollar', false)).toBe(-100)
  })

  /* Paid in full from dollars, the card must read as paid - not as still
     owing everything but the dollar figure. */
  it('counts a card payment for what reached the card', () => {
    const card = { name: 'Card', type: 'credit', cutoffDate: 5, dueDate: 25, creditLimit: 50000 }
    const now = new Date(2026, 8, 25, 12)
    const txs = [
      { type: 'expense', account: 'Card', amount: 3200, date: new Date(2026, 7, 20, 12).toISOString() },
      {
        type: 'transfer', fromAccount: 'BDO Dollar', toAccount: 'Card',
        amount: 55.65, toAmount: 3200, toCurrency: 'PHP',
        date: new Date(2026, 8, 10, 12).toISOString(),
      },
    ]
    const s = getCreditStatus(/** @type {any} */ (card), txs, now)
    expect(s.totalPayments).toBe(3200)
    expect(s.stmtOutstanding).toBe(0)
    expect(s.stmtPaid).toBe(true)
  })

  it('shows the destination\'s ledger row in its own currency', () => {
    expect(amountDisplay(CROSS, { account: 'BPI' }))
      .toMatchObject({ sign: '+', magnitude: 5750, currency: 'PHP', tone: 'in' })
    expect(amountDisplay(CROSS, { account: 'BDO Dollar' }))
      .toMatchObject({ sign: '−', magnitude: 100, currency: 'USD', tone: 'out' })
  })
})

describe('sync', () => {
  it('pushes the received leg', () => {
    const row = toSupabaseRow(/** @type {any} */ ({ ...CROSS, txId: 't1' }), 'u1')
    expect(row.to_amount).toBe(5750)
    expect(row.to_currency).toBe('PHP')
    expect(toSupabaseRow(/** @type {any} */ ({ ...PLAIN, txId: 't2' }), 'u1').to_amount).toBeNull()
  })

  it('pulls it back', () => {
    const rec = toDexieRecord({ tx_id: 't1', type: 'transfer', amount: 100, to_amount: 5750, to_currency: 'PHP' })
    expect(rec.toAmount).toBe(5750)
    expect(rec.toCurrency).toBe('PHP')
  })

  /* A database that has not had 019 returns rows WITHOUT the key. The pull
     spreads the record over the local row, so writing null here would wipe
     a received leg this device knows about. */
  it('leaves a local received leg alone when the remote has no column for it', () => {
    const rec = toDexieRecord({ tx_id: 't1', type: 'transfer', amount: 100 })
    expect('toAmount' in rec).toBe(false)
    expect({ ...CROSS, ...rec }.toAmount).toBe(5750)
  })
})
