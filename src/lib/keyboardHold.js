/**
 * Keep the phone's keyboard up across a navigation.
 *
 * iOS opens the keyboard only for a field focused during a tap - not for one
 * focused a moment later, after a database write and a new page. So tapping
 * the pencil for a new note focused its editor too late, and a new note
 * opened with no keyboard, one more tap from being written in.
 *
 * The way round it is the one every web editor uses: focus a field that
 * exists for this alone, invisibly, inside the tap - the keyboard comes up
 * for it - and then hand the focus to the real editor when it is there,
 * which iOS lets through without closing the keyboard in between. The stand-
 * in goes as soon as it is handed over, or after three seconds whatever
 * happens, so it is never left holding the keyboard for nothing.
 *
 * Anywhere else the stand-in is harmless: it is focused and let go.
 */

/** @type {HTMLInputElement|null} */
let held = null
/** @type {ReturnType<typeof setTimeout>|null} */
let timer = null

/** Call inside the tap. */
export function holdKeyboard() {
  releaseKeyboard()
  if (typeof document === 'undefined') return
  const el = document.createElement('input')
  el.type = 'text'
  el.tabIndex = -1
  el.setAttribute('aria-hidden', 'true')
  // 16px: anything smaller and iOS zooms the page to it.
  Object.assign(el.style, {
    position: 'fixed', top: '0', left: '0', width: '1px', height: '1px',
    opacity: '0', border: '0', padding: '0', fontSize: '16px', pointerEvents: 'none',
  })
  document.body.appendChild(el)
  el.focus({ preventScroll: true })
  held = el
  timer = setTimeout(releaseKeyboard, 3000)
}

/** Once the real editor has the focus. */
export function releaseKeyboard() {
  if (timer) { clearTimeout(timer); timer = null }
  held?.remove()
  held = null
}
