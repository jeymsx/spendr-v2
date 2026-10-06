import { useLayoutEffect, useRef } from 'react'

/**
 * A figure that steps its type down until it fits its box, rather than being
 * cut off with an ellipsis: an eight-figure balance in a figure card at
 * 1280px read "₱14,683,60…". Down a pixel at a time from the size the CSS
 * gives it, no smaller than `min` - past that the ellipsis is the last
 * resort. Again whenever the box is resized or the figure changes (a
 * balance rolling, a currency switched), from the CSS size each time, so a
 * figure that shrinks back gets its size back too.
 *
 * @param {number} [min] the smallest it may go, in px
 * @returns {import('react').RefObject<HTMLElement|null>}
 */
export function useFitText(min = 16) {
  const ref = useRef(/** @type {HTMLElement|null} */ (null))
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let width = -1
    let text = ''
    const fit = () => {
      // Only when something it depends on moved: a resize of its height is its own doing.
      if (el.clientWidth === width && el.textContent === text) return
      width = el.clientWidth
      text = el.textContent ?? ''
      el.style.fontSize = ''
      let size = parseFloat(getComputedStyle(el).fontSize)
      while (el.scrollWidth > el.clientWidth + 0.5 && size > min) {
        size -= 1
        el.style.fontSize = `${size}px`
      }
    }
    fit()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    ro?.observe(el)
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(fit)
    mo?.observe(el, { childList: true, characterData: true, subtree: true })
    // Inter arriving after the first measure changes every width.
    document.fonts?.ready.then(() => { width = -1; fit() }).catch(() => {})
    return () => { ro?.disconnect(); mo?.disconnect() }
  }, [min])
  return ref
}
