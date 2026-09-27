import { APP_VERSION, RELEASE_DATE, RELEASE_NOTES } from './release'

/**
 * Every release of Spendr, newest first, in the words of someone using it.
 *
 * Written from the commit history - four hundred-odd commits since May - and
 * boiled down to what changed on screen. None of the refactors, migrations
 * or tests are here: they are why the figures are right, and none of them is
 * something the person using the app wants to read. That is what the commit
 * messages are for.
 *
 * The newest entry is this release's own notes (lib/release.js), so What's
 * New and the changelog can never tell two different stories.
 *
 * @typedef {{title: string, desc: string}} ChangelogItem
 * @typedef {{version: string, date: string, items: ChangelogItem[]}} Release
 */

/** @type {Release[]} */
export const CHANGELOG = [
  {
    version: APP_VERSION,
    date: RELEASE_DATE,
    items: RELEASE_NOTES.map(({ title, desc }) => ({ title, desc })),
  },
  {
    version: '0.6.0',
    date: '2026-09-27',
    items: [
      { title: 'Achievements', desc: 'Challenges you pick, milestones that keep climbing, and badges for the big moments, all in one place.' },
      { title: 'A moment for every win', desc: 'Earning something fills the screen, and you can share it as a picture with your name on it.' },
      { title: 'Clean style and Lights out', desc: 'A flat, quiet look, with true black in dark mode. Find it in Settings, under Preferences.' },
      { title: 'Wrapped, easier to flip through', desc: 'New 3D art, and a tap anywhere moves on. Hold a chart to explore it.' },
      { title: 'A tidier Settings', desc: 'Grouped the way you use it, with reports, backups and sync each one tap away.' },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-09-26',
    items: [
      { title: 'Your month, Wrapped', desc: 'On the 1st, a full-screen story of last month: what you spent, what you kept, your busiest day and your money personality. Share any slide, with the amounts hidden if you like.' },
      { title: 'Notifications, in one place', desc: 'The bell on the home screen collects card due dates, bills, budget alerts and new badges, laid out by day.' },
      { title: 'Budget alerts', desc: 'A heads-up when a category reaches 80% of its budget, and again when it goes over.' },
      { title: 'Reminders, even when the app is closed', desc: 'Your phone can remind you about due dates and bills without Spendr being open.' },
      { title: 'Transfers between currencies', desc: 'Moving money from a dollar account to a peso one asks what actually arrived.' },
      { title: 'Installments keep their dates', desc: 'An installment asks for the purchase date, and moving one payment no longer moves it to today.' },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-09-17',
    items: [
      { title: 'Accounts in another currency', desc: 'Give an account its own currency and it keeps it everywhere, with rates updated daily and a converter under every foreign amount.' },
      { title: 'Net worth, your way', desc: 'One combined figure at today’s rate, or one line per currency with nothing converted.' },
      { title: 'Quick log', desc: 'Hold the + and type it the way you would say it: "500 from gcash to maya". Spendr works out the rest, and learns as you go.' },
      { title: 'Bills that ask first', desc: 'Posting a bill is a swipe, it asks before it posts, and you can take it back. Bills wear their own logo, and quarterly bills exist.' },
      { title: 'A budget you can read at a glance', desc: 'This month’s budget is an arc with the amount inside it, in your accent colour.' },
      { title: 'The + works on Android', desc: 'Tapping it did nothing on some phones. Fixed.' },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-09-11',
    items: [
      { title: 'Savings goals', desc: 'Goals are funded by what is really in your accounts, not by a number you type in.' },
      { title: 'You can tell at a glance', desc: 'A number appears on Bills, Debts and Goals the moment one of them needs you.' },
      { title: 'Bills and debts, rebuilt', desc: 'Every bill has its own page with what it costs you a year. Debts are one list, or split by who owes whom.' },
      { title: 'Pick a category with your thumb', desc: 'A row you swipe instead of a sheet over your form, with every category in its own colour and icon.' },
      { title: 'See the accent before you choose it', desc: 'Each accent colour arrives as a card showing the app wearing it.' },
      { title: 'Readable in daylight', desc: 'Coloured text and tiles were measured against what they sit on, and moved until they passed.' },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-09-09',
    items: [
      { title: 'Your accounts look like your cards', desc: 'Real bank logos at true card proportions, stacked like a wallet. Hold a card and drag to reorder.' },
      { title: 'Every account has its own page', desc: 'Tap a card for its balance, a 30-day trend and its full history.' },
      { title: 'Guided account setup', desc: 'Adding an account shows the card you are making as you make it.' },
      { title: 'Your budget on the home screen', desc: 'One line for how much of the month is gone, and a page with the breakdown.' },
      { title: 'A desktop layout', desc: 'On a wide screen Spendr becomes a full desktop app, with tables, side-by-side charts and a sidebar.' },
      { title: 'Two figures were wrong', desc: 'Next Statement counted every future installment instead of the next bill, and the Credit total read zero. Both fixed.' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-05-21',
    items: [
      { title: 'Spendr, offline first', desc: 'Track what you spend, earn and move between cash, banks, e-wallets and credit cards. Everything works without a connection.' },
      { title: 'Credit cards that understand statements', desc: 'Statement cycles, due dates, what you owe now and installment plans spread across the months.' },
      { title: 'Budgets, bills and debts', desc: 'A monthly limit per category, recurring bills that post themselves, and who owes whom.' },
      { title: 'Sync across devices', desc: 'Sign in with Google to keep your phone and computer in step.' },
      { title: 'Your data is yours', desc: 'Export to CSV, back up and restore everything as one file, and download a monthly PDF report.' },
      { title: 'Undo', desc: 'Deleted a transaction by mistake? Tap Undo right after.' },
    ],
  },
]
