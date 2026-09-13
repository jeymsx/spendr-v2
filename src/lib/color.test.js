import { describe, it, expect } from 'vitest'
import { parseHex, toHex, relativeLuminance, contrastRatio, readableInk } from './color'

describe('parseHex', () => {
  it('reads six hex digits, with or without the hash', () => {
    expect(parseHex('#2D9DFF')).toEqual([45, 157, 255])
    expect(parseHex('2d9dff')).toEqual([45, 157, 255])
  })

  /** Colours arrive from sync, from old rows, and from a picker that may not
   *  exist yet - none of which this can assume are well-formed. */
  it('is null for anything else', () => {
    for (const bad of ['#fff', 'red', '', null, undefined, '#2d9dfff']) {
      expect(parseHex(/** @type {any} */ (bad))).toBeNull()
    }
  })
})

describe('toHex', () => {
  it('round-trips, clamps and rounds', () => {
    expect(toHex([45, 157, 255])).toBe('#2d9dff')
    expect(toHex([-10, 300, 127.6])).toBe('#00ff80')
  })
})

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0)
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10)
  })
})

describe('contrastRatio', () => {
  it('is 21 for black on white, and 1 for a colour on itself', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6)
    expect(contrastRatio([45, 157, 255], [45, 157, 255])).toBe(1)
  })

  it('does not care which way round the pair is given', () => {
    const a = [45, 157, 255], b = [255, 255, 255]
    expect(contrastRatio(a, b)).toBe(contrastRatio(b, a))
  })
})

describe('readableInk', () => {
  /* The whole reason the function exists: one ink cannot serve both ends of
     this palette. */
  it('inks a light fill dark and a dark fill white', () => {
    expect(readableInk('#FFB347')).not.toBe('#ffffff')   // light orange
    expect(readableInk('#845EF7')).toBe('#ffffff')       // violet
  })

  /** Every colour the app ships, plus the two the CSS note calls worst case. */
  it('clears 3:1 on every category colour, the bar a graphic needs', () => {
    const palette = [
      '#6b7280', '#FFB347', '#FF8CC8', '#2D9DFF', '#FF6B6B', '#845EF7',
      '#51CF66', '#20C997', '#22c55e', '#f59e0b', '#FCC419', '#94a3b8',
      '#10b981', '#ef4444', '#ec4899', '#6366f1', '#84cc16', '#0ea5e9',
    ]
    for (const hex of palette) {
      const ratio = contrastRatio(
        /** @type {number[]} */ (parseHex(hex)),
        /** @type {number[]} */ (parseHex(readableInk(hex))),
      )
      expect(ratio, `${hex} -> ${readableInk(hex)}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps the hue rather than going to flat black', () => {
    // A near-black orange, not #000000 - the ink still belongs to its tile.
    const ink = /** @type {number[]} */ (parseHex(readableInk('#FFB347')))
    expect(ink[0]).toBeGreaterThan(ink[2])
  })

  it('falls back for a colour it cannot read', () => {
    expect(readableInk(undefined)).toBe('#ffffff')
    expect(readableInk('nonsense', '#000000')).toBe('#000000')
  })
})
