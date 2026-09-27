// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { onReducedMotionChange, prefersReducedMotion, reduceMotionChosen, setReduceMotion } from './motion'
import { useReduceMotion, useReduceMotionChosen } from '../../hooks/useReduceMotion'

/**
 * Reduce motion: the phone's setting or Spendr's own switch, either one.
 * jsdom has no matchMedia, so "the phone" is stubbed where it matters.
 */

afterEach(() => {
  setReduceMotion(false)
  localStorage.clear()
  vi.unstubAllGlobals()
})

/** @param {boolean} reduce */
const phone = (reduce) => vi.stubGlobal('matchMedia', (/** @type {string} */ q) => ({
  matches: reduce && q.includes('reduce'), addEventListener() {}, removeEventListener() {},
}))

describe('the switch', () => {
  it('is off to begin with, and so is reduced motion', () => {
    expect(reduceMotionChosen()).toBe(false)
    expect(prefersReducedMotion()).toBe(false)
  })

  it('on: kept for next time, marked on <html>, and motion is reduced', () => {
    setReduceMotion(true)
    expect(localStorage.getItem('spendr-reduce-motion')).toBe('1')
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(true)
    expect(prefersReducedMotion()).toBe(true)
  })

  it('off again: all of it undone', () => {
    setReduceMotion(true)
    setReduceMotion(false)
    expect(localStorage.getItem('spendr-reduce-motion')).toBe('0')
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(false)
    expect(prefersReducedMotion()).toBe(false)
  })

  it("the phone's Reduce Motion is enough on its own", () => {
    phone(true)
    expect(reduceMotionChosen()).toBe(false)
    expect(prefersReducedMotion()).toBe(true)
  })

  it('tells whoever is listening', () => {
    const heard = vi.fn()
    const stop = onReducedMotionChange(heard)
    setReduceMotion(true)
    expect(heard).toHaveBeenCalled()
    stop()
  })
})

describe('the hooks', () => {
  it('follow the switch, live', () => {
    const reduce = renderHook(() => useReduceMotion())
    const chosen = renderHook(() => useReduceMotionChosen())
    expect(reduce.result.current).toBe(false)
    act(() => setReduceMotion(true))
    expect(reduce.result.current).toBe(true)
    expect(chosen.result.current).toBe(true)
  })
})
