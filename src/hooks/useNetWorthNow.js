import { useMemo } from 'react'
import { useBaseCurrency } from '../context/CurrencyContext'
import useRates from './useRates'
import { netWorthNow } from '../lib/netWorth'

/**
 * Today's net worth in the ledger's currency - lib/netWorth.js, kept current
 * as the accounts, the ledger and the rates change. Null until both lists
 * have loaded.
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
    return netWorthNow(accounts, transactions, base, rates)
  }, [accounts, transactions, base, rates])
}
