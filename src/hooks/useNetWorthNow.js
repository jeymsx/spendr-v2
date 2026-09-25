import { useMemo } from 'react'
import { useBaseCurrency } from '../context/CurrencyContext'
import useRates from './useRates'
import { getCreditStatus } from '../utils/creditCycle'
import { sumInBase } from '../lib/fx'

/**
 * Today's net worth in the ledger's currency, the way the wallet reads it:
 * every asset at its balance, less what every card currently owes.
 *
 * One definition for every screen that draws net worth over time - the
 * Insights chart and the monthly recap walk back from this same figure, so
 * the right-hand end of one is the last day of the other.
 *
 * Null until both lists have loaded.
 *
 * @param {Array<Record<string, any>>|undefined} accounts
 * @param {Array<Record<string, any>>|undefined} transactions
 * @returns {number|null}
 */
export default function useNetWorthNow(accounts, transactions) {
  const base = useBaseCurrency()
  const { table: rates } = useRates()
  return useMemo(() => {
    if (!accounts || !transactions) return null
    const assets = sumInBase(accounts.filter(a => a.type !== 'credit'), base, rates).total
    const owed = sumInBase(
      accounts.filter(a => a.type === 'credit'), base, rates,
      a => getCreditStatus(/** @type {any} */ (a), transactions).currentBalance ?? 0,
    ).total
    return assets - owed
  }, [accounts, transactions, base, rates])
}
