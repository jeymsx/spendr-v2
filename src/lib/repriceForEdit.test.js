import { describe, expect, it } from 'vitest'
import { repriceForEdit } from './fxContext'

const ctx = /** @type {any} */ ({
  base: 'PHP',
  rates: { rates: { PHP: 57.5, USD: 1 } },
  byAccount: new Map([['BPI', 'PHP'], ['Wise', 'USD']]),
})

describe('an edit keeps the figure the totals read in step', () => {
  it('follows a new amount on the same account, keeping the day\'s rate', () => {
    const tx = { type: 'expense', account: 'Wise', amount: 40, currency: 'USD', baseAmount: 2280, baseCurrency: 'PHP' }
    expect(repriceForEdit(tx, { amount: 20 }, ctx)).toEqual({ baseAmount: 1140 })
  })

  it('prices afresh when the row moves to another account', () => {
    const tx = { type: 'expense', account: 'Wise', amount: 40, currency: 'USD', baseAmount: 2280, baseCurrency: 'PHP' }
    expect(repriceForEdit(tx, { account: 'BPI', amount: 40 }, ctx))
      .toEqual({ currency: 'PHP', baseAmount: 40, baseCurrency: 'PHP' })
  })

  it('writes nothing when no money-related field changed', () => {
    const tx = { type: 'expense', account: 'BPI', amount: 150, baseAmount: 150, baseCurrency: 'PHP' }
    expect(repriceForEdit(tx, { description: 'Lunch', amount: 150 }, ctx)).toEqual({})
  })

  it('fixes the case that was reported: 1,500 corrected to 150 stops counting as 1,500', () => {
    const tx = { type: 'expense', account: 'BPI', amount: 1500, currency: 'PHP', baseAmount: 1500, baseCurrency: 'PHP' }
    expect(repriceForEdit(tx, { amount: 150 }, ctx)).toEqual({ baseAmount: 150 })
  })
})
