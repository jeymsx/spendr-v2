import { describe, it, expect } from 'vitest'
import { buildCashFlow } from './cashFlowData'

const inflow = (description, amount, extra = {}) => ({ type: 'inflow', description, category: 'Income', amount, account: 'BPI', ...extra })
const spend = (category, amount, account = 'Cash', extra = {}) => ({ type: 'expense', description: category, category, amount, account, ...extra })
const catMap = { Food: { color: '#f90' }, Rent: { color: '#80f' } }
const acctMap = { Cash: { id: 1, color: '#0a0' }, BPI: { id: 2, color: '#a00' } }
const sum = (/** @type {Array<{value: number}>} */ list) => list.reduce((s, n) => s + n.value, 0)

describe('buildCashFlow', () => {
  it('groups money in by what it was and money out by category, each with its rows', () => {
    const inflows = [inflow('Salary', 1000), inflow('Salary', 1000), inflow('Gift', 300)]
    const expenses = [spend('Food', 200), spend('Food', 100), spend('Rent', 900)]
    const f = buildCashFlow({ inflows, expenses, catMap, acctMap })
    expect(f.sources.map(s => [s.name, s.value, s.txs.length])).toEqual([['Salary', 2000, 2], ['Gift', 300, 1]])
    expect(f.targets.filter(t => t.kind === 'category').map(t => [t.name, t.value, t.txs.length])).toEqual([['Rent', 900, 1], ['Food', 300, 2]])
    expect(f.targets[0].href).toBe('/categories/Rent')
    expect(f.targets[0].color).toBe('#80f')
  })

  it('both sides always add up: what is kept goes on the right', () => {
    const f = buildCashFlow({ inflows: [inflow('Salary', 1000)], expenses: [spend('Food', 250)], catMap, acctMap })
    const kept = f.targets.find(t => t.kind === 'kept')
    expect(kept?.value).toBe(750)
    expect(kept?.txs).toEqual([])
    expect(f.sources.some(s => s.kind === 'savings')).toBe(false)
    expect(sum(f.sources)).toBe(sum(f.targets))
  })

  it('and the gap, when more went out than came in, comes from savings', () => {
    const f = buildCashFlow({ inflows: [inflow('Salary', 100)], expenses: [spend('Rent', 400)], catMap, acctMap })
    const drawn = f.sources.find(s => s.kind === 'savings')
    expect(drawn?.value).toBe(300)
    expect(f.targets.some(t => t.kind === 'kept')).toBe(false)
    expect(sum(f.sources)).toBe(sum(f.targets))
  })

  it('keeps the biggest six sources and eight targets, the rest together with their rows', () => {
    const inflows = Array.from({ length: 8 }, (_, i) => inflow(`Source ${i}`, 1000 - i * 10))
    const expenses = Array.from({ length: 11 }, (_, i) => spend(`Cat ${i}`, 500 - i * 10))
    const f = buildCashFlow({ inflows, expenses, catMap, acctMap })
    const other = f.sources.find(s => s.kind === 'other-income')
    expect(f.sources.filter(s => s.kind === 'income')).toHaveLength(6)
    expect(other?.txs).toHaveLength(2)
    expect(other?.value).toBe(940 + 930)
    const rest = f.targets.find(t => t.kind === 'rest')
    expect(f.targets.filter(t => t.kind === 'category')).toHaveLength(8)
    expect(rest?.txs).toHaveLength(3)
  })

  it('can group money out by account instead, linking each to its page', () => {
    const f = buildCashFlow({ inflows: [inflow('Salary', 1000)], expenses: [spend('Food', 200, 'Cash'), spend('Rent', 500, 'BPI')], catMap, acctMap, by: 'account' })
    expect(f.targets.filter(t => t.kind === 'account').map(t => [t.name, t.value, t.color, t.href])).toEqual([['BPI', 500, '#a00', '/accounts/2'], ['Cash', 200, '#0a0', '/accounts/1']])
  })

  it('leaves out a group whose refunds outweigh its spending, but not its rows from the total', () => {
    const expenses = [spend('Food', 100), spend('Food', -150), spend('Rent', 400)]
    const f = buildCashFlow({ inflows: [], expenses, catMap, acctMap })
    expect(f.targets.map(t => t.name)).toEqual(['Rent'])
  })

  it('is empty with nothing in it', () => {
    const f = buildCashFlow({ inflows: [], expenses: [], catMap, acctMap })
    expect(f.sources).toEqual([])
    expect(f.targets).toEqual([])
  })
})
