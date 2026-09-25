/**
 * Keeping a keyboard inside a dialog.
 *
 * Shared by Sheet and the full-screen monthly recap: anything that covers the
 * page should be inert to a keyboard the way it already is to a pointer.
 */

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Call from a keydown handler: a Tab that would leave `container` wraps to
 * its other end instead, and a Tab from outside it lands inside.
 *
 * Not an offsetParent check for visibility: that returns null for every
 * element in jsdom and for anything positioned fixed in a browser, so it made
 * the trap silently do nothing. `hidden` and an aria-hidden ancestor are what
 * actually occur here - dialogs conditionally render rather than display:none
 * their controls.
 *
 * @param {KeyboardEvent} e
 * @param {HTMLElement|null|undefined} container
 */
export function keepTabInside(e, container) {
  if (e.key !== 'Tab' || !container) return
  const nodes = [...container.querySelectorAll(FOCUSABLE)]
    .filter(n => !n.hasAttribute('hidden') && !n.closest('[aria-hidden="true"]'))
  if (!nodes.length) { e.preventDefault(); return }
  const first = /** @type {HTMLElement} */ (nodes[0])
  const last = /** @type {HTMLElement} */ (nodes[nodes.length - 1])
  const active = document.activeElement
  // The container itself holds focus when a dialog opens; from there, either
  // direction should land on a control rather than walk out.
  const inside = active !== container && container.contains(active)
  if (!e.shiftKey && (active === last || !inside)) {
    e.preventDefault()
    first.focus()
  } else if (e.shiftKey && (active === first || !inside)) {
    e.preventDefault()
    last.focus()
  }
}
