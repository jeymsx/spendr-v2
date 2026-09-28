import { describe, it, expect } from 'vitest'
import { txGlyphCat, txKindLabel, txRowWords } from './txRow'
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

describe('txRowWords', () => {
  it('titles a loan payment with the loan, from the account that paid it', () => {
    const tx = { type: 'transfer', fromAccount: 'BPI', toAccount: 'Car Loan', description: loanPaymentNote('Car Loan') }
    expect(txRowWords(tx)).toEqual({ title: 'Car Loan', where: 'BPI', kind: 'Loan payment' })
  })

  it('keeps a plain transfer as its two accounts, with no kind', () => {
    expect(txRowWords({ type: 'transfer', fromAccount: 'BPI', toAccount: 'GCash' }))
      .toEqual({ title: 'Transfer to GCash', where: 'BPI → GCash', kind: '' })
  })

  it('gives an ordinary row its category', () => {
    expect(txRowWords({ type: 'expense', description: 'Lunch', category: 'Food', account: 'GCash' }, catMap.Food))
      .toEqual({ title: 'Lunch', where: 'GCash', kind: 'Food' })
  })
})

describe('txKindLabel', () => {
  it('names the rows the app writes for what they are', () => {
    expect(txKindLabel({ type: 'inflow', category: 'Income', adjust: 'correction' })).toBe('Adjustment')
    expect(txKindLabel({ type: 'expense', category: 'Others', description: 'Balance adjustment' })).toBe('Adjustment')
    expect(txKindLabel({ type: 'expense', category: 'Debt Payment' })).toBe('Debt')
    expect(txKindLabel({ type: 'inflow', category: 'Debt Collection' })).toBe('Debt')
  })

  it('is the category for anything else, and nothing for no row', () => {
    expect(txKindLabel({ type: 'expense', category: 'Groceries' })).toBe('Groceries')
    expect(txKindLabel(null)).toBe('')
  })
})
