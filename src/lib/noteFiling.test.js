import { describe, it, expect } from 'vitest'
import { cleanTags, folderCounts, inView, normalizeFolderName, normalizeTag, tagCounts, MAX_TAGS, TAG_MAX } from './noteFiling'

describe('normalizeTag', () => {
  it('keeps one word whatever way it was typed', () => {
    expect(normalizeTag('Pay Day')).toBe('pay-day')
    expect(normalizeTag('#pay-day')).toBe('pay-day')
    expect(normalizeTag('  ##Pay_day  ')).toBe('pay-day')
    expect(normalizeTag('PAY   DAY')).toBe('pay-day')
  })

  it('drops what is not a letter, a digit or a dash, keeping accents and other scripts', () => {
    expect(normalizeTag('Café!')).toBe('café')
    expect(normalizeTag('to-do?!')).toBe('to-do')
    expect(normalizeTag('日本')).toBe('日本')
    expect(normalizeTag('a--b')).toBe('a-b')
  })

  it('is empty when nothing is left, and never ends or starts with a dash', () => {
    expect(normalizeTag('#')).toBe('')
    expect(normalizeTag('!!!')).toBe('')
    expect(normalizeTag(null)).toBe('')
    expect(normalizeTag('-ok-')).toBe('ok')
  })

  it('is cut at the longest a tag may be, without leaving a dash on the end', () => {
    const long = normalizeTag('a'.repeat(TAG_MAX + 10))
    expect(long).toHaveLength(TAG_MAX)
    expect(normalizeTag(`${'a'.repeat(TAG_MAX - 1)} b`)).toBe('a'.repeat(TAG_MAX - 1))
  })
})

describe('cleanTags', () => {
  it('normalises each, drops empties and repeats, in order', () => {
    expect(cleanTags(['Ideas', '#ideas', '', 'Pay Day', 'pay-day', 'work'])).toEqual(['ideas', 'pay-day', 'work'])
  })

  it('holds no more than a note may', () => {
    const many = Array.from({ length: MAX_TAGS + 5 }, (_, i) => `t${i}`)
    expect(cleanTags(many)).toHaveLength(MAX_TAGS)
    expect(cleanTags(many)[0]).toBe('t0')
  })

  it('is empty for anything that is not a list', () => {
    expect(cleanTags(undefined)).toEqual([])
    expect(cleanTags('ideas')).toEqual([])
  })
})

describe('normalizeFolderName', () => {
  it('trims and keeps one space between words', () => {
    expect(normalizeFolderName('  Work   stuff ')).toBe('Work stuff')
    expect(normalizeFolderName(undefined)).toBe('')
  })
})

describe('counting', () => {
  const notes = [
    { folder: 'a', tags: ['ideas', 'work'] },
    { folder: 'a', tags: ['work'] },
    { folder: 'b', tags: [] },
    { folder: null, tags: ['ideas', 'ideas'] },
    {},
  ]

  it('counts tags by the notes that carry them, the most used first', () => {
    expect(tagCounts(notes)).toEqual([{ tag: 'ideas', count: 2 }, { tag: 'work', count: 2 }])
  })

  it('counts notes by folder, leaving out the unfiled', () => {
    expect([...folderCounts(notes)]).toEqual([['a', 2], ['b', 1]])
  })
})

describe('inView', () => {
  const notes = [
    { id: 1, folder: 'a', tags: ['ideas'] },
    { id: 2, folder: 'a', tags: [] },
    { id: 3, folder: 'b', tags: ['ideas'] },
    { id: 4, tags: ['ideas'] },
  ]
  const ids = (/** @type {Array<{id: number}>} */ list) => list.map(n => n.id)

  it('shows everything by default', () => {
    expect(ids(inView(notes))).toEqual([1, 2, 3, 4])
  })

  it('shows one folder, and one tag, and both together', () => {
    expect(ids(inView(notes, { folder: 'a' }))).toEqual([1, 2])
    expect(ids(inView(notes, { tag: 'ideas' }))).toEqual([1, 3, 4])
    expect(ids(inView(notes, { folder: 'a', tag: 'ideas' }))).toEqual([1])
  })
})
