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
export const RELEASE_DATE = '2026-09-27'

/**
 * @typedef {object} ReleaseNote
 * @property {string} icon   a name What's New draws a glyph for
 * @property {string} title
 * @property {string} desc   one sentence, two at most
 */

/** @type {ReleaseNote[]} */
export const RELEASE_NOTES = [
  {
    icon: 'trophy',
    title: 'Achievements',
    desc: 'Challenges you pick, milestones that keep climbing, and badges for the big moments, all in one place.',
  },
  {
    icon: 'sparkle',
    title: 'A moment for every win',
    desc: 'Earning something fills the screen, and you can share it as a picture with your name on it.',
  },
  {
    icon: 'contrast',
    title: 'Clean style and Lights out',
    desc: 'A flat, quiet look, with true black in dark mode. Find it in Settings, under Preferences.',
  },
  {
    icon: 'chart',
    title: 'Wrapped, easier to flip through',
    desc: 'New 3D art, and a tap anywhere moves on. Hold a chart to explore it.',
  },
  {
    icon: 'settings',
    title: 'A tidier Settings',
    desc: 'Grouped the way you use it, with reports, backups and sync each one tap away.',
  },
]
