import { useState } from 'react'
import { EASE_OUT, prefersReducedMotion } from '../../components/ui/motion'
import { setInsights } from './period'

/**
 * A card on Insights that opens into its page, and a page that closes back
 * into its card.
 *
 * ── What moves ──
 *
 * A surface the card's own colour and shape grows over the page you are on
 * until it fills the screen, turning to the page's colour as it goes, while
 * the card's words fade off it. Only then does the route change - under the
 * surface - and the surface fades to show the new page, whose content
 * resolves out of a short blur (useArrival). Back runs it the other way: the
 * overview is covered as it mounts, and once its figures are in and its
 * scroll is where you left it, the surface closes into the card you left
 * through. One zero-bounce ease throughout, as everything in the app.
 *
 * ── Why a surface of its own, and not the card itself ──
 *
 * The card belongs to a page that is about to be unmounted, and the page it
 * opens is a different route with its own layout. Nothing survives the route
 * change to be morphed, and the View Transitions API that would take
 * snapshots of both needs a data router this app does not use. A plain
 * element above the page, below the tab bar, is the one thing that lasts
 * through both.
 *
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
/** @type {{key: string}|null} */
let leftThrough = null
let busy = false

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
  if (busy || prefersReducedMotion() || typeof card.animate !== 'function') { go(); return }
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

/** On a page's first render: did it arrive out of a card? Its content then resolves out of a blur. */
export function useArrival() {
  const [cls] = useState(() => (performance.now() - arrivedAt < ARRIVAL_MS ? 'zoom-arrive' : ''))
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
    },
    /** The page went before it was ready: let go - unless it is back at once. */
    cancel() {
      clearTimeout(state.cancelling)
      state.cancelling = window.setTimeout(() => { clearTimeout(giveUp); fade() }, 0)
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
