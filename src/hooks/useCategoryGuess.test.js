import { describe, it, expect, vi } from 'vitest'

// The hook reads Dexie; there is no IndexedDB in a node test, and the pure
// guess under it is what these are about.
vi.mock('../db/db', () => ({ default: {} }))

const { guessCategory, guessLabel } = await import('./useCategoryGuess')
const { learnLedger } = await import('../lib/quickParse')

/**
 * "From your history" was printed under every category the form guessed,
 * including "Jollibee" -> Food for someone with no history at all, a typo, and
 * the category name typed into the description. Only the first of those is
 * history. The guess now says how it was reached.
 */

const categories = [
  { id: 1, name: 'Food', type: 'expense' },
  { id: 2, name: 'Groceries', type: 'expense' },
  { id: 3, name: 'Coffee', type: 'expense' },
  { id: 4, name: 'Salary', type: 'inflow' },
]

const NOW = new Date(2026, 9, 8)
/** @param {string} description @param {string} category @param {number} n */
const rows = (description, category, n) => Array.from({ length: n }, (_, i) => ({
  description, category, type: 'expense', account: 'Cash', amount: 100,
  date: new Date(2026, 9, 1 + i).toISOString(),
}))

const know = (/** @type {any[]} */ ledger = []) => learnLedger(ledger, { now: NOW })

describe('guessCategory', () => {
  it('is from history when the ledger has filed this description before', () => {
    const knowledge = know(rows('Aling Nena', 'Groceries', 4))
    const g = guessCategory('Aling Nena', { type: 'expense', categories, knowledge })
    expect(g?.category.name).toBe('Groceries')
    expect(g?.via).toBe('history')
    expect(g?.fromHistory).toBe(true)
    expect(guessLabel(g)).toBe('From your history')
  })

  it('is only a suggestion for a built-in merchant, with no history at all', () => {
    const g = guessCategory('Jollibee', { type: 'expense', categories, knowledge: know() })
    expect(g?.category.name).toBe('Food')
    expect(g?.via).toBe('merchant')
    expect(g?.fromHistory).toBe(false)
    expect(guessLabel(g)).toBe('Suggested')
  })

  it('is only a suggestion when the category name was typed in the text', () => {
    const g = guessCategory('snacks groceries', { type: 'expense', categories, knowledge: know() })
    expect(g?.category.name).toBe('Groceries')
    expect(g?.via).toBe('name')
    expect(guessLabel(g)).toBe('Suggested')
  })

  it('is only a suggestion for a typo, even of something in the history', () => {
    const knowledge = know(rows('Starbucks', 'Coffee', 4))
    const exact = guessCategory('Starbucks', { type: 'expense', categories, knowledge })
    expect(exact?.via).toBe('history')

    const typo = guessCategory('Starbuks', { type: 'expense', categories, knowledge })
    expect(typo?.category.name).toBe('Coffee')
    expect(typo?.via).toBe('typo')
    expect(typo?.fromHistory).toBe(false)
    expect(guessLabel(typo)).toBe('Suggested')
  })

  it('lets the ledger win over the built-in list, and says so', () => {
    // Jollibee is Food for everyone - until you have filed it as Coffee.
    const knowledge = know(rows('Jollibee', 'Coffee', 3))
    const g = guessCategory('Jollibee', { type: 'expense', categories, knowledge })
    expect(g?.category.name).toBe('Coffee')
    expect(g?.fromHistory).toBe(true)
  })

  it('offers nothing for a short description, no match, or another kind of category', () => {
    const knowledge = know()
    expect(guessCategory('ab', { type: 'expense', categories, knowledge })).toBeNull()
    expect(guessCategory('xqzvw', { type: 'expense', categories, knowledge })).toBeNull()
    // "Salary" is an inflow category: an expense form never offers it.
    expect(guessCategory('salary', { type: 'expense', categories: categories.filter(c => c.type === 'expense'), knowledge })).toBeNull()
    expect(guessCategory('salary', { type: 'expense', categories, knowledge })).toBeNull()
    expect(guessCategory('Jollibee', { type: 'expense', categories: [], knowledge })).toBeNull()
  })
})

describe('guessLabel', () => {
  it('says "Suggested" when there is no guess to describe', () => {
    expect(guessLabel(null)).toBe('Suggested')
  })
})
