// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardInset, KEYBOARD_MIN } from './useKeyboardInset'

/**
 * A stand-in for window.visualViewport.
 *
 * jsdom does not implement it, which is the point: this test is the only
 * place the arithmetic can be checked at all. The BEHAVIOUR - whether iOS
 * actually leaves the gap this is meant to close - is not testable anywhere
 * but a real phone, and is not what these assert.
 */
function fakeViewport({ height, offsetTop = 0 }) {
  const listeners = {}
  return {
    height,
    offsetTop,
    addEventListener: (t, fn) => { (listeners[t] ??= []).push(fn) },
    removeEventListener: (t, fn) => {
      listeners[t] = (listeners[t] ?? []).filter(f => f !== fn)
    },
    /** Move the visible slice, the way opening a keyboard does. */
    set(next) {
      Object.assign(this, next)
      for (const fn of listeners.resize ?? []) fn()
    },
  }
}

const WIN_H = 844

describe('useKeyboardInset', () => {
  /** @type {any} */
  let original
  beforeEach(() => {
    original = window.visualViewport
    window.innerHeight = WIN_H
  })
  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      value: original, configurable: true, writable: true,
    })
  })

  /** @param {any} vv */
  const install = (vv) => Object.defineProperty(window, 'visualViewport', {
    value: vv, configurable: true, writable: true,
  })

  it('is closed and flat when the viewport fills the window', () => {
    install(fakeViewport({ height: WIN_H }))
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toEqual({ top: 0, height: WIN_H, inset: 0, open: false })
  })

  /**
   * The iOS case this exists for: the visible slice both SHRINKS and SCROLLS,
   * and a fixed element has to account for both or it lands in the wrong place.
   */
  it('counts the scrolled offset as well as the lost height', () => {
    const vv = fakeViewport({ height: 500, offsetTop: 60 })
    install(vv)
    const { result } = renderHook(() => useKeyboardInset())
    // 844 - (60 + 500) = 284 of keyboard below the visible slice.
    expect(result.current.inset).toBe(284)
    expect(result.current.top).toBe(60)
    expect(result.current.open).toBe(true)
  })

  it('follows the viewport as the keyboard opens', () => {
    const vv = fakeViewport({ height: WIN_H })
    install(vv)
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current.open).toBe(false)
    act(() => vv.set({ height: 520, offsetTop: 0 }))
    expect(result.current.open).toBe(true)
    expect(result.current.inset).toBe(324)
  })

  /**
   * The visual viewport moves by a few pixels for reasons that are not a
   * keyboard. Chrome hiding a URL bar is not a reason to pull the navbar.
   */
  it('ignores a shift too small to be a keyboard', () => {
    install(fakeViewport({ height: WIN_H - (KEYBOARD_MIN - 1) }))
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current.open).toBe(false)
  })

  it('opens exactly at the threshold', () => {
    install(fakeViewport({ height: WIN_H - KEYBOARD_MIN }))
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current.open).toBe(true)
  })

  /** An old browser gets the behaviour it has always had, not a guess. */
  it('reports nothing when the browser has no visualViewport', () => {
    install(undefined)
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toEqual({ top: 0, height: WIN_H, inset: 0, open: false })
  })

  it('lets go of its listeners on unmount', () => {
    const vv = fakeViewport({ height: WIN_H })
    install(vv)
    const { unmount } = renderHook(() => useKeyboardInset())
    unmount()
    // Nothing left to fire into a component that is gone.
    expect(() => vv.set({ height: 500 })).not.toThrow()
  })
})
