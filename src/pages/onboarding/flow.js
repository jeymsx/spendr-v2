/**
 * What setup asks, in what order, on this device - and what it saves.
 *
 * ── Fewer questions, better defaults ──
 *
 * Setup used to ask seven things: a name, a currency, accounts, balances,
 * then two long lists of categories. Most people answered the currency and
 * categories by tapping Continue, which says the defaults were the answer.
 * So those two are defaults now - the peso for a phone in the Philippines,
 * and a starter set of categories anyone can edit in Settings - and the
 * questions left are the ones only the person can answer.
 *
 * ── The order depends on the phone ──
 *
 *   iPhone, in Safari   The Home Screen comes FIRST. An app added there gets
 *                       storage of its own, apart from Safari's, so a setup
 *                       finished in the Safari tab would not be in the icon.
 *   Android             The Home Screen comes last: the installed app shares
 *                       the browser's storage, so nothing set up is lost.
 *   An app's browser    Messenger or Facebook opened the link. It can install
 *                       nothing and may not keep what is stored, so the first
 *                       thing is the way out.
 *   Opened from the     No install step at all.
 *   Home Screen
 *
 * And the step that offers a Google backup and the daily check-in is there
 * only when the app has a server to back up to.
 */

import { EXPENSE_PRESETS, INFLOW_PRESETS, LOCKED_EXPENSE, LOCKED_INFLOW, SYSTEM_CATS } from '../../lib/phCategories'

/**
 * @typedef {'welcome'|'openInBrowser'|'installFirst'|'name'|'currency'|'accounts'|'balances'|'stayOnTrack'|'install'|'done'} StepId
 */

/**
 * @param {{install: import('../../lib/install').InstallContext, cloud: boolean, ph: boolean}} o
 * @returns {StepId[]}
 */
export function planSteps({ install, cloud, ph }) {
  /** @type {StepId[]} */
  const steps = ['welcome']
  if (install === 'in-app') steps.push('openInBrowser')
  if (install === 'ios') steps.push('installFirst')
  steps.push('name')
  if (!ph) steps.push('currency')
  steps.push('accounts', 'balances')
  if (cloud) steps.push('stayOnTrack')
  if (install === 'prompt' || install === 'android') steps.push('install')
  steps.push('done')
  return steps
}

/**
 * Whether this phone is in the Philippines, going by its clock and its
 * languages. Only decides whether to ask for a currency at all - the answer
 * is still one tap away in Settings.
 */
export function inPhilippines() {
  try {
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Manila') return true
  } catch { /* no Intl time zones: fall through to the languages */ }
  const langs = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
  return langs.some(l => /-PH$/i.test(l ?? '') || /^(fil|tl)\b/i.test(l ?? ''))
}

/**
 * The currency to have ticked when the question is asked: the one this
 * phone's clock and language point to, among the eight offered.
 *
 * @param {string[]} offered
 */
export function guessCurrency(offered) {
  let tz = ''
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '' } catch { /* none */ }
  const lang = typeof navigator === 'undefined' ? '' : navigator.language ?? ''
  const pick = /** @param {string} c */ c => (offered.includes(c) ? c : null)
  /* Singapore's and Kuala Lumpur's clocks are also what a Windows laptop in
     Manila usually runs on - Windows has no Philippine zone of its own - so
     they count as the peso, the currency most people opening this use. */
  return (
    (['Asia/Manila', 'Asia/Singapore', 'Asia/Kuala_Lumpur'].includes(tz) && pick('PHP'))
    || (tz === 'Asia/Dubai' && pick('AED'))
    || (tz === 'Asia/Tokyo' && pick('JPY'))
    || (tz === 'Europe/London' && pick('GBP'))
    || (tz.startsWith('Australia/') && pick('AUD'))
    || (tz.startsWith('Europe/') && pick('EUR'))
    || (tz.startsWith('America/') && pick('USD'))
    || (/-GB$/i.test(lang) && pick('GBP'))
    || (/-AU$/i.test(lang) && pick('AUD'))
    || (/-US$/i.test(lang) && pick('USD'))
    || offered[0]
  )
}

/* The categories a new ledger starts with. Enough that nearly everything
   has a place on day one, few enough that the picker is not a wall. The
   rest of the presets are one tap away in Settings, Categories. */
const START_EXPENSE = ['Food', 'Groceries', 'Transpo', 'Bills', 'Rent', 'Shopping', 'Health', 'Personal', 'Entertainment', 'Education', 'Gifts', 'Subscriptions']
/* Investment is here because an investment account's value updates are
   filed under it (lib/investments.js). */
const START_INFLOW = ['Salary', 'Freelance', 'Allowance', 'Gift Money', 'Bonus', 'Refund', 'Interest', 'Investment']

/** Every category a new ledger is given, system ones included. */
export function starterCategories() {
  const pick = (/** @type {typeof EXPENSE_PRESETS} */ list, /** @type {string[]} */ names) =>
    names.map(n => list.find(c => c.name === n)).filter(Boolean)
  const system = SYSTEM_CATS.filter(s => s.name !== LOCKED_EXPENSE.name && s.name !== LOCKED_INFLOW.name)
  return [
    LOCKED_EXPENSE,
    ...pick(EXPENSE_PRESETS, START_EXPENSE),
    LOCKED_INFLOW,
    ...pick(INFLOW_PRESETS, START_INFLOW),
    ...system,
  ].map(c => ({ ...c, budget: 0 }))
}

// ── The draft ─────────────────────────────────────────────────────────────
//
// Everything answered so far, kept in the tab as it is answered. Two things
// leave the page halfway through setup: signing in with Google, which is a
// full redirect, and a phone that drops a backgrounded tab to save memory.
// Either way the answers are still here when the page comes back, and setup
// picks up at the step it was on.

const DRAFT_KEY = 'spendr-onboarding'
/** A draft older than this is a setup abandoned, not one interrupted. */
const DRAFT_TTL_MS = 6 * 60 * 60 * 1000

/**
 * @typedef {object} Draft
 * @property {StepId} step
 * @property {string} name
 * @property {string} currency
 * @property {string[]} picked       PH_ACCOUNTS names
 * @property {Array<{name: string, type: string, color: string}>} custom
 * @property {Record<string, string>} balances
 * @property {Record<string, string>} limits
 * @property {boolean} [skippedCloud]
 */

/** @returns {(Draft & {savedAt: number}) | null} */
export function readDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d || typeof d !== 'object' || Date.now() - (d.savedAt ?? 0) > DRAFT_TTL_MS) return null
    return d
  } catch {
    return null
  }
}

/** @param {Draft} d */
export function saveDraft(d) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() })) } catch { /* private mode: setup just starts over */ }
}

export function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* nothing to clear */ }
}
