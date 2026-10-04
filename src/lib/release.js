import { version } from '../../package.json'

/**
 * This release: its version and what is new in it, told from your side of
 * the screen - what is different when you open the app - rather than the
 * code's.
 *
 * ── One version, one place ──
 *
 * It was three numbers for one app: package.json said 0.5.0, What's New said
 * 0.5.0 and the Settings footer said 0.4.0, because each was typed by hand.
 * package.json is the one the crash log already reads, so it is the one:
 * bump it, and What's New, the footer and the changelog all follow.
 *
 * ── Small on purpose ──
 *
 * What's New is on the first screen of the app, so it imports only this.
 * The full history is lib/changelog.js, which only the changelog page loads.
 */
export const APP_VERSION = version

/** When this release went out, 'YYYY-MM-DD'. */
export const RELEASE_DATE = '2026-10-04'

/**
 * @typedef {object} ReleaseNote
 * @property {string} icon   a name What's New draws a glyph for
 * @property {string} title
 * @property {string} desc   one sentence, two at most
 */

/** @type {ReleaseNote[]} */
export const RELEASE_NOTES = [
  {
    icon: 'desktop',
    title: 'A sidebar that folds',
    desc: 'On a computer, the button beside Spendr folds the sidebar to its icons. Point at the logo and click to open it again.',
  },
  {
    icon: 'compose',
    title: 'Edit in place',
    desc: 'On a computer, editing a transaction opens over the page you were on, and the transaction itself shows in a tidier, narrower window.',
  },
  {
    icon: 'wallet',
    title: 'Pages that line up',
    desc: 'Every list and the page beside it divide at the same place, Home shows five cards and a way to the rest, and hovering a row no longer lights it up white in dark mode.',
  },
]
