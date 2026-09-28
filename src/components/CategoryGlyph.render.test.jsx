// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import CategoryGlyph from './CategoryGlyph'

/* What reaches the screen: a line icon (an svg) or the emoji as text. */
afterEach(cleanup)

const drawn = (/** @type {HTMLElement} */ el) => !!el.querySelector('svg')

describe('CategoryGlyph', () => {
  it('draws the fallback a caller passes when there is no category', () => {
    for (const emoji of ['💸', '🔁', '⚡', '🏷️', '📦']) {
      const { container } = render(<CategoryGlyph cat={null} emoji={emoji} />)
      expect(drawn(container), emoji).toBe(true)
      expect(container.textContent).not.toContain(emoji)
      cleanup()
    }
  })

  it('keeps the emoji of a custom category it has no glyph for', () => {
    const { container } = render(<CategoryGlyph cat={{ name: 'Sari-sari tab', icon: '🧃' }} emoji="💸" />)
    expect(drawn(container)).toBe(false)
    expect(container.textContent).toBe('🧃')
  })
})
