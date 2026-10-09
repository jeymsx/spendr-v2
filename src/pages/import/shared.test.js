import { describe, it, expect } from 'vitest'
import { LIMITS, cleanText, cleanName, nameKey, nameIndex, stripInvisible, canImport } from './shared'

/**
 * Names and text from a file. "cash" beside "Cash", a 5,000-character account
 * name and a name with a zero-width space in it were all things the forms
 * refuse and the importer made.
 */

const ZWSP = String.fromCodePoint(0x200B)
const BOM = String.fromCodePoint(0xFEFF)
const RLO = String.fromCodePoint(0x202E)
const LRI = String.fromCodePoint(0x2066)
const PDI = String.fromCodePoint(0x2069)
const WJ = String.fromCodePoint(0x2060)

describe('the limits are the forms limits', () => {
  it('are 100, 40 and 30', () => {
    expect(LIMITS).toEqual({ description: 100, account: 40, category: 30 })
  })
})

describe('invisible characters', () => {
  it('are taken out whole, wherever they are', () => {
    expect(stripInvisible(`${BOM}a${ZWSP}b${WJ}c${RLO}d${LRI}e${PDI}`)).toBe('abcde')
    expect(stripInvisible('plain')).toBe('plain')
    expect(stripInvisible('')).toBe('')
  })

  it('leave the visible characters beside them alone, emoji and accents included', () => {
    const wallet = String.fromCodePoint(0x1F45B)
    expect(stripInvisible(`Caf${String.fromCodePoint(0xE9)} ${wallet}${ZWSP}`)).toBe(`Caf${String.fromCodePoint(0xE9)} ${wallet}`)
  })
})

describe('text', () => {
  it('is trimmed, cleaned and cut, and never null', () => {
    expect(cleanText(`  hi${ZWSP}  `, 100)).toBe('hi')
    expect(cleanText(null, 100)).toBe('')
    expect(cleanText(undefined, 100)).toBe('')
    expect(cleanText(12, 100)).toBe('12')
    expect(cleanText('x'.repeat(500), 100)).toHaveLength(100)
  })

  it('is cut by what an input counts, without splitting a pair', () => {
    const wallet = String.fromCodePoint(0x1F45B)
    // 39 letters and a 2-unit emoji is 41 units: the emoji does not fit, so it goes whole.
    expect(cleanText('a'.repeat(39) + wallet, 40)).toBe('a'.repeat(39))
    expect(cleanText('a'.repeat(38) + wallet, 40)).toBe('a'.repeat(38) + wallet)
    expect(cleanText('a'.repeat(39) + ' b', 40)).toBe('a'.repeat(39))
  })

  it('keeps the spacing inside it', () => {
    expect(cleanText('a   b', 100)).toBe('a   b')
  })
})

describe('names', () => {
  it('make every run of spaces one, and put an accent in one form', () => {
    expect(cleanName('  Eating \t  out\n', 30)).toBe('Eating out')
    expect(cleanName(`Cafe${String.fromCodePoint(0x301)}`, 30)).toBe(`Caf${String.fromCodePoint(0xE9)}`)
  })

  it('are cut to the limit and trimmed again after the cut', () => {
    expect(cleanName('L'.repeat(5000), 40)).toHaveLength(40)
    expect(cleanName(`${'a'.repeat(29)} b`, 30)).toBe('a'.repeat(29))
  })

  it('are the same name whatever the case, spacing or hidden characters', () => {
    const key = nameKey('Cash', 40)
    for (const other of ['cash', 'CASH', ' Cash ', `C${ZWSP}ash`, `${RLO}cASH`, 'Cash' + String.fromCodePoint(0xA0)]) {
      expect(nameKey(other, 40)).toBe(key)
    }
    expect(nameKey('Cash 2', 40)).not.toBe(key)
    expect(nameKey('Ca sh', 40)).not.toBe(key)
  })
})

describe('the names a wallet has', () => {
  it('are the spelling a file name lands on', () => {
    const index = nameIndex(['Cash', 'BPI'], LIMITS.account)
    expect(index.pick('cash')).toBe('Cash')
    expect(index.pick('  bpi ')).toBe('BPI')
    expect(index.pick(`B${ZWSP}PI`)).toBe('BPI')
    expect(index.known('CASH')).toBe('Cash')
    expect(index.known('GCash')).toBeUndefined()
  })

  it('spell a new name the way the file first did, for every later spelling', () => {
    const index = nameIndex(['Cash'], LIMITS.account)
    expect(index.pick('Maya')).toBe('Maya')
    expect(index.pick('MAYA')).toBe('Maya')
    expect(index.pick(' maya ')).toBe('Maya')
    // A new name is not a known one: it is still to be created.
    expect(index.known('Maya')).toBeUndefined()
  })

  it('cut a new name to the limit, and meet a second long one at the same place', () => {
    const index = nameIndex([], LIMITS.account)
    const first = index.pick('L'.repeat(5000))
    expect(first).toBe('L'.repeat(40))
    expect(index.pick('L'.repeat(60))).toBe(first)
  })

  it('leave blank, or nothing but hidden characters, blank', () => {
    const index = nameIndex(['Cash'], LIMITS.account)
    expect(index.pick('')).toBe('')
    expect(index.pick(null)).toBe('')
    expect(index.pick(`${ZWSP}${BOM}`)).toBe('')
  })

  it('know a name that is longer than a form would allow', () => {
    const long = 'N'.repeat(60)
    const index = nameIndex([long], LIMITS.account)
    expect(index.pick(long)).toBe(long)
    expect(index.known('N'.repeat(45))).toBe(long)
  })

  it('give a name the wallet has exactly as written back as it is, when two differ only in case', () => {
    const index = nameIndex(['Cash', 'cash'], LIMITS.account)
    expect(index.pick('cash')).toBe('cash')
    expect(index.pick('Cash')).toBe('Cash')
    // A third spelling lands on the first.
    expect(index.pick('CASH')).toBe('Cash')
  })
})

describe('a row that can be imported', () => {
  it('has no problem', () => {
    expect(canImport({})).toBe(true)
    expect(canImport({ problem: undefined })).toBe(true)
    expect(canImport({ problem: 'No date' })).toBe(false)
  })
})
