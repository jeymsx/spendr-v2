import { useEffect } from 'react'

/** How long the viewport has to be still before the page is checked, ms. */
export const SETTLE_AFTER = 150

/** Inputs that never bring up a keyboard. */
const NO_KEYBOARD = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'])

/**
 * Whether the element has the keyboard, or a picker in its place.
 *
 * @param {Element|null} el
 */
export function typing(el) {
  if (!el) return false
  if (/** @type {HTMLElement} */ (el).isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  return tag === 'INPUT' && !NO_KEYBOARD.has(/** @type {HTMLInputElement} */ (el).type)
}

/**
 * Puts the page back once the keyboard has gone.
 *
 * iOS slides the whole page up to show the field being typed in
 * (hooks/useKeyboardInset.js), and slides it back when the keyboard goes.
 * iOS 26 sometimes doesn't: visualViewport.offsetTop stays where it was, and
 * everything pinned stays pushed up with it, the tab bar floating over a strip
 * of background (Apple Developer Forums 800154, FB19889436).
 *
 * The app's page never scrolls, because every list scrolls inside it. A page
 * left scrolled with nothing being typed is always that, so scrolling it back
 * to the top is always right. It is checked once the viewport has been still
 * for a moment, so iOS's own way back is never cut short, and never while a
 * field has the keyboard: that field's page looks after itself.
 */
export function useKeyboardSettle() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    /** @type {ReturnType<typeof setTimeout>|null} */
    let timer = null

    const check = () => {
      timer = null
      if (typing(document.activeElement)) return
      // Pinch-zoomed, in a Safari tab: the page is meant to be moved.
      if (Math.abs(vv.scale - 1) > 0.01) return
      if (vv.offsetTop < 1 && window.scrollY < 1) return
      window.scrollTo(0, 0)
    }
    const soon = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(check, SETTLE_AFTER)
    }

    vv.addEventListener('resize', soon)
    vv.addEventListener('scroll', soon)
    document.addEventListener('focusout', soon)
    return () => {
      if (timer) clearTimeout(timer)
      vv.removeEventListener('resize', soon)
      vv.removeEventListener('scroll', soon)
      document.removeEventListener('focusout', soon)
    }
  }, [])
}

export default useKeyboardSettle
