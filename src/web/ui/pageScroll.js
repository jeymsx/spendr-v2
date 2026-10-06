import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Where each desktop page was scrolled to, so Back lands where you left it.
 *
 * The phone has had this since 0.12.0 (layouts/AppLayout): scroll a long
 * Transactions list, open a row's account, come back, and you are still at
 * the row. The desktop reset every page to its top on every address change,
 * Back included. Each desktop page is its own scroller (ui/Page, ui/PhonePage),
 * mounted with its route, so the places are kept here, outside them, per
 * history entry (location.key) - the same page opened twice keeps two.
 *
 * A new address (`top` changes) starts at the top, as before; Back or
 * Forward to an entry with a place puts it back. The page's rows arrive a
 * few frames after its route - its code, then its reads, its skeletons
 * first - so the place is put back as soon as there is enough page under
 * it, and is not counted as done while skeletons are still standing in. A
 * wheel, a press or a key in the meantime wins: never fight the hand.
 *
 * `top` is what has to change for the page to start again at its top - its
 * address, or a split view's own key (Notes, Settings), whose right half
 * changes without the column moving.
 */

/** @type {Map<string, number>} */
const places = new Map()
const KEEP = 200

/**
 * @param {import('react').RefObject<HTMLElement|null>} ref the page's scroller
 * @param {string} top
 */
export function usePageScroll(ref, top) {
  const location = useLocation()
  const navType = useNavigationType()
  const shown = useRef(location.key)
  // Not while a place is being put back: those steps are not where you were.
  const restoring = useRef(false)
  const lastTop = useRef(/** @type {string|null} */ (null))
  // Which entry the page's scroll belongs to, before anything below reads it.
  useLayoutEffect(() => { shown.current = location.key }, [location.key])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const onScroll = () => {
      if (frame || restoring.current) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (restoring.current) return
        places.delete(shown.current)
        places.set(shown.current, el.scrollTop)
        while (places.size > KEEP) {
          const oldest = places.keys().next().value
          if (oldest === undefined) break
          places.delete(oldest)
        }
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame) }
  }, [ref])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const moved = lastTop.current !== top
    lastTop.current = top
    const saved = navType === 'POP' ? places.get(location.key) : undefined
    // A new entry at the same address (a note opened beside the list, ?tx=) stays where it is.
    if (!saved) { if (moved) el.scrollTop = 0; return }
    restoring.current = true
    let raf = 0
    const deadline = performance.now() + 3000
    const finish = () => {
      restoring.current = false
      cancelAnimationFrame(raf)
      el.removeEventListener('wheel', finish)
      el.removeEventListener('pointerdown', finish)
      window.removeEventListener('keydown', finish)
    }
    el.addEventListener('wheel', finish, { passive: true })
    el.addEventListener('pointerdown', finish, { passive: true })
    window.addEventListener('keydown', finish)
    const place = () => {
      const max = el.scrollHeight - el.clientHeight
      el.scrollTop = Math.min(saved, max)
      const arrived = max >= saved - 1 && !el.querySelector('.d-skel')
      if (arrived || performance.now() > deadline) { finish(); return }
      raf = requestAnimationFrame(place)
    }
    place()
    return finish
    // Only a new address or a new entry moves the page; the rest of location does not.
  }, [top, location.key]) // eslint-disable-line react-hooks/exhaustive-deps
}
