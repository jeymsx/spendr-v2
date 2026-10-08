import { describe, it, expect } from 'vitest'
import { PH_ACCOUNTS, PH_HOLDINGS, PH_RETIRED_ACCOUNTS } from './phAccounts'
import { accountBrand, logoCandidates } from './accountBrands'

/**
 * Citi's Philippine consumer cards moved to UnionBank in 2022, so a new card
 * is offered as UnionBank - while an account somebody already made as
 * "Citibank" keeps its logo and its house colour.
 */
describe('the Citibank preset', () => {
  it('is no longer offered as a new account', () => {
    expect(PH_ACCOUNTS.some(a => a.name === 'Citibank')).toBe(false)
    expect(PH_HOLDINGS.some(a => a.name === 'Citibank')).toBe(false)
  })

  it('is kept for the accounts already made from it', () => {
    expect(PH_RETIRED_ACCOUNTS.map(a => a.name)).toContain('Citibank')
  })

  it('still finds its logo by name, so an existing Citibank account looks as it did', () => {
    expect(logoCandidates('Citibank')).toContain('citibank')
    expect(accountBrand({ name: 'Citibank', type: 'credit', color: '#2D9DFF' }).logoKeys).toContain('citibank')
  })

  it('is replaced by a UnionBank card, with UnionBank\'s own logo', () => {
    const card = PH_ACCOUNTS.find(a => a.name === 'UnionBank Credit Card')
    expect(card).toMatchObject({ type: 'credit' })
    expect(logoCandidates(card?.name)).toContain('unionbank')
    expect(accountBrand({ name: card?.name, type: 'credit', color: card?.color }).logoKeys).toContain('unionbank')
  })

  /** Account names are unique, so the card cannot take the bank's own name. */
  it('keeps the bank itself on offer beside the card', () => {
    expect(PH_ACCOUNTS.find(a => a.name === 'UnionBank')).toMatchObject({ type: 'bank' })
  })
})

describe('the preset lists', () => {
  it('never offer one name twice, or a retired name again', () => {
    const names = [...PH_ACCOUNTS, ...PH_HOLDINGS].map(a => a.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    for (const r of PH_RETIRED_ACCOUNTS) expect(names).not.toContain(r.name.toLowerCase())
  })
})
