/** Where the app lives. Every "Open Spendr" on the site goes here. */
export const APP_URL = 'https://spendr-v2.vercel.app'

/** The app's address as people see it, without the scheme. */
export const APP_HOST = new URL(APP_URL).host

export const SITE_NAME = 'Spendr'
export const AUTHOR = 'James Sablay'
export const CONTACT_EMAIL = 'jamesandgen111@gmail.com'

/** What the site says Spendr is, in one line: the <meta> description and the footer. */
export const TAGLINE =
  'A money app for your phone. Track cash, banks, e-wallets and credit cards, offline, with no account needed.'
