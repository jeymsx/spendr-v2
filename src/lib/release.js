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
export const RELEASE_DATE = '2026-10-07'

/**
 * @typedef {object} ReleaseNote
 * @property {string} icon   a name What's New draws a glyph for
 * @property {string} title
 * @property {string} desc   one sentence, two at most
 */

/** @type {ReleaseNote[]} */
export const RELEASE_NOTES = [
  {
    icon: 'receipt',
    title: 'Installments, counted when bought',
    desc: 'A \u20b136,000 phone on 12 months now counts as \u20b136,000 spent the day you bought it, in that month\u2019s budget, Insights and Wrapped, and shows once in your lists instead of every month.',
  },
  {
    icon: 'transfer',
    title: 'Cash flow you can open',
    desc: 'On a computer, press a band in Insights to see the transactions in it, group your spending by account, and save the chart as a picture.',
  },
  {
    icon: 'wallet',
    title: 'Figures with the story behind them',
    desc: 'Accounts and Insights say more under each figure: what changed this month, how your money is split, how much of your card limit is used, and what falls due next. On a computer, Home\u2019s net worth is bigger too.',
  },
  {
    icon: 'bank',
    title: 'Menus and a calendar of Spendr\u2019s own',
    desc: 'On a computer, point at Add and its menu opens, choosing an account drops a menu under the field, and every date field opens Spendr\u2019s own calendar.',
  },
  {
    icon: 'desktop',
    title: 'Pages stay where you left them',
    desc: 'On a computer, Back puts a page where you were scrolled to, and opening Forecast settings or a form leaves the page behind it in place.',
  },
  {
    icon: 'contrast',
    title: 'A calmer desktop',
    desc: 'The sidebar and top bar share the page\u2019s own ground, buttons are flat, pages fade softly under the top bar and load as grey outlines, and each tab names its page.',
  },
  {
    icon: 'phone',
    title: 'Layout, your choice',
    desc: 'Preferences has Layout: Automatic, Mobile or Desktop, and a phone set to Desktop has a way back.',
  },
  {
    icon: 'chart',
    title: 'Figures that fit, charts that tell the truth',
    desc: 'Long figures step down to fit, an empty chart says so instead of drawing a made-up scale, and Budget no longer says you saved money in a month with nothing logged.',
  },
]
