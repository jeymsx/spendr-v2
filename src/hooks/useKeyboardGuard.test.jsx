// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useKeyboardGuard, guarded, keepFieldClear, typing, SETTLE_AFTER, RELEASE_AFTER } from './useKeyboardGuard'
import { forgetKeyboard } from '../lib/keyboard'

/**
 * The page kept still while you type on a phone, and put back if iOS moved
 * it. Whether iOS then leaves the page alone is only testable on an iPhone;
 * this checks what the page does: where it scrolls a field to, and when it
 * puts the page back.
 */

const WIN_H = 844
const WIN_W = 390
const HEADER = 103

/** A stand-in visualViewport (jsdom has none), which can fire its events. */
function fakeViewport() {
  /** @type {Record<string, Function[]>} */
  const listeners = {}
  return {
    height: WIN_H,
    offsetTop: 0,
    pageTop: 0,
    scale: 1,
    /** @param {string} t @param {Function} fn */
    addEventListener: (t, fn) => { (listeners[t] ??= []).push(fn) },
    /** @param {string} t @param {Function} fn */
    removeEventListener: (t, fn) => { listeners[t] = (listeners[t] ?? []).filter(f => f !== fn) },
    /** @param {string} t */
    fire(t) { for (const fn of listeners[t] ?? []) fn() },
    count: () => Object.values(listeners).reduce((n, l) => n + l.length, 0),
  }
}

/** @param {boolean} on */
function touchScreen(on) {
  Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: on }), configurable: true, writable: true })
}

/**
 * A page in the app's scroller, with a pinned header and fields at the given
 * client positions, and a scrollTop that sticks (jsdom's does not).
 *
 * @param {Record<string, {top: number, height?: number, html?: string}>} fields
 */
function page(fields) {
  document.body.innerHTML = '<main id="app-main"><div class="page-enter"><div class="pinned-top"></div></div></main>'
  const main = /** @type {HTMLElement} */ (document.getElementById('app-main'))
  let top = 0
  Object.defineProperty(main, 'scrollTop', { get: () => top, set: (v) => { top = v }, configurable: true })
  const header = /** @type {HTMLElement} */ (main.querySelector('.pinned-top'))
  vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(/** @type {DOMRect} */ ({ top: 0, bottom: HEADER, height: HEADER }))
  /** @type {Record<string, HTMLElement>} */
  const els = {}
  for (const [name, f] of Object.entries(fields)) {
    const holder = document.createElement('div')
    holder.innerHTML = f.html ?? '<input type="text">'
    const el = /** @type {HTMLElement} */ (holder.querySelector('input, textarea'))
    main.firstElementChild?.appendChild(holder)
    const h = f.height ?? 44
    // Where it is, less however far the page has scrolled since.
    vi.spyOn(el, 'getBoundingClientRect').mockImplementation(() => /** @type {DOMRect} */ ({ top: f.top - top, bottom: f.top + h - top, height: h }))
    els[name] = el
  }
  return { main, els, scrolled: () => top }
}

describe('useKeyboardGuard', () => {
  /** @type {any} */
  let originalVV
  /** @type {any} */
  let originalMM
  /** @type {ReturnType<typeof fakeViewport>} */
  let vv
  /** @type {import('vitest').MockInstance} */
  let scrollTo
  beforeEach(() => {
    vi.useFakeTimers()
    originalVV = window.visualViewport
    originalMM = window.matchMedia
    window.innerHeight = WIN_H
    window.innerWidth = WIN_W
    localStorage.clear()
    forgetKeyboard()
    vv = fakeViewport()
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true })
    touchScreen(true)
    vi.spyOn(document.documentElement, 'getBoundingClientRect').mockReturnValue(/** @type {DOMRect} */ ({ top: 0 }))
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })
  afterEach(() => {
    // Unmounted here, or each test's listeners outlive it and answer the next one's events.
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    Object.defineProperty(window, 'visualViewport', { value: originalVV, configurable: true, writable: true })
    Object.defineProperty(window, 'matchMedia', { value: originalMM, configurable: true, writable: true })
    document.body.innerHTML = ''
    document.documentElement.classList.remove('field-typing')
  })

  describe('a field on a page', () => {
    it('is scrolled up to the middle of the room the keyboard will leave, as the focus lands', () => {
      renderHook(() => useKeyboardGuard())
      const { els, scrolled } = page({ note: { top: 600 } })
      els.note.focus()
      // Half of 844 is the guess: its middle, 622, goes to 422 / 2 less 8.
      expect(scrolled()).toBe(622 - (211 - 8))
      expect(document.documentElement.classList.contains('field-typing')).toBe(true)
    })

    it('is left where it is when it is high enough already', () => {
      renderHook(() => useKeyboardGuard())
      const { els, scrolled } = page({ amount: { top: 150 } })
      els.amount.focus()
      expect(scrolled()).toBe(0)
    })

    it('goes by the room a number pad left last time, for an amount', () => {
      renderHook(() => useKeyboardGuard())
      const { els, scrolled } = page({ amount: { top: 600, html: '<input type="text" inputmode="decimal">' } })
      vv.height = 560
      els.amount.focus()
      vv.fire('resize')
      // Up now, and kept for next time.
      expect(JSON.parse(localStorage.getItem('spendr-keyboard-room') ?? '{}')).toMatchObject({ w: WIN_W, pad: 560 })
      els.amount.blur()
      vi.advanceTimersByTime(RELEASE_AFTER)
      vv.height = WIN_H
      vv.fire('resize')
      const before = scrolled()
      els.amount.focus()
      expect(scrolled() - before).toBeCloseTo((600 + 22 - before) - (280 - 8), 0)
    })

    it('never goes up under the header', () => {
      renderHook(() => useKeyboardGuard())
      // A field taller than half the room: only its top needs to be high.
      const { els, scrolled } = page({ notes: { top: 400, height: 500, html: '<textarea></textarea>' } })
      els.notes.focus()
      expect(400 - scrolled()).toBeGreaterThanOrEqual(HEADER + 12)
    })

    it('is kept clear of the keyboard once it is up', () => {
      renderHook(() => useKeyboardGuard())
      const { els, scrolled } = page({ desc: { top: 150 } })
      els.desc.focus()
      expect(scrolled()).toBe(0)
      vv.height = 180
      vv.fire('resize')
      // 194 at its bottom, over a keyboard that starts at 180: up to 180 less 16.
      expect(scrolled()).toBe(194 - 164)
    })

    it('puts back a page iOS scrolled anyway, not twice in a beat', () => {
      renderHook(() => useKeyboardGuard())
      const { els } = page({ desc: { top: 200 } })
      els.desc.focus()
      vv.height = 470
      vv.offsetTop = 120
      vv.fire('scroll')
      expect(scrollTo).toHaveBeenCalledTimes(1)
      expect(scrollTo).toHaveBeenCalledWith(0, 0)
      vv.fire('scroll')
      expect(scrollTo).toHaveBeenCalledTimes(1)
    })

    it('keeps its room while the focus moves to the next field, and gives it up after', () => {
      renderHook(() => useKeyboardGuard())
      const { els } = page({ a: { top: 200 }, b: { top: 300 } })
      els.a.focus()
      els.b.focus()
      vi.advanceTimersByTime(RELEASE_AFTER)
      expect(document.documentElement.classList.contains('field-typing')).toBe(true)
      els.b.blur()
      vi.advanceTimersByTime(RELEASE_AFTER)
      expect(document.documentElement.classList.contains('field-typing')).toBe(false)
    })

    it('is nothing to do with a mouse', () => {
      touchScreen(false)
      renderHook(() => useKeyboardGuard())
      const { els, scrolled } = page({ note: { top: 600 } })
      els.note.focus()
      expect(scrolled()).toBe(0)
      expect(document.documentElement.classList.contains('field-typing')).toBe(false)
    })
  })

  describe('after the keyboard', () => {
    it('scrolls a page left pushed up back to the top, once the viewport is still', () => {
      renderHook(() => useKeyboardGuard())
      vv.offsetTop = 60
      vv.fire('resize')
      vi.advanceTimersByTime(SETTLE_AFTER - 1)
      expect(scrollTo).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(scrollTo).toHaveBeenCalledWith(0, 0)
    })

    it('checks once for a run of changes', () => {
      renderHook(() => useKeyboardGuard())
      vv.offsetTop = 60
      for (let i = 0; i < 5; i++) {
        vv.fire('scroll')
        vi.advanceTimersByTime(50)
      }
      vi.advanceTimersByTime(SETTLE_AFTER)
      expect(scrollTo).toHaveBeenCalledTimes(1)
    })

    it('checks when a field lets go of the focus', () => {
      renderHook(() => useKeyboardGuard())
      vv.offsetTop = 60
      document.dispatchEvent(new Event('focusout'))
      vi.advanceTimersByTime(SETTLE_AFTER)
      expect(scrollTo).toHaveBeenCalledWith(0, 0)
    })

    it('leaves a page alone while a field in a sheet has the keyboard', () => {
      renderHook(() => useKeyboardGuard())
      document.body.innerHTML = '<div role="dialog"><input type="text"></div>'
      const field = /** @type {HTMLInputElement} */ (document.querySelector('input'))
      field.focus()
      vv.offsetTop = 60
      vv.fire('resize')
      vi.advanceTimersByTime(SETTLE_AFTER)
      expect(scrollTo).not.toHaveBeenCalled()
    })

    it('leaves a pinch-zoomed page alone', () => {
      renderHook(() => useKeyboardGuard())
      vv.offsetTop = 60
      vv.scale = 2
      vv.fire('scroll')
      vi.advanceTimersByTime(SETTLE_AFTER)
      expect(scrollTo).not.toHaveBeenCalled()
    })

    it('does nothing to a page that is where it belongs', () => {
      renderHook(() => useKeyboardGuard())
      vv.fire('resize')
      vi.advanceTimersByTime(SETTLE_AFTER)
      expect(scrollTo).not.toHaveBeenCalled()
    })

    it('stops listening when unmounted', () => {
      const { unmount } = renderHook(() => useKeyboardGuard())
      expect(vv.count()).toBe(2)
      unmount()
      expect(vv.count()).toBe(0)
      vv.offsetTop = 60
      document.dispatchEvent(new Event('focusout'))
      vi.advanceTimersByTime(SETTLE_AFTER)
      expect(scrollTo).not.toHaveBeenCalled()
    })
  })
})

describe('guarded', () => {
  afterEach(() => { document.body.innerHTML = '' })

  /** @param {string} html */
  const find = (html) => {
    document.body.innerHTML = html
    return document.querySelector('[data-t]')
  }

  it('is a text field or a textarea on a page', () => {
    expect(guarded(find('<main id="app-main"><input data-t type="text"></main>'))).toBe(true)
    expect(guarded(find('<main id="app-main"><input data-t></main>'))).toBe(true)
    expect(guarded(find('<main id="app-main"><input data-t type="search"></main>'))).toBe(true)
    expect(guarded(find('<main id="app-main"><textarea data-t></textarea></main>'))).toBe(true)
  })

  it('is not a picker, a checkbox or a field that cannot be typed in', () => {
    expect(guarded(find('<main id="app-main"><input data-t type="date"></main>'))).toBe(false)
    expect(guarded(find('<main id="app-main"><input data-t type="checkbox"></main>'))).toBe(false)
    expect(guarded(find('<main id="app-main"><input data-t readonly></main>'))).toBe(false)
    expect(guarded(find('<main id="app-main"><select data-t></select></main>'))).toBe(false)
  })

  it('is not a field in a sheet, in the notes editor, or off the page', () => {
    expect(guarded(find('<main id="app-main"><div role="dialog"><input data-t></div></main>'))).toBe(false)
    expect(guarded(find('<main id="app-main"><div data-own-keyboard><input data-t></div></main>'))).toBe(false)
    expect(guarded(find('<input data-t>'))).toBe(false)
    expect(guarded(null)).toBe(false)
  })
})

describe('keepFieldClear', () => {
  it('does nothing without the app scroller', () => {
    document.body.innerHTML = '<input>'
    expect(() => keepFieldClear(/** @type {HTMLElement} */ (document.querySelector('input')), true)).not.toThrow()
  })
})

describe('typing', () => {
  /** @param {string} type */
  const input = (type) => Object.assign(document.createElement('input'), { type })

  it('is text, number, search and the rest that bring a keyboard', () => {
    for (const type of ['text', 'number', 'search', 'email', 'tel', 'url', 'password', 'date']) {
      expect(typing(input(type))).toBe(true)
    }
  })

  it('is a textarea, a select and an editable', () => {
    expect(typing(document.createElement('textarea'))).toBe(true)
    expect(typing(document.createElement('select'))).toBe(true)
    // jsdom has no isContentEditable of its own.
    expect(typing(/** @type {any} */ ({ isContentEditable: true, tagName: 'DIV' }))).toBe(true)
  })

  it('is not a checkbox, a button or nothing', () => {
    expect(typing(input('checkbox'))).toBe(false)
    expect(typing(document.createElement('button'))).toBe(false)
    expect(typing(null)).toBe(false)
  })
})
