// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { titleFor, setPageTitle } from './pageTitle'

describe('titleFor', () => {
  it('names the main pages', () => {
    expect(titleFor('/')).toBe('Home')
    expect(titleFor('/budget')).toBe('Budget')
    expect(titleFor('/transactions')).toBe('Transactions')
    expect(titleFor('/insights')).toBe('Insights')
  })

  it('takes the longer path before the shorter', () => {
    expect(titleFor('/transactions/deleted')).toBe('Recently deleted')
    expect(titleFor('/transactions/12/edit')).toBe('Edit transaction')
    expect(titleFor('/accounts/new')).toBe('New account')
    expect(titleFor('/accounts/3/statements')).toBe('Statement history')
    expect(titleFor('/accounts/3')).toBe('Account')
    expect(titleFor('/insights/forecast/settings')).toBe('Forecast settings')
    expect(titleFor('/insights/forecast')).toBe('Forecast')
  })

  it('names a category by its own name, decoded', () => {
    expect(titleFor('/categories/Food')).toBe('Food')
    expect(titleFor('/categories/Eating%20out')).toBe('Eating out')
    expect(titleFor('/categories/%E0%A4%A')).toBe('%E0%A4%A')
  })

  it('names every settings page, and Settings for one it does not know', () => {
    expect(titleFor('/settings')).toBe('Settings')
    expect(titleFor('/settings/sync')).toBe('Cloud sync')
    expect(titleFor('/settings/something-new')).toBe('Settings')
  })

  it('names a note and a Wrapped month by their section', () => {
    expect(titleFor('/notes/abc')).toBe('Notes')
    expect(titleFor('/recap/2026-09')).toBe('Wrapped')
  })

  it('has no name for an address it does not know', () => {
    expect(titleFor('/nowhere')).toBeNull()
  })
})

describe('setPageTitle', () => {
  it('puts the name before the app', () => {
    setPageTitle('Budget')
    expect(document.title).toBe('Budget · Spendr')
  })

  it('is the app alone with no name', () => {
    setPageTitle(null)
    expect(document.title).toBe('Spendr')
  })
})
