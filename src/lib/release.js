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
    icon: 'chart',
    title: 'Insights, reorganised',
    desc: 'Your month leads with where it went, with income, net and how it compares with last month. Trend, top expenses, accounts and net worth each open a page of their own.',
  },
  {
    icon: 'sparkle',
    title: 'Highlights to swipe through',
    desc: 'Every fact about your month side by side, instead of one at random.',
  },
  {
    icon: 'categories',
    title: 'Change a category from the list',
    desc: "Tap a transaction's icon to file it under another category, without opening it.",
  },
  {
    icon: 'trash',
    title: 'Swipe to delete, and Recently deleted',
    desc: 'Swipe a transaction left to delete it. It stays in Recently deleted for 30 days, to put back.',
  },
  {
    icon: 'motion',
    title: 'Reduce motion',
    desc: "A switch in Preferences that turns off Spendr's animations, whatever your phone is set to.",
  },
  {
    icon: 'target',
    title: 'Safe to spend',
    desc: 'Home and Insights look 30 days ahead: what you can spend before payday, your tightest day, and a warning if money could run short.',
  },
  {
    icon: 'chart',
    title: 'Investments and loans',
    desc: "Add your MP2, a UITF or a loan as an account. Update an investment's value when you check it, and pay a loan from its page.",
  },
  {
    icon: 'transfer',
    title: 'Bills is now Recurring',
    desc: 'It takes your pay too, twice-a-month paydays included. Net worth now counts debts with friends, which you can turn off in Preferences.',
  },
]
