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
export const RELEASE_DATE = '2026-10-13'

/**
 * @typedef {object} ReleaseNote
 * @property {string} icon   a name What's New draws a glyph for
 * @property {string} title
 * @property {string} desc   one sentence, two at most
 */

/** @type {ReleaseNote[]} */
export const RELEASE_NOTES = [
  {
    icon: 'gift',
    title: 'Wishlist',
    desc: 'Park something you want with its price and a day to think it over. Spendr asks if you still want it then, and what you skip counts as kept.',
  },
  {
    icon: 'receipt',
    title: 'Paste a shop link',
    desc: 'Paste a Shopee or Lazada share message into a wish and its name and price fill in.',
  },
  {
    icon: 'phone',
    title: 'More on Home',
    desc: 'The round buttons on Home scroll sideways now, with Wishlist, Challenges, Quick log and Forecast. Expense, Income and Transfer are under +.',
  },
]
