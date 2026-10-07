// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import NoteView from './NoteView'
import { composeNote } from '../../lib/standing/compose'
import { SCENARIOS, SCENARIO_ACCOUNTS, SCENARIO_CATEGORIES } from '../../lib/standing/scenarios'
import { textOf } from '../../lib/standing/tokens'

/* What reaches the screen: the note's words, once, and its pictures drawn. */
afterEach(cleanup)

const lookups = {
  cats: Object.fromEntries(SCENARIO_CATEGORIES.map(c => [c.name, c])),
  accts: Object.fromEntries(SCENARIO_ACCOUNTS.map(a => [a.name, a])),
}
const squash = (/** @type {string} */ s) => s.replace(/\s+/g, '')

describe('NoteView', () => {
  for (const sc of SCENARIOS) {
    it(`${sc.id}: draws every word of the note, and a picture for each bar`, () => {
      const note = composeNote(sc.facts)
      const { container } = render(<NoteView note={note} lookups={lookups} />)
      const text = squash(container.textContent ?? '')
      expect(text).toContain(squash(note.title))
      expect(text).toContain(squash(note.level.label))
      for (const p of note.paragraphs) expect(text, textOf(p.tokens)).toContain(squash(textOf(p.tokens)))
      const bars = note.paragraphs.flatMap(p => p.tokens).filter(t => t.k === 'pace').length
      expect(container.querySelectorAll('[role="img"]').length).toBe(bars)
      expect(container.querySelectorAll('p')).toHaveLength(note.paragraphs.length)
    })
  }

  it('tells a screen reader how far the budget is gone, not just the bar', () => {
    const note = composeNote(SCENARIOS[0].facts)
    const { container } = render(<NoteView note={note} lookups={lookups} />)
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('48% of the budget used, 23% of the month gone')
  })

  it('draws a category it has never heard of as just its name', () => {
    const note = composeNote(SCENARIOS[0].facts)
    const { container } = render(<NoteView note={note} lookups={{ cats: {}, accts: {} }} />)
    expect(container.textContent).toContain('Rent')
  })
})
