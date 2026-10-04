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
    version: '0.14.3',
    date: '2026-09-30',
    items: [
      { title: 'Field to field, holding still', desc: 'Going from the amount to the description, or between any two fields, the page no longer slides up as the number pad gives way to the letters.' },
      { title: 'The tab bar stays down', desc: 'It no longer rides up on the keyboard, on any page, whichever way iOS makes room for the keyboard.' },
    ],
  },
  {
    version: '0.14.2',
    date: '2026-09-30',
    items: [
      { title: 'Forms hold still', desc: 'Adding or editing an expense, inflow, transfer or account on an iPhone, the page and its header stay put when the keyboard opens, and the field you tap moves up clear of it.' },
      { title: 'The tab bar keeps out of the way', desc: 'While you type, the tab bar stays hidden instead of riding up over the keyboard.' },
    ],
  },
  {
    version: '0.14.1',
    date: '2026-09-30',
    items: [
      { title: 'Notes hold still', desc: 'On an iPhone, a note and its header stay where they are when the keyboard opens, and the line you are typing stays above it.' },
      { title: 'Formatting in the header', desc: 'Aa, the checklist and Done sit at the top while you write, clear of the keyboard. Aa still swaps the keyboard for the formatting panel.' },
      { title: 'Pages settle after typing', desc: 'If iOS leaves a page pushed up once the keyboard closes, it drops back into place, tab bar and all.' },
    ],
  },
  {
    version: '0.14.0',
    date: '2026-09-30',
    items: [
      { title: 'Notes', desc: 'Plans for payday, lists, ideas: write them with headings, bullets, numbered lists and checklists. Open Notes from the page icon on Home.' },
      { title: 'Swipe in from the right', desc: 'In the installed app on an iPhone, swipe in from the right edge of a tab to open Notes, the way the left edge goes back.' },
      { title: 'Credit cards, tidied', desc: 'A card leads with what it wants from you now: the statement you owe, or once that is paid, the cycle you are spending in. The rest folds away.' },
      { title: 'Statement history', desc: 'Every statement a card has closed, with its charges and the payments that settled it.' },
    ],
  },
  {
    version: '0.13.2',
    date: '2026-09-29',
    items: [
      { title: 'Tidier headers', desc: 'Settings\' title sits beside its Back button, as on every other page, and Templates on Add expense, Add inflow and Transfer is an icon, clear of the title.' },
      { title: 'Less empty space', desc: 'Pages end just above the tab bar instead of leaving a gap under their last row, and captions like "Cash · Food" read as one line.' },
      { title: 'Back after saving', desc: 'An entry started on Home returns you to that Home when saved, so the next Back works the first time.' },
      { title: 'Escape keeps your place', desc: 'Escape or Back on a delete confirmation returns to the transaction instead of closing it.' },
      { title: 'Setup in your currency', desc: 'A profile kept in yen or another currency shows it on every card during setup, Android\'s Back steps back through setup, and yen and won are typed without decimals.' },
      { title: 'Keys on a computer', desc: 'The Add transaction menu works with the arrow keys, Enter and Escape.' },
    ],
  },
  {
    version: '0.13.1',
    date: '2026-09-29',
    items: [
      { title: 'Back that feels like a phone', desc: 'A swipe back shows the page you came from sliding in underneath, and Android\'s Back button closes the sheet on top instead of leaving the page.' },
      { title: 'Nothing you typed is lost', desc: 'Every form asks before throwing away what you entered, whether you tap Back, swipe, or close its sheet.' },
      { title: 'Fees stay with their transfer', desc: 'Deleting or re-routing a transfer takes its fee with it, and the transfer shows and edits its fee.' },
      { title: 'Titles, all alike', desc: 'Every page and sheet title is written the same way, and named like the row that opens it.' },
    ],
  },
  {
    version: '0.13.0',
    date: '2026-09-29',
    items: [
      { title: 'Your data, kept safer', desc: 'Every synced change keeps the version it replaced for 30 days, and Spendr asks your browser not to clear its data when space runs low.' },
      { title: 'Backup reminders', desc: 'The bell asks for a backup when your last one is two weeks old, and Backup & restore shows when you saved it.' },
      { title: 'Bills spotted for you', desc: 'Recurring lists the bills it finds in your history, ready to add in one tap.' },
      { title: 'A category guess', desc: 'Type what you bought and the category is picked from what you logged before. Tap another to change it.' },
      { title: 'Swipe back, like an iPhone app', desc: 'In the installed app, swipe from the left edge to go back. Headers stay at the top as you scroll, and Back returns to where you came from.' },
      { title: 'A steadier forecast', desc: 'Tell it a found payment is not pay, and your settings follow you to your other devices. Pay and bills on Recurring are never counted twice.' },
      { title: 'Cards that add up', desc: 'Paying more than you owe leaves the extra as credit, cash taken from a card counts toward its bill, and setup records what a card already owes.' },
    ],
  },
  {
    version: '0.12.0',
    date: '2026-09-29',
    items: [
      { title: 'Signing in asks first', desc: 'A phone or computer signing in to an account that already has data asks before anything syncs: use the account\'s data, keep both, or sign out.' },
      { title: 'Your pay, found for you', desc: 'The forecast reads your pay from what you have logged, so a salary you never put on Recurring still arrives on the 15th and the 30th.' },
      { title: 'Forecast settings', desc: 'The sliders on Forecast pick where pay comes from, how everyday spending is counted, whether savings count, and what the chart shows.' },
      { title: 'Glass empty screens', desc: 'A screen with nothing on it yet gets a glass picture instead of a flat icon.' },
      { title: 'Back where you left off', desc: 'Back returns you to where you were on a page, even on one opened from a notification, and tapping the tab you are on scrolls to the top.' },
      { title: 'Pull to sync, where it belongs', desc: 'Pulling down syncs on the screens that show your money, not on forms or settings.' },
    ],
  },
  {
    version: '0.11.0',
    date: '2026-09-28',
    items: [
      { title: 'A daily check-in', desc: 'A nudge at a time you pick to log what you spent, skipped on days you already have. Turn it on in Settings, Reminders.' },
      { title: 'Install Spendr', desc: 'Put Spendr on your Home Screen from Settings: one tap on Android, three on iPhone.' },
      { title: 'A friendlier first run', desc: 'Someone new sets up in a few taps: their cards appear as they pick them, and categories are ready without asking.' },
      { title: 'A new layout for computers', desc: 'Every page from your phone, with the list and what you pick in it side by side. Press E, I, T or Q to add from anywhere.' },
    ],
  },
  {
    version: '0.10.0',
    date: '2026-09-28',
    items: [
      { title: 'Net worth that counts everything', desc: 'Investments, loans and debts with friends now count, and its page shows what you have against what you owe. Leave debts out in Preferences.' },
      { title: 'Investments and loans', desc: "Add your MP2, a UITF or a loan as an account. Update an investment's value when you check it, and pay a loan from its page: Spendr splits off the interest." },
      { title: 'Bills is now Recurring', desc: 'It takes your pay too, twice-a-month paydays included, and lists loan payments beside card statements.' },
      { title: 'Safe to spend', desc: 'Home looks 30 days ahead: what you can spend before payday, your tightest day, and a warning if money could run short. The Forecast page shows the likely range.' },
      { title: 'What you have, or what you owe', desc: "Home's wallet shows three at a time. Tap the arrows beside the eye to switch." },
      { title: 'Tidier transactions', desc: 'Transfers, loans and debts get icons like your categories, a loan payment is one row, and long lists keep going as you scroll.' },
      { title: 'Livelier Insights', desc: 'Highlights are glass cards that come together as you reach them, and each Insights card grows into its page.' },
    ],
  },
  {
    version: '0.9.0',
    date: '2026-09-27',
    items: [
      { title: 'Insights, reorganised', desc: 'Your month leads with where it went, with income, net and how it compares with last month. Trend, top expenses, accounts and net worth each open a page of their own.' },
      { title: 'Highlights to swipe through', desc: 'Every fact about your month side by side, instead of one at random.' },
      { title: 'Change a category from the list', desc: "Tap a transaction's icon to file it under another category, without opening it." },
      { title: 'Swipe to delete, and Recently deleted', desc: 'Swipe a transaction left to delete it. It stays in Recently deleted for 30 days, to put back.' },
      { title: 'Reduce motion', desc: "A switch in Preferences that turns off Spendr's animations, whatever your phone is set to." },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-09-27',
    items: [
      { title: 'Seven new badges', desc: 'Fifteen in all now, for things like paying yourself first, keeping half of what came in, and splitting a bill.' },
      { title: 'Wrapped, four ways', desc: "Your month's picture comes in colour, dark, light or Lights out, like the app itself. Swipe to pick one when you share." },
    ],
  },
  {
    version: '0.7.0',
    date: '2026-09-27',
    items: [
      { title: 'Lock Spendr with Face ID', desc: "Turn it on in Settings, under App lock. It asks for Face ID when you open Spendr, and a backup PIN gets you in if Face ID can't." },
      { title: 'Sharper pictures to share', desc: 'Badges and Wrapped slides saved on an iPhone come out crisp, without a grey box behind the art.' },
    ],
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
