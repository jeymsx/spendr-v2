import { APP_HOST } from '../config'
import { banks, holdings } from './app'

/**
 * The questions people ask first. Every answer is something the app does
 * today; the policy text and the changelog are where each one comes from.
 * `a` is HTML, for the occasional link.
 */
export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Is Spendr free?',
    a: 'Yes. There’s nothing to buy, no subscription and no ads.',
  },
  {
    q: 'Do I need an account?',
    a: 'No. Spendr works on your phone from the first tap, with nothing to sign up for. Sign in with Google only if you want your phone and your computer to stay in step.',
  },
  {
    q: 'Is it on the App Store or Google Play?',
    a: `No. Spendr is a web app: open <strong>${APP_HOST}</strong> and add it to your home screen, and it opens full screen like any other app, even offline. <a href="/install">Here’s how</a>.`,
  },
  {
    q: 'Does it connect to my bank?',
    a: `No, and it never asks for a bank login. You log what you spend, and quick log and templates make that quick. It knows ${banks.length} banks and e-wallets and ${holdings.length} kinds of investments and loans by name, but it isn’t affiliated with any of them.`,
  },
  {
    q: 'Where is my data kept?',
    a: 'On your device. If you turn on sync, a copy is kept in a database that no other user can read, so it can reach your other devices. The <a href="/privacy">privacy policy</a> lists everything the app ever contacts.',
  },
  {
    q: 'Does it work offline?',
    a: 'All of it. Everything is stored on your phone, so logging, budgets and Insights work without a connection.',
  },
  {
    q: 'Can I use it on my computer?',
    a: 'Yes. On a wide screen it becomes a desktop app with a sidebar, tables and charts side by side. Sign in on both to keep them in sync.',
  },
  {
    q: 'Can I get my data out?',
    a: 'Any time: export to CSV, back up everything as one file you can restore, or download a monthly PDF report.',
  },
  {
    q: 'Does it handle other currencies?',
    a: 'Yes. Give an account its own currency and Spendr converts it at daily rates, or shows each currency on a line of its own.',
  },
  {
    q: 'Who makes Spendr?',
    a: 'James Sablay. Questions and ideas are welcome at <a href="mailto:jamesandgen111@gmail.com">jamesandgen111@gmail.com</a>.',
  },
]
