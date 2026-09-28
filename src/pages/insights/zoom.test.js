// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { beginReturn, closeInto, openFrom } from './zoom'

/**
 * A card opening into its page through the View Transitions API, and the
 * page closing back into it. jsdom has no such API, so a stand-in runs the
 * update the way a browser does - at once, holding the transition open
 * until the promise it returns settles - and records what was named when.
 */

/** @type {{update: () => Promise<void>, settled: Promise<void>}[]} */
let started = []
const names = () => ({
  main: document.getElementById('app-main')?.style.viewTransitionName ?? '',
})

beforeEach(() => {
  started = []
  document.body.innerHTML = '<main id="app-main"><a data-zoom="trend" id="card">Trend</a></main>'
  // @ts-ignore - test stand-in
  document.startViewTransition = (update) => {
    const settled = Promise.resolve().then(update)
    started.push({ update, settled })
    return { finished: settled.then(() => {}), ready: settled, updateCallbackDone: settled }
  }
  window.history.replaceState({ key: 'overview' }, '')
  // On screen, for Back to close into.
  card().getBoundingClientRect = () => /** @type {DOMRect} */ ({ top: 100, bottom: 232, left: 20, right: 190, width: 170, height: 132 })
  vi.useFakeTimers()
})

afterEach(() => {
  // @ts-ignore
  delete document.startViewTransition
  vi.useRealTimers()
})

const card = () => /** @type {HTMLElement} */ (document.getElementById('card'))

describe('the card zoom', () => {
  it('opens through a transition, naming the card first and the page after', async () => {
    let namedAtGo = null
    openFrom(card(), () => {
      namedAtGo = { card: card().style.viewTransitionName, ...names() }
      window.history.pushState({ key: 'trend-page' }, '')
    }, 'trend')
    expect(started).toHaveLength(1)
    expect(card().style.viewTransitionName).toBe('insight-zoom')
    // No page says it is ready here: the hold lets go by itself.
    await vi.advanceTimersByTimeAsync(1000)
    await started[0].settled
    expect(namedAtGo).toEqual({ card: '', main: 'insight-zoom' })
  })

  it('goes straight back from a page no card opened', () => {
    const go = vi.fn()
    closeInto(go)
    expect(go).toHaveBeenCalledOnce()
    expect(started).toHaveLength(0)
  })

  it('closes into the card the page was opened from, once the overview lands it', async () => {
    openFrom(card(), () => window.history.pushState({ key: 'trend-page' }, ''), 'trend')
    await vi.advanceTimersByTimeAsync(1000)
    await started[0].settled

    let landed = null
    closeInto(() => {
      window.history.back()
      // The overview mounting after Back: it lands the card once it is in place.
      const landing = beginReturn(true)
      landing?.land()
      landed = card().style.viewTransitionName
    })
    expect(started).toHaveLength(2)
    await started[1].settled
    expect(landed).toBe('insight-zoom')
  })

  it('does not close into a card from the same page reached another way', async () => {
    openFrom(card(), () => window.history.pushState({ key: 'trend-page' }, ''), 'trend')
    await vi.advanceTimersByTimeAsync(1000)
    await started[0].settled
    // Left by the tab bar, and the same page opened again from Home: a new entry.
    window.history.pushState({ key: 'home' }, '')
    window.history.pushState({ key: 'trend-again' }, '')
    const go = vi.fn()
    closeInto(go)
    expect(go).toHaveBeenCalledOnce()
    expect(started).toHaveLength(1)
  })
})
