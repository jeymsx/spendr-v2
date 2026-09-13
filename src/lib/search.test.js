import { describe, it, expect } from 'vitest'
import { scoreText, scoreAny, scoreAmount, searchEverything, txMatches } from './search'

/**
 * The ranking is the part worth pinning.
 *
 * Everything else here is string containment, which is hard to get wrong. The
 * order results come back in is the thing that decides whether the feature
 * feels like it read your mind or like it guessed.
 */

describe('scoreText', () => {
  it('ranks exact above prefix above fragment', () => {
    expect(scoreText('GCash', 'gcash')).toBe(3)
    expect(scoreText('GCash', 'gc')).toBe(2)
    expect(scoreText('Groceries', 'ce')).toBe(1)
    expect(scoreText('GCash', 'zzz')).toBe(0)
  })

  it('ignores case and surrounding space', () => {
    expect(scoreText('  Maya Savings  ', 'maya savings')).toBe(3)
  })

  it('scores nothing for an empty side', () => {
    expect(scoreText('', 'a')).toBe(0)
    expect(scoreText('GCash', '')).toBe(0)
    expect(scoreText(undefined, 'a')).toBe(0)
  })
})

describe('scoreAny', () => {
  it('takes the best field, not the first', () => {
    // A fragment hit on the note must not beat an exact hit on the name.
    expect(scoreAny(['a note mentioning gcash', 'GCash'], 'gcash')).toBe(3)
  })
})

describe('scoreAmount', () => {
  /** "that 1,850 thing from last month" is a real way people search. */
  it('finds a figure typed with or without separators', () => {
    expect(scoreAmount(1850, '1850')).toBe(3)
    expect(scoreAmount(1850, '1,850')).toBe(3)
    expect(scoreAmount(1850, '₱1,850')).toBe(3)
  })

  it('matches a figure part-way through being typed', () => {
    expect(scoreAmount(1850, '18')).toBe(1)
    expect(scoreAmount(18.5, '18')).toBe(1)
  })

  it('uses the magnitude, so a refund is findable by what came back', () => {
    expect(scoreAmount(-500, '500')).toBe(3)
  })

  it('is not fooled by a word', () => {
    expect(scoreAmount(1850, 'grocery')).toBe(0)
    expect(scoreAmount(1850, '')).toBe(0)
  })
})

describe('searchEverything', () => {
  const data = {
    accounts: [
      { id: 1, name: 'GCash', type: 'ewallet' },
      { id: 2, name: 'Maya Savings', type: 'savings' },
    ],
    categories: [{ id: 5, name: 'Groceries', type: 'expense' }],
    recurring: [{ id: 7, name: 'Netflix', amount: 549, category: 'Bills' }],
    goals: [{ id: 9, name: 'Japan trip' }],
    debts: [{ id: 11, name: 'Gelo', contact: 'Gelo', amount: 2250, type: 'owed_to_me' }],
  }

  it('groups hits and links each one somewhere real', () => {
    const groups = searchEverything('gcash', data)
    expect(groups).toHaveLength(1)
    expect(groups[0].group).toBe('Accounts')
    expect(groups[0].items[0].to).toBe('/accounts/1')
  })

  /**
   * The reason this is not a fuzzy matcher. A subsequence scorer puts
   * "Groceries" in front for "gc" because g...c appears in it, and nobody
   * typing "gc" means Groceries.
   */
  it('puts a prefix hit above a fragment hit', () => {
    const groups = searchEverything('gc', data)
    const labels = groups.flatMap(g => g.items.map(i => i.label))
    expect(labels[0]).toBe('GCash')
  })

  it('finds a bill by its amount', () => {
    const groups = searchEverything('549', data)
    expect(groups.find(g => g.group === 'Bills').items[0].label).toBe('Netflix')
  })

  it('percent-encodes a category name for its route', () => {
    // "50% off" as a category would otherwise break the URL.
    const groups = searchEverything('gro', { categories: [{ id: 1, name: 'Gro/cery' }] })
    expect(groups[0].items[0].to).toBe('/categories/Gro%2Fcery')
  })

  /** One letter matches most of the app; the results would be noise. */
  it('says nothing until there are two characters', () => {
    expect(searchEverything('g', data)).toEqual([])
    expect(searchEverything('', data)).toEqual([])
  })

  it('caps each group so one match cannot bury the ledger', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `Test ${i}` }))
    const groups = searchEverything('test', { goals: many }, 3)
    expect(groups[0].items).toHaveLength(3)
  })

  it('returns nothing rather than empty groups when nothing matches', () => {
    expect(searchEverything('zzzz', data)).toEqual([])
  })
})

describe('txMatches', () => {
  const tx = {
    description: 'Coffee beans', category: 'Others',
    account: 'ZZ Test Card', amount: 950,
  }

  it('searches the account and the amount, which it never used to', () => {
    expect(txMatches(tx, 'zz test')).toBe(true)
    expect(txMatches(tx, '950')).toBe(true)
  })

  it('still searches the description and category', () => {
    expect(txMatches(tx, 'coffee')).toBe(true)
    expect(txMatches(tx, 'others')).toBe(true)
  })

  it('matches both sides of a transfer', () => {
    const t = { type: 'transfer', fromAccount: 'Wallet', toAccount: 'BPI', amount: 100 }
    expect(txMatches(t, 'bpi')).toBe(true)
    expect(txMatches(t, 'wallet')).toBe(true)
  })

  it('lets everything through on an empty query', () => {
    expect(txMatches(tx, '')).toBe(true)
  })

  it('says no when it means no', () => {
    expect(txMatches(tx, 'zzzz')).toBe(false)
  })
})
