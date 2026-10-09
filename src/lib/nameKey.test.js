import { describe, expect, it } from 'vitest'
import { nameKey, stripInvisible } from './nameKey'

describe('stripInvisible', () => {
  it('takes out every invisible character in the list', () => {
    const invisible = ['\u200B', '\u200C', '\u200D', '\uFEFF', '\u2060',
      '\u202A', '\u202B', '\u202C', '\u202D', '\u202E', '\u2066', '\u2067', '\u2068', '\u2069']
    for (const ch of invisible) expect(stripInvisible(`Ca${ch}sh`)).toBe('Cash')
    expect(stripInvisible(invisible.join('') + 'Cash' + invisible.join(''))).toBe('Cash')
  })

  it('trims, and leaves spacing inside a name as it was typed', () => {
    expect(stripInvisible('  Eating   out ')).toBe('Eating   out')
    // A zero-width space is not whitespace to trim(), so it cannot hide a blank name.
    expect(stripInvisible('\u200B \u200B')).toBe('')
  })

  it('is an empty string for nothing', () => {
    expect(stripInvisible(undefined)).toBe('')
    expect(stripInvisible(null)).toBe('')
  })
})

describe('nameKey', () => {
  it('makes look-alikes one key', () => {
    expect(nameKey('Ca\u200Bsh')).toBe(nameKey('Cash'))
    expect(nameKey('  food ')).toBe(nameKey('FOOD'))
    expect(nameKey('Eating   out')).toBe(nameKey('eating out'))
    expect(nameKey('Eating\u00A0out')).toBe(nameKey('Eating out'))
    expect(nameKey('F\u2060o\uFEFFod\u202E')).toBe('food')
  })

  it('keeps different names apart', () => {
    expect(nameKey('Food')).not.toBe(nameKey('Foods'))
    expect(nameKey('Eating out')).not.toBe(nameKey('Eatingout'))
  })
})
