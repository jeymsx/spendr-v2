import { describe, it, expect, beforeEach, vi } from 'vitest'
import { recordNav, entryBehind, homeAfterSave, resetTrail } from './navTrail'

/**
 * The history behind the current page, as the app has seen it - what the
 * edge swipe draws underneath, and where a form goes after a save.
 */

const at = (/** @type {string} */ key, /** @type {string} */ pathname) => ({ key, pathname })

describe('navTrail', () => {
  beforeEach(() => resetTrail())

  it('knows the entry behind: a push adds one, Back drops to it', () => {
    recordNav('POP', at('a', '/'))
    expect(entryBehind()).toBeNull()
    recordNav('PUSH', at('b', '/expense'))
    expect(entryBehind()).toEqual(at('a', '/'))
    recordNav('POP', at('a', '/'))
    expect(entryBehind()).toBeNull()
  })

  it("puts a replace in the current entry's place", () => {
    recordNav('POP', at('a', '/transactions'))
    recordNav('PUSH', at('b', '/expense'))
    recordNav('REPLACE', at('c', '/'))
    expect(entryBehind()).toEqual(at('a', '/transactions'))
  })

  it('starts again at an entry it never saw', () => {
    recordNav('POP', at('a', '/'))
    recordNav('PUSH', at('b', '/settings'))
    recordNav('POP', at('z', '/accounts'))
    expect(entryBehind()).toBeNull()
  })

  it('takes a second look at the same entry as no move at all', () => {
    // StrictMode runs the layout's effect twice on mount.
    recordNav('POP', at('a', '/'))
    recordNav('POP', at('a', '/'))
    recordNav('PUSH', at('b', '/expense'))
    expect(entryBehind()).toEqual(at('a', '/'))
  })

  /* Replacing the form with a second Home left two in the history, and
     Android's Back from there seemed to do nothing. */
  it('goes back to the Home a form came from, or puts Home in its place', () => {
    const navigate = vi.fn()
    recordNav('POP', at('a', '/'))
    recordNav('PUSH', at('b', '/expense'))
    homeAfterSave(navigate)
    expect(navigate).toHaveBeenLastCalledWith(-1)

    resetTrail()
    recordNav('POP', at('a', '/transactions'))
    recordNav('PUSH', at('b', '/expense'))
    homeAfterSave(navigate)
    expect(navigate).toHaveBeenLastCalledWith('/', { replace: true })

    resetTrail()
    recordNav('POP', at('b', '/expense'))
    homeAfterSave(navigate)
    expect(navigate).toHaveBeenLastCalledWith('/', { replace: true })
  })
})
