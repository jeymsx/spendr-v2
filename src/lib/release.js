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
export const RELEASE_DATE = '2026-10-08'

/**
 * @typedef {object} ReleaseNote
 * @property {string} icon   a name What's New draws a glyph for
 * @property {string} title
 * @property {string} desc   one sentence, two at most
 */

/** @type {ReleaseNote[]} */
export const RELEASE_NOTES = [
  {
    icon: 'chart',
    title: 'Trend, your way',
    desc: 'Every range of the Trend chart is a line, with Expenses, Income and Net flow switched on in any mix and laid over each other. On a computer, its three figures sit under the chart.',
  },
  {
    icon: 'settings',
    title: 'Trend settings',
    desc: 'The sliders button picks a line, area or bars, and a point per day, week or month. It follows you to your other devices, like Forecast settings do.',
  },
  {
    icon: 'receipt',
    title: 'Everything as a spreadsheet',
    desc: 'Reports now saves one spreadsheet of it all: accounts and net worth, transactions, each month, categories, budgets, bills, debts and goals, with the totals as live formulas. Open it in Excel or Google Sheets.',
  },
  {
    icon: 'lock',
    title: 'Less leaves your device',
    desc: 'The Google Sheets connection is gone, and a crash no longer offers to send a report: its details stay on your device. The privacy policy now says so.',
  },
]
