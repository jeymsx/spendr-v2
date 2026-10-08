import { banks, holdings, badges, milestones, challenges, achievements, accents } from './app'

/**
 * The features page, group by group. Every line is something the app does
 * in this release - each is from the changelog, the privacy policy or the
 * code - worded for someone deciding whether to try it.
 */
export interface Feature { icon: string; title: string; body: string }
export interface Group {
  id: string
  nav: string
  eyebrow: string
  title: string
  lede: string
  shots?: { name: string; alt: string }[]
  items: Feature[]
  swatches?: boolean
  desktop?: boolean
}

export const GROUPS: Group[] = [
  {
    id: 'logging',
    nav: 'Logging',
    eyebrow: 'Logging',
    title: 'Log it in seconds.',
    lede: 'The one thing you do every day should take no time at all, so every way in is short.',
    shots: [
      { name: 'expense', alt: 'Adding an expense: ₱185 at Starbucks, filed under Coffee, paid from GCash' },
      { name: 'transactions', alt: 'The transactions list, grouped by day' },
    ],
    items: [
      { icon: 'bolt', title: 'Quick log', body: 'Hold the + and type “185 starbucks”. It fills in the amount, the category and the account, and learns as you go.' },
      { icon: 'category', title: 'Categories under your thumb', body: 'A row you swipe, every category in its own colour and icon, right on the form.' },
      { icon: 'template', title: 'Templates', body: 'Save the ones you log every week, and add them again in a tap.' },
      { icon: 'arrows-split-2', title: 'Split it, or share it', body: 'File one purchase under several categories, or note what friends owe you for it. Their share refunds the purchase when they pay you back.' },
      { icon: 'hand-finger-left', title: 'Swipe to delete', body: 'Swipe a transaction away. It waits in Recently deleted for 30 days, to put back.' },
      { icon: 'file-import', title: 'Bring your history', body: 'Import a CSV from a spreadsheet or another app, step by step.' },
    ],
  },
  {
    id: 'accounts',
    nav: 'Accounts & cards',
    eyebrow: 'Accounts and cards',
    title: 'Your accounts, as they really are.',
    lede: `Cash, banks, e-wallets, credit cards, investments and loans, each the way it actually works. ${banks.length} banks and e-wallets and ${holdings.length} kinds of investments and loans are ready to add by name.`,
    shots: [
      { name: 'accounts', alt: 'Accounts stacked like cards in a wallet' },
      { name: 'card', alt: 'A credit card with its balance, limit and last statement' },
    ],
    items: [
      { icon: 'cards', title: 'Stacked like a wallet', body: 'Your accounts as cards at true card proportions. Tap one for its trend and history; hold and drag to reorder.' },
      { icon: 'credit-card', title: 'Cards that understand statements', body: 'Statement cycles, due dates and installments spread across the months. What you owe is worked out from your transactions.' },
      { icon: 'building-bank', title: 'Investments and loans', body: 'Add your MP2, a UITF or a loan. Update an investment when you check it, and pay a loan from its page: Spendr splits off the interest.' },
      { icon: 'sparkles', title: 'Set up in a few taps', body: 'Pick your banks and e-wallets and their cards appear as you go, with categories ready from the start.' },
      { icon: 'world', title: 'Other currencies', body: 'Give an account its own currency. Rates update daily, and every foreign amount has a converter under it.' },
      { icon: 'qrcode', title: 'Your payment QR', body: 'Keep an account’s QR code with it, ready to show when someone pays you.' },
    ],
  },
  {
    id: 'budgets',
    nav: 'Budgets',
    eyebrow: 'Budgets and the forecast',
    title: 'Know what’s safe to spend.',
    lede: 'A limit for each category, and a look ahead at what’s coming, so the end of the month isn’t a surprise.',
    shots: [
      { name: 'budget', alt: 'The month’s budget as an arc, with each category’s progress' },
      { name: 'forecast', alt: 'The forecast: what is safe to spend until payday' },
    ],
    items: [
      { icon: 'gauge', title: 'A limit per category', body: 'Set a monthly budget for each one, and read the month at a glance as an arc.' },
      { icon: 'bell-ringing', title: 'Alerts before it’s too late', body: 'A heads-up when a category reaches 80% of its budget, and again if it goes over.' },
      { icon: 'shield-check', title: 'Safe to spend', body: 'Home looks 30 days ahead: what you can spend before payday, your tightest day, and a warning if money could run short.' },
      { icon: 'timeline', title: 'The forecast', body: 'Your balance day by day until payday and beyond, with the likely range drawn around it.' },
      { icon: 'pig-money', title: 'Leftovers, put to work', body: 'What you didn’t spend last month can go straight into a goal.' },
    ],
  },
  {
    id: 'recurring',
    nav: 'Recurring',
    eyebrow: 'Recurring',
    title: 'Bills, paydays and loans, in one list.',
    lede: 'Everything that comes around again, with what’s due and when, and a nudge before it is.',
    shots: [{ name: 'recurring', alt: 'Recurring: card statements, loan payments and what is coming up' }],
    items: [
      { icon: 'repeat', title: 'Anything that repeats', body: 'Bills, subscriptions and pay: daily, weekly, twice a month, monthly, quarterly or yearly.' },
      { icon: 'hand-move', title: 'Post it with a swipe', body: 'Paying a bill is a swipe. It asks before it posts, and you can take it back.' },
      { icon: 'credit-card-pay', title: 'Cards and loans beside your bills', body: 'Card statements and loan payments sit in the same list, with what’s due on each.' },
      { icon: 'bell', title: 'Reminders, even when it’s closed', body: 'Your phone can remind you about due dates and bills without Spendr being open.' },
      { icon: 'clock-check', title: 'A daily check-in', body: 'A nudge at a time you pick to log what you spent, skipped on days you already have.' },
      { icon: 'inbox', title: 'Notifications in one place', body: 'The bell on Home collects due dates, bills, budget alerts and new badges, laid out by day.' },
    ],
  },
  {
    id: 'debts',
    nav: 'Debts & goals',
    eyebrow: 'Debts and goals',
    title: 'Pay off and save up.',
    lede: 'What you owe, what you’re owed, and what you’re saving for, all worked out from what’s actually there.',
    shots: [
      { name: 'debts', alt: 'Debts: the net position with everyone' },
      { name: 'goals', alt: 'Goals funded in order, with rings of progress' },
    ],
    items: [
      { icon: 'users', title: 'Who owes whom', body: 'Lend and borrow with friends and family, log partial payments, and see overdue ones flagged.' },
      { icon: 'scale', title: 'Where you stand', body: 'One figure for your net position with everyone, in your favour or not.' },
      { icon: 'target', title: 'Goals funded by real money', body: 'Goals are funded by what’s in your accounts, not by a number you type in.' },
      { icon: 'sort-descending', title: 'In the order you choose', body: 'Your money fills the first goal to its target, then the next, so every peso is counted once.' },
      { icon: 'circle-number-1', title: 'A number when it needs you', body: 'Bills, Debts and Goals show a count the moment one of them needs attention.' },
    ],
  },
  {
    id: 'insights',
    nav: 'Insights',
    eyebrow: 'Insights',
    title: 'See where it all went.',
    lede: 'Your month as a picture, and your money over time, each a tap away from the detail.',
    shots: [
      { name: 'insights', alt: 'Insights: the month by category, income and net' },
      { name: 'networth', alt: 'Net worth over six months, and what it is made of' },
    ],
    items: [
      { icon: 'chart-donut', title: 'Your month by category', body: 'Where it went, with income, net and how it compares with the month before.' },
      { icon: 'sparkles', title: 'Highlights', body: 'Every fact worth knowing about your month, as glass cards to swipe through.' },
      { icon: 'trending-up', title: 'Trends and top expenses', body: 'The trend over time, your biggest expenses and each account, each on a page of its own.' },
      { icon: 'scale', title: 'Net worth that counts everything', body: 'Investments, loans and debts with friends, set against what you have.' },
    ],
  },
  {
    id: 'wrapped',
    nav: 'Wrapped',
    eyebrow: 'Wrapped and achievements',
    title: 'A month worth looking back on.',
    lede: `On the 1st, last month becomes a story. And ${achievements.length} achievements to earn along the way, all proven from what you log.`,
    shots: [
      { name: 'wrapped-summary', alt: 'August Wrapped, the summary slide' },
      { name: 'achievements', alt: 'Achievements: badges earned' },
    ],
    items: [
      { icon: 'gift', title: 'Your month, Wrapped', body: 'What you spent and kept, your busiest day, your go-to place and your money personality.' },
      { icon: 'share', title: 'Share any slide', body: 'In colour, dark, light or Lights out, with the amounts hidden if you like.' },
      { icon: 'trophy', title: `${challenges.length} challenges`, body: 'Pick one: a no-spend weekend, a week under a cap on one category, a month inside every limit.' },
      { icon: 'stairs-up', title: `${milestones.length} milestone levels`, body: 'Streaks, entries, green months and money held, each with a next level to reach.' },
      { icon: 'award', title: `${badges.length} badges`, body: 'For the big moments, like paying yourself first, settling a debt or keeping half of what came in.' },
    ],
  },
  {
    id: 'privacy',
    nav: 'Privacy',
    eyebrow: 'Privacy and your data',
    title: 'Private by default. Yours to take.',
    lede: 'Spendr keeps everything on your phone unless you ask it not to, and lets you take all of it with you.',
    items: [
      { icon: 'lock', title: 'App lock', body: 'Face ID when Spendr opens, with a backup PIN if Face ID can’t.' },
      { icon: 'eye-off', title: 'Out of sight', body: 'Your net worth stays hidden on Home until you tap the eye.' },
      { icon: 'chart-bar-off', title: 'No tracking', body: 'No analytics, no usage tracking, no advertising identifiers, no ads.' },
      { icon: 'file-spreadsheet', title: 'Export and back up', body: 'Export to CSV, get one spreadsheet of everything, or back up everything as one file you can restore.' },
      { icon: 'file-type-pdf', title: 'A monthly report', body: 'Download any month as a PDF.' },
      { icon: 'refresh', title: 'Sync, if you want it', body: 'Sign in with Google to keep your phone and computer in step, or don’t: everything works without it.' },
    ],
  },
  {
    id: 'style',
    nav: 'Make it yours',
    eyebrow: 'Make it yours',
    title: 'Your colour, your look.',
    lede: `${accents.length} accent colours, light and dark, and a quieter look if you prefer it.`,
    swatches: true,
    items: [
      { icon: 'palette', title: `${accents.length} accents`, body: `From ${accents[0].name}, the default, to ${accents[accents.length - 1].name}. Each shows you the app wearing it before you choose.` },
      { icon: 'moon-stars', title: 'Light, dark and Lights out', body: 'True black in dark mode, and a flat, neutral Clean style in light.' },
      { icon: 'accessible', title: 'Reduce motion', body: 'A switch that turns off Spendr’s animations, whatever your phone is set to.' },
      { icon: 'contrast', title: 'Readable in daylight', body: 'Coloured text and tiles are measured against what they sit on, and moved until they pass.' },
    ],
  },
  {
    id: 'desktop',
    nav: 'On a computer',
    eyebrow: 'On your computer',
    title: 'A full desktop app, too.',
    lede: 'On a wide screen Spendr spreads out, with a sidebar for every section and room for two things at once.',
    desktop: true,
    items: [
      { icon: 'layout-sidebar', title: 'Made for a big screen', body: 'Home in two columns, and a split view for accounts, Insights, Recurring, Debts and Goals: the list on the left, what you picked on the right.' },
      { icon: 'keyboard', title: 'A key for every entry', body: 'Press E, I or T from anywhere to add an expense, an inflow or a transfer, and Q for quick log.' },
      { icon: 'devices', title: 'In step with your phone', body: 'Sign in with Google on both, and what you log on one is on the other.' },
    ],
  },
]
