/**
 * The privacy policy and the terms of use, as text.
 *
 * Two readers: the sheet in Settings (pages/settings/Policy.jsx) and the
 * website's /privacy and /terms pages (site/), which import this file at build
 * time. One copy, so the app and the site can never say two different things.
 * Nothing here imports anything, which is what lets the site read it.
 *
 * Each section is a heading and a body. The one with no heading is the intro,
 * drawn as a callout above the numbered sections.
 *
 * @typedef {{h: string|null, b: string}} PolicySection
 */

/*
 * Rewritten September 2026 against what the code actually does, not what it
 * was meant to do. Four statements in the previous version were untrue by
 * then, and one of them seriously:
 *
 *   "Nothing leaves it unless you turn on cloud sync"
 *       Google Fonts loads on every launch; exchange rates are fetched for a
 *       ledger holding a foreign account; the Sheets export sends the whole
 *       ledger. None of them was mentioned.
 *   "never ... transmitted to any third party"
 *       Same three.
 *   "The developer has no access to your cloud data"
 *       Row-level security stops OTHER USERS reading your data. It does not
 *       stop the database operator, who can read every row. A policy that
 *       says otherwise is a promise nobody can keep.
 *   Terms: figures "derived solely from data you enter"
 *       Converted amounts use a third party's exchange rates.
 *
 * Every service named below was found by searching the source for the hosts
 * the app contacts. Keep it that way: add a network call, add it here.
 *
 * Revised again the same month: Inter is bundled now, so Google Fonts is no
 * longer contacted and its section went; push reminders arrived and have
 * theirs; and the cloud sync section says the developer does not access
 * synced data - James's statement of practice, in his words, which is his to
 * make and to keep.
 */
/** @type {PolicySection[]} */
export const PRIVACY_SECTIONS = [
  { h: null, b: 'Last updated: October 2026' },
  { h: 'What is stored, and where', b: 'Everything you enter - transactions, accounts, budgets, goals, bills, templates, the people in your debts, and any account QR images - is stored on your device. It stays there unless you use one of the features listed below.' },
  { h: 'What we do not collect', b: 'No analytics, no usage tracking, no advertising identifiers. The app does not report what you do in it to anyone.' },
  { h: 'Services the app contacts', b: 'Some features need to reach another service. Each one receives your device’s IP address, the way any website does, and nothing more unless stated.' },
  { h: 'Hosting', b: 'The app is served by Vercel. Loading it is an ordinary web request.' },
  { h: 'Exchange rates', b: 'Only if you hold an account in a currency other than your main one. The app asks fxratesapi.com, or open.er-api.com if that fails, for current rates. The request contains your main currency code (for example "PHP") and nothing else about you or your money. Rates are stored on your device.' },
  { h: 'Cloud sync', b: 'Only if you sign in with Google. Your data is then stored in a Supabase database so it can reach your other devices. Row-level security means no other user can read it, and the developer does not access it.' },
  { h: 'Reminders', b: 'Only if you turn them on, which needs cloud sync. Your device works out which card payments and bills are coming up, and stores a short reminder for each in the same database: when to send it, and its text, such as "BPI Credit due today, ₱3,000.00 to pay". If you turn on the daily check-in, it also stores one "Anything to log today?" note for each of the next two weeks, and the time you chose for it; logging something on a day withdraws that day’s note. It also stores your device’s push address. When a reminder is due, Spendr’s server sends it through your device’s push service (Apple, Google or Mozilla), encrypted so that service cannot read it. The server reads only these reminders, never your transactions or balances. Turning reminders off, or signing out, removes the device’s push address.' },
  { h: 'Error reports', b: 'If the app crashes, a short description of the error is kept on your device. The app never sends it anywhere.' },
  { h: 'Deleting your data', b: 'Delete everything on this device at any time with Settings, Reset app. To have cloud-synced data removed, email jamesandgen111@gmail.com and it will be deleted.' },
  { h: 'Security', b: 'Data on your device is as secure as the device itself. Synced data is protected by Supabase and by your Google account.' },
  { h: 'Changes', b: 'This policy will be updated when what the app does changes. Continued use after an update means you accept it.' },
  { h: 'Contact', b: 'Questions or concerns? Email jamesandgen111@gmail.com' },
]

/** @type {PolicySection[]} */
export const TERMS_SECTIONS = [
  { h: null, b: 'Last updated: September 2026. By using Spendr, you agree to these terms. If you do not agree, please stop using the app.' },
  { h: 'Permitted use', b: 'Spendr is for personal, non-commercial financial tracking. You are responsible for the accuracy of what you enter.' },
  { h: 'Not financial advice', b: 'Spendr does not give financial, investment, tax or legal advice. Its figures are for information only. Do not make financial decisions based on this app alone.' },
  { h: 'Converted amounts', b: 'Where an amount is converted between currencies, it uses mid-market rates from a third-party provider. They may be delayed or unavailable, and they are not the rate your bank will give you. Treat converted figures as estimates.' },
  { h: 'Credit card due dates', b: 'Due dates are worked out from the statement and due days you enter. Always check the due date printed on your statement - the app cannot see it, and paying late is between you and your bank. Reminders, if you turn them on, can arrive late or not at all, and are not a substitute for your bank’s own notices.' },
  { h: 'No institutional affiliation', b: 'Spendr is independent. It is not affiliated with, endorsed by, or connected to GCash, Maya, BPI, BDO, or any other bank, e-wallet or financial institution named in the app. Those names are labels for your own convenience.' },
  { h: 'Intellectual property', b: 'The Spendr app, its design, interface and source code are the intellectual property of James Sablay. All rights reserved.' },
  { h: 'No warranty', b: 'The app is provided "as is" and "as available", without warranties of any kind. No guarantee is made about accuracy, reliability, availability or fitness for a particular purpose.' },
  { h: 'Limitation of liability', b: 'To the fullest extent the law allows, James Sablay is not liable for any direct, indirect, incidental or consequential damages from using or being unable to use the app, including loss of data or charges from a missed payment.' },
  { h: 'Changes to these terms', b: 'These terms may be revised. Continued use after a revision means you accept it.' },
  { h: 'Governing law', b: 'These terms are governed by the laws of the Republic of the Philippines.' },
  { h: 'Contact', b: 'Questions? Email jamesandgen111@gmail.com' },
]
