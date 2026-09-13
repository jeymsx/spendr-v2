import { useState, useEffect } from 'react'

/**
 * Where the visible part of the screen ends, once the keyboard is over it.
 *
 * ── The behaviour this exists for ──
 *
 * On iOS - Safari and an installed PWA alike - opening the software keyboard
 * does NOT shrink the layout viewport. `100vh`, `position: fixed` and
 * `inset-0` all still measure the whole screen, so a bar pinned to the bottom
 * is pinned behind the keyboard. iOS then scrolls the VISUAL viewport inside
 * the layout one to reveal the caret, which drags everything painted at a
 * fixed position upward with it - and what you see is the page riding up with
 * a strip of background left under it.
 *
 * That is the gap. It is not a bug in the app and it is not something the
 * page can opt out of: `interactive-widget=resizes-content` in the viewport
 * meta would be the declarative fix and Safari does not implement it. The
 * only handle is window.visualViewport, which reports the visible slice and
 * where it sits.
 *
 * ── The two numbers ──
 *
 *   top     how far the visible slice has scrolled down inside the layout
 *           viewport. Fixed children are laid out from the layout viewport's
 *           origin, so this is how far they have to move to catch up.
 *   height  how tall the visible slice is.
 *
 * `inset` is what is left underneath - the keyboard, plus whatever browser
 * furniture is down there - in the same coordinates a fixed element is
 * positioned in. `open` is inset past a threshold, because the visual
 * viewport also moves by a few pixels for reasons that are not a keyboard,
 * and a navbar that flickers on a two-pixel wobble is worse than one that
 * ignores it.
 *
 * ── Not a duplicate of QuickLogOverlay's readViewport ──
 *
 * That one predates this and computes `offsetTop + height` for a different
 * job: it positions a block ABOVE the keyboard rather than pinning chrome to
 * the visible bottom. It reads the same two numbers and is deliberately left
 * alone - it is the one piece of this that is known to work on a real phone,
 * and none of this can be tested anywhere but a real phone.
 *
 * @returns {{top: number, height: number, inset: number, open: boolean}}
 */

/** Below this, it is browser furniture or a rounding wobble, not a keyboard. */
export const KEYBOARD_MIN = 80

function readViewport() {
  if (typeof window === 'undefined') {
    return { top: 0, height: 0, inset: 0, open: false }
  }
  const winH = window.innerHeight
  const vv = window.visualViewport
  // No visualViewport means an old browser, and an old browser gets the
  // behaviour it has always had rather than a guess.
  if (!vv) return { top: 0, height: winH, inset: 0, open: false }

  const inset = Math.max(0, Math.round(winH - (vv.offsetTop + vv.height)))
  return {
    top: Math.round(vv.offsetTop),
    height: Math.round(vv.height),
    inset,
    open: inset >= KEYBOARD_MIN,
  }
}

export function useKeyboardInset() {
  const [vp, setVp] = useState(readViewport)

  useEffect(() => {
    const vv = window.visualViewport

    const onChange = () => setVp(prev => {
      const next = readViewport()
      /* Same object back when nothing meaningful moved, so React bails out of
         the render. `scroll` fires on every frame of an iOS scroll, and this
         hook sits in the navbar and in every open sheet - re-rendering both on
         each of those would be a real cost for a number that has not changed. */
      if (next.open === prev.open && next.top === prev.top && next.inset === prev.inset) {
        return prev
      }
      return next
    })

    /* scroll as well as resize. The keyboard opening is a resize; iOS nudging
       the page to reveal the caret is a scroll, and that moves the visible
       slice just as much. */
    vv?.addEventListener('resize', onChange)
    vv?.addEventListener('scroll', onChange)
    window.addEventListener('orientationchange', onChange)
    return () => {
      vv?.removeEventListener('resize', onChange)
      vv?.removeEventListener('scroll', onChange)
      window.removeEventListener('orientationchange', onChange)
    }
  }, [])

  return vp
}

export default useKeyboardInset
