/**
 * The nearest ancestor that scrolls: <main> in the phone app, a pane on the
 * desktop, a sheet's body in a sheet. Null when only the page itself does.
 *
 * Used as an IntersectionObserver's root, so what is watched is where an
 * element sits in its own scroll, not where the window happens to be. On an
 * iPhone the window can be left moved by the keyboard, and a box watched
 * against the window then reads as scrolled away when it is not.
 *
 * Hidden counts: <main> is overflow hidden while a sheet locks it
 * (hooks/useScrollLock.js), and it is still what the page scrolls in.
 *
 * @param {HTMLElement} el
 * @returns {HTMLElement|null}
 */
export function scrollParent(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if (oy === 'auto' || oy === 'scroll' || oy === 'hidden') return p
  }
  return null
}
