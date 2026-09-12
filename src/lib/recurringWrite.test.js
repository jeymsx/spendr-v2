import { describe, it, expect, vi } from 'vitest'

/**
 * The bill form's validator and the row it builds.
 *
 * Both are pure and both had no tests. The validator is what stands between a
 * half-filled form and a bill that posts ₱0 to nowhere every month, and the
 * row builder is where a draft's display strings become stored numbers.
 *
 * db is stubbed only because the module imports it for saveRecurring, which
 * nothing here calls.
 */
vi.mock('../db/db', () => ({ default: { recurring: {} }, UNSYNCED: 0, SYNCED: 1 }))

const { validateRecurring, toRecurringRow } = await import('./recurringWrite')

const filled = {
  name: 'Netflix',
  amountStr: '549',
  category: { name: 'Bills' },
  account: { name: 'GCash' },
  frequency: 'monthly',
  nextDate: '2026-10-05',
  active: true,
}

describe('validateRecurring', () => {
  it('passes a complete draft', () => {
    expect(validateRecurring(filled)).toEqual({})
  })

  it('requires a name that is not just spaces', () => {
    expect(validateRecurring({ ...filled, name: '   ' }).name).toBe('Required')
    expect(validateRecurring({ ...filled, name: '' }).name).toBe('Required')
  })

  /**
   * Zero and negative are the two that matter: a bill for nothing posts a
   * transaction every month that moves no money, and a negative one moves it
   * the wrong way.
   */
  it('requires a positive amount', () => {
    expect(validateRecurring({ ...filled, amountStr: '0' }).amount).toBeTruthy()
    expect(validateRecurring({ ...filled, amountStr: '' }).amount).toBeTruthy()
    expect(validateRecurring({ ...filled, amountStr: 'abc' }).amount).toBeTruthy()
  })

  it('requires a category, an account and a date', () => {
    expect(validateRecurring({ ...filled, category: null }).category).toBeTruthy()
    expect(validateRecurring({ ...filled, account: null }).account).toBeTruthy()
    expect(validateRecurring({ ...filled, nextDate: '' }).nextDate).toBeTruthy()
  })

  it('reports every problem at once, not the first one', () => {
    const errs = validateRecurring({})
    expect(Object.keys(errs).sort()).toEqual(
      ['account', 'amount', 'category', 'name', 'nextDate'])
  })
})

describe('toRecurringRow', () => {
  it('stores the amount as a number, not the string that was typed', () => {
    expect(toRecurringRow({ ...filled, amountStr: '1,549.50' }).amount).toBe(1549.5)
  })

  it('trims the name', () => {
    expect(toRecurringRow({ ...filled, name: '  Netflix  ' }).name).toBe('Netflix')
  })

  /**
   * Names, not ids. The whole schema keys on account and category NAMES -
   * transactions, balances, goals and parentName all do - so a bill storing an
   * id would be the one table that needed a different cascade on rename.
   */
  it('stores the category and account by name', () => {
    const row = toRecurringRow(filled)
    expect(row.category).toBe('Bills')
    expect(row.account).toBe('GCash')
  })

  it('carries the schedule through untouched', () => {
    const row = toRecurringRow(filled)
    expect(row.frequency).toBe('monthly')
    expect(row.nextDate).toBe('2026-10-05')
    expect(row.active).toBe(true)
  })
})
