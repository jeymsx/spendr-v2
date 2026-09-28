// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { clearDraft, guessCurrency, planSteps, readDraft, saveDraft, starterCategories } from './flow'

afterEach(() => {
  clearDraft()
  vi.useRealTimers()
})

describe('planSteps', () => {
  it('on Android: setup first, the Home Screen last', () => {
    expect(planSteps({ install: 'android', cloud: true, ph: true }))
      .toEqual(['welcome', 'name', 'accounts', 'balances', 'stayOnTrack', 'install', 'done'])
  })

  it('on an iPhone in Safari: the Home Screen FIRST, since the icon keeps its own storage', () => {
    const plan = planSteps({ install: 'ios', cloud: true, ph: true })
    expect(plan.indexOf('installFirst')).toBe(1)
    expect(plan).not.toContain('install')
  })

  it('from the Home Screen: no install step at all', () => {
    const plan = planSteps({ install: 'installed', cloud: true, ph: true })
    expect(plan).not.toContain('install')
    expect(plan).not.toContain('installFirst')
  })

  it("inside Messenger's browser: the way out comes first", () => {
    expect(planSteps({ install: 'in-app', cloud: true, ph: true })[1]).toBe('openInBrowser')
  })

  it('asks the currency only outside the Philippines, and the backup only with a cloud', () => {
    expect(planSteps({ install: 'desktop', cloud: false, ph: true }))
      .toEqual(['welcome', 'name', 'accounts', 'balances', 'done'])
    expect(planSteps({ install: 'desktop', cloud: false, ph: false })).toContain('currency')
  })
})

describe('starterCategories', () => {
  it('gives a new ledger everyday categories, the system ones, and no repeats', () => {
    const cats = starterCategories()
    const names = cats.map(c => `${c.type}:${c.name}`)
    expect(new Set(names).size).toBe(names.length)
    for (const n of ['expense:Food', 'expense:Transpo', 'expense:Bills', 'expense:Others', 'inflow:Salary', 'inflow:Income', 'transfer:Transfer', 'expense:Transfer Fee']) {
      expect(names).toContain(n)
    }
    expect(cats.every(c => c.budget === 0)).toBe(true)
  })

  it("includes Investment, where an investment account's value updates are filed", () => {
    expect(starterCategories().some(c => c.name === 'Investment' && c.type === 'inflow')).toBe(true)
  })
})

describe('the draft', () => {
  const draft = { step: /** @type {const} */ ('balances'), name: 'Ana', currency: 'PHP', picked: ['GCash'], custom: [], balances: { Cash: '500' }, limits: {} }

  it('comes back as it was left', () => {
    saveDraft(draft)
    expect(readDraft()).toMatchObject(draft)
  })

  it('is forgotten once cleared', () => {
    saveDraft(draft)
    clearDraft()
    expect(readDraft()).toBeNull()
  })

  it('is a setup abandoned, not interrupted, after six hours', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 28, 8))
    saveDraft(draft)
    vi.setSystemTime(new Date(2026, 8, 28, 15))
    expect(readDraft()).toBeNull()
  })
})

describe('guessCurrency', () => {
  it('only ever answers with one of the currencies offered', () => {
    const offered = ['PHP', 'USD', 'SGD', 'EUR', 'AED', 'AUD', 'JPY', 'GBP']
    expect(offered).toContain(guessCurrency(offered))
    expect(guessCurrency(['PHP'])).toBe('PHP')
  })
})
