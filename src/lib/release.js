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
    icon: 'transfer',
    title: 'Back that feels like a phone',
    desc: 'A swipe back shows the page you came from sliding in underneath, and Android\'s Back button closes the sheet on top instead of leaving the page.',
  },
  {
    icon: 'lock',
    title: 'Nothing you typed is lost',
    desc: 'Every form asks before throwing away what you entered, whether you tap Back, swipe, or close its sheet.',
  },
  {
    icon: 'bank',
    title: 'Fees stay with their transfer',
    desc: 'Deleting or re-routing a transfer takes its fee with it, and the transfer shows and edits its fee.',
  },
  {
    icon: 'sparkle',
    title: 'Titles, all alike',
    desc: 'Every page and sheet title is written the same way, and named like the row that opens it.',
  },
]
