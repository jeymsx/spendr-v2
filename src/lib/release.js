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
    title: 'A desktop made for a desktop',
    desc: 'On a computer, a bar across the top searches everything (Ctrl+K), adds a transaction, and holds the bell and your settings. Every page is laid out wide, with the same rounded cards and blue as the phone.',
  },
  {
    icon: 'receipt',
    title: 'Transactions as a table',
    desc: 'Sort by any column, filter by date, account or category, pick many rows to refile or delete at once, and save what you see as a CSV.',
  },
  {
    icon: 'chart',
    title: 'Every page, at a glance',
    desc: 'Home, Accounts, Budget, Insights, Goals, Recurring and Debts each show their figures across the top and their detail in tables and charts below.',
  },
  {
    icon: 'card',
    title: 'Cards that sit flat',
    desc: 'In light mode, account cards, the net worth card and the highlights lose their grey shadows, and the card colours are a little brighter.',
  },
]
