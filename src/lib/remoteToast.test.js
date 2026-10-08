import { describe, it, expect } from 'vitest'
import { remoteToastMessage } from './remoteToast'

const lunch = { type: 'expense', amount: 150, description: 'Lunch', category: 'Food', account: 'GCash', currency: 'PHP' }

describe('remoteToastMessage', () => {
  it('says nothing when nothing came', () => {
    expect(remoteToastMessage([])).toBeNull()
    expect(remoteToastMessage(/** @type {any} */ (undefined))).toBeNull()
  })

  it('names one expense, with its figure', () => {
    expect(remoteToastMessage([lunch])).toBe('From your other device: Lunch, ₱150.00')
  })

  it('falls back to the category, then to a word, when there is no description', () => {
    expect(remoteToastMessage([{ ...lunch, description: '' }])).toBe('From your other device: Food, ₱150.00')
    expect(remoteToastMessage([{ ...lunch, description: '', category: '' }])).toBe('From your other device: Expense, ₱150.00')
  })

  it('shows money coming in with a plus', () => {
    expect(remoteToastMessage([{ type: 'inflow', amount: 24000, description: 'Salary' }])).toBe('From your other device: Salary, +₱24,000.00')
    expect(remoteToastMessage([{ type: 'inflow', amount: 500 }])).toBe('From your other device: Income, +₱500.00')
  })

  it('says where a transfer went', () => {
    expect(remoteToastMessage([{ type: 'transfer', amount: 500, fromAccount: 'GCash', toAccount: 'BPI' }])).toBe('From your other device: ₱500.00 to BPI')
    expect(remoteToastMessage([{ type: 'transfer', amount: 500 }])).toBe('From your other device: ₱500.00')
  })

  it('writes a foreign amount in its own currency', () => {
    expect(remoteToastMessage([{ ...lunch, amount: 12, currency: 'USD' }])).toBe('From your other device: Lunch, $12.00')
  })

  it('counts several instead of listing them', () => {
    expect(remoteToastMessage([lunch, lunch, lunch])).toBe('3 new transactions from your other device')
  })

  it('leaves out a balance correction, which is not something that happened', () => {
    expect(remoteToastMessage([{ ...lunch, adjust: true }])).toBeNull()
    expect(remoteToastMessage([lunch, { ...lunch, adjust: true }])).toBe('From your other device: Lunch, ₱150.00')
  })

  it('never prints a bad figure', () => {
    for (const amount of [NaN, undefined, null, 'x']) {
      expect(remoteToastMessage([{ ...lunch, amount }])).not.toMatch(/NaN|undefined|null/)
    }
  })
})
