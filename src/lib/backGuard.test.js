// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGuard, formGuarded, leaveThen, resetGuards } from './backGuard'

/* jsdom runs history traversals a task later and fires popstate, as a
   browser does; each step waits for that. */
const settle = () => new Promise(r => setTimeout(r, 30))
const back = async () => { window.history.back(); await settle() }
const depth = () => Number(window.history.state?.spendrGuard ?? 0)

beforeEach(() => {
  resetGuards()
  // The router's own state, which a guard's entry must carry unchanged.
  window.history.replaceState({ key: 'page', idx: 3 }, '')
})
afterEach(() => resetGuards())

describe('system Back with something on top', () => {
  it('spends the guard entry, keeps the page, and tells the guard', async () => {
    const onBack = vi.fn()
    const g = createGuard({ onBack })
    g.set(true)
    expect(depth()).toBe(1)
    expect(window.history.state).toMatchObject({ key: 'page', idx: 3 })

    await back()
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(depth()).toBe(0)
    expect(window.history.state).toMatchObject({ key: 'page', idx: 3 })
    g.drop()
  })

  it('takes its entry back off when it goes away some other way', async () => {
    const onBack = vi.fn()
    const g = createGuard({ onBack })
    g.set(true)
    g.set(false)
    await settle()
    expect(depth()).toBe(0)
    expect(onBack).not.toHaveBeenCalled()
    g.drop()
  })

  it('answers with the innermost of two, then the one under it', async () => {
    const outer = vi.fn()
    const inner = vi.fn()
    const a = createGuard({ onBack: outer })
    const b = createGuard({ onBack: inner })
    a.set(true)
    b.set(true)
    expect(depth()).toBe(2)
    await back()
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
    await back()
    expect(outer).toHaveBeenCalledTimes(1)
    a.drop()
    b.drop()
  })

  it('takes two entries off in one go when both close together', async () => {
    const a = createGuard({ onBack: vi.fn() })
    const b = createGuard({ onBack: vi.fn() })
    a.set(true)
    b.set(true)
    b.set(false)
    a.set(false)
    await settle()
    expect(depth()).toBe(0)
    a.drop()
    b.drop()
  })

  it('steps past an entry left behind by a guard that is gone', async () => {
    const g = createGuard({ onBack: vi.fn() })
    g.set(true)
    // A sheet whose button went to another page: its entry is no longer on top.
    window.history.pushState({ key: 'next', idx: 4 }, '')
    g.drop()
    await settle()
    await back()      // lands on the stale entry, and goes on past it
    await settle()
    expect(depth()).toBe(0)
    expect(window.history.state).toMatchObject({ key: 'page', idx: 3 })
  })

  it('says whether a form is holding an entry, for the edge swipe', () => {
    const f = createGuard({ onBack: vi.fn(), form: true })
    expect(formGuarded()).toBe(false)
    f.set(true)
    expect(formGuarded()).toBe(true)
    f.drop()
  })
})

describe('leaving on purpose', () => {
  it('takes the entries off first, then runs the navigation', async () => {
    const g = createGuard({ onBack: vi.fn(), form: true })
    g.set(true)
    const nav = vi.fn(() => depth())
    leaveThen(nav)
    await settle()
    expect(nav).toHaveBeenCalledTimes(1)
    // It ran on the page's own entry, not on the guard's.
    expect(nav.mock.results[0].value).toBe(0)
    // And nothing arms again on the way out.
    g.set(true)
    expect(depth()).toBe(0)
    g.drop()
  })

  it('runs at once when nothing is holding an entry', () => {
    const nav = vi.fn()
    leaveThen(nav)
    expect(nav).toHaveBeenCalledTimes(1)
  })
})
