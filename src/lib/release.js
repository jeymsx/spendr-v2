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
    title: 'Your data, kept safer',
    desc: 'Every synced change keeps the version it replaced for 30 days, and Spendr asks your browser not to clear its data when space runs low.',
  },
  {
    icon: 'bell',
    title: 'Backup reminders',
    desc: 'The bell asks for a backup when your last one is two weeks old, and Backup & restore shows when you saved it.',
  },
  {
    icon: 'wallet',
    title: 'Bills spotted for you',
    desc: 'Recurring lists the bills it finds in your history, ready to add in one tap.',
  },
  {
    icon: 'categories',
    title: 'A category guess',
    desc: 'Type what you bought and the category is picked from what you logged before. Tap another to change it.',
  },
  {
    icon: 'transfer',
    title: 'Swipe back, like an iPhone app',
    desc: 'In the installed app, swipe from the left edge to go back. Headers stay at the top as you scroll, and Back returns to where you came from.',
  },
  {
    icon: 'chart',
    title: 'A steadier forecast',
    desc: 'Tell it a found payment is not pay, and your settings follow you to your other devices. Pay and bills on Recurring are never counted twice.',
  },
  {
    icon: 'bank',
    title: 'Cards that add up',
    desc: 'Paying more than you owe leaves the extra as credit, cash taken from a card counts toward its bill, and setup records what a card already owes.',
  },
]
