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

const { validateRecurring, toRecurringRow, isIncomeRecurring, resolveDueDay } = await import('./recurringWrite')
const { advanceNextDate } = await import('../utils/recurring')

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

/**
 * `dueDay`: the day of the month a bill is really due, so a bill made on the
 * 31st is not on the 28th for good after its first February.
 */
describe('the due day a bill keeps', () => {
  it('is the day of the date a new monthly bill starts on', () => {
    expect(toRecurringRow({ ...filled, nextDate: '2026-01-31' }).dueDay).toBe(31)
    expect(toRecurringRow({ ...filled, nextDate: '2026-10-05' }).dueDay).toBe(5)
  })

  it('is set for every frequency that steps by months', () => {
    for (const frequency of ['monthly', 'quarterly', 'semiannual', 'yearly']) {
      expect(toRecurringRow({ ...filled, frequency, nextDate: '2026-08-30' }).dueDay).toBe(30)
    }
  })

  it('is null where there is no day of the month to protect', () => {
    for (const frequency of ['daily', 'weekly', 'fortnightly', 'semimonthly']) {
      expect(toRecurringRow({ ...filled, frequency, nextDate: '2026-08-30' }).dueDay).toBeNull()
    }
  })

  it('follows a date that was changed', () => {
    const prev = { nextDate: '2026-02-28', dueDay: 31, frequency: 'monthly' }
    expect(toRecurringRow({ ...filled, nextDate: '2026-03-12' }, prev).dueDay).toBe(12)
    expect(toRecurringRow({ ...filled, nextDate: '2026-03-31' }, prev).dueDay).toBe(31)
  })

  /**
   * The date a Jan 31 bill shows in February is the 28th. Saving the bill to
   * fix a typo in its name must not read the day off that and overwrite the
   * 31st it exists to remember.
   */
  it('keeps the day on file when the bill is saved with its date unchanged', () => {
    const prev = { nextDate: '2026-02-28', dueDay: 31, frequency: 'monthly' }
    expect(toRecurringRow({ ...filled, name: 'Rent', nextDate: '2026-02-28' }, prev).dueDay).toBe(31)
  })

  it('reads the day off the date when the row had none, which is no worse than before', () => {
    const prev = { nextDate: '2026-02-28', frequency: 'monthly' }
    expect(toRecurringRow({ ...filled, nextDate: '2026-02-28' }, prev).dueDay).toBe(28)
  })

  it('does not trust a day on file that the unchanged date disagrees with', () => {
    expect(resolveDueDay('monthly', '2026-03-15', { nextDate: '2026-03-15', dueDay: 31 })).toBe(15)
  })

  it('takes the date a twice-a-month bill was snapped to, not the one typed', () => {
    expect(toRecurringRow({ ...filled, frequency: 'semimonthly', nextDate: '2026-10-05' }).dueDay).toBeNull()
  })

  it('makes a bill that survives a year of posts, end to end', () => {
    const row = toRecurringRow({ ...filled, nextDate: '2026-01-31' })
    let next = row.nextDate
    const seen = []
    for (let i = 0; i < 4; i++) { next = advanceNextDate(next, row.frequency, row.dueDay); seen.push(next) }
    expect(seen).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })
})
