// @vitest-environment jsdom
/**
 * A figure rolls from the last value you saw - and only then.
 *
 * The frame loop and the clock are faked, so "the first frame shows the old
 * balance" and "it lands exactly on the new one" are checked as facts about
 * the text node rather than eyeballed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import RollingNumber from './RollingNumber'

let now = 0
let frames = []
function flush(max = 200) {
  for (let i = 0; i < max && frames.length; i++) {
    const cb = frames.shift()
    now += 16
    cb?.(now)
  }
}

beforeEach(() => {
  now = 0
  frames = []
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const peso = (v) => `P${v.toFixed(2)}`

describe('RollingNumber', () => {
  it('shows a figure seen for the first time as it is - no count from zero', () => {
    const { container } = render(<RollingNumber id="t1" value={4771} format={peso} />)
    expect(container.textContent).toBe('P4771.00')
    expect(frames.length).toBe(0)
  })

  it('rolls from what it last showed when it comes back changed, and lands exactly', () => {
    const first = render(<RollingNumber id="t2" value={4771} format={peso} />)
    first.unmount()
    const { container } = render(<RollingNumber id="t2" value={4621} format={peso} />)
    // The first painted frame is the balance you last saw.
    expect(container.textContent).toBe('P4771.00')
    flush()
    expect(container.textContent).toBe('P4621.00')
  })

  it('rolls in place when the value changes while it is on screen', () => {
    const { container, rerender } = render(<RollingNumber id="t3" value={100} format={peso} />)
    rerender(<RollingNumber id="t3" value={250} format={peso} />)
    expect(container.textContent).toBe('P100.00')
    flush(3)
    const mid = Number(container.textContent.slice(1))
    expect(mid).toBeGreaterThan(100)
    expect(mid).toBeLessThan(250)
    flush()
    expect(container.textContent).toBe('P250.00')
  })

  it('treats a different id as a different figure - pesos to dollars is not a roll', () => {
    const first = render(<RollingNumber id="t4:PHP" value={5600} format={peso} />)
    first.unmount()
    const { container } = render(<RollingNumber id="t4:USD" value={100} format={peso} />)
    expect(container.textContent).toBe('P100.00')
    expect(frames.length).toBe(0)
  })

  it('does not roll under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const first = render(<RollingNumber id="t5" value={10} format={peso} />)
    first.unmount()
    const { container } = render(<RollingNumber id="t5" value={20} format={peso} />)
    expect(container.textContent).toBe('P20.00')
    expect(frames.length).toBe(0)
  })
})
