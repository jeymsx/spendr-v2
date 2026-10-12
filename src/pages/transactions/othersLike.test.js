import { describe, it, expect } from 'vitest'
import { othersLike } from './othersLike'

const row = (id, over = {}) => ({ id, type: 'expense', category: 'Shopping', description: 'Jollibee', amount: 100, account: 'Cash', ...over })

describe('othersLike', () => {
  const tapped = row(1)

  it('finds the same description under the category it left, whatever the case and spacing', () => {
    const all = [tapped, row(2), row(3, { description: '  jollibee ' }), row(4, { description: 'JOLLI​BEE' })]
    expect(othersLike(tapped, all).map(r => r.id)).toEqual([2, 3, 4])
  })

  it('leaves a row already filed somewhere else', () => {
    expect(othersLike(tapped, [tapped, row(2, { category: 'Food' })])).toEqual([])
  })

  it('leaves other descriptions and the other kind', () => {
    const all = [tapped, row(2, { description: 'Jollibee Delivery' }), row(3, { type: 'inflow' })]
    expect(othersLike(tapped, all)).toEqual([])
  })

  it('leaves split legs, refunds, settlements and transfers', () => {
    const all = [tapped,
      row(2, { splitId: 's1' }),
      row(3, { refundOf: 'x' }),
      row(4, { settles: 'p1' }),
      row(5, { type: 'transfer' })]
    expect(othersLike(tapped, all)).toEqual([])
  })

  it('leaves what moved with it already', () => {
    expect(othersLike(tapped, [tapped, row(2), row(3)], [2]).map(r => r.id)).toEqual([3])
  })

  it('offers nothing for a row with no description', () => {
    const blank = row(1, { description: '  ' })
    expect(othersLike(blank, [blank, row(2, { description: '' })])).toEqual([])
  })
})
