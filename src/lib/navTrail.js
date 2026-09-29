/**
 * The history behind the current page, as the app has seen it: each entry
 * by its location.key, with the page it was.
 *
 * The browser keeps this to itself - a page can read only its own entry -
 * and two things need to know what is behind: the edge swipe, to show that
 * page sliding in underneath (layouts/AppLayout.jsx), and a form going Home
 * after a save, which should go BACK to Home when that is where it was
 * opened from. Replacing the form with a second Home left two in the
 * history, and Android's Back then seemed to do nothing.
 *
 * Kept by AppLayout on every navigation; a cold open starts it again.
 */

/** @type {Array<{key: string, pathname: string}>} */
let trail = []

/**
 * @param {'PUSH'|'REPLACE'|'POP'|string} type  react-router's navigation type
 * @param {{key: string, pathname: string}} loc
 */
export function recordNav(type, loc) {
  const entry = { key: loc.key, pathname: loc.pathname }
  if (type === 'PUSH') trail.push(entry)
  else if (type === 'REPLACE') {
    if (trail.length) trail[trail.length - 1] = entry
    else trail = [entry]
  } else {
    // Back or forward to an entry we know: everything after it is gone. One we do not: start again.
    const at = trail.map(e => e.key).lastIndexOf(loc.key)
    if (at >= 0) trail.length = at + 1
    else trail = [entry]
  }
}

/** The entry behind the current one, or null on the first. */
export function entryBehind() {
  return trail.length > 1 ? trail[trail.length - 2] : null
}

/**
 * Home, after a form has saved: back, when Home is what it was opened from,
 * and otherwise Home in the form's place, so Back does not reopen the form.
 * @param {(to: any, opts?: any) => void} navigate
 */
export function homeAfterSave(navigate) {
  if (entryBehind()?.pathname === '/') navigate(-1)
  else navigate('/', { replace: true })
}

/** For tests. */
export function resetTrail() { trail = [] }
