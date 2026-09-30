// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { expectedRoom, forgetKeyboard, keyboardIsUp, keyboardKind, rememberKeyboard, visibleSlice } from './keyboard'

/**
 * The phone's keyboard as the page sees it, against a stand-in
 * visualViewport (jsdom has none).
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

describe('keyboard', () => {
  /** @type {any} */
  let originalVV
  beforeEach(() => {
    originalVV = window.visualViewport
    window.innerHeight = WIN_H
    window.innerWidth = WIN_W
    localStorage.clear()
    forgetKeyboard()
    docTop(0)
  })
  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', { value: originalVV, configurable: true, writable: true })
    vi.restoreAllMocks()
  })

  describe('visibleSlice', () => {
    it('is the whole window with no visualViewport', () => {
      Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true, writable: true })
      expect(visibleSlice()).toEqual({ top: 0, bottom: WIN_H })
    })

    it('ends at the keyboard', () => {
      install({ height: 470 })
      expect(visibleSlice()).toEqual({ top: 0, bottom: 470 })
    })

    /** Safari measures from what is visible, so a page iOS scrolled up starts at 0. */
    it('starts at 0 in Safari with the page scrolled up', () => {
      install({ height: 470, offsetTop: 120, pageTop: 120 })
      docTop(-120)
      expect(visibleSlice()).toEqual({ top: 0, bottom: 470 })
    })

    /** Chrome measures from the layout viewport, so the same scroll starts lower. */
    it('starts lower in Chrome with the visible part scrolled down', () => {
      install({ height: 470, offsetTop: 120, pageTop: 120 })
      docTop(0)
      expect(visibleSlice()).toEqual({ top: 120, bottom: 590 })
    })
  })

  describe('keyboardIsUp', () => {
    it('is up with the bottom of the window covered', () => {
      install({ height: 470 })
      expect(keyboardIsUp()).toBe(true)
    })

    it('is down for a sliver, like the Safari toolbar', () => {
      install({ height: WIN_H - 40 })
      expect(keyboardIsUp()).toBe(false)
    })

    describe('with a field focused', () => {
      /** @type {HTMLInputElement} */
      let field
      beforeEach(() => {
        field = document.createElement('input')
        document.body.appendChild(field)
        field.focus()
      })
      afterEach(() => { field.remove() })

      /* An installed app on iOS 26 can shrink the page itself: innerHeight
         falls with the visible part, and nothing is covered. */
      it('is up when the whole page shrinks for the keyboard', () => {
        const vv = install({ height: WIN_H })
        expect(keyboardIsUp()).toBe(false)
        window.innerHeight = 470
        vv.height = 470
        expect(keyboardIsUp()).toBe(true)
      })

      /* iOS scrolling the page up by the keyboard's height leaves the visible
         part ending at the page's bottom. */
      it('is up with the page scrolled up by the whole keyboard', () => {
        const vv = install({ height: WIN_H })
        keyboardIsUp()
        Object.assign(vv, { height: 470, offsetTop: WIN_H - 470, pageTop: WIN_H - 470 })
        expect(keyboardIsUp()).toBe(true)
      })

      it('is down for a toolbar sliding in', () => {
        const vv = install({ height: WIN_H })
        keyboardIsUp()
        vv.height = WIN_H - 60
        expect(keyboardIsUp()).toBe(false)
      })

      it('measures again at a new width', () => {
        const vv = install({ height: WIN_H })
        keyboardIsUp()
        window.innerWidth = 844
        window.innerHeight = 390
        vv.height = 390
        expect(keyboardIsUp()).toBe(false)
      })
    })

    it('is down for a shrunk page with nothing focused', () => {
      const vv = install({ height: WIN_H })
      keyboardIsUp()
      window.innerHeight = 470
      vv.height = 470
      expect(keyboardIsUp()).toBe(false)
    })
  })

  describe('keyboardKind', () => {
    /** @param {Record<string, string>} attrs */
    const input = (attrs) => {
      const el = document.createElement('input')
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
      return el
    }

    it('is a number pad for amounts, numbers and phone numbers', () => {
      expect(keyboardKind(input({ inputmode: 'decimal' }))).toBe('pad')
      expect(keyboardKind(input({ inputmode: 'numeric' }))).toBe('pad')
      expect(keyboardKind(input({ type: 'number' }))).toBe('pad')
      expect(keyboardKind(input({ type: 'tel' }))).toBe('pad')
    })

    it('is the letters for everything else', () => {
      expect(keyboardKind(input({ type: 'text' }))).toBe('text')
      expect(keyboardKind(input({ type: 'search' }))).toBe('text')
      expect(keyboardKind(document.createElement('textarea'))).toBe('text')
      expect(keyboardKind(null)).toBe('text')
    })
  })

  describe('the room a keyboard leaves', () => {
    it('is half the window before any keyboard has been seen', () => {
      expect(expectedRoom('text')).toBe(WIN_H / 2)
      expect(expectedRoom('pad')).toBe(WIN_H / 2)
    })

    it('is what each kind left last time', () => {
      const vv = install({ height: 470 })
      rememberKeyboard('text')
      vv.height = 560
      rememberKeyboard('pad')
      expect(expectedRoom('text')).toBe(470)
      expect(expectedRoom('pad')).toBe(560)
    })

    it('outlasts a launch', () => {
      install({ height: 470 })
      rememberKeyboard('text')
      forgetKeyboard()
      expect(expectedRoom('text')).toBe(470)
    })

    it('reads what 0.14.1 kept, for the notes, as the letters', () => {
      localStorage.setItem('spendr-keyboard-room', JSON.stringify({ w: WIN_W, h: 471 }))
      expect(expectedRoom('text')).toBe(471)
      expect(expectedRoom('pad')).toBe(WIN_H / 2)
    })

    it('leaves behind what 0.14.2 kept, which could be the number pad kept as the letters', () => {
      localStorage.setItem('spendr-keyboard-room', JSON.stringify({ w: WIN_W, text: 560, pad: 560 }))
      expect(expectedRoom('text')).toBe(WIN_H / 2)
      expect(expectedRoom('pad')).toBe(WIN_H / 2)
    })

    it('is not last time at another width', () => {
      install({ height: 470 })
      rememberKeyboard('text')
      window.innerWidth = 844
      expect(expectedRoom('text')).toBe(WIN_H / 2)
    })

    it('starts again at a new width, forgetting the old one', () => {
      const vv = install({ height: 470 })
      rememberKeyboard('pad')
      window.innerWidth = 844
      vv.height = 200
      rememberKeyboard('text')
      expect(JSON.parse(localStorage.getItem('spendr-keyboard-rooms') ?? '{}')).toEqual({ w: 844, text: 200 })
    })

    it('keeps nothing with no keyboard up', () => {
      install({ height: WIN_H })
      rememberKeyboard('text')
      expect(localStorage.getItem('spendr-keyboard-rooms')).toBeNull()
    })

    it('keeps nothing while pinch-zoomed', () => {
      install({ height: 300, scale: 2 })
      rememberKeyboard('text')
      expect(localStorage.getItem('spendr-keyboard-rooms')).toBeNull()
    })
  })
})
