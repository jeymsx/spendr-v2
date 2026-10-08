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
    icon: 'transfer',
    title: 'Live between your devices',
    desc: 'Add a transaction on your phone and it shows on your computer within a second, with a note saying it came from your other device. Budgets, accounts and bills follow too.',
  },
  {
    icon: 'sparkle',
    title: 'Getting started',
    desc: 'New to Spendr? A short list pinned at the top of your notifications walks you through the first week, and ticks itself off as you go.',
  },
  {
    icon: 'compose',
    title: 'Help, built in',
    desc: 'Settings › Help centre answers everything Spendr does, with a search, pictures, and a button that takes you to the right place.',
  },
  {
    icon: 'card',
    title: 'Cards and what you owe',
    desc: 'A card added any time can start with what you owe on it, and Edit can correct it. Card payments now come only from cash, e-wallet, bank or savings.',
  },
  {
    icon: 'categories',
    title: 'Budgets that add up',
    desc: 'Carry budgets over now really carries, income categories no longer count as budgets, near the limit means 80% everywhere, and renaming a category renames it on bills and templates too.',
  },
  {
    icon: 'receipt',
    title: 'Imports that keep your balances',
    desc: 'Importing a CSV changes balances only by what it adds and asks for an opening balance only for new accounts. Your own export comes back whole.',
  },
  {
    icon: 'desktop',
    title: 'Calmer messages, softer top bar',
    desc: 'On a computer, messages stack in the corner one under another. On the phone, the top bar blurs into the page instead of ending on a line.',
  },
  {
    icon: 'trash',
    title: 'Undo, and many small fixes',
    desc: 'Recently deleted has Undo, bills due on the 31st stay on the 31st, Hide balances hides every total, and a split expense can no longer lose its split to installments.',
  },
]
