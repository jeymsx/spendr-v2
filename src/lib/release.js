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
export const RELEASE_DATE = '2026-09-29'

/**
 * @typedef {object} ReleaseNote
 * @property {string} icon   a name What's New draws a glyph for
 * @property {string} title
 * @property {string} desc   one sentence, two at most
 */

/** @type {ReleaseNote[]} */
export const RELEASE_NOTES = [
  {
    icon: 'settings',
    title: 'Tidier headers',
    desc: 'Settings\' title sits beside its Back button, as on every other page, and Templates on Add expense, Add inflow and Transfer is an icon, clear of the title.',
  },
  {
    icon: 'categories',
    title: 'Less empty space',
    desc: 'Pages end just above the tab bar instead of leaving a gap under their last row, and captions like "Cash · Food" read as one line.',
  },
  {
    icon: 'transfer',
    title: 'Back after saving',
    desc: 'An entry started on Home returns you to that Home when saved, so the next Back works the first time.',
  },
  {
    icon: 'trash',
    title: 'Escape keeps your place',
    desc: 'Escape or Back on a delete confirmation returns to the transaction instead of closing it.',
  },
  {
    icon: 'wallet',
    title: 'Setup in your currency',
    desc: 'A profile kept in yen or another currency shows it on every card during setup, Android\'s Back steps back through setup, and yen and won are typed without decimals.',
  },
  {
    icon: 'desktop',
    title: 'Keys on a computer',
    desc: 'The Add transaction menu works with the arrow keys, Enter and Escape.',
  },
]
