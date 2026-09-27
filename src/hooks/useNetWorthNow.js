import { useMemo } from 'react'
import { useBaseCurrency } from '../context/CurrencyContext'
import useRates from './useRates'
import useNetWorthDebts from './useNetWorthDebts'
import { netWorthNow } from '../lib/netWorth'

/**
 * Today's net worth in the ledger's currency - lib/netWorth.js, kept current
 * as the accounts, the ledger, the debts and the rates change. Null until
 * everything it needs has loaded.
 *
 * @param {Array<Record<string, any>>|undefined} accounts
 * @param {Array<Record<string, any>>|undefined} transactions
 * @returns {number|null}
 */
export default function useNetWorthNow(accounts, transactions) {
  const base = useBaseCurrency()
  const { table: rates } = useRates()
  const { include, debts, ready } = useNetWorthDebts()
  return useMemo(() => {
    if (!accounts || !transactions || !ready) return null
    return netWorthNow(accounts, transactions, base, rates, { debts, includeDebts: include })
  }, [accounts, transactions, base, rates, debts, include, ready])
}
