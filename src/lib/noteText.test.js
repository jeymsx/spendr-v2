import { describe, it, expect } from 'vitest'
import {
  NEW_NOTE_DOC, docLines, docText, isBlankDoc, noteTitle, notePreview, noteWhen, noteStamp,
  noteGroups, noteMatches,
} from './noteText'

/**
 * A note's words, read off its document without an editor: the list, search
 * and a note arriving from another device all depend on these.
 */

/** @param {string} t @param {any[]} [marks] */
const text = (t, marks) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) })
const p = (/** @type {any[]} */ ...c) => ({ type: 'paragraph', content: c })
const h = (/** @type {number} */ level, /** @type {any[]} */ ...c) => ({ type: 'heading', attrs: { level }, content: c })
const doc = (/** @type {any[]} */ ...c) => ({ type: 'doc', content: c })

const plans = doc(
  h(1, text('Payday plan')),
  p(text('Rent first, '), text('then', [{ type: 'bold' }]), text(' savings.')),
  { type: 'bulletList', content: [
    { type: 'listItem', content: [p(text('Meralco'))] },
    { type: 'listItem', content: [p(text('Globe')), { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('postpaid'))] }] }] },
  ] },
  { type: 'taskList', content: [
    { type: 'taskItem', attrs: { checked: true }, content: [p(text('Move 5k to Maya'))] },
  ] },
  { type: 'codeBlock', content: [text('ref 1234\nline two')] },
  p(text('a'), { type: 'hardBreak' }, text('b')),
)

describe('docLines / docText', () => {
  it('reads every line in order, lists and checklists included', () => {
    expect(docLines(plans)).toEqual([
      'Payday plan', 'Rent first, then savings.', 'Meralco', 'Globe', 'postpaid',
      'Move 5k to Maya', 'ref 1234', 'line two', 'a', 'b',
    ])
    expect(docText(plans).split('\n')).toHaveLength(10)
  })

  it('makes nothing of an empty or a malformed document', () => {
    expect(docText(NEW_NOTE_DOC)).toBe('')
    expect(docText(null)).toBe('')
    expect(docText(/** @type {any} */ ({ type: 'doc', content: [null, 3, { type: 'mystery' }] }))).toBe('')
    expect(isBlankDoc(doc(p(text('   ')), p()))).toBe(true)
    expect(isBlankDoc(plans)).toBe(false)
  })
})

describe('noteTitle / notePreview', () => {
  it('takes the first line with words on it as the title', () => {
    expect(noteTitle(plans)).toBe('Payday plan')
    expect(noteTitle(doc(p(), p(text('  Groceries  ')), p(text('eggs'))))).toBe('Groceries')
    expect(noteTitle(NEW_NOTE_DOC)).toBe('')
  })

  it('keeps a title to one line of sensible length', () => {
    expect(noteTitle(doc(p(text('x'.repeat(300)))))).toHaveLength(120)
    expect(noteTitle(doc(p(text('two   spaces\tand tab'))))).toBe('two spaces and tab')
  })

  it('previews what comes after the title, run together', () => {
    expect(notePreview(docText(plans))).toBe('Rent first, then savings. Meralco Globe postpaid Move 5k to Maya ref 1234 line two a b')
    expect(notePreview('Only a title')).toBe('')
    expect(notePreview('\n\nTitle\n\n  second  \nthird')).toBe('second third')
    expect(notePreview('')).toBe('')
  })
})

describe('noteWhen', () => {
  const now = new Date(2026, 8, 30, 15, 0)
  it('says the time today, then Yesterday, the weekday, and a date', () => {
    expect(noteWhen(new Date(2026, 8, 30, 9, 41).toISOString(), now)).toMatch(/^9:41\s?(AM|am)$/)
    expect(noteWhen(new Date(2026, 8, 29, 23, 0).toISOString(), now)).toBe('Yesterday')
    expect(noteWhen(new Date(2026, 8, 25, 12, 0).toISOString(), now)).toBe('Friday')
    expect(noteWhen(new Date(2026, 7, 3, 12, 0).toISOString(), now)).toBe('Aug 3')
    expect(noteWhen(new Date(2025, 11, 24, 12, 0).toISOString(), now)).toBe('Dec 24, 2025')
    expect(noteWhen(null, now)).toBe('')
  })

  it('stamps an open note with its full date and time', () => {
    expect(noteStamp(new Date(2026, 8, 30, 9, 41).toISOString())).toMatch(/^September 30, 2026 at 9:41\s?(AM|am)$/)
    expect(noteStamp('not a date')).toBe('')
  })
})

describe('noteGroups', () => {
  const now = new Date(2026, 8, 30, 15, 0)
  const at = (/** @type {number} */ y, /** @type {number} */ m, /** @type {number} */ d) => new Date(y, m - 1, d, 12).toISOString()
  it('files notes the way iOS Notes does, pinned first', () => {
    const notes = [
      { id: 1, editedAt: at(2026, 9, 30) },
      { id: 2, editedAt: at(2026, 9, 29) },
      { id: 3, editedAt: at(2026, 9, 24), pinned: true },
      { id: 4, editedAt: at(2026, 9, 23) },
      { id: 5, editedAt: at(2026, 9, 10) },
      { id: 6, editedAt: at(2026, 7, 2) },
      { id: 7, editedAt: at(2026, 6, 30) },
      { id: 8, editedAt: at(2025, 3, 1) },
    ]
    const groups = noteGroups(notes, now)
    expect(groups.map(g => [g.label, g.notes.map(n => n.id)])).toEqual([
      ['Pinned', [3]],
      ['Today', [1]],
      ['Yesterday', [2]],
      ['Previous 7 days', [4]],
      ['Previous 30 days', [5]],
      ['July', [6]],
      ['June', [7]],
      ['2025', [8]],
    ])
  })

  it('has no sections for no notes', () => {
    expect(noteGroups([], now)).toEqual([])
  })
})

describe('noteMatches', () => {
  it('finds words in the title or the text, ignoring case and accents', () => {
    const n = { title: 'Café list', text: 'Café list\nOat milk, BEANS' }
    expect(noteMatches(n, 'cafe')).toBe(true)
    expect(noteMatches(n, 'beans')).toBe(true)
    expect(noteMatches(n, 'tea')).toBe(false)
    expect(noteMatches(n, '   ')).toBe(true)
  })

  it('counts a note\'s tags as words in it', () => {
    const n = { title: 'Rent', text: 'Rent\nPay it', tags: ['payday', 'to-do'] }
    expect(noteMatches(n, 'payday')).toBe(true)
    expect(noteMatches(n, 'to-do')).toBe(true)
    expect(noteMatches({ ...n, tags: [] }, 'payday')).toBe(false)
  })

  it('looks at the tags alone for a query that starts with #', () => {
    const n = { title: 'Pay the bills', text: 'Pay the bills', tags: ['payday'] }
    expect(noteMatches(n, '#pay')).toBe(true)
    expect(noteMatches(n, '#payday')).toBe(true)
    expect(noteMatches(n, '#bills')).toBe(false)
    expect(noteMatches({ ...n, tags: [] }, '#pay')).toBe(false)
    expect(noteMatches(n, '#')).toBe(true)
  })
})
