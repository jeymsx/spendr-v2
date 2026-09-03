import { useEffect, useState } from 'react'

/**
 * Chooses between the mobile UI (src/pages) and the desktop UI (src/web).
 *
 * Auto by default: wide viewport gets desktop, narrow gets mobile, so opening
 * the app on a laptop or a phone just works with no setup.
 *
 * The override is stored in localStorage, NOT in db.meta. meta syncs, so a
 * desktop preference set on the laptop would follow to the phone and force a
 * landscape layout onto a 390px screen. This choice belongs to the device.
 *
 * `?view=desktop` / `?view=mobile` in the URL sets the override and persists
 * it, which is the escape hatch when a laptop window is too narrow to trip the
 * media query. Nothing in the mobile UI needed changing to support any of this.
 */

const KEY = 'spendr-view-mode'      // 'auto' | 'mobile' | 'desktop'
export const DESKTOP_QUERY = '(min-width: 1024px)'

function readOverride() {
  try {
    const url = new URLSearchParams(window.location.search).get('view')
    if (url === 'desktop' || url === 'mobile' || url === 'auto') {
      localStorage.setItem(KEY, url)
      return url
    }
    const stored = localStorage.getItem(KEY)
    return stored === 'desktop' || stored === 'mobile' ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

export function setViewMode(mode) {
  try { localStorage.setItem(KEY, mode) } catch { /* storage unavailable */ }
  // A full reload is deliberate: the two UIs mount different route trees, and
  // swapping them live would unmount every page mid-interaction.
  window.location.reload()
}

export function getViewPreference() {
  return readOverride()
}

/** Returns 'desktop' | 'mobile'. */
export function useViewMode() {
  const [mode, setMode] = useState(() => {
    const pref = readOverride()
    if (pref !== 'auto') return pref
    try {
      return window.matchMedia(DESKTOP_QUERY).matches ? 'desktop' : 'mobile'
    } catch {
      return 'mobile'
    }
  })

  useEffect(() => {
    if (readOverride() !== 'auto') return
    let mq
    try { mq = window.matchMedia(DESKTOP_QUERY) } catch { return }
    const onChange = (e) => setMode(e.matches ? 'desktop' : 'mobile')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return mode
}
