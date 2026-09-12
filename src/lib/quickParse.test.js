import { describe, it, expect } from 'vitest'
import { quickParse, learnMerchants, learnLedger } from './quickParse'
import {
  LEDGER, FIXTURE_NOW, ACCOUNTS as FX_ACCOUNTS, CATEGORIES as FX_CATEGORIES,
  RECURRING, TEMPLATES, countOf,
} from './quickParse.fixture'

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

  it('removes a category you named from the description', () => {
    // "food" there is an INSTRUCTION - you are saying where to file it, not
    // what you bought. Left in, the row lands in the ledger described as
    // "Jollibee Food", and the learner then reads that back and reinforces
    // "food" as a merchant word off a row that only contains it by accident.
    const r = quickParse('150 jollibee food gcash', ctx())
    expect(r.category).toBe('Food')
    expect(r.account).toBe('GCash')
    expect(r.description).toBe('Jollibee')
  })

  it('keeps words that only INFERRED the category', () => {
    // Nothing was named here - "groceries" is a real seed merchant term and
    // it is also what you bought, so it stays.
    const r = quickParse('500 grocery run', ctx())
    expect(r.description).toBe('Grocery Run')
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

// ─────────────────────────────────────────────────────────────────────────────
// Everything above tests the parser against inputs written by hand, two or
// three rows at a time. Everything below tests it against a ledger shaped like
// a real one.
//
// That distinction is the point. All 38 tests above passed while the learner
// was deriving "with" -> Food from "Lunch with team" and firing it on "800
// with mom", because none of them fed it a description that was mostly
// connective tissue - and real descriptions are mostly connective tissue.
// ─────────────────────────────────────────────────────────────────────────────

const KNOW = learnLedger(LEDGER, { now: FIXTURE_NOW })

describe('learnLedger, against a real-shaped ledger', () => {
  it('learns what a frequent merchant is filed under', () => {
    expect(KNOW.category.grab).toBe('Transpo')
    expect(KNOW.category.jollibee).toBe('Food')
  })

  it('learns which account each merchant is paid from', () => {
    // Per merchant, not per user. This ledger pays Grab with GCash, Jollibee
    // with Cash and SM with BPI, and all three have to survive together.
    expect(KNOW.account.grab).toBe('GCash')
    expect(KNOW.account.jollibee).toBe('Cash')
    expect(KNOW.account['sm supermarket']).toBe('BPI')
  })

  it('learns a two-word merchant as one phrase', () => {
    expect(KNOW.category['sm supermarket']).toBe('Groceries')
  })

  it('learns a short word once there is enough of it', () => {
    // "sm" is two characters. The old learner threw away anything under three
    // and so could never learn the one thing you would actually type. The
    // guard is evidence, not length: six SM rows earn it.
    expect(KNOW.category.sm).toBe('Groceries')
  })

  it('never turns a stopword into a rule, however often it appears', () => {
    // "with" is in six rows, every one of them Food. Frequency is not the
    // test - the word says nothing about what was bought.
    expect(LEDGER.filter(r => / with /i.test(' ' + r.description + ' ')).length).toBeGreaterThan(3)
    expect(KNOW.category.with).toBeUndefined()
    expect(KNOW.category.the).toBeUndefined()
    expect(KNOW.category.for).toBeUndefined()
  })

  it('does not turn a word seen once into a rule', () => {
    // "run" comes from a single "Grocery run". Left as a rule it fires on
    // "fun run registration", which was the measured failure.
    expect(KNOW.category.run).toBeUndefined()
    expect(KNOW.category.balance).toBeUndefined()
  })

  it('still believes a whole description seen once', () => {
    // The counterpart to the rule above: you wrote the entire thing, so it
    // means what it says even on one transaction.
    expect(countOf('Haircut')).toBe(1)
    expect(KNOW.category.haircut).toBe('Others')
    expect(KNOW.category['team building']).toBe('Others')
  })

  it('refuses a merchant filed two ways in equal measure', () => {
    expect(countOf('Milk tea', 'Food')).toBe(4)
    expect(countOf('Milk tea', 'Others')).toBe(4)
    expect(KNOW.category['milk tea']).toBeUndefined()
  })

  it('still learns the account for a merchant whose category it refuses', () => {
    // Partial knowledge is not no knowledge. It cannot say what milk tea is,
    // but it is quite sure which account pays for it.
    expect(KNOW.account['milk tea']).toBe('GCash')
  })

  it('refuses an account that varies, even when the category is obvious', () => {
    // Alfamart is three Cash and three GCash. WHICH account paid is a fact
    // about that week, not about the merchant. Measured on a real ledger,
    // guessing here made the account wrong more often than right.
    expect(countOf('Alfamart', null)).toBe(6)
    expect(KNOW.category.alfamart).toBe('Food')
    expect(KNOW.account.alfamart).toBeUndefined()
  })

  it('withholds an account that is consistent but not yet established', () => {
    // Two rows, both Maya, never varied. Consistent is not established.
    expect(countOf('Bookstore')).toBe(2)
    expect(KNOW.category.bookstore).toBe('Shopping')
    expect(KNOW.account.bookstore).toBeUndefined()
  })

  it('lets recent history outvote more numerous older history', () => {
    // Load was Bills eight times last year and Transpo three times this
    // month. Raw counts say Bills; a 90-day half-life says Transpo, which is
    // what the user has actually been doing.
    expect(countOf('Load', 'Bills')).toBe(8)
    expect(countOf('Load', 'Transpo')).toBe(3)
    expect(KNOW.category.load).toBe('Transpo')
  })

  it('learns which direction a merchant means', () => {
    expect(KNOW.type.payroll).toBe('inflow')
    expect(KNOW.type.grab).toBe('expense')
  })

  it('records a typical amount only once there are enough samples', () => {
    expect(KNOW.amount.grab).toMatchObject({ median: 165, n: 12 })
    expect(KNOW.amount.haircut).toBeUndefined()   // one sample is not a habit
  })

  it('survives rows with no description, no category or a broken date', () => {
    expect(() => learnLedger(LEDGER, { now: FIXTURE_NOW })).not.toThrow()
    expect(KNOW.category.grab).toBe('Transpo')    // and does not corrupt the rest
  })

  it('is deterministic', () => {
    expect(learnLedger(LEDGER, { now: FIXTURE_NOW })).toEqual(KNOW)
  })
})

describe('quickParse with a learned ledger', () => {
  const ctx = (extra = {}) => ({
    accounts: FX_ACCOUNTS, categories: FX_CATEGORIES,
    recurring: RECURRING, templates: TEMPLATES,
    knowledge: KNOW, today: new Date(FIXTURE_NOW), ...extra,
  })

  it('fills in the account you always use for that merchant', () => {
    const r = quickParse('180 grab', ctx())
    expect(r.category).toBe('Transpo')
    expect(r.account).toBe('GCash')
    expect(r.matched.account.via).toBe('history')
  })

  it('never overrides an account you named yourself', () => {
    const r = quickParse('180 grab bpi', ctx())
    expect(r.account).toBe('BPI')
    expect(r.matched.account.via).toBe('name')
  })

  it('does not infer an account from a category name', () => {
    // "food" is a category, not a merchant. Its account history is whichever
    // accounts happened to pay for food, which is not a useful answer.
    const r = quickParse('500 food', ctx())
    expect(r.matched.category.via).toBe('name')
    expect(r.account).toBeNull()
  })

  it('prefers the longest phrase the ledger knows', () => {
    // "team" alone leans Food. "team building" is Others, and is the more
    // specific claim.
    expect(KNOW.category.team).toBe('Food')
    expect(quickParse('1500 team building', ctx()).category).toBe('Others')
  })

  it('flags an amount far above your usual', () => {
    const r = quickParse('9000 grab', ctx())
    expect(r.amountFlag).toMatchObject({ direction: 'high', median: 165 })
  })

  it('flags an amount far below your usual', () => {
    // The dropped-zero case, which is the one that costs money to find late.
    expect(quickParse('20 payroll', ctx()).amountFlag).toMatchObject({ direction: 'low' })
  })

  it('does not flag an ordinary amount', () => {
    expect(quickParse('180 grab', ctx()).amountFlag).toBeNull()
  })

  it('does not flag when it has too few samples to have an opinion', () => {
    expect(quickParse('99999 haircut', ctx()).amountFlag).toBeNull()
  })

  it('forgives one typo in a long merchant name', () => {
    const r = quickParse('420 jolibee', ctx())
    expect(r.category).toBe('Food')
    expect(r.matched.category).toMatchObject({ via: 'typo', typed: 'jolibee' })
    expect(r.account).toBe('Cash')      // and still fills the account in
  })

  it('reaches a phrase through one of its words', () => {
    const r = quickParse('1940 supermrket', ctx())
    expect(r.category).toBe('Groceries')
    expect(r.matched.category.via).toBe('typo')
  })

  it('calls an exact match history, not a typo', () => {
    // Both spellings resolve; only one of them is a misspelling, and telling
    // the user they mistyped a word they typed correctly is its own bug.
    expect(quickParse('1940 supermarket', ctx()).matched.category.via).toBe('history')
  })

  it('never lets a typo decide the direction', () => {
    // A near miss is the weakest evidence in the system and direction is the
    // costliest field, so the two must not meet. Measured: "Google Cloud" was
    // being read as an inflow because "cloud" is one edit from "icloud", and
    // the user's iCloud rows are money coming back from friends.
    const r = quickParse('300 jolibee', ctx())
    expect(r.matched.category.via).toBe('typo')
    expect(r.type).toBe('expense')
    expect(r.matched.type).toBeUndefined()
  })

  it('does not guess at a short mistyped word', () => {
    // "grap" is one edit from "grab", and also from "gray", "grip" and "trap".
    // Under five characters one edit reaches too much of the vocabulary.
    expect(quickParse('300 grap', ctx()).category).toBeNull()
  })

  it('refuses a category you no longer have', () => {
    const r = quickParse('180 grab', ctx({ categories: [{ name: 'Food' }] }))
    expect(r.category).toBeNull()
    expect(r.account).toBe('GCash')     // the account is still a fact
  })

  it('refuses an account you no longer have', () => {
    const r = quickParse('180 grab', ctx({ accounts: [{ name: 'Cash' }] }))
    expect(r.account).toBeNull()
    expect(r.category).toBe('Transpo')
  })

  it('books money coming in as an inflow, without the word being hardcoded', () => {
    // "payroll" is not in INFLOW_WORDS and cannot be - a fixed list has no way
    // to know what any given person calls their pay. Nine rows of it do.
    const r = quickParse('40000 payroll', ctx())
    expect(r.type).toBe('inflow')
    expect(r.matched.type).toMatchObject({ via: 'history' })
  })

  it('lets your ledger overrule the inflow word list', () => {
    // "interest" is in INFLOW_WORDS, for people with savings accounts. This
    // user only ever pays it on a card. Getting the SIGN wrong is the one
    // error that moves a balance the wrong way, so history has to win.
    const r = quickParse('340 interest', ctx())
    expect(r.type).toBe('expense')
    expect(r.matched.type).toMatchObject({ via: 'history' })
  })

  it('still trusts the word list where the ledger has nothing to say', () => {
    const r = quickParse('5000 bonus', ctx())
    expect(r.type).toBe('inflow')
    expect(r.matched.type).toMatchObject({ via: 'word', value: 'bonus' })
  })

  it('does not flip an ordinary expense', () => {
    expect(quickParse('180 grab', ctx()).type).toBe('expense')
  })

  it('offers a bill you already have instead of a duplicate', () => {
    expect(quickParse('549 netflix', ctx()).recurringMatch).toMatchObject({ name: 'Netflix', id: 1 })
  })

  it('ignores a paused bill', () => {
    expect(quickParse('1500 gym', ctx()).recurringMatch).toBeNull()
  })

  it('offers a template by name', () => {
    expect(quickParse('12000 rent', ctx()).templateMatch).toMatchObject({ name: 'Rent' })
  })

  it('fills a gap from a named template rather than only reporting it', () => {
    // The Rent template names BPI. Nothing in "12000 rent" does, and the
    // ledger has no rent history, so the template is the best answer going.
    const r = quickParse('12000 rent', ctx())
    expect(r.account).toBe('BPI')
    expect(r.matched.account).toMatchObject({ via: 'template', value: 'Rent' })
  })

  it('lets what you typed beat the template', () => {
    const r = quickParse('12000 rent gcash', ctx())
    expect(r.account).toBe('GCash')
    expect(r.matched.account.via).toBe('name')
  })

  it('finds no bill in an ordinary expense', () => {
    expect(quickParse('180 grab', ctx()).recurringMatch).toBeNull()
  })
})

describe('transfer fees, typed the way people say them', () => {
  const ctx = () => ({
    accounts: FX_ACCOUNTS, categories: FX_CATEGORIES,
    knowledge: KNOW, today: new Date(FIXTURE_NOW),
  })

  const FEES = [
    '500 from gcash to maya savings, 18 tf',
    '500 from gcash to maya savings, 18 fee',
    '500 from gcash to maya savings, 18 transfer fee',
    '500 from gcash to maya savings 18tf',
    'transfer 500 from gcash to maya savings, tf 18',
  ]

  it.each(FEES)('reads the fee from: %s', (input) => {
    const r = quickParse(input, ctx())
    expect(r.type).toBe('transfer')
    expect(r.amount).toBe(500)          // the fee must not become the amount
    expect(r.fee).toBe(18)
    expect(r.fromAccount).toBe('GCash')
    expect(r.toAccount).toBe('Maya Savings')   // nor pollute the "to" capture
  })

  // "fee" is an ordinary English word inside real merchant names. Every one of
  // these is a real description from a real ledger, and reading a fee out of
  // any of them would silently swallow the amount.
  /** @type {Array<[string, number]>} */
  const NOT_FEES = [
    ['200 ppark entrance fee', 200],
    ['300 vliner reservation fee', 300],
    ['18 withdraw service fee', 18],
    ['125 clearance fee to gelo', 125],
    ['1500 entrance fee for 3 people', 1500],
  ]

  it.each(NOT_FEES)('leaves the amount alone in: %s', (input, amount) => {
    const r = quickParse(input, ctx())
    expect(r.amount).toBe(amount)
    expect(r.fee).toBeNull()
  })

  it('needs two numbers before it will look for a fee at all', () => {
    // One number cannot be both the amount and the fee.
    expect(quickParse('18 tf', ctx()).fee).toBeNull()
  })

  it('leaves fee null on an ordinary expense', () => {
    expect(quickParse('180 grab', ctx()).fee).toBeNull()
  })
})

describe('a transfer that almost parsed', () => {
  const ctx = (extra = {}) => ({
    accounts: FX_ACCOUNTS, categories: FX_CATEGORIES,
    knowledge: KNOW, today: new Date(FIXTURE_NOW), ...extra,
  })

  it('says when both sides resolved to the same account', () => {
    // The exact failure a real device hit. With no "Maya Savings" account,
    // "maya savings" falls back to matching "Maya", both sides agree, the
    // transfer is refused, and an EXPENSE on Maya described "Savings Maya"
    // appears instead - filled-looking and wrong in the expensive field.
    const thin = ctx({ accounts: [{ name: 'Maya' }, { name: 'GCash' }] })
    const r = quickParse('200 from maya savings to maya', thin)
    expect(r.type).toBe('expense')
    expect(r.transferIssue).toMatchObject({ reason: 'same-account', account: 'Maya' })
  })

  it('says which account it did not recognise', () => {
    const r = quickParse('500 from gcash to seabank', ctx())
    expect(r.transferIssue).toMatchObject({ reason: 'unknown-account', typed: 'seabank' })
  })

  it('stays quiet when neither side is an account', () => {
    // Ordinary English is full of "X to Y". Warning on these would make the
    // hint meaningless within a day.
    for (const s of ['150 lunch to go', '500 gift to mom', '200 back to school']) {
      expect(quickParse(s, ctx()).transferIssue).toBeUndefined()
    }
  })

  it('stays quiet on a transfer that worked', () => {
    const r = quickParse('500 from gcash to bpi', ctx({
      accounts: [{ name: 'GCash' }, { name: 'BPI' }],
    }))
    expect(r.type).toBe('transfer')
    expect(r.transferIssue).toBeUndefined()
  })

  it('stays quiet on an ordinary expense', () => {
    expect(quickParse('180 grab', ctx()).transferIssue).toBeUndefined()
  })
})

describe('the corpus - what must and must not be understood', () => {
  const ctx = {
    accounts: FX_ACCOUNTS, categories: FX_CATEGORIES,
    recurring: RECURRING, templates: TEMPLATES,
    knowledge: KNOW, today: new Date(FIXTURE_NOW),
  }

  // A flat table, because the value here is breadth. Each row is one thing a
  // person might actually type. `null` means "must not decide".
  /** @type {Array<[string, string, number, string|null, string|null]>} */
  const CASES = [
    // typed                       type        amount   category      account
    ['180 grab',                   'expense',     180, 'Transpo',    'GCash'],
    ['lrt fare transpo 11 gcash',  'expense',      11, 'Transpo',    'GCash'],
    ['grab 180',                   'expense',     180, 'Transpo',    'GCash'],
    ['1.2k grab',                  'expense',    1200, 'Transpo',    'GCash'],
    ['260 jollibee',               'expense',     260, 'Food',       'Cash'],
    ['260 jollibee gcash',         'expense',     260, 'Food',       'GCash'],
    ['2100 sm supermarket',        'expense',    2100, 'Groceries',  'BPI'],
    ['1300 shopee order',          'expense',    1300, 'Shopping',   'Maya'],
    ['100 load',                   'expense',     100, 'Transpo',    'GCash'],
    ['42000 salary',               'inflow',    42000, 'Salary',     null],
    ['40000 payroll',              'inflow',    40000, 'Salary',     'BPI'],
    ['340 interest',               'expense',     340, 'Bills',      'Maya Black'],
    // must NOT decide
    ['800 with mom',               'expense',     800, null,         null],
    ['450 fun run',                'expense',     450, null,         null],
    ['160 milk tea',               'expense',     160, null,         'GCash'],
    ['300 grap',                   'expense',     300, null,         null],
    ['500 zzqq',                   'expense',     500, null,         null],
    ['1500 gym',                   'expense',    1500, null,         null],
  ]

  it.each(CASES)('%s', (input, type, amount, category, account) => {
    const r = quickParse(input, ctx)
    expect({ type: r.type, amount: r.amount, category: r.category, account: r.account })
      .toEqual({ type, amount, category, account })
  })

  // Two distinct real accounts either side of "to" is the ONLY thing that
  // makes a transfer, now that no keyword is required. So the cases that must
  // still fail are the ones that carry the shape without the accounts - and
  // ordinary English is full of them.
  const NOT_TRANSFERS = [
    '150 from jollibee to go',       // "to go" is not an account; this is lunch
    '200 from maya to maya',         // the same account on both sides
    '300 from cash to nowhere',      // one side does not resolve
    '150 lunch to go',               // no keyword, and neither side resolves
    '500 gift to mom',
    '200 back to school',
    '900 top to bottom',
    '260 jollibee to cash',          // one real account is not enough
  ]

  it.each(NOT_TRANSFERS)('is not a transfer: %s', (input) => {
    expect(quickParse(input, ctx).type).not.toBe('transfer')
  })

  const TRANSFERS = [
    ['500 from gcash to bpi',         'GCash', 'BPI'],
    ['transfer 500 from bpi to maya', 'BPI',   'Maya'],
    ['200 from maya savings to maya', 'Maya Savings', 'Maya'],
    ['1000 gcash to cash',            'GCash', 'Cash'],
  ]

  it.each(TRANSFERS)('is a transfer: %s', (input, from, to) => {
    const r = quickParse(input, ctx)
    expect(r.type).toBe('transfer')
    expect(r.fromAccount).toBe(from)
    expect(r.toAccount).toBe(to)
  })
})
