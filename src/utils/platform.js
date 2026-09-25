/**
 * What kind of device this is, for the few places the answer changes what
 * the app should do: push reminders, and how a file is handed over.
 *
 * Prefer asking the browser what it can do. These are for when the question
 * is what the device IS - an iPhone's rules for web apps are the rules
 * whatever features its browser reports.
 */

/** An iPhone, iPod or iPad - iPadOS included, which reports itself as a Mac. */
export function isIos() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** Opened from the Home Screen as an installed app, not in a browser tab. */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches
    || /** @type {any} */ (navigator).standalone === true
}
