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
export const RELEASE_DATE = '2026-09-30'

/**
 * @typedef {object} ReleaseNote
 * @property {string} icon   a name What's New draws a glyph for
 * @property {string} title
 * @property {string} desc   one sentence, two at most
 */

/** @type {ReleaseNote[]} */
export const RELEASE_NOTES = [
  {
    icon: 'notes',
    title: 'Notes',
    desc: 'Plans for payday, lists, ideas: write them with headings, bullets, numbered lists and checklists. Open Notes from the page icon on Home.',
  },
  {
    icon: 'transfer',
    title: 'Swipe in from the right',
    desc: 'In the installed app on an iPhone, swipe in from the right edge of a tab to open Notes, the way the left edge goes back.',
  },
  {
    icon: 'card',
    title: 'Credit cards, tidied',
    desc: 'A card leads with what it wants from you now: the statement you owe, or once that is paid, the cycle you are spending in. The rest folds away.',
  },
  {
    icon: 'receipt',
    title: 'Statement history',
    desc: 'Every statement a card has closed, with its charges and the payments that settled it.',
  },
]
