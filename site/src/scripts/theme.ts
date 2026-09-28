/**
 * Light and dark. The site follows the OS until the visitor picks one with
 * the toggle, and then remembers the pick on this device.
 *
 * The first paint is decided by the inline script in Base.astro, which reads
 * the same key before any CSS applies; this module keeps it right after that:
 * the toggle, the OS changing its mind, and the pictures.
 */
export const THEME_KEY = 'spendr-site-theme'
type Pref = 'light' | 'dark' | 'system'

const root = document.documentElement
const media = window.matchMedia('(prefers-color-scheme: dark)')

function readPref(): Pref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function isDark(): boolean {
  return root.classList.contains('dark')
}

/**
 * Each capture is a <picture> whose dark <source> answers the OS. With a pick
 * that disagrees with the OS, the query is rewritten to always or never
 * match, and the browser swaps the image by itself.
 */
function syncPictures(pref: Pref) {
  const q = pref === 'system' ? '(prefers-color-scheme: dark)' : pref === 'dark' ? 'all' : 'not all'
  for (const s of document.querySelectorAll<HTMLSourceElement>('source[data-theme-source]')) {
    if (s.media !== q) s.media = q
  }
}

function syncMeta(dark: boolean) {
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    m.content = dark ? '#0b0f14' : '#f8fafc'
    m.removeAttribute('media')
  }
}

function apply(pref: Pref, animate: boolean) {
  const dark = pref === 'dark' || (pref === 'system' && media.matches)
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (animate && !reduce) {
    root.classList.add('theme-switching')
    window.setTimeout(() => root.classList.remove('theme-switching'), 420)
  }
  root.classList.toggle('dark', dark)
  root.dataset.themePref = pref
  syncPictures(pref)
  syncMeta(dark)
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
    b.setAttribute('aria-pressed', String(dark))
    b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode')
  }
  document.dispatchEvent(new CustomEvent('themechange', { detail: { dark } }))
}

export function initTheme() {
  apply(readPref(), false)

  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
    b.addEventListener('click', () => {
      const next: Pref = isDark() ? 'light' : 'dark'
      // Back to following the OS when the pick is what the OS says anyway.
      const pref: Pref = (next === 'dark') === media.matches ? 'system' : next
      try {
        if (pref === 'system') localStorage.removeItem(THEME_KEY)
        else localStorage.setItem(THEME_KEY, pref)
      } catch { /* private window: this visit only */ }
      apply(pref, true)
    })
  }

  media.addEventListener('change', () => {
    if (readPref() === 'system') apply('system', true)
  })
}
