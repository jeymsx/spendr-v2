import { describe, it, expect } from 'vitest'
import { quickParse, learnMerchants } from './quickParse'

const ACCOUNTS = [
  { name: 'Cash' }, { name: 'GCash' }, { name: 'Maya' },
  { name: 'Maya Savings' }, { name: 'BPI' }, { name: 'Maya Black' },
]
const CATEGORIES = [
  { name: 'Food' }, { name: 'Groceries' }, { name: 'Transpo' },
  { name: 'Bills' }, { name: 'Shopping' }, { name: 'Salary' }, { name: 'Others' },
]
const TODAY = new Date('2026-09-11T10:00:00')
const ctx = (extra = {}) => ({ accounts: ACCOUNTS, categories: CATEGORIES, today: TODAY, ...extra })

describe('amounts', () => {
  it('reads a plain amount', () => {
    expect(quickParse('150 jollibee', ctx()).amount).toBe(150)
  })

  it('reads decimals and thousands separators', () => {
    expect(quickParse('1,234.56 groceries', ctx()).amount).toBe(1234.56)
  })

  it('reads a k suffix without leaving ".5k" behind', () => {
    const r = quickParse('1.5k rent', ctx())
    expect(r.amount).toBe(1500)
    expect(r.description).not.toMatch(/5k/)
  })

  it('reads an m suffix', () => {
    expect(quickParse('2m condo', ctx()).amount).toBe(2_000_000)
  })

  it('tolerates a peso sign', () => {
    expect(quickParse('₱250 grab', ctx()).amount).toBe(250)
  })

  it('leaves amount null when there is no number', () => {
    expect(quickParse('jollibee', ctx()).amount).toBeNull()
  })
})

describe('direction', () => {
  it('defaults to expense', () => {
    expect(quickParse('150 jollibee', ctx()).type).toBe('expense')
  })

  it('recognises a transfer by shape', () => {
    const r = quickParse('200 from maya savings to maya', ctx())
    expect(r.type).toBe('transfer')
    expect(r.fromAccount).toBe('Maya Savings')
    expect(r.toAccount).toBe('Maya')
    expect(r.amount).toBe(200)
  })

  it('recognises the word transfer', () => {
    const r = quickParse('transfer 500 from bpi to gcash', ctx())
    expect(r.type).toBe('transfer')
    expect(r.fromAccount).toBe('BPI')
    expect(r.toAccount).toBe('GCash')
  })

  it('does not call it a transfer when both sides are the same account', () => {
    expect(quickParse('200 from maya to maya', ctx()).type).not.toBe('transfer')
  })

  it('does not call it a transfer when one side is not an account', () => {
    // "to go" is not an account; this is lunch, not a transfer.
    expect(quickParse('150 from jollibee to go', ctx()).type).toBe('expense')
  })

  it('recognises inflow words', () => {
    expect(quickParse('42000 salary', ctx()).type).toBe('inflow')
    expect(quickParse('500 refund from shopee', ctx()).type).toBe('inflow')
    expect(quickParse('1200 sahod', ctx()).type).toBe('inflow')
  })
})

describe('accounts', () => {
  it('matches an account by name', () => {
    expect(quickParse('150 jollibee gcash', ctx()).account).toBe('GCash')
  })

  it('prefers the longest match', () => {
    // "Maya Savings" must win over "Maya", or the money leaves the wrong
    // account - the most damaging thing this parser could get wrong.
    expect(quickParse('300 maya savings', ctx()).account).toBe('Maya Savings')
    expect(quickParse('300 maya black', ctx()).account).toBe('Maya Black')
  })

  it('is case-insensitive', () => {
    expect(quickParse('150 BPI lunch', ctx()).account).toBe('BPI')
  })

  it('leaves account null when none is named', () => {
    expect(quickParse('150 jollibee', ctx()).account).toBeNull()
  })
})

describe('categories', () => {
  it('matches a category the user typed', () => {
    const r = quickParse('500 groceries', ctx())
    expect(r.category).toBe('Groceries')
    expect(r.matched.category.via).toBe('name')
  })

  it('falls back to the seeded merchant map', () => {
    const r = quickParse('150 jollibee', ctx())
    expect(r.category).toBe('Food')
    expect(r.matched.category.via).toBe('merchant')
  })

  it('prefers what the user has actually filed the merchant under', () => {
    // They file Jollibee as Others. History beats the seed list.
    const merchantMap = { jollibee: 'Others' }
    const r = quickParse('150 jollibee', ctx({ merchantMap }))
    expect(r.category).toBe('Others')
    expect(r.matched.category.via).toBe('history')
  })

  it('never suggests a category the user does not have', () => {
    const thin = ctx({ categories: [{ name: 'Food' }] })
    // 'meralco' seeds to bills, which does not exist here.
    expect(quickParse('2000 meralco', thin).category).toBeNull()
  })

  it('leaves category null for an unknown merchant', () => {
    expect(quickParse('150 zzqq', ctx()).category).toBeNull()
  })
})

describe('dates', () => {
  it('defaults to today', () => {
    expect(quickParse('150 jollibee', ctx()).date).toBe('2026-09-11')
  })

  it('understands yesterday, in both languages', () => {
    expect(quickParse('150 jollibee yesterday', ctx()).date).toBe('2026-09-10')
    expect(quickParse('150 jollibee kahapon', ctx()).date).toBe('2026-09-10')
  })

  it('does not guess at weekday names', () => {
    // Deliberate: "last friday" and "friday" differ, and putting a
    // transaction on the wrong date silently is worse than not trying.
    const r = quickParse('150 jollibee last friday', ctx())
    expect(r.date).toBe('2026-09-11')
  })
})

describe('description', () => {
  it('keeps the leftover words, title-cased', () => {
    expect(quickParse('150 jollibee', ctx()).description).toBe('Jollibee')
  })

  it('drops filler words', () => {
    expect(quickParse('150 for lunch at jollibee', ctx()).description).toBe('Lunch Jollibee')
  })

  it('removes the matched account from the description', () => {
    const r = quickParse('150 jollibee gcash', ctx())
    expect(r.description).toBe('Jollibee')
  })

  it('is empty when nothing is left', () => {
    expect(quickParse('500', ctx()).description).toBe('')
  })
})

describe('confidence', () => {
  it('is confident with an amount and something to file it under', () => {
    expect(quickParse('150 jollibee', ctx()).confident).toBe(true)
  })

  it('is not confident without an amount', () => {
    expect(quickParse('jollibee', ctx()).confident).toBe(false)
  })

  it('is not confident with a bare number', () => {
    expect(quickParse('500', ctx()).confident).toBe(false)
  })
})

describe('learnMerchants', () => {
  it('maps a word to the category it is usually filed under', () => {
    const m = learnMerchants([
      { description: 'Jollibee', category: 'Food' },
      { description: 'Jollibee takeout', category: 'Food' },
      { description: 'Grab', category: 'Transpo' },
    ])
    expect(m.jollibee).toBe('Food')
    expect(m.grab).toBe('Transpo')
  })

  it('refuses an ambiguous word rather than guessing', () => {
    // "load" is filed half under Bills and half under Transpo. No answer is
    // better than a coin flip.
    const m = learnMerchants([
      { description: 'load', category: 'Bills' },
      { description: 'load', category: 'Transpo' },
    ])
    expect(m.load).toBeUndefined()
  })

  it('accepts a clear favourite', () => {
    const m = learnMerchants([
      { description: 'load', category: 'Bills' },
      { description: 'load', category: 'Bills' },
      { description: 'load', category: 'Transpo' },
    ])
    expect(m.load).toBe('Bills')
  })

  it('ignores short words and bare numbers', () => {
    const m = learnMerchants([{ description: 'at 7 11 sm', category: 'Food' }])
    expect(m['7']).toBeUndefined()
    expect(m.at).toBeUndefined()
    expect(m.sm).toBeUndefined()      // under 3 chars
  })

  it('survives rows with no description or category', () => {
    expect(() => learnMerchants([{}, { description: 'x' }, { category: 'y' }])).not.toThrow()
  })
})

describe('the examples from the brief', () => {
  it('"150 jollibee" -> expense, Food, today', () => {
    const r = quickParse('150 jollibee', ctx())
    expect(r).toMatchObject({
      type: 'expense', amount: 150, category: 'Food',
      description: 'Jollibee', date: '2026-09-11',
    })
  })

  it('"200 from maya savings to maya" -> transfer', () => {
    const r = quickParse('200 from maya savings to maya', ctx())
    expect(r).toMatchObject({
      type: 'transfer', amount: 200,
      fromAccount: 'Maya Savings', toAccount: 'Maya',
    })
  })
})
