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
export const RELEASE_DATE = '2026-09-28'

/**
 * @typedef {object} ReleaseNote
 * @property {string} icon   a name What's New draws a glyph for
 * @property {string} title
 * @property {string} desc   one sentence, two at most
 */

/** @type {ReleaseNote[]} */
export const RELEASE_NOTES = [
  {
    icon: 'bell',
    title: 'A daily check-in',
    desc: 'A nudge at a time you pick to log what you spent, skipped on days you already have. Turn it on in Settings, Reminders.',
  },
  {
    icon: 'sparkle',
    title: 'Install Spendr',
    desc: 'Put Spendr on your Home Screen from Settings: one tap on Android, three on iPhone.',
  },
  {
    icon: 'sparkle',
    title: 'A friendlier first run',
    desc: 'Someone new sets up in a few taps: their cards appear as they pick them, and categories are ready without asking.',
  },
]
