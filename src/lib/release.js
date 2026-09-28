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
    icon: 'lock',
    title: 'Signing in asks first',
    desc: 'A phone or computer signing in to an account that already has data asks before anything syncs: use the account\'s data, keep both, or sign out.',
  },
  {
    icon: 'chart',
    title: 'Your pay, found for you',
    desc: 'The forecast reads your pay from what you have logged, so a salary you never put on Recurring still arrives on the 15th and the 30th.',
  },
  {
    icon: 'settings',
    title: 'Forecast settings',
    desc: 'The sliders on Forecast pick where pay comes from, how everyday spending is counted, whether savings count, and what the chart shows.',
  },
  {
    icon: 'sparkle',
    title: 'Glass empty screens',
    desc: 'A screen with nothing on it yet gets a glass picture instead of a flat icon.',
  },
  {
    icon: 'transfer',
    title: 'Back where you left off',
    desc: 'Back returns you to where you were on a page, even on one opened from a notification, and tapping the tab you are on scrolls to the top.',
  },
  {
    icon: 'motion',
    title: 'Pull to sync, where it belongs',
    desc: 'Pulling down syncs on the screens that show your money, not on forms or settings.',
  },
]
