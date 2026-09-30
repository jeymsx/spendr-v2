import { useEffect } from 'react'
import { expectedRoom, keyboardIsUp, keyboardKind, rememberKeyboard, touchScreen, visibleSlice } from '../lib/keyboard'

/**
 * Keeps the page where it is while you type on a phone, and puts it back if
 * iOS moved it anyway.
 *
 * ── A field on a page ──
 *
 * iOS centres a focused field in the room above the keyboard by scrolling
 * the whole page, header and tab bar with it (lib/keyboard.js). So as the
 * focus lands, before the keyboard is up, the page scrolls its own content
 * to put the field there itself, and iOS finds nothing to do. While there is
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

/** Inputs that never bring up a keyboard. */
const NO_KEYBOARD = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'])
/** Inputs that bring up a keyboard to type into (a date or time brings a picker). */
const TYPED = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number'])

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
 * With the keyboard on its way (`expecting`): no lower than the centre of
 * the room it will leave - where iOS would centre it by moving the page,
 * which then has nothing to do. A field taller than that room only needs
 * its top in the upper half. With the keyboard up: between the header and
 * the keyboard.
 *
 * @param {HTMLElement} el
 * @param {boolean} expecting
 */
export function keepFieldClear(el, expecting) {
  const scroller = document.getElementById('app-main')
  if (!scroller) return
  const r = el.getBoundingClientRect()
  const slice = visibleSlice()
  const room = expecting ? expectedRoom(keyboardKind(el)) : slice.bottom - slice.top
  const top = headerBottom(scroller, slice.top) + TOP_ROOM

  let move = 0
  if (expecting) {
    const centre = slice.top + room / 2 - CENTRE_ROOM
    const at = r.height >= room ? r.top : (r.top + r.bottom) / 2
    if (at > centre) move = Math.min(at - centre, r.top - top)
  } else {
    const bottom = slice.top + room - BOTTOM_ROOM
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

    const onViewport = () => {
      const el = document.activeElement
      if (!guarded(el) || !touchScreen()) { settleSoon(); return }
      if (Math.abs(vv.scale - 1) > 0.01) return
      const up = keyboardIsUp()
      if (up) rememberKeyboard(keyboardKind(el))
      if (vv.offsetTop > 1 && performance.now() - undone > 300) {
        undone = performance.now()
        window.scrollTo(0, 0)
      }
      keepFieldClear(el, !up)
    }

    /** @param {FocusEvent} e */
    const onFocusIn = (e) => {
      const el = /** @type {Element} */ (e.target)
      if (!guarded(el) || !touchScreen()) return
      if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null }
      // Synchronously, so the room is there for the scroll below.
      root.classList.add('field-typing')
      keepFieldClear(el, !keyboardIsUp())
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
