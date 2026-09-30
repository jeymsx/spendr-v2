import { KEYBOARD_MIN } from '../hooks/useKeyboardInset'

/**
 * The phone's keyboard, as far as a page can know it: whether it is up, the
 * part of the screen it leaves, and how much it will leave the next time it
 * opens. Shared by the notes editor (pages/notes/keyboardRoom.js) and every
 * page's fields (hooks/useKeyboardGuard.js).
 *
 * ── Why a page cares ──
 *
 * The keyboard does not shrink a web page on an iPhone
 * (hooks/useKeyboardInset.js). When a field takes the focus, WebKit scrolls
 * the page itself instead, to put the field in the room above the keyboard:
 * it centres the field's box there when the box fits, and otherwise leaves
 * the box where it is and only makes sure the caret shows. On a phone it
 * does this on every focus, even with the field already in view
 * (WKWebViewIOS.mm, _zoomToFocusRect, forced because a phone shows the
 * ^ v ✓ bar). Spendr's page is one screen tall and its content scrolls
 * inside it, so scrolling the page slides everything: the header up under
 * the clock, the tab bar up over the keyboard.
 *
 * WebKit measures the focused field at its next rendering update, after
 * the focus event. So a page that scrolls its own content to put the field
 * where WebKit would put it, as the focus lands, leaves WebKit nothing to
 * do. That needs the keyboard's height before the keyboard is up, which is
 * what rememberKeyboard is for.
 *
 * ── Client coordinates ──
 *
 * getBoundingClientRect measures from the layout viewport in Chrome and from
 * the visible part of the screen in Safari. The two differ only while iOS
 * has the page scrolled, and visibleSlice() works in whichever the engine
 * uses, by adding where the document's own top is.
 */

/** @typedef {{top: number, bottom: number}} Slice */
/** @typedef {'text'|'pad'} KeyboardKind */

/**
 * The part of the screen you can see, in client coordinates.
 *
 * @returns {Slice}
 */
export function visibleSlice() {
  const vv = window.visualViewport
  if (!vv) return { top: 0, bottom: window.innerHeight }
  const top = vv.pageTop + document.documentElement.getBoundingClientRect().top
  return { top, bottom: top + vv.height }
}

/** Whether a keyboard covers the bottom of the screen now. */
export function keyboardIsUp() {
  const vv = window.visualViewport
  if (!vv) return false
  return window.innerHeight - (vv.offsetTop + vv.height) >= KEYBOARD_MIN
}

/**
 * Which keyboard a field brings up: the letters, with their suggestions
 * above, or a number pad, which is shorter.
 *
 * @param {Element|null|undefined} el
 * @returns {KeyboardKind}
 */
export function keyboardKind(el) {
  const mode = el?.getAttribute?.('inputmode')
  const type = /** @type {HTMLInputElement|undefined} */ (el)?.type
  return mode === 'numeric' || mode === 'decimal' || mode === 'tel' || type === 'number' || type === 'tel'
    ? 'pad'
    : 'text'
}

const STORE = 'spendr-keyboard-room'

/** @type {{w: number, text?: number, pad?: number}|null} */
let known = null

function load() {
  if (known) return known
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null')
    // 0.14.1 kept one number, for the notes' keyboard.
    if (saved && typeof saved.w === 'number') known = { w: saved.w, text: saved.text ?? saved.h, pad: saved.pad }
  } catch { /* nothing kept, or storage off */ }
  return known
}

/**
 * Keeps the room above the keyboard while it is up, for the next time this
 * kind opens.
 *
 * @param {KeyboardKind} [kind]
 */
export function rememberKeyboard(kind = 'text') {
  const vv = window.visualViewport
  if (!vv || !keyboardIsUp() || Math.abs(vv.scale - 1) > 0.01) return
  const h = Math.round(vv.height)
  const w = window.innerWidth
  const was = load()
  if (was && was.w === w && was[kind] === h) return
  /** @type {{w: number, text?: number, pad?: number}} */
  const next = was && was.w === w ? { ...was } : { w }
  next[kind] = h
  known = next
  try { localStorage.setItem(STORE, JSON.stringify(next)) } catch { /* private mode: this launch only */ }
}

/**
 * The room above a keyboard that is on its way up: what this kind left the
 * last time at this width, or half the screen, which is less than any iPhone
 * keyboard leaves.
 *
 * @param {KeyboardKind} [kind]
 */
export function expectedRoom(kind = 'text') {
  const was = load()
  const h = was && was.w === window.innerWidth ? was[kind] : undefined
  return h && h > 0 ? h : Math.round(window.innerHeight / 2)
}

/** For tests. */
export function forgetKeyboard() {
  known = null
}

/** A touch screen, where focusing a field brings up a keyboard. */
export function touchScreen() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}
