import { useSyncExternalStore } from 'react'
import { isAndroid, isIos, isStandalone } from '../utils/platform'

/**
 * Putting Spendr on the Home Screen.
 *
 * ── What a browser will say, and what it will not ──
 *
 * Chrome, Edge and Samsung Internet (on Android, and Chrome and Edge on a
 * computer) announce that a web app can be installed with a
 * `beforeinstallprompt` event, and hand over the prompt for the app to show
 * when it chooses. Safari never does. On an iPhone the only way in is Share,
 * then Add to Home Screen, so all an app can do there is show the way. The
 * answer to "what kind of phone is this?" is therefore what the browser
 * fires first, and what the device is (utils/platform.js) second.
 *
 * The event fires once, early - usually before any screen that wants it has
 * mounted - so it is caught here, when main.jsx imports this, and kept.
 * preventDefault() keeps Chrome's own mini-infobar off the first screen
 * someone ever sees; the app offers the same install where it makes sense,
 * at the end of setup and in Settings.
 *
 * ── The iPhone's separate storage ──
 *
 * An app added to an iPhone's Home Screen gets storage of its own, apart from
 * Safari's. Whatever was set up in the Safari tab is not in the icon, so on
 * an iPhone the Home Screen comes BEFORE setup, not after it (onboarding asks
 * first). Android's installed app shares the browser's storage, so there it
 * can come at the end.
 *
 * ── In-app browsers ──
 *
 * A link opened from Messenger, Facebook, Instagram or TikTok opens in that
 * app's own browser: it cannot install anything, and what it stores is not
 * the phone's browser's. Spendr says so and offers the way out.
 */

/**
 * @typedef {'installed'|'prompt'|'ios'|'android'|'in-app'|'desktop'} InstallContext
 *   installed  opened from the Home Screen, or installed during this visit
 *   prompt     the browser has handed over an install prompt
 *   ios        an iPhone or iPad: Share, then Add to Home Screen
 *   android    an Android browser with no prompt (yet): its own menu
 *   in-app     inside another app's browser: open in the real one first
 *   desktop    a computer with no prompt: nothing to offer
 */

/** @type {any} the BeforeInstallPromptEvent, until used */
let deferred = null
let installedNow = false
/** @type {InstallContext|null} dev-only override, see previewInstall */
let preview = null
/** @type {Set<() => void>} */
const listeners = new Set()
const emit = () => { for (const l of listeners) l() }

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installedNow = true
    emit()
  })
  try {
    window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', emit)
  } catch { /* old Safari: no change events on a MediaQueryList */ }
}

/**
 * The in-app browsers people actually open links in here, from their own
 * user-agent tokens, and "; wv)" for any other Android web view.
 */
/** @type {Array<{re: RegExp, name: string}>} */
const IN_APP = [
  { re: /FB_IAB\/(MESSENGER|Orca)|FBAN\/Messenger|MessengerForiOS/i, name: 'Messenger' },
  { re: /FBAN|FBAV|FB_IAB|FBIOS|FB4A/, name: 'Facebook' },
  { re: /Instagram/, name: 'Instagram' },
  { re: /musical_ly|TikTok|BytedanceWebview/i, name: 'TikTok' },
  { re: /\bLine\//, name: 'LINE' },
  { re: /Snapchat/, name: 'Snapchat' },
  { re: /MicroMessenger/, name: 'WeChat' },
  { re: /Viber/, name: 'Viber' },
  { re: /; wv\)/, name: '' },
]

/**
 * The app whose browser this is, '' for one we cannot name, or null in a
 * real browser.
 *
 * @param {string} [ua]
 * @returns {string|null}
 */
export function inAppBrowser(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '') {
  for (const { re, name } of IN_APP) if (re.test(ua)) return name
  return null
}

/**
 * Which browser an iPhone is using. They all draw with Safari's engine and
 * all can add to the Home Screen since iOS 16.4, but each keeps Share in a
 * different place.
 *
 * @param {string} [ua]
 * @returns {'safari'|'chrome'|'edge'|'firefox'|'other'}
 */
export function iosBrowser(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '') {
  if (/CriOS/.test(ua)) return 'chrome'
  if (/EdgiOS/.test(ua)) return 'edge'
  if (/FxiOS/.test(ua)) return 'firefox'
  if (/OPiOS|YaBrowser|DuckDuckGo|GSA\//.test(ua)) return 'other'
  return 'safari'
}

/**
 * Safari's major version, from its `Version/` token - the one number that
 * still moves. From iOS 26 the OS version in the user agent is frozen, and
 * Safari 26 is also where the compact tab bar moved Share into its ••• menu.
 *
 * @param {string} [ua]
 */
export function safariVersion(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '') {
  const m = /Version\/(\d+)/.exec(ua)
  return m ? Number(m[1]) : 0
}

/** An iPad rather than an iPhone: Safari's Share button is at the top there. */
export function isIpad() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** @returns {InstallContext} */
export function installContext() {
  if (preview) return preview
  if (installedNow || isStandalone()) return 'installed'
  if (inAppBrowser() !== null) return 'in-app'
  if (deferred) return 'prompt'
  if (isIos()) return 'ios'
  if (isAndroid()) return 'android'
  return 'desktop'
}

/**
 * Show the browser's install prompt. Only once per event: a used prompt
 * cannot be shown again, so it is dropped whatever the answer.
 *
 * @returns {Promise<'accepted'|'dismissed'|'unavailable'>}
 */
export async function promptInstall() {
  if (preview === 'prompt') {
    preview = 'installed'
    emit()
    return 'accepted'
  }
  const e = deferred
  if (!e) return 'unavailable'
  deferred = null
  try {
    await e.prompt()
    const choice = await e.userChoice
    return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed'
  } catch {
    return 'dismissed'
  } finally {
    emit()
  }
}

/**
 * Force a context, for previewing each version of the install step and
 * guide in the dev server (see onboarding/preview.js) and for tests. Does
 * nothing in a production build.
 *
 * @param {InstallContext|null} ctx
 */
export function previewInstall(ctx) {
  if (!import.meta.env?.DEV && import.meta.env?.MODE !== 'test') return
  preview = ctx
  emit()
}

/** @param {() => void} l */
function subscribe(l) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** The install context, kept current as the browser changes its mind. */
export function useInstall() {
  return useSyncExternalStore(subscribe, installContext, installContext)
}

/**
 * A way out of an in-app browser on Android: an intent that asks for
 * Chrome by name. Messenger's and Facebook's browsers follow it; one that
 * does not simply stays where it is, and the link can still be copied.
 *
 * @param {string} [href]
 */
export function chromeIntentUrl(href = typeof location === 'undefined' ? '' : location.href) {
  const url = new URL(href)
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;end`
}
