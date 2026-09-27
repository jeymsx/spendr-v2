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

const { validateRecurring, toRecurringRow, isIncomeRecurring } = await import('./recurringWrite')

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

describe('income on a schedule', () => {
  it('marks income as inflow and a bill as expense', () => {
    expect(toRecurringRow({ ...filled, type: 'inflow' }).type).toBe('inflow')
    expect(toRecurringRow({ ...filled, type: 'expense' }).type).toBe('expense')
  })

  /* The desktop sheet builds drafts with no type. An update from there must
     not write one, or editing a salary on desktop would turn it into a bill. */
  it('leaves the type out when the draft does not say', () => {
    expect('type' in toRecurringRow(filled)).toBe(false)
  })

  it('never stores a division on income', () => {
    const split = { people: [{ name: 'Gelo' }], mode: 'equal' }
    expect(toRecurringRow({ ...filled, type: 'inflow', split }).split).toBeNull()
    expect(toRecurringRow({ ...filled, type: 'expense', split }).split).toBe(split)
  })

  it('lands twice-a-month on the 15th or the last day', () => {
    expect(toRecurringRow({ ...filled, frequency: 'semimonthly', nextDate: '2026-10-05' }).nextDate).toBe('2026-10-15')
    expect(toRecurringRow({ ...filled, frequency: 'semimonthly', nextDate: '2026-02-20' }).nextDate).toBe('2026-02-28')
    expect(toRecurringRow({ ...filled, frequency: 'monthly', nextDate: '2026-10-05' }).nextDate).toBe('2026-10-05')
  })

  it('tells income from a bill, and reads a row with no type as a bill', () => {
    expect(isIncomeRecurring({ type: 'inflow' })).toBe(true)
    expect(isIncomeRecurring({ type: 'expense' })).toBe(false)
    expect(isIncomeRecurring({})).toBe(false)
    expect(isIncomeRecurring(null)).toBe(false)
  })
})
