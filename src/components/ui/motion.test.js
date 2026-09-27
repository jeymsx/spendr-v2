/**
 * The two closed-form curves every hand-driven movement uses.
 *
 * Driven by a fake clock and a fake frame loop, so the assertions are about
 * the maths - where the value is at a given time - and not about how fast
 * the machine running the tests happens to be.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { spring, tween } from './motion'

let now = 0
let frames = []

beforeEach(() => {
  now = 0
  frames = []
  vi.stubGlobal('performance', { now: () => now })
  vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length })
  vi.stubGlobal('cancelAnimationFrame', (id) => { frames[id - 1] = null })
})
afterEach(() => { vi.unstubAllGlobals() })

/** Run frames 16ms apart until nothing asks for another, or `max` frames. */
function run(max = 400) {
  for (let i = 0; i < max; i++) {
    const cb = frames.shift()
    if (cb === undefined) return i
    if (cb === null) continue
    now += 16
    cb(now)
  }
  return max
}

describe('spring', () => {
  it('lands exactly on its target and says so', () => {
    const seen = []
    const done = vi.fn()
    spring({ from: 300, to: 0, duration: 0.3, onUpdate: v => seen.push(v), onComplete: done })
    run()
    expect(seen.at(-1)).toBe(0)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('never passes its target from rest - bounce 0 means no overshoot', () => {
    const seen = []
    spring({ from: 300, to: 0, duration: 0.3, onUpdate: v => seen.push(v) })
    run()
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0)
    // And it only ever closes in.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1])
  })

  it('keeps the speed it was handed: a throw away from the target carries on first', () => {
    // A sheet released while still moving down keeps moving down for a
    // moment before it comes back - that continuity is the point of it.
    const seen = []
    spring({ from: 100, to: 0, velocity: 2000, duration: 0.3, onUpdate: v => seen.push(v) })
    run()
    expect(seen[0]).toBeGreaterThan(100)
    expect(seen.at(-1)).toBe(0)
  })

  it('a faster throw toward the target gets there sooner', () => {
    const at = (velocity) => {
      frames = []; now = 0
      let v = 0
      spring({ from: 200, to: 0, velocity, duration: 0.3, onUpdate: x => { v = x } })
      for (let i = 0; i < 5; i++) run(1)
      return v
    }
    expect(at(-1500)).toBeLessThan(at(0))
  })

  it('stops where it was when stopped', () => {
    const seen = []
    const stop = spring({ from: 300, to: 0, duration: 0.3, onUpdate: v => seen.push(v) })
    run(3)
    stop()
    const count = seen.length
    run()
    expect(seen.length).toBe(count)
    expect(seen.at(-1)).toBeGreaterThan(0)
  })
})

describe('tween', () => {
  it('ends exactly on the figure - no spring tail on a balance', () => {
    const seen = []
    tween({ from: 4771, to: 4621, duration: 0.5, onUpdate: v => seen.push(v) })
    run()
    expect(seen.at(-1)).toBe(4621)
    // Monotonic: a balance going down never ticks back up on the way.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1])
  })

  it('front-loads the change, the way an ease-out does', () => {
    const seen = []
    tween({ from: 0, to: 100, duration: 0.5, onUpdate: v => seen.push(v) })
    run()
    // A third of the way through, well over half the distance is covered.
    const third = seen[Math.floor(seen.length / 3)]
    expect(third).toBeGreaterThan(60)
  })
})
