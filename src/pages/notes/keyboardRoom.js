import { expectedRoom, keyboardIsUp, touchScreen, visibleSlice } from '../../lib/keyboard'

/**
 * Where the caret may sit while a note is written on a phone, and keeping it
 * there: the notes half of stopping iOS from sliding the whole page up when
 * the keyboard opens (lib/keyboard.js has the other half, and why).
 *
 * A note is not a field WebKit can centre, so it keeps the two things that
 * leave the page where it is:
 *   - it is taller than the room above the keyboard while you write
 *     (index.css), so there is nothing to centre;
 *   - the caret is already above where the keyboard will be when iOS looks,
 *     so there is nothing to reveal. keepCaretClear runs as the focus lands,
 *     before the keyboard is up, with the keyboard's height from the last
 *     time it was up.
 * And while you type, the note's own scroller keeps the caret clear of the
 * keyboard. ProseMirror's own scrolling ends by scrolling the window, which
 * on an iPhone is the slide itself.
 *
 * The editor marks itself data-own-keyboard, so the guard every other
 * page's fields get (hooks/useKeyboardGuard.js) leaves it to this.
 */

/** Space between the header's bottom edge and the caret, px. */
const TOP_ROOM = 12
/** Space between the caret and the keyboard: a line and a half of text, px. */
const BOTTOM_ROOM = 40
/** More, while the keyboard's top is only expected. */
const EXPECTED_ROOM = 56

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
  let bottom = expected ? slice.top + expectedRoom('text') : slice.bottom
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
