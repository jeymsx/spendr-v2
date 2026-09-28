import { describe, it, expect } from 'vitest'
import { txGlyphCat } from './txGlyph'
import { categoryIcon } from '../components/CategoryGlyph'
import { loanPaymentNote, loanInterestNote, LOAN_INTEREST } from './loans'

/* Every row a list draws should come out as a line icon. These are the rows
   that used to print an emoji: a transfer, a loan payment's two halves, a
   debt settled up, a balance correction. */

const catMap = {
  Food: { name: 'Food', icon: '🍔', color: '#FFB347' },
  Transfer: { name: 'Transfer', icon: '🔄', color: '#123456' },
  [LOAN_INTEREST]: { name: LOAN_INTEREST, icon: '🏦', color: '#f97316' },
}

describe('txGlyphCat', () => {
  it('is the row category when it has one', () => {
    expect(txGlyphCat({ type: 'expense', category: 'Food' }, catMap)).toBe(catMap.Food)
  })

  it('draws a transfer as the Transfer category, in its colour', () => {
    const g = txGlyphCat({ type: 'transfer', fromAccount: 'BPI', toAccount: 'GCash' }, catMap)
    expect(g).toBe(catMap.Transfer)
    expect(categoryIcon(g)).toBeTruthy()
  })

  it('still draws a transfer when the Transfer category is not loaded', () => {
    const g = txGlyphCat({ type: 'transfer', fromAccount: 'BPI', toAccount: 'GCash' }, {})
    expect(g?.name).toBe('Transfer')
    expect(categoryIcon(g)).toBeTruthy()
  })

  it('draws the principal of a loan payment as a bank, not a transfer', () => {
    const tx = { type: 'transfer', fromAccount: 'BPI', toAccount: 'Car loan', description: loanPaymentNote('Car loan') }
    const g = txGlyphCat(tx, catMap)
    expect(g?.name).toBe('Loan payment')
    expect(g?.color).toBe('#123456')
    expect(categoryIcon(g)).toBeTruthy()
    expect(categoryIcon(g)).not.toBe(categoryIcon(catMap.Transfer))
  })

  it('draws the interest of a loan payment by its category', () => {
    const tx = { type: 'expense', category: LOAN_INTEREST, description: loanInterestNote('Car loan') }
    expect(categoryIcon(txGlyphCat(tx, catMap))).toBeTruthy()
  })

  it('draws a category the app writes but never creates, by its name', () => {
    for (const category of ['Debt Payment', 'Debt Collection']) {
      const g = txGlyphCat({ type: 'expense', category }, catMap)
      expect(g?.name).toBe(category)
      expect(categoryIcon(g), category).toBeTruthy()
    }
  })

  it('gives a balance correction a tile of its own, old or new', () => {
    const fresh = txGlyphCat({ type: 'inflow', category: 'Income', adjust: 'correction', description: 'Balance adjustment' }, catMap)
    const old = txGlyphCat({ type: 'expense', category: 'Others', description: 'Balance adjustment' }, catMap)
    expect(fresh?.name).toBe('Balance adjustment')
    expect(old?.name).toBe('Balance adjustment')
    expect(categoryIcon(fresh)).toBeTruthy()
  })

  it('leaves an investment value update on its category', () => {
    const g = txGlyphCat({ type: 'inflow', category: 'Investment', adjust: 'value', description: 'Value update' }, catMap)
    expect(g?.name).toBe('Investment')
    expect(categoryIcon(g)).toBeTruthy()
  })

  it('is nothing for a row with no category and no kind of its own', () => {
    expect(txGlyphCat({ type: 'expense' }, catMap)).toBeNull()
    expect(txGlyphCat(null, catMap)).toBeNull()
  })
})
