// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { keepCaretClear } from './keyboardRoom'
import { forgetKeyboard, rememberKeyboard } from '../../lib/keyboard'

/**
 * The arithmetic of keeping a note's caret clear of the keyboard, against a
 * stand-in visualViewport (jsdom has none). Whether iOS then leaves the page
 * alone is only testable on an iPhone; this checks that the numbers handed
 * to it are the right ones.
 */

const WIN_H = 844
const WIN_W = 390

/** @param {Partial<{height: number, offsetTop: number, pageTop: number, scale: number}>} v */
function install(v) {
  const vv = { height: WIN_H, offsetTop: 0, pageTop: 0, scale: 1, ...v }
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true })
  return vv
}

/**
 * Where the document's top is in client coordinates: minus the scroll, in Safari.
 *
 * @param {number} top
 */
function docTop(top) {
  vi.spyOn(document.documentElement, 'getBoundingClientRect').mockReturnValue(/** @type {DOMRect} */ ({ top }))
}

/** @param {boolean} on */
function touchScreen(on) {
  Object.defineProperty(window, 'matchMedia', {
    value: () => ({ matches: on }), configurable: true, writable: true,
  })
}

/**
 * A note's view and its scroller, the caret at `caret` in client coordinates.
 *
 * @param {{caret: {top: number, bottom: number}, headerBottom?: number, atTap?: number|null}} o
 */
function note({ caret, headerBottom = 103, atTap = null }) {
  const scroller = {
    scrollTop: 500,
    querySelector: (/** @type {string} */ sel) => (sel === '.pinned-top'
      ? { getBoundingClientRect: () => ({ bottom: headerBottom }) }
      : null),
  }
  const coordsAtPos = vi.fn(() => caret)
  const view = /** @type {any} */ ({
    dom: { closest: () => scroller },
    state: { selection: { head: 3 } },
    posAtCoords: vi.fn(() => (atTap == null ? null : { pos: atTap, inside: -1 })),
    coordsAtPos,
  })
  return { view, scroller, coordsAtPos }
}

describe('keyboardRoom', () => {
  /** @type {any} */
  let originalVV
  /** @type {any} */
  let originalMM
  beforeEach(() => {
    originalVV = window.visualViewport
    originalMM = window.matchMedia
    window.innerHeight = WIN_H
    window.innerWidth = WIN_W
    localStorage.clear()
    forgetKeyboard()
    touchScreen(false)
    docTop(0)
  })
  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', { value: originalVV, configurable: true, writable: true })
    Object.defineProperty(window, 'matchMedia', { value: originalMM, configurable: true, writable: true })
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  describe('keepCaretClear, with the keyboard up', () => {
    it('scrolls a caret near the keyboard up, leaving room under it', () => {
      install({ height: 470 })
      const { view, scroller } = note({ caret: { top: 425, bottom: 450 } })
      expect(keepCaretClear(view)).toBe(true)
      // 40px under the caret: 450 has to come up to 430.
      expect(scroller.scrollTop).toBe(520)
    })

    it('scrolls a caret under the header down, clear of it', () => {
      install({ height: 470 })
      const { view, scroller } = note({ caret: { top: 100, bottom: 125 } })
      keepCaretClear(view)
      // 12px under the header's 103.
      expect(scroller.scrollTop).toBe(485)
    })

    it('leaves a caret that is clear where it is', () => {
      install({ height: 470 })
      const { view, scroller } = note({ caret: { top: 200, bottom: 225 } })
      keepCaretClear(view)
      expect(scroller.scrollTop).toBe(500)
    })

    it('never scrolls the window', () => {
      install({ height: 470 })
      const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      keepCaretClear(note({ caret: { top: 700, bottom: 725 } }).view)
      expect(scrollBy).not.toHaveBeenCalled()
      expect(scrollTo).not.toHaveBeenCalled()
    })
  })

  describe('keepCaretClear, as the keyboard comes up', () => {
    it('guesses half the window the first time', () => {
      touchScreen(true)
      install({ height: WIN_H })
      const { view, scroller } = note({ caret: { top: 675, bottom: 700 } })
      keepCaretClear(view)
      // 422 is half, less 56 while it is a guess: 700 comes up to 366.
      expect(scroller.scrollTop).toBe(500 + 700 - 366)
    })

    it('uses the room the keyboard left last time, at this width', () => {
      touchScreen(true)
      const vv = install({ height: 470 })
      rememberKeyboard()
      vv.height = WIN_H
      const { view, scroller } = note({ caret: { top: 675, bottom: 700 } })
      keepCaretClear(view)
      expect(scroller.scrollTop).toBe(500 + 700 - (470 - 56))
    })

    it('does not use last time at another width', () => {
      touchScreen(true)
      const vv = install({ height: 470 })
      rememberKeyboard()
      window.innerWidth = 844
      vv.height = WIN_H
      const { view, scroller } = note({ caret: { top: 675, bottom: 700 } })
      keepCaretClear(view)
      expect(scroller.scrollTop).toBe(500 + 700 - 366)
    })

    it('goes by where a touch landed, not the old selection', () => {
      touchScreen(true)
      install({ height: WIN_H })
      const { view, coordsAtPos } = note({ caret: { top: 675, bottom: 700 }, atTap: 42 })
      keepCaretClear(view, { x: 100, y: 690 })
      expect(view.posAtCoords).toHaveBeenCalledWith({ left: 100, top: 690 })
      expect(coordsAtPos).toHaveBeenCalledWith(42)
    })

    it('falls back to the selection for a touch outside the note', () => {
      touchScreen(true)
      install({ height: WIN_H })
      const { view, coordsAtPos } = note({ caret: { top: 200, bottom: 225 }, atTap: null })
      keepCaretClear(view, { x: 100, y: 800 })
      expect(coordsAtPos).toHaveBeenCalledWith(3)
    })
  })

  describe('keepCaretClear, with no keyboard coming', () => {
    it('keeps the caret above the tab bar', () => {
      install({ height: WIN_H })
      document.body.innerHTML = '<main id="app-main"></main><nav></nav>'
      const nav = /** @type {HTMLElement} */ (document.querySelector('nav'))
      vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(/** @type {DOMRect} */ ({ top: 764, height: 80 }))
      const { view, scroller } = note({ caret: { top: 755, bottom: 780 } })
      keepCaretClear(view)
      expect(scroller.scrollTop).toBe(500 + 780 - (764 - 40))
    })

    it('ignores a hidden tab bar', () => {
      install({ height: WIN_H })
      document.body.innerHTML = '<main id="app-main"></main><nav class="hidden"></nav>'
      const nav = /** @type {HTMLElement} */ (document.querySelector('nav'))
      vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(/** @type {DOMRect} */ ({ top: 0, height: 0 }))
      const { view, scroller } = note({ caret: { top: 755, bottom: 780 } })
      keepCaretClear(view)
      expect(scroller.scrollTop).toBe(500)
    })
  })

  it('leaves a note outside the phone scroller to ProseMirror', () => {
    install({ height: 470 })
    const view = /** @type {any} */ ({ dom: { closest: () => null } })
    expect(keepCaretClear(view)).toBe(false)
  })
})
