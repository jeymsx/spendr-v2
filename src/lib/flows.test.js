import { describe, expect, it } from 'vitest'
import { isAdjustment, isFlowRow, isIncome, isSpend } from './flows'

describe('what counts as income and spending', () => {
  it('counts ordinary expenses and inflows, refunds included', () => {
    expect(isSpend({ type: 'expense', amount: 500 })).toBe(true)
    expect(isSpend({ type: 'expense', amount: -200, refundOf: 'x' })).toBe(true)
    expect(isIncome({ type: 'inflow', amount: 30000 })).toBe(true)
    expect(isFlowRow({ type: 'transfer', amount: 100 })).toBe(false)
  })

  it('leaves out a row marked as an adjustment', () => {
    const correction = { type: 'inflow', amount: 700, adjust: 'correction' }
    const value = { type: 'expense', amount: 300, adjust: 'value' }
    expect(isAdjustment(correction)).toBe(true)
    expect(isIncome(correction)).toBe(false)
    expect(isSpend(value)).toBe(false)
    expect(isFlowRow(value)).toBe(false)
  })

  it('recognises corrections written before the flag existed, by the words the app gave them', () => {
    expect(isSpend({ type: 'expense', amount: 80, description: 'Balance adjustment' })).toBe(false)
    expect(isIncome({ type: 'inflow', amount: 80, description: 'Value update' })).toBe(false)
    expect(isSpend({ type: 'expense', amount: 80, description: 'Balance adjustments for Q3' })).toBe(true)
  })

  it('is safe on nothing', () => {
    expect(isSpend(undefined)).toBe(false)
    expect(isIncome(null)).toBe(false)
    expect(isAdjustment(undefined)).toBe(false)
  })
})
