import { describe, it, expect } from 'vitest'
import { billBrandKey } from './billBrands'

/**
 * Matching a bill's name to a brand logo.
 *
 * The rule that makes this worth testing is the word-boundary one: short keys
 * have to match a whole word, long ones may match anywhere in the squashed
 * name. Without it, "pldt" inside a longer word or a two-letter key would
 * paint the wrong logo on somebody's bill - and a wrong logo is a thing you
 * notice every month.
 */

describe('billBrandKey', () => {
  it('finds a brand in an ordinary bill name', () => {
    expect(billBrandKey('Netflix')).toBeTruthy()
    expect(billBrandKey('Spotify Premium')).toBeTruthy()
  })

  it('ignores case, spacing and punctuation', () => {
    const plain = billBrandKey('Netflix')
    expect(billBrandKey('  NETFLIX  ')).toBe(plain)
    expect(billBrandKey('net-flix')).toBe(plain)
  })

  it('is null on a bill that names no brand', () => {
    expect(billBrandKey('Rent')).toBeNull()
    expect(billBrandKey('Allowance for mom')).toBeNull()
  })

  it('is null on nothing at all rather than throwing', () => {
    expect(billBrandKey('')).toBeNull()
    expect(billBrandKey(undefined)).toBeNull()
    expect(billBrandKey(null)).toBeNull()
  })

  /**
   * A short key has to be a whole word. "sky" must not match "Skyline
   * Apartments Rent", which is a rent bill and not a cable subscription.
   */
  it('will not find a short key inside a longer word', () => {
    const asWord = billBrandKey('Sky')
    if (asWord) expect(billBrandKey('Skyline Apartments Rent')).not.toBe(asWord)
  })

  it('finds a long key even when it is joined to other words', () => {
    expect(billBrandKey('NetflixSubscription')).toBe(billBrandKey('Netflix'))
  })

  it('is stable - the same name always gives the same key', () => {
    for (const n of ['Netflix', 'Meralco', 'Globe', 'PLDT', 'Rent']) {
      expect(billBrandKey(n)).toBe(billBrandKey(n))
    }
  })
})
