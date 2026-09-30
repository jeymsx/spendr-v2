// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useKeyboardSettle, typing, SETTLE_AFTER } from './useKeyboardSettle'

/**
 * Putting back a page iOS left scrolled after its keyboard went. Whether iOS
 * leaves it scrolled is only testable on an iPhone; this checks when the page
 * is put back and when it is left alone.
 */

/** A stand-in visualViewport (jsdom has none), which can fire its events. */
function fakeViewport() {
  /** @type {Record<string, Function[]>} */
  const listeners = {}
  return {
    offsetTop: 0,
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

describe('useKeyboardSettle', () => {
  /** @type {any} */
  let original
  /** @type {ReturnType<typeof fakeViewport>} */
  let vv
  /** @type {import('vitest').MockInstance} */
  let scrollTo
  beforeEach(() => {
    vi.useFakeTimers()
    original = window.visualViewport
    vv = fakeViewport()
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true })
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })
  afterEach(() => {
    // Unmounted here, or each test's listeners outlive it and answer the next one's events.
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    Object.defineProperty(window, 'visualViewport', { value: original, configurable: true, writable: true })
    document.body.innerHTML = ''
  })

  it('scrolls a page left pushed up back to the top, once the viewport is still', () => {
    renderHook(() => useKeyboardSettle())
    vv.offsetTop = 60
    vv.fire('resize')
    vi.advanceTimersByTime(SETTLE_AFTER - 1)
    expect(scrollTo).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('checks once for a run of changes', () => {
    renderHook(() => useKeyboardSettle())
    vv.offsetTop = 60
    for (let i = 0; i < 5; i++) {
      vv.fire('scroll')
      vi.advanceTimersByTime(50)
    }
    vi.advanceTimersByTime(SETTLE_AFTER)
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it('checks when a field lets go of the focus', () => {
    renderHook(() => useKeyboardSettle())
    vv.offsetTop = 60
    document.dispatchEvent(new Event('focusout'))
    vi.advanceTimersByTime(SETTLE_AFTER)
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('leaves a page alone while a field has the keyboard', () => {
    renderHook(() => useKeyboardSettle())
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    vv.offsetTop = 60
    vv.fire('resize')
    vi.advanceTimersByTime(SETTLE_AFTER)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('leaves a pinch-zoomed page alone', () => {
    renderHook(() => useKeyboardSettle())
    vv.offsetTop = 60
    vv.scale = 2
    vv.fire('scroll')
    vi.advanceTimersByTime(SETTLE_AFTER)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('does nothing to a page that is where it belongs', () => {
    renderHook(() => useKeyboardSettle())
    vv.fire('resize')
    vi.advanceTimersByTime(SETTLE_AFTER)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('stops listening when unmounted', () => {
    const { unmount } = renderHook(() => useKeyboardSettle())
    expect(vv.count()).toBe(2)
    unmount()
    expect(vv.count()).toBe(0)
    vv.offsetTop = 60
    document.dispatchEvent(new Event('focusout'))
    vi.advanceTimersByTime(SETTLE_AFTER)
    expect(scrollTo).not.toHaveBeenCalled()
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
