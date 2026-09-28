/**
 * The small, pure facts about an account that every screen needs.
 *
 * These lived in pages/Accounts.jsx, which was fine while only pages imported
 * them. components/CardStyle.jsx needs them too, and a component importing a
 * page to get a colour list is both backwards and a real import cycle the
 * moment that page renders the component. Nothing here touches Dexie, React
 * or the DOM, so it belongs in lib.
 *
 * pages/Accounts.jsx re-exports all of it, so `from './Accounts'` keeps
 * working everywhere it already did.
 */


export const PALETTE = [
  '#10b981', '#2D9DFF', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#f97316',
  '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#a78bfa', '#64748b', '#0ea5e9',
]

/* Sentence case, like every other label in the app: these are common nouns,
   not brand names. `value` is the stored key and does not move. */
export const TYPE_OPTIONS = [
  { value: 'cash',       label: 'Cash',        shortLabel: 'Cash'     },
  { value: 'ewallet',    label: 'E-wallet',    shortLabel: 'E-wallet' },
  { value: 'savings',    label: 'Savings',     shortLabel: 'Savings'  },
  { value: 'bank',       label: 'Bank',        shortLabel: 'Bank'     },
  { value: 'credit',     label: 'Credit card', shortLabel: 'Credit'   },
  { value: 'investment', label: 'Investment',  shortLabel: 'Invest'   },
  { value: 'loan',       label: 'Loan',        shortLabel: 'Loan'     },
]

export const TYPE_LABEL = Object.fromEntries(TYPE_OPTIONS.map(t => [t.value, t.label]))

/* What an investment is, for its label and its glyph. Deliberately a short
   list of the things people in the Philippines actually hold, and nothing
   that needs a price feed: every one of these is valued by typing the figure
   the provider shows you. See lib/investments.js. */
export const INVESTMENT_KINDS = [
  { value: 'fund',     label: 'UITF / fund' },
  { value: 'mp2',      label: 'MP2 / Pag-IBIG' },
  { value: 'stocks',   label: 'Stocks' },
  { value: 'bonds',    label: 'Bonds / RTB' },
  { value: 'deposit',  label: 'Time deposit' },
  { value: 'pera',     label: 'PERA' },
  { value: 'vul',      label: 'Insurance / VUL' },
  { value: 'gold',     label: 'Gold' },
  { value: 'property', label: 'Property' },
  { value: 'business', label: 'Business' },
  { value: 'other',    label: 'Other' },
]

export const INVESTMENT_KIND_LABEL = Object.fromEntries(INVESTMENT_KINDS.map(k => [k.value, k.label]))

/**
 * Which pile an account's money belongs in - the ONE place that decides.
 *
 *   spending   cash and wallets, or anything you said is for spending
 *   savings    banks and deposits, or anything you said you are holding
 *   invested   an investment: worth something, not spendable today
 *   credit     a card: its figure is what you owe
 *   loan       a loan: its balance is stored negative, what you owe
 *
 * Three screens used to answer this with their own copy of the same five
 * lines, and a fourth answered "not a card, so it is money you have" - which
 * is right for exactly as long as cards are the only thing you can owe on.
 * The type wins for the three kinds whose meaning is fixed, then the "Counts
 * as" answer, then the type's own default.
 *
 * @param {Record<string, any>|null|undefined} a
 * @returns {'spending'|'savings'|'invested'|'credit'|'loan'}
 */
export function bucketOf(a) {
  if (!a) return 'savings'
  if (a.type === 'credit') return 'credit'
  if (a.type === 'loan') return 'loan'
  if (a.type === 'investment') return 'invested'
  if (a.role === 'spending' || a.role === 'savings') return a.role
  return ['cash', 'ewallet'].includes(a.type) ? 'spending' : 'savings'
}

/** A card. @param {Record<string, any>|null|undefined} a */
export const isCreditAccount = (a) => a?.type === 'credit'
/** A loan, whose balance is what you owe, stored negative. @param {Record<string, any>|null|undefined} a */
export const isLoan = (a) => a?.type === 'loan'
/** An investment, valued by hand. @param {Record<string, any>|null|undefined} a */
export const isInvestment = (a) => a?.type === 'investment'

/**
 * Money you can actually spend from today: cash, wallets, banks, savings.
 * Not a card (that is borrowing), not a loan, and not an investment - which
 * is yours, but is not money you can reach without selling something.
 * @param {Record<string, any>|null|undefined} a
 */
export function isLiquid(a) {
  const b = bucketOf(a)
  return b === 'spending' || b === 'savings'
}

/**
 * Accounts a purchase or an income can land on. Money goes into an
 * investment or a loan by moving it there - a transfer - never by spending
 * from it or being paid into it.
 * @param {Record<string, any>|null|undefined} a
 */
export const isEverydayAccount = (a) => !isInvestment(a) && !isLoan(a)

/* What "Counts as" offers, and the line under each answer.

   Here rather than in either form because both of them ask it - the create
   flow on its details step, the edit form further down the same list of
   fields - and a question asked twice with two different sets of words is
   how the two screens started looking like two different apps. */
export const ROLE_OPTIONS = [
  { value: 'spending', label: 'Spending', hint: 'Day-to-day money you spend from' },
  { value: 'savings',  label: 'Savings',  hint: 'Money you are holding, not spending' },
]

/** @param {string} type */
export function defaultRole(type) {
  if (type === 'credit') return 'credit'
  if (type === 'investment') return 'invested'
  if (type === 'loan') return 'loan'
  return ['cash', 'ewallet'].includes(type) ? 'spending' : 'savings'
}
