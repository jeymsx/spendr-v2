import { describe, it, expect } from 'vitest'
import { getAvatarColor } from './Debts'

/**
 * The debt avatars carry white initials at 14px bold, which needs 4.5:1.
 *
 * The original palette was the raw Tailwind 500s and every one of the ten
 * failed - indigo at 4.47:1 down to amber at 2.15:1. They are pre-darkened
 * now, and this test is what stops someone restoring the brighter values
 * because they look nicer in isolation.
 */
const srgb = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const hex = (h) => { const s = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)) }
const onWhite = (h) => 1.05 / (lum(hex(h)) + 0.05)

describe('getAvatarColor', () => {
  it('is stable for a given name', () => {
    expect(getAvatarColor('Kuya Ramon')).toBe(getAvatarColor('Kuya Ramon'))
  })

  it('clears 4.5:1 for white initials, for any name', () => {
    const names = ['Kuya Ramon', 'Nica', 'Ate Lyn', 'Jem', 'Marco', 'A', 'Zzz',
                   'Maria Clara', 'Jose', 'X Y', '', 'Ñoño']
    for (const n of names) {
      const c = getAvatarColor(n)
      expect(onWhite(c), `${n} -> ${c}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('handles a missing name without throwing', () => {
    expect(getAvatarColor(undefined)).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
