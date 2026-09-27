// @vitest-environment jsdom
/**
 * The eye buttons' blur swap plays after a tap, never on arrival.
 */
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSwap } from './useSwap'

describe('useSwap', () => {
  it('is nothing on arrival, masked or not', () => {
    expect(renderHook(() => useSwap(true)).result.current).toBe('')
    expect(renderHook(() => useSwap(false)).result.current).toBe('')
  })

  it('swaps once the value has changed, and every time after', () => {
    const { result, rerender } = renderHook(({ v }) => useSwap(v), { initialProps: { v: true } })
    rerender({ v: true })
    expect(result.current).toBe('')
    rerender({ v: false })
    expect(result.current).toBe('swap-in')
    rerender({ v: true })
    expect(result.current).toBe('swap-in')
  })
})
