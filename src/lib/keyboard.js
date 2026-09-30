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
 *
 * ── Is it up ──
 *
 * The keyboard covering the bottom of the page is the classic sign: the
 * visible part ending well above the page's own bottom. It is not the only
 * one. An installed app on iOS 26 can shrink the page itself for the
 * keyboard - innerHeight with it - and then nothing is covered at all; and
 * iOS scrolling the page up by the keyboard's full height leaves the visible
 * part ending at the page's bottom again. Both read "no keyboard", and the
 * tab bar, hidden only while a keyboard is up, rode up on it. So it is also
 * up when a field that takes a keyboard has the focus and the visible part
 * is well short of the tallest it has been at this width.
 */

/** Below this, it is browser furniture or a rounding wobble, not a keyboard. */
export const KEYBOARD_MIN = 80
/** How far short of its tallest the visible part has to be to be a keyboard.
    Taller than any toolbar that slides in and out; shorter than any keyboard. */
const SHRUNK_MIN = 120

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

/** The tallest the visible part has been, at the width it was measured at. */
let tallest = { w: 0, h: 0 }

/** Measures, and returns, the tallest the visible part has been at this width. */
export function tallestSeen() {
  const vv = window.visualViewport
  const w = window.innerWidth
  const h = Math.round(Math.max(window.innerHeight, vv ? vv.offsetTop + vv.height : 0))
  if (tallest.w !== w) tallest = { w, h }
  else if (h > tallest.h) tallest = { w, h }
  return tallest.h
}

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

/** Whether a keyboard is up now (see Is it up, above). */
export function keyboardIsUp() {
  const vv = window.visualViewport
  if (!vv) return false
  const tall = tallestSeen()
  if (window.innerHeight - (vv.offsetTop + vv.height) >= KEYBOARD_MIN) return true
  return typing(document.activeElement) && tall - vv.height >= SHRUNK_MIN
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

const STORE = 'spendr-keyboard-rooms'

/**
 * Where 0.14.1 and 0.14.2 kept it. 0.14.1's one number is the notes', taken
 * with the letters up, and is kept. 0.14.2's could be the number pad's under
 * the letters' name - it remembered on any viewport change, including the
 * one just after the focus moved from an amount to a description, with the
 * pad still up - so those are left behind and measured again.
 */
const LEGACY = 'spendr-keyboard-room'

/** @type {{w: number, text?: number, pad?: number}|null} */
let known = null

function load() {
  if (known) return known
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null')
    if (saved && typeof saved.w === 'number') {
      known = { w: saved.w, text: saved.text, pad: saved.pad }
    } else {
      const old = JSON.parse(localStorage.getItem(LEGACY) ?? 'null')
      if (old && typeof old.w === 'number' && typeof old.h === 'number') known = { w: old.w, text: old.h }
    }
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
  tallest = { w: 0, h: 0 }
}

/** A touch screen, where focusing a field brings up a keyboard. */
export function touchScreen() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}
