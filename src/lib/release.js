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
    icon: 'chart',
    title: 'Net worth that counts everything',
    desc: 'Investments, loans and debts with friends now count, and its page shows what you have against what you owe. Leave debts out in Preferences.',
  },
  {
    icon: 'bank',
    title: 'Investments and loans',
    desc: "Add your MP2, a UITF or a loan as an account. Update an investment's value when you check it, and pay a loan from its page: Spendr splits off the interest.",
  },
  {
    icon: 'transfer',
    title: 'Bills is now Recurring',
    desc: 'It takes your pay too, twice-a-month paydays included, and lists loan payments beside card statements.',
  },
  {
    icon: 'target',
    title: 'Safe to spend',
    desc: 'Home looks 30 days ahead: what you can spend before payday, your tightest day, and a warning if money could run short. The Forecast page shows the likely range.',
  },
  {
    icon: 'wallet',
    title: 'What you have, or what you owe',
    desc: "Home's wallet shows three at a time. Tap the arrows beside the eye to switch.",
  },
  {
    icon: 'categories',
    title: 'Tidier transactions',
    desc: 'Transfers, loans and debts get icons like your categories, a loan payment is one row, and long lists keep going as you scroll.',
  },
  {
    icon: 'sparkle',
    title: 'Livelier Insights',
    desc: 'Highlights are glass cards that come together as you reach them, and each Insights card grows into its page.',
  },
]
