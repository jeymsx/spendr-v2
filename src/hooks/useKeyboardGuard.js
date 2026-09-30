import { useEffect } from 'react'
import { expectedRoom, keyboardIsUp, keyboardKind, rememberKeyboard, touchScreen, typing, visibleSlice } from '../lib/keyboard'

export { typing }

/**
 * Keeps the page where it is while you type on a phone, and puts it back if
 * iOS moved it anyway.
 *
 * ── A field on a page ──
 *
 * iOS centres a focused field in the room above the keyboard by scrolling
 * the whole page, header and tab bar with it (lib/keyboard.js). So as the
 * focus lands, before iOS looks, the page scrolls its own content to put
 * the field there itself, and iOS finds nothing to do. That is every focus,
 * the keyboard up or not: moving from the amount to the description centres
 * the description all over again, for the letters that replace the number
 * pad. While there is
 * a field to look after, the page gets room under it to scroll into
 * (index.css, html.field-typing), since a short form has no scroll to spare.
 * If iOS scrolls the page anyway - a guess at the keyboard that was wrong,
 * a keyboard that grew - the page goes back and its content scrolls instead,
 * not more than once a beat, so a scroll iOS insists on is never fought over.
 *
 * Fields in a sheet are left alone: a sheet sizes itself to the room above
 * the keyboard (ui/Sheet.jsx). So is the notes editor, which marks itself
 * data-own-keyboard and keeps its caret clear itself
 * (pages/notes/keyboardRoom.js).
 *
 * ── After the keyboard ──
 *
 * iOS 26 sometimes leaves visualViewport.offsetTop where the keyboard put it
 * after the keyboard closes, and everything pinned stays pushed up with it:
 * the tab bar floating over a strip of background (Apple Developer Forums
 * 800154, FB19889436). The app's page never scrolls, since every list scrolls
 * inside it, so a page left scrolled with nothing being typed is always that,
 * and scrolling it back to the top is always right. It is checked once the
 * viewport has been still for a moment, so iOS's own way back is never cut
 * short.
 */

/** How long the viewport has to be still before the page is checked, ms. */
export const SETTLE_AFTER = 150
/** How long a field's room outlasts its focus, so the next field keeps it, ms. */
export const RELEASE_AFTER = 250

/** Space between the header and a field, and between a field and the keyboard, px. */
const TOP_ROOM = 12
const BOTTOM_ROOM = 16
/** How far above the room's centre a field goes, to be sure of it, px. */
const CENTRE_ROOM = 8

/** Inputs that bring up a keyboard to type into (a date or time brings a picker). */
const TYPED = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number'])

/**
 * Whether this looks after the field: something typed into, on a page, not
 * in a sheet and not the notes editor.
 *
 * @param {Element|null} el
 * @returns {el is HTMLInputElement|HTMLTextAreaElement}
 */
export function guarded(el) {
  if (!el?.closest) return false
  const field = /** @type {HTMLInputElement} */ (el)
  if (el.tagName === 'INPUT') {
    if (!TYPED.has(field.type)) return false
  } else if (el.tagName !== 'TEXTAREA') {
    return false
  }
  if (field.readOnly || field.disabled) return false
  if (el.closest('[role="dialog"], [data-own-keyboard]')) return false
  return !!el.closest('#app-main')
}

/**
 * Where the page's own top ends: its pinned header, or the status bar.
 *
 * @param {HTMLElement} scroller
 * @param {number} fallback
 */
function headerBottom(scroller, fallback) {
  let bottom = fallback
  const tops = [...scroller.querySelectorAll('.pinned-top, .own-top'), document.querySelector('.status-frost')]
  for (const el of tops) {
    const r = el?.getBoundingClientRect()
    if (r && r.height > 0) bottom = Math.max(bottom, r.bottom)
  }
  return bottom
}

/**
 * Scrolls the page's content so the field sits where iOS wants it.
 *
 * `centre`, as the focus lands, and whenever there is no keyboard up yet: no
 * lower than the middle of the room the field's keyboard leaves - where iOS
 * would centre it by moving the page, which then has nothing to do. The
 * field's keyboard may not be the one that is up (the letters for a
 * description, after the amount's number pad), so it is the smaller of the
 * two rooms. A field taller than the room only needs its top in the upper
 * half.
 *
 * Otherwise, with the keyboard up: between the header and the keyboard.
 *
 * @param {HTMLElement} el
 * @param {boolean} centre
 */
export function keepFieldClear(el, centre) {
  const scroller = document.getElementById('app-main')
  if (!scroller) return
  const r = el.getBoundingClientRect()
  const slice = visibleSlice()
  const up = keyboardIsUp()
  const top = headerBottom(scroller, slice.top) + TOP_ROOM

  let move = 0
  if (centre || !up) {
    const expected = expectedRoom(keyboardKind(el))
    const room = up ? Math.min(slice.bottom - slice.top, expected) : expected
    const middle = slice.top + room / 2 - CENTRE_ROOM
    const at = r.height >= room ? r.top : (r.top + r.bottom) / 2
    if (at > middle) move = Math.min(at - middle, r.top - top)
    else if (r.top < top) move = r.top - top
  } else {
    const bottom = slice.bottom - BOTTOM_ROOM
    if (r.bottom > bottom) move = Math.min(r.bottom - bottom, r.top - top)
    else if (r.top < top) move = r.top - top
  }
  if (move) scroller.scrollTop += move
}

export function useKeyboardGuard() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    /** @type {ReturnType<typeof setTimeout>|null} */
    let settleTimer = null
    /** @type {ReturnType<typeof setTimeout>|null} */
    let releaseTimer = null
    let undone = -Infinity

    const settle = () => {
      settleTimer = null
      if (typing(document.activeElement)) return
      // Pinch-zoomed, in a Safari tab: the page is meant to be moved.
      if (Math.abs(vv.scale - 1) > 0.01) return
      if (vv.offsetTop < 1 && window.scrollY < 1) return
      window.scrollTo(0, 0)
    }
    const settleSoon = () => {
      if (settleTimer) clearTimeout(settleTimer)
      settleTimer = setTimeout(settle, SETTLE_AFTER)
    }

    /** @param {Event} e */
    const onViewport = (e) => {
      const el = document.activeElement
      if (!guarded(el) || !touchScreen()) { settleSoon(); return }
      if (Math.abs(vv.scale - 1) > 0.01) return
      /* Kept on a resize only. A scroll leaves the keyboard as it was, and
         just after the focus moves, the keyboard up can still be the last
         field's - the number pad, remembered as the letters' room. */
      if (e.type === 'resize' && keyboardIsUp()) rememberKeyboard(keyboardKind(el))
      if (vv.offsetTop > 1 && performance.now() - undone > 300) {
        undone = performance.now()
        window.scrollTo(0, 0)
      }
      keepFieldClear(el, false)
    }

    /** @param {FocusEvent} e */
    const onFocusIn = (e) => {
      const el = /** @type {Element} */ (e.target)
      if (!guarded(el) || !touchScreen()) return
      if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null }
      // Synchronously, so the room is there for the scroll below.
      root.classList.add('field-typing')
      keepFieldClear(el, true)
    }

    const onFocusOut = () => {
      settleSoon()
      if (!root.classList.contains('field-typing')) return
      if (releaseTimer) clearTimeout(releaseTimer)
      releaseTimer = setTimeout(() => {
        releaseTimer = null
        if (!guarded(document.activeElement)) root.classList.remove('field-typing')
      }, RELEASE_AFTER)
    }

    vv.addEventListener('resize', onViewport)
    vv.addEventListener('scroll', onViewport)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      if (settleTimer) clearTimeout(settleTimer)
      if (releaseTimer) clearTimeout(releaseTimer)
      root.classList.remove('field-typing')
      vv.removeEventListener('resize', onViewport)
      vv.removeEventListener('scroll', onViewport)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])
}

export default useKeyboardGuard
