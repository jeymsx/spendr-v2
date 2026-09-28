import { useCallback, useEffect, useState } from 'react'
import { EASE_OUT, prefersReducedMotion } from '../../components/ui/motion'
import { useBack } from '../../hooks/useBack'
import { setInsights } from './period'

/**
 * A card on Insights that opens into its page, and a page that closes back
 * into its card.
 *
 * ── What moves: the page itself ──
 *
 * The card grows into its page, and the page is in it the whole way: a
 * container transform, the way a phone opens an app from its icon. The
 * card's rounded box expands to fill the screen, its own face fading as the
 * page shows through it - the real page, with its figures, not a blank
 * standing in for it. Behind, the overview dims and sinks a little. Back
 * is the same in reverse: the page shrinks into the card you left through,
 * wherever the overview has been scrolled back to.
 *
 * It is the View Transitions API (morphOpen, closeInto). The browser takes
 * a picture of the screen, the route changes underneath, and it animates
 * from the card's picture to the new page's live one: the card is named
 * `insight-zoom` before the change, the page's scroll area (#app-main)
 * after it, and the CSS by `.zoom-surface` in index.css says how the two
 * meet. React Router only wires this up for a data router, which this app
 * does not use - but the API needs nothing from the router: start the
 * transition, navigate inside it, and hold it open until the page says it
 * has its figures (useArrival), so what grows is the page and not its
 * skeleton.
 *
 * ── The surface, where there is no View Transitions ──
 *
 * Older browsers, and a Back that is not the page's own button (a swipe, a
 * hardware key: by the time it is heard, the screen has already changed,
 * too late to take a picture of it), get what this was before: a surface
 * in the card's colour grows over the page, the route changes under it, and
 * it fades to show the page, whose content resolves out of a short blur.
 * Drawn with clip-path on a fixed full-screen element, so a frame costs a
 * repaint of one flat colour, not a layout.
 *
 * Reduced motion: none of it. The route changes at once, as any link's does.
 */

const GROW_MS = 340
const FACE_MS = 150
const FADE_MS = 200
/** How long after a surface grew that a page counts as having arrived out of it. */
const ARRIVAL_MS = 700

let arrivedAt = -Infinity
/** The card the overview was left through, and the history entry of the page it opened. @type {{key: string, entry?: string}|null} */
let leftThrough = null
let busy = false

// ── The page itself, through the View Transitions API ──

const NAME = 'insight-zoom'
/** How long a transition waits for its page to be ready before it runs anyway. */
const HOLD_MS = 900

/** A Back through the page's own button is closing into its card: the overview lands it. */
let closing = false
/** The element named for a transition, to unname when it is over. @type {HTMLElement|null} */
let named = null
/** A transition held open until its page is ready. @type {{kind: 'open'|'close', resolve: () => void}|null} */
let waiting = null

const canMorph = () => typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
/* On the desktop the card's page opens beside the overview, not over it
   (src/web WebSections) - there is nothing to grow into, so no zoom. */
const onDesktop = () => typeof document !== 'undefined' && document.documentElement.classList.contains('web')
/** The router's key for the history entry on screen. @returns {string|undefined} */
const entryKey = () => window.history.state?.key
const appMain = () => /** @type {HTMLElement|null} */ (document.getElementById('app-main'))

/** @param {HTMLElement|null} el */
function nameFor(el) {
  if (named && named !== el) named.style.viewTransitionName = ''
  named = el
  if (el) el.style.viewTransitionName = NAME
}

/**
 * The card's corners and colour, and the page's, for the box to turn from
 * one to the other as it grows (the CSS by `.zoom-surface`). The box has to
 * be painted: the page's scroll area has no ground of its own - the body
 * gives it one - so its picture alone was figures floating over the
 * overview.
 *
 * @param {HTMLElement} card
 */
function surfaceOf(card) {
  const style = getComputedStyle(card)
  const page = pageColour()
  const root = document.documentElement.style
  root.setProperty('--zoom-radius', `${parseFloat(style.borderTopLeftRadius) || 16}px`)
  root.setProperty('--zoom-card', over(style.backgroundColor, page))
  root.setProperty('--zoom-page', page)
}

/**
 * Wait for the page on the other side to be ready - or HOLD_MS, whichever
 * is first: a page that never says so must not hold the screen.
 *
 * @param {'open'|'close'} kind
 * @returns {Promise<void>}
 */
function hold(kind) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      if (waiting?.resolve === done) waiting = null
      resolve()
    }
    const timer = setTimeout(done, HOLD_MS)
    waiting = { kind, resolve: done }
  })
}

/** The page a transition is waiting for is ready. @param {'open'|'close'} kind */
function release(kind) {
  if (waiting?.kind === kind) waiting.resolve()
}

/**
 * Run `update` as a transition from the screen now to the screen after it,
 * marked on <html> as `data-zoom` for the CSS to tell open from close.
 *
 * @param {'open'|'close'} kind @param {() => Promise<void>} update
 */
function transition(kind, update) {
  const root = document.documentElement
  root.dataset.zoom = kind
  busy = true
  const end = () => {
    delete root.dataset.zoom
    nameFor(null)
    const main = appMain()
    if (main) main.style.viewTransitionName = ''
    closing = false
    busy = false
  }
  try {
    document.startViewTransition(update).finished.then(end, end)
  } catch {
    end()
    update()
  }
}

/** @param {HTMLElement} card @param {() => void} go */
function morphOpen(card, go) {
  surfaceOf(card)
  nameFor(card)
  transition('open', async () => {
    nameFor(null)
    const main = appMain()
    if (main) main.style.viewTransitionName = NAME
    const ready = hold('open')
    go()
    // The page's own entry, which only it has: the router keys every one.
    if (leftThrough) leftThrough.entry = entryKey()
    await ready
  })
}

/**
 * Back from a page a card opened, through the page's own button: the page
 * shrinks into the card. Anything else goes back as it would have.
 *
 * @param {() => void} go  the page's back
 */
export function closeInto(go) {
  const trip = leftThrough
  /* Only from the very page the card opened. Reached any other way - the
     same page opened again from Home, after leaving this one by the tab
     bar - Back leads somewhere with no card to close into. */
  if (!trip || !trip.entry || trip.entry !== entryKey() || busy || prefersReducedMotion() || !canMorph() || onDesktop()) {
    go()
    return
  }
  closing = true
  const main = appMain()
  if (main) main.style.viewTransitionName = NAME
  transition('close', async () => {
    if (main) main.style.viewTransitionName = ''
    const ready = hold('close')
    go()
    await ready
  })
}

/**
 * The back button's handler for a page an Insights card opens: back as
 * useBack goes, closing into the card when that is where it leads.
 *
 * @param {string} fallback  where Back goes when there is nothing behind
 */
export function useZoomBack(fallback) {
  const back = useBack(fallback)
  return useCallback(() => closeInto(back), [back])
}

/** @param {string} color @returns {number[]|null} r, g, b, alpha */
function channels(color) {
  const m = String(color).match(/^rgba?\(([^)]+)\)$/)
  if (!m) return null
  const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean)
  const out = [Number(r), Number(g), Number(b), Number(a)]
  return out.every(Number.isFinite) ? out : null
}

/** The screen's own colour: the body's where it paints one, else the page's. */
function pageColour() {
  const body = getComputedStyle(document.body).backgroundColor
  const c = channels(body)
  return c && c[3] === 0 ? getComputedStyle(document.documentElement).backgroundColor : body
}

/**
 * A translucent colour as it looks over `under`. The dark cards are a tint
 * of the accent at a fifth, over the page: drawn on its own, a surface in
 * that colour would be nearly transparent.
 *
 * @param {string} top @param {string} under
 */
function over(top, under) {
  const t = channels(top), u = channels(under)
  if (!t || t[3] >= 1 || !u) return top
  return `rgb(${[0, 1, 2].map(i => Math.round(t[i] * t[3] + u[i] * (1 - t[3]))).join(', ')})`
}

const inset = (/** @type {DOMRect|null} */ r, /** @type {number} */ radius) => {
  if (!r) return 'inset(0px 0px 0px 0px round 0px)'
  const vw = document.documentElement.clientWidth, vh = window.innerHeight
  return `inset(${r.top}px ${vw - r.right}px ${vh - r.bottom}px ${r.left}px round ${radius}px)`
}

/** @param {string} colour */
function makeSurface(colour) {
  const el = document.createElement('div')
  el.className = 'zoom-surface'
  el.setAttribute('aria-hidden', 'true')
  el.style.backgroundColor = colour
  document.body.appendChild(el)
  return el
}

/** The card's words, laid exactly over it, to fade as the surface grows. @param {HTMLElement} card @param {DOMRect} r */
function faceOf(card, r) {
  const face = /** @type {HTMLElement} */ (card.cloneNode(true))
  face.removeAttribute('href')
  face.removeAttribute('data-zoom')
  Object.assign(face.style, {
    position: 'absolute', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    margin: '0', background: 'transparent', boxShadow: 'none', scale: '1', transition: 'none',
  })
  return face
}

/** What the overview's scroll container is scrolled to now. */
const scrolled = () => document.getElementById('app-main')?.scrollTop ?? 0

/**
 * Leave the overview through `card`, for `go` to take you where it leads.
 *
 * @param {HTMLElement} card @param {() => void} go @param {string} key  which card, for Back to close into
 */
export function openFrom(card, go, key) {
  leftThrough = { key }
  setInsights({ scroll: scrolled() }, true)
  if (busy || prefersReducedMotion() || onDesktop()) { go(); return }
  if (canMorph()) { morphOpen(card, go); return }
  if (typeof card.animate !== 'function') { go(); return }
  busy = true
  const r = card.getBoundingClientRect()
  const style = getComputedStyle(card)
  const page = pageColour()
  const from = over(style.backgroundColor, page)
  const radius = parseFloat(style.borderTopLeftRadius) || 16
  const surface = makeSurface(from)
  const face = faceOf(card, r)
  surface.appendChild(face)

  const done = () => { surface.remove(); busy = false }
  face.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FACE_MS, easing: 'linear', fill: 'forwards' })
  surface.animate(
    [{ clipPath: inset(r, radius), backgroundColor: from }, { clipPath: inset(null, 0), backgroundColor: page }],
    { duration: GROW_MS, easing: EASE_OUT, fill: 'forwards' },
  ).finished.then(() => {
    arrivedAt = performance.now()
    go()
    // Two frames: the new page has committed and painted under the surface.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      surface.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'linear', fill: 'forwards' })
        .finished.then(done, done)
    }))
  }, () => { done(); go() })
}

/**
 * On a page an Insights card opens. Returns the class its content wears:
 * after the surface, a short blur it resolves out of; after a transition,
 * nothing, as the page grew in whole.
 *
 * `ready` is whether its figures are in. A transition into the page waits
 * for that (up to HOLD_MS), so what grows out of the card is the page and
 * not its skeleton.
 *
 * @param {boolean} [ready]
 */
export function useArrival(ready = true) {
  const [cls] = useState(() => (performance.now() - arrivedAt < ARRIVAL_MS ? 'zoom-arrive' : ''))
  useEffect(() => { if (ready) release('open') }, [ready])
  return cls
}

/**
 * @typedef {{land: () => void, cancel: () => void}} Return
 * @type {{handle: Return, finished: boolean, cancelling: number}|null}
 */
let returning = null

/**
 * The overview, mounting after Back from a page it opened: cover the screen
 * now, before its first paint, and hand back how to finish once the card is
 * in place. Null when there is nothing to close into.
 *
 * The card it was left through is taken once, so an old trip is never
 * replayed. But a return that has started and not landed is handed out
 * again to a mount that asks straight after its own unmount - which is what
 * React's development mode does to every component, mounting it, unmounting
 * it and mounting it again at once. Without that, the second mount found
 * nothing to close into, and the first one's cover faded out unlanded.
 *
 * @param {boolean} back  whether this is a Back (a POP), not a fresh visit
 * @returns {Return|null}
 */
export function beginReturn(back) {
  if (returning && !returning.finished) {
    clearTimeout(returning.cancelling)
    returning.cancelling = 0
    return returning.handle
  }
  const trip = leftThrough
  leftThrough = null
  if (onDesktop()) return null
  if (closing) {
    if (!trip || !back) { release('close'); return null }
    return landing(trip)
  }
  if (!trip || !back || prefersReducedMotion() || typeof document.body.animate !== 'function') return null
  const page = pageColour()
  const surface = makeSurface(page)
  const state = { handle: /** @type {Return} */ (/** @type {unknown} */ (null)), finished: false, cancelling: 0 }
  const remove = () => surface.remove()
  const fade = () => {
    if (state.finished) return
    state.finished = true
    if (returning === state) returning = null
    surface.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'linear', fill: 'forwards' })
      .finished.then(remove, remove)
  }
  // However long the page takes, the screen is not held hostage for it.
  const giveUp = setTimeout(fade, 900)
  state.handle = {
    /** Close into the card, now that the page is laid out and scrolled back. */
    land() {
      requestAnimationFrame(() => landSurface())
    },
    /** The page went before it was ready: let go - unless it is back at once. */
    cancel() {
      clearTimeout(state.cancelling)
      state.cancelling = window.setTimeout(() => { clearTimeout(giveUp); fade() }, 0)
    },
  }
  // A frame after the scroll is put back, so the card is where it will be seen.
  function landSurface() {
    clearTimeout(giveUp)
    if (state.finished) return
    const card = /** @type {HTMLElement|null} */ (document.querySelector(`[data-zoom="${trip.key}"]`))
    const r = card?.getBoundingClientRect()
    if (!card || !r || r.bottom < 0 || r.top > window.innerHeight) { fade(); return }
    state.finished = true
    if (returning === state) returning = null
    const style = getComputedStyle(card)
    const to = over(style.backgroundColor, page)
    const radius = parseFloat(style.borderTopLeftRadius) || 16
    surface.animate(
      [{ clipPath: inset(null, 0), backgroundColor: page }, { clipPath: inset(r, radius), backgroundColor: to }],
      { duration: GROW_MS, easing: EASE_OUT, fill: 'forwards' },
    ).finished.then(() => surface.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FACE_MS, easing: 'linear', fill: 'forwards' }).finished)
      .then(remove, remove)
  }
  returning = state
  return state.handle
}

/**
 * The overview's side of closing a page into its card through the View
 * Transitions API: name the card once the overview is back in place, and
 * let the transition run. The same hand-out-again rule as the surface's
 * (see beginReturn), for React's double mount in development.
 *
 * @param {{key: string}} trip
 * @returns {Return}
 */
function landing(trip) {
  const state = { handle: /** @type {Return} */ (/** @type {unknown} */ (null)), finished: false, cancelling: 0 }
  const finish = () => {
    if (state.finished) return
    state.finished = true
    if (returning === state) returning = null
    release('close')
  }
  state.handle = {
    land() {
      if (state.finished) return
      const card = /** @type {HTMLElement|null} */ (document.querySelector(`[data-zoom="${trip.key}"]`))
      const r = card?.getBoundingClientRect()
      // Off screen, there is nothing to close into: the page just fades.
      if (card && r && r.bottom > 0 && r.top < window.innerHeight) {
        surfaceOf(card)
        nameFor(card)
      }
      finish()
    },
    cancel() {
      clearTimeout(state.cancelling)
      state.cancelling = window.setTimeout(finish, 0)
    },
  }
  returning = state
  return state.handle
}

/**
 * Keep how far down the overview is, as it scrolls, for Back to put it
 * there again. Returns the way to stop, and `ready` to call once the page
 * has been put back where it was: until then the scrolling is the page
 * being laid out and reset, not you, and is not kept.
 *
 * Kept as it happens rather than read as the page is left: by the time a
 * page is gone, the next one has often already reset the scroll to the top.
 */
export function trackScroll() {
  const main = document.getElementById('app-main')
  let live = true
  let armed = false
  let frame = 0
  const onScroll = () => {
    if (!armed) return
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => { if (live) setInsights({ scroll: scrolled() }, true) })
  }
  main?.addEventListener('scroll', onScroll, { passive: true })
  return {
    ready() { armed = true },
    stop() {
      live = false
      cancelAnimationFrame(frame)
      main?.removeEventListener('scroll', onScroll)
    },
  }
}
