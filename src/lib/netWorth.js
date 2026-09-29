import { getCreditStatus } from '../utils/creditCycle'
import { convert, sumInBase } from './fx'
import { bucketOf } from './accountMeta'
import { byPerson, totals as peopleTotals } from './people'

/**
 * Net worth, and the piles it is made of - one definition for every screen.
 *
 *   + spending   cash and wallets
 *   + savings    banks and deposits
 *   + invested   investments, at the value you last typed
 *   − credit     what every card currently owes
 *   − loans      what every loan still owes (their balances are stored negative)
 *   ± people     what people owe you, less what you owe them - only when
 *                "Count debts" is on in Preferences
 *
 * Home, the Accounts list, Insights, the recap and the PDF each used to work
 * this out for themselves, three different ways, and they agreed only because
 * cards were the one thing you could owe on. Investments and loans would have
 * made every copy wrong in its own direction, so they all ask here.
 *
 * ── Currencies ──
 *
 * `view` is the currency the answer is expressed in; accounts are converted
 * into it at today's rate and anything that cannot be priced is reported in
 * `missing` rather than quietly valued at nothing (see lib/fx.js). Debts carry
 * no currency of their own and are in the ledger's, `ledger`.
 *
 * `scope` narrows the accounts first - the Home wallet's "separated" mode,
 * which counts only the accounts held in one currency. Debts count there only
 * while the view IS the ledger's currency, since that is the one they are in.
 *
 * @param {object} input
 * @param {Array<Record<string, any>>} input.accounts
 * @param {Array<Record<string, any>>} input.transactions  every row, unfiltered:
 *   a card owes its future installments too
 * @param {string} input.view    the currency to answer in
 * @param {string} [input.ledger] the ledger's own currency; defaults to `view`
 * @param {import('./fx').RateTable|null|undefined} input.rates
 * @param {Array<Record<string, any>>} [input.debts]
 * @param {boolean} [input.includeDebts]
 * @param {(accts: Array<Record<string, any>>) => Array<Record<string, any>>} [input.scope]
 * @param {Record<string, any>} [input.creditStatus]  getCreditStatus by card
 *   name, when the caller already has it
 */
export function netWorthBreakdown({
  accounts, transactions, view, ledger = view, rates,
  debts = [], includeDebts = false, scope, creditStatus,
}) {
  const all = scope ? scope(accounts ?? []) : (accounts ?? [])
  /** @type {Record<string, Array<Record<string, any>>>} */
  const piles = { spending: [], savings: [], invested: [], credit: [], loan: [] }
  for (const a of all) piles[bucketOf(a)].push(a)

  const missing = new Set()
  /** @param {{total: number, missing: string[]}} r */
  const take = (r) => { r.missing.forEach(c => missing.add(c)); return r.total }

  const spending = take(sumInBase(piles.spending, view, rates))
  const savings  = take(sumInBase(piles.savings, view, rates))
  const invested = take(sumInBase(piles.invested, view, rates))
  const credit   = take(sumInBase(piles.credit, view, rates, a =>
    /* Signed: an overpaid card holds a credit, which is money you have. */
    ((/** @type {any} */ st) => st.signedBalance ?? st.currentBalance ?? 0)(creditStatus?.[a.name] ?? getCreditStatus(/** @type {any} */ (a), transactions ?? []))))
  // Owed, as a positive figure. Unclamped: a loan paid past zero is money back.
  const loans    = take(sumInBase(piles.loan, view, rates, a => -(a.balance ?? 0)))

  let owedToYou = 0
  let youOwe = 0
  const debtsCount = !!includeDebts
    && (!scope || String(view).toUpperCase() === String(ledger).toUpperCase())
  if (debtsCount && (debts ?? []).length) {
    const t = peopleTotals(byPerson(debts))
    const a = convert(t.owedToYou, ledger, view, rates)
    const b = convert(t.youOwe, ledger, view, rates)
    if (a == null || b == null) missing.add(String(ledger).toUpperCase())
    else { owedToYou = a; youOwe = b }
  }

  const total = spending + savings + invested - credit - loans + owedToYou - youOwe
  return {
    spending, savings, invested, credit, loans, owedToYou, youOwe,
    people: owedToYou - youOwe,
    /** What you could spend today: cash, wallets and banks, less the cards. */
    liquid: spending + savings - credit,
    total,
    missing: [...missing].sort(),
    has: {
      invested: piles.invested.length > 0,
      loans: piles.loan.length > 0,
      people: debtsCount && (owedToYou > 0.005 || youOwe > 0.005),
    },
  }
}

/**
 * Today's net worth in the ledger's currency, the way the wallet reads it.
 *
 * One definition for every place that draws net worth over time - the
 * Insights chart and the monthly recap walk back from this same figure, so
 * the right-hand end of one is the last day of the other. Pure, so a recap
 * can be built outside a component too (the Wrapped card's share button).
 *
 * @param {Array<Record<string, any>>} accounts
 * @param {Array<Record<string, any>>} transactions
 * @param {string} base
 * @param {import('./fx').RateTable|null|undefined} rates
 * @param {{debts?: Array<Record<string, any>>, includeDebts?: boolean}} [opts]
 * @returns {number}
 */
export function netWorthNow(accounts, transactions, base, rates, opts = {}) {
  return netWorthBreakdown({
    accounts, transactions, view: base, ledger: base, rates,
    debts: opts.debts ?? [], includeDebts: !!opts.includeDebts,
  }).total
}

/**
 * Whether "Count debts" is on. Stored in meta as `netWorthDebts`; a missing
 * row means on, which is the default.
 * @param {{value?: any}|null|undefined} row
 */
export const debtsCountFrom = (row) => row?.value !== false
