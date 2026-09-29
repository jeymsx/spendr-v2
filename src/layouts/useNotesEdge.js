import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { prefersReducedMotion } from '../components/ui/motion'

/**
 * Whether Notes is being drawn under the finger - kept outside React state,
 * so that starting a swipe re-renders the drawn page and nothing else. As
 * state in the layout it re-rendered the whole page under the finger on the
 * swipe's first frame, which is the frame a hitch shows most.
 */
function createPeek() {
  let on = false
  const listeners = new Set()
  return {
    get: () => on,
    /** @param {boolean} v */
    set: (v) => {
      if (v === on) return
      on = v
      for (const l of listeners) l()
    },
    /** @param {() => void} l */
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l) } },
  }
}

/**
 * Draws its children only while the swipe is drawing Notes.
 *
 * @param {{peek: ReturnType<typeof createPeek>, children: import('react').ReactNode}} props
 */
export function WhilePeeking({ peek, children }) {
  const on = useSyncExternalStore(peek.subscribe, peek.get, () => false)
  return on ? children : null
}

/**
 * Swipe in from the right edge of a tab and Notes slides in over it - the
 * way the left edge takes you back (AppLayout's edge swipe), and the way a
 * page pushed on an iPhone comes in.
 *
 * ── Where it works ──
 *
 * The installed app on an iPhone, on the four tabs. Only there: Android's
 * back gesture owns both edges of the screen, and a browser tab's edge swipe
 * is its own forward and back. Everywhere else Notes is the page icon on
 * Home (and the sidebar on a computer).
 *
 * Not from a row that swipes itself (a transaction's delete), a chart a
 * finger scrubs, or a rail that can still scroll that way - a drag there is
 * that thing's, as it is on an iPhone. And not while a sheet is up.
 *
 * ── What moves ──
 *
 * The page under the finger drifts left a third as fast, dimming, while
 * Notes - the real page, drawn inert (pages/Notes.jsx `peek`) - comes in over
 * it with the finger. Let go past a third of the way, or flick it, and it
 * finishes and the route changes under it; the drawn copy stays over the real
 * page for a moment, so the swap cannot be seen. Short of that it slides back
 * off. Reduced motion keeps the finger's own movement and drops the drift.
 *
 * @param {{
 *   mainRef: import('react').RefObject<HTMLElement|null>,
 *   pageRef: import('react').RefObject<HTMLElement|null>,
 *   pathnameRef: import('react').RefObject<string>,
 *   onOpen: () => void,
 * }} opts
 *   onOpen: go to Notes, once the slide has finished
 */
export function useNotesEdge({ mainRef, pageRef, pathnameRef, onOpen }) {
  const [standalone] = useState(() => typeof navigator !== 'undefined' && !!/** @type {any} */ (navigator).standalone)
  const [peek] = useState(createPeek)
  const aheadRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const dimRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const openRef = useRef(onOpen)
  useEffect(() => { openRef.current = onOpen }, [onOpen])
  // Set when a swipe finished: the page it opened is already in place.
  const arrived = useRef(false)

  const reset = useCallback(() => {
    const layer = aheadRef.current
    const dim = dimRef.current
    if (layer) {
      layer.style.transition = 'none'
      layer.style.transform = 'translateX(100%)'
      layer.style.visibility = 'hidden'
    }
    if (dim) { dim.style.transition = 'none'; dim.style.opacity = '0' }
    peek.set(false)
  }, [peek])

  useEffect(() => { if (aheadRef.current) aheadRef.current.inert = true }, [standalone])

  // The chunk ready before a finger needs it, so the page is drawn under the first swipe.
  useEffect(() => {
    if (!standalone) return
    const t = setTimeout(() => { import('../pages/Notes').catch(() => { /* offline: the swipe draws it when it can */ }) }, 1500)
    return () => clearTimeout(t)
  }, [standalone])

  useEffect(() => {
    const el = mainRef.current
    if (!el || !standalone) return
    const EDGE = 20
    const TABS = new Set(['/', '/transactions', '/accounts', '/insights'])
    const width = () => el.clientWidth || window.innerWidth

    /* A rail that can still scroll towards the finger's direction has the
       drag. At its end, the edge does. */
    const railCanTake = (/** @type {EventTarget|null} */ t) => {
      for (let n = /** @type {HTMLElement|null} */ (t instanceof HTMLElement ? t : null); n && n !== el; n = n.parentElement) {
        if (n.scrollWidth <= n.clientWidth + 1 || n.scrollLeft + n.clientWidth >= n.scrollWidth - 1) continue
        // Only a box that scrolls: a card's clipped name is wider than the card too.
        const { overflowX } = getComputedStyle(n)
        if (overflowX === 'auto' || overflowX === 'scroll') return true
      }
      return false
    }

    /** @param {number} x how far left of where it started, 0 or less @param {boolean} settle */
    const place = (x, settle) => {
      const w = width()
      const p = Math.min(1, Math.max(0, -x / w))
      const curve = 'cubic-bezier(0.2, 0.9, 0.25, 1)'
      const layer = aheadRef.current
      const page = pageRef.current
      const dim = dimRef.current
      if (layer) {
        layer.style.visibility = 'visible'
        layer.style.transition = settle ? `transform 260ms ${curve}` : 'none'
        layer.style.transform = `translateX(${Math.round(w + x)}px)`
      }
      if (page) {
        page.style.transition = settle ? `transform 260ms ${curve}` : 'none'
        page.style.transform = x && !prefersReducedMotion() ? `translateX(${Math.round(x * 0.3)}px)` : ''
      }
      if (dim) {
        dim.style.transition = settle ? `opacity 260ms ${curve}` : 'none'
        dim.style.opacity = String(p * 0.14)
      }
    }

    /** @type {{x: number, y: number, t: number}|null} */
    let start = null
    /** @type {'x'|'y'|null} */
    let axis = null
    let dx = 0
    let busy = false

    const onStart = (/** @type {TouchEvent} */ e) => {
      if (start && e.touches.length > 1) { start = null; place(0, true); setTimeout(reset, 280); return }
      start = null
      const t = e.touches[0]
      if (busy || e.touches.length !== 1 || t.clientX < width() - EDGE || !TABS.has(pathnameRef.current ?? '')) return
      if (document.querySelector('.sheet-overlay, [aria-modal="true"]')) return
      // A chart's SVG is not an HTMLElement, so this asks for `closest` rather than the class.
      const target = /** @type {{closest?: (s: string) => unknown}|null} */ (e.target)
      if (target?.closest?.('.swipe-row, .recharts-wrapper') || railCanTake(e.target)) return
      start = { x: t.clientX, y: t.clientY, t: performance.now() }
      axis = null
      dx = 0
    }
    const onMove = (/** @type {TouchEvent} */ e) => {
      if (!start) return
      const t = e.touches[0]
      const mx = t.clientX - start.x
      const my = t.clientY - start.y
      if (!axis && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
        axis = Math.abs(mx) > Math.abs(my) && mx < 0 ? 'x' : 'y'
        if (axis === 'x') peek.set(true)
      }
      if (axis === 'y') { start = null; return }
      if (axis !== 'x') return
      e.preventDefault()
      dx = Math.min(0, mx)
      place(dx, false)
    }
    const onEnd = (/** @type {TouchEvent} */ e) => {
      if (e.touches.length > 0) return
      if (!start || axis !== 'x') { start = null; return }
      const speed = -dx / Math.max(1, performance.now() - start.t)
      start = null
      const w = width()
      if (-dx > w / 3 || (speed > 0.5 && -dx > 40)) {
        busy = true
        place(-w, true)
        setTimeout(() => {
          busy = false
          arrived.current = true
          openRef.current()
        }, 260)
      } else {
        place(0, true)
        setTimeout(reset, 280)
      }
    }
    const onCancel = () => {
      if (!start) return
      start = null
      place(0, true)
      setTimeout(reset, 280)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
    }
  }, [mainRef, pageRef, pathnameRef, standalone, reset, peek])

  /**
   * For AppLayout, as the route changes: when the swipe opened this page,
   * skip its fade (it is already in place) and take the drawn copy away once
   * the real one has had a moment to draw.
   *
   * @returns {boolean} whether it did
   */
  const land = useCallback(() => {
    if (!arrived.current) return false
    arrived.current = false
    setTimeout(reset, 280)
    return true
  }, [reset])

  return { standalone, peek, aheadRef, dimRef, land }
}
