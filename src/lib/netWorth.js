import { getCreditStatus } from '../utils/creditCycle'
import { sumInBase } from './fx'

/**
 * Today's net worth in the ledger's currency, the way the wallet reads it:
 * every asset at its balance, less what every card currently owes.
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
 * @returns {number}
 */
export function netWorthNow(accounts, transactions, base, rates) {
  const assets = sumInBase(accounts.filter(a => a.type !== 'credit'), base, rates).total
  const owed = sumInBase(
    accounts.filter(a => a.type === 'credit'), base, rates,
    a => getCreditStatus(/** @type {any} */ (a), transactions).currentBalance ?? 0,
  ).total
  return assets - owed
}
