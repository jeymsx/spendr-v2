import { KEYBOARD_MIN } from '../../hooks/useKeyboardInset'

/**
 * Where the caret may sit while a note is written on a phone, and keeping it
 * there: the notes half of stopping iOS from sliding the whole page up when
 * the keyboard opens.
 *
 * ── What iOS does ──
 *
 * The keyboard does not shrink a web page on an iPhone
 * (hooks/useKeyboardInset.js). When something takes the focus, WebKit
 * scrolls the page itself instead, to put what is being edited in the room
 * above the keyboard: it centres the editable's whole box there if the box
 * fits, and otherwise leaves the box where it is and only makes sure the
 * caret shows. On a phone it does this on every focus, even with all of it
 * already in view (WKWebViewIOS.mm, _zoomToFocusRect, forced because a
 * phone shows the ^ v ✓ bar). Spendr's page is one screen tall and its lists
 * scroll inside it, so scrolling the page slides everything: the header up
 * under the clock, the tab bar up off the bottom.
 *
 * So the note keeps the two things that leave the page where it is:
 *   - it is taller than the room above the keyboard while you write
 *     (index.css), so there is nothing to centre;
 *   - the caret is already above where the keyboard will be when iOS looks,
 *     so there is nothing to reveal. keepCaretClear runs as the focus lands,
 *     before the keyboard is up, with the keyboard's height from the last
 *     time it was up. WebKit measures the focused note after that, at its
 *     next rendering update, so it sees the note where this put it.
 * And while you type, the note's own scroller keeps the caret clear of the
 * keyboard. ProseMirror's own scrolling ends by scrolling the window, which
 * on an iPhone is the slide itself.
 *
 * ── Client coordinates ──
 *
 * getBoundingClientRect measures from the layout viewport in Chrome and from
 * the visible part of the screen in Safari. The two differ only while iOS
 * has the page scrolled, and visibleSlice() works in whichever the engine
 * uses, by adding where the document's own top is.
 */

/** Space between the header's bottom edge and the caret, px. */
const TOP_ROOM = 12
/** Space between the caret and the keyboard: a line and a half of text, px. */
const BOTTOM_ROOM = 40
/** More, while the keyboard's top is only expected. */
const EXPECTED_ROOM = 56

const STORE = 'spendr-keyboard-room'

/** @typedef {{top: number, bottom: number}} Slice */

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

/** @type {{w: number, h: number}|null} */
let known = null

/** Keeps the room above the keyboard while it is up, for the next time it opens. */
export function rememberKeyboard() {
  const vv = window.visualViewport
  if (!vv || !keyboardIsUp() || Math.abs(vv.scale - 1) > 0.01) return
  const next = { w: window.innerWidth, h: Math.round(vv.height) }
  if (known && known.w === next.w && known.h === next.h) return
  known = next
  try { localStorage.setItem(STORE, JSON.stringify(next)) } catch { /* private mode: this launch only */ }
}

/**
 * The room above a keyboard that is on its way up: what it was last time at
 * this width, or half the screen, which is less than any iPhone leaves.
 */
function expectedRoom() {
  if (!known) {
    try { known = JSON.parse(localStorage.getItem(STORE) ?? 'null') } catch { known = null }
  }
  if (known && known.w === window.innerWidth && known.h > 0) return known.h
  return Math.round(window.innerHeight / 2)
}

/** For tests. */
export function forgetKeyboard() {
  known = null
}

/** A touch screen, where focusing the note brings up a keyboard. */
const touchScreen = () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches

/**
 * Scrolls the note's scroller so the caret sits between the header and the
 * keyboard. Returns whether it looked after the scrolling, for ProseMirror's
 * handleScrollToSelection.
 *
 * @param {import('@tiptap/pm/view').EditorView} view
 * @param {{x: number, y: number}|null} [tap]  where a touch just landed. The
 *   caret is going there, but the selection has not moved yet when the
 *   focus arrives.
 * @returns {boolean}
 */
export function keepCaretClear(view, tap = null) {
  const scroller = /** @type {HTMLElement|null} */ (view.dom.closest('#app-main'))
  if (!scroller) return false
  const caret = caretRect(view, tap)
  if (!caret) return true

  const slice = visibleSlice()
  // Focused on a touch screen with no keyboard yet: it is on its way.
  const expected = touchScreen() && !keyboardIsUp()
  let bottom = expected ? slice.top + expectedRoom() : slice.bottom
  if (!expected) {
    // With no keyboard, the tab bar or the Aa panel covers the bottom instead.
    for (const el of document.querySelectorAll('#app-main ~ nav, .note-format')) {
      const r = el.getBoundingClientRect()
      if (r.height > 0) bottom = Math.min(bottom, r.top)
    }
  }
  const header = scroller.querySelector('.pinned-top')?.getBoundingClientRect().bottom ?? slice.top
  const top = Math.max(slice.top, header) + TOP_ROOM
  const limit = bottom - (expected ? EXPECTED_ROOM : BOTTOM_ROOM)

  if (caret.bottom > limit) scroller.scrollTop += caret.bottom - limit
  else if (caret.top < top) scroller.scrollTop -= top - caret.top
  return true
}

/**
 * @param {import('@tiptap/pm/view').EditorView} view
 * @param {{x: number, y: number}|null} tap
 */
function caretRect(view, tap) {
  let pos = view.state.selection.head
  if (tap) {
    const at = view.posAtCoords({ left: tap.x, top: tap.y })
    if (at) pos = at.pos
  }
  try {
    return view.coordsAtPos(pos)
  } catch {
    return null
  }
}
