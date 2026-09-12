import { describe, it, expect } from 'vitest'
import { CARD_DESIGNS, DEFAULT_DESIGN, normalizeDesign, designMeta } from './cardDesigns'

/**
 * The alias map, which is the only thing standing between a removed design and
 * somebody's card quietly reverting to a bare gradient.
 *
 * Every entry here exists because a design was renamed or dropped, and the
 * accounts already wearing it are rows in a database nobody is going to
 * migrate. Getting this wrong is invisible in review and visible on the home
 * screen of whoever picked the design that went away.
 */

describe('normalizeDesign', () => {
  it('passes a live design through untouched', () => {
    for (const d of CARD_DESIGNS) expect(normalizeDesign(d.key)).toBe(d.key)
  })

  it('maps every retired name onto a design that still exists', () => {
    for (const old of ['aurora', 'ripple', 'wave', 'onyx', 'weave']) {
      const resolved = normalizeDesign(old)
      expect(CARD_DESIGNS.some(d => d.key === resolved)).toBe(true)
      // And specifically NOT the fallback - the whole point is that a retired
      // design keeps a pattern rather than reverting to a bare gradient.
      expect(resolved).not.toBe(DEFAULT_DESIGN)
    }
  })

  it('falls back for a value that means nothing at all', () => {
    expect(normalizeDesign('not-a-design')).toBe(DEFAULT_DESIGN)
    expect(normalizeDesign(undefined)).toBe(DEFAULT_DESIGN)
    expect(normalizeDesign(null)).toBe(DEFAULT_DESIGN)
    expect(normalizeDesign('')).toBe(DEFAULT_DESIGN)
  })

  it('is idempotent, so normalising twice cannot drift', () => {
    for (const key of ['onyx', 'wave', 'classic', 'nonsense', undefined]) {
      expect(normalizeDesign(normalizeDesign(key))).toBe(normalizeDesign(key))
    }
  })
})

describe('designMeta', () => {
  it('always returns a design, never undefined', () => {
    for (const key of ['classic', 'onyx', 'nonsense', undefined]) {
      expect(designMeta(key)).toBeTruthy()
      expect(typeof designMeta(key).key).toBe('string')
    }
  })

  it('resolves an alias to the real design meta', () => {
    expect(designMeta('onyx').key).toBe(normalizeDesign('onyx'))
  })
})

describe('CARD_DESIGNS', () => {
  it('has no duplicate keys', () => {
    const keys = CARD_DESIGNS.map(d => d.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('includes the default, or every unknown value would resolve to nothing', () => {
    expect(CARD_DESIGNS.some(d => d.key === DEFAULT_DESIGN)).toBe(true)
  })

  it('gives every design a name and a hint for the gallery', () => {
    for (const d of CARD_DESIGNS) {
      expect(typeof d.name).toBe('string')
      expect(typeof d.hint).toBe('string')
    }
  })
})
