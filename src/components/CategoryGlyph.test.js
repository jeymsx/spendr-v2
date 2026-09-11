import { describe, it, expect } from 'vitest'
import { categoryIcon } from './CategoryGlyph'
import { EXPENSE_PRESETS, INFLOW_PRESETS } from '../lib/phCategories'

/* The map is keyed on the category NAME, which makes it silently fall back to
   an emoji the moment a preset is renamed or added without touching it. These
   tests are here to make that loud. */

describe('categoryIcon', () => {
  const named = (list) => list.map(c => [c.name, c])

  it.each(named(EXPENSE_PRESETS))('has an icon for the %s preset', (name, cat) => {
    expect(categoryIcon(cat), `no icon for preset "${name}"`).toBeTruthy()
  })

  it.each(named(INFLOW_PRESETS))('has an icon for the %s preset', (name, cat) => {
    expect(categoryIcon(cat), `no icon for preset "${name}"`).toBeTruthy()
  })

  it('knows Payment, which is hand-made rather than a preset', () => {
    expect(categoryIcon({ name: 'Payment' })).toBeTruthy()
  })

  it('knows the system categories', () => {
    for (const name of ['Others', 'Income', 'Transfer', 'Transfer Fee']) {
      expect(categoryIcon({ name }), name).toBeTruthy()
    }
  })

  it('falls back to nothing for a category it does not know', () => {
    // Deliberate: an unknown category keeps its own emoji rather than being
    // handed a generic box.
    expect(categoryIcon({ name: 'Sari-sari tab' })).toBeNull()
    expect(categoryIcon(null)).toBeNull()
    expect(categoryIcon(undefined)).toBeNull()
  })

  it('returns the same identity for the same name', () => {
    // CategoryGlyph suppresses react-hooks/static-components on the strength
    // of this: the lookup is a frozen map, not a component built per render.
    expect(categoryIcon({ name: 'Food' })).toBe(categoryIcon({ name: 'Food' }))
  })
})
