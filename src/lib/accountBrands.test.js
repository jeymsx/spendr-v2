import { describe, it, expect } from 'vitest'
import { accountBrand, GRADIENT_PRESETS } from './accountBrands'
import { CUSTOM_PALETTE } from './phAccounts'

/**
 * The contrast invariant, locked in.
 *
 * Every card face in the app carries white text on a brand gradient, and the
 * only thing keeping that legible is aaSafeStops darkening each stop until it
 * clears 4.5:1. That solve is invisible - nothing on screen says it happened -
 * so if it ever regresses, the symptom is unreadable cards rather than a
 * crash.
 *
 * These tests assert the PROPERTY rather than specific hex values, so they go
 * on protecting the invariant when the palette changes.
 */

// WCAG 2.1 relative luminance and contrast, in gamma space - the same maths
// the library itself uses, restated here so a bug in one is not hidden by the
// same bug in the other.
const srgb = (c) => {
  const x = c / 255
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
/** @returns {[number, number, number]} */
const hex = (h) => {
  const s = h.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16))
  return [r, g, b]
}
const contrastWithWhite = (h) => (1.0 + 0.05) / (lum(hex(h)) + 0.05)

const AA_SMALL = 4.5

describe('accountBrand', () => {
  it('returns a gradient for an unknown account', () => {
    const b = accountBrand({ name: 'Some Credit Union', type: 'bank' })
    expect(b.from).toMatch(/^#[0-9a-f]{6}$/i)
    expect(b.to).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('clears 4.5:1 for white text on both stops of every known brand', () => {
    const names = ['GCash', 'Maya', 'BPI', 'BDO', 'GoTyme', 'Metrobank',
                   'SPayLater', 'China Bank', 'GrabPay', 'Cash', 'Unknown Bank']
    for (const name of names) {
      const b = accountBrand({ name, type: 'bank' })
      expect(contrastWithWhite(b.from), `${name} from ${b.from}`).toBeGreaterThanOrEqual(AA_SMALL)
      expect(contrastWithWhite(b.to),   `${name} to ${b.to}`).toBeGreaterThanOrEqual(AA_SMALL)
    }
  })

  it('clears 4.5:1 for every solid colour a user can pick', () => {
    for (const c of CUSTOM_PALETTE) {
      const b = accountBrand({ name: 'Custom', type: 'bank', customColor: true, color: c })
      expect(contrastWithWhite(b.from), `${c} -> ${b.from}`).toBeGreaterThanOrEqual(AA_SMALL)
      expect(contrastWithWhite(b.to),   `${c} -> ${b.to}`).toBeGreaterThanOrEqual(AA_SMALL)
    }
  })

  it('clears 4.5:1 for every gradient preset, both stops', () => {
    for (const [a, z] of GRADIENT_PRESETS) {
      const b = accountBrand({ name: 'Custom', type: 'bank', customColor: true, color: `${a},${z}` })
      expect(contrastWithWhite(b.from), `${a} -> ${b.from}`).toBeGreaterThanOrEqual(AA_SMALL)
      expect(contrastWithWhite(b.to),   `${z} -> ${b.to}`).toBeGreaterThanOrEqual(AA_SMALL)
    }
  })

  it('keeps the brand mark when a custom colour overrides the gradient', () => {
    // A repainted Metrobank card is still a Metrobank card: only the gradient
    // is overridden, so the mark and logo keys survive.
    const stock  = accountBrand({ name: 'Metrobank', type: 'bank' })
    const custom = accountBrand({ name: 'Metrobank', type: 'bank', customColor: true, color: '#845EF7' })
    expect(custom.mark).toBe(stock.mark)
    expect(custom.from).not.toBe(stock.from)
  })

  it('ignores a custom colour that is not set', () => {
    const stock  = accountBrand({ name: 'GCash', type: 'ewallet' })
    const nocust = accountBrand({ name: 'GCash', type: 'ewallet', color: '#845EF7' })
    expect(nocust.from).toBe(stock.from)
  })

  it('falls back rather than throwing on a malformed colour', () => {
    const b = accountBrand({ name: 'X', type: 'bank', customColor: true, color: 'not-a-colour' })
    expect(b.from).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('GRADIENT_PRESETS', () => {
  it('is a list of two-colour pairs', () => {
    expect(GRADIENT_PRESETS.length).toBeGreaterThan(0)
    for (const p of GRADIENT_PRESETS) {
      expect(p).toHaveLength(2)
      expect(p[0]).toMatch(/^#[0-9a-f]{6}$/i)
      expect(p[1]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
