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
export const RELEASE_DATE = '2026-10-05'

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
    title: 'Forms beside the page',
    desc: 'On a computer, adding or editing a transaction, an account or a bill opens in a panel at the right, over the page you were on. Escape takes you back to it.',
  },
  {
    icon: 'settings',
    title: 'Settings, laid out for a computer',
    desc: 'Everything at a glance in one list, App lock inside Preferences, and every accent colour in one row to pick from.',
  },
  {
    icon: 'sparkle',
    title: 'Wrapped in Insights',
    desc: 'Last month\u2019s Wrapped now has a card of its own in the Insights overview, one click from the story.',
  },
  {
    icon: 'contrast',
    title: 'Readable on every accent',
    desc: 'Buttons in Honey, Amber, Sage and Lagoon now use dark text, so they are easy to read. On the phone too.',
  },
  {
    icon: 'trash',
    title: 'Recently deleted as a table',
    desc: 'On a computer, put back one row or many at once, or delete them for good.',
  },
  {
    icon: 'lock',
    title: 'A new sign-in screen',
    desc: 'On a computer, signing in shows Spendr on one side and Google on the other.',
  },
]

