import { useLiveQuery } from './useLiveQuery'
import { getCreditStatus } from '../utils/creditCycle'
import db from '../db/db'

/**
 * Returns a map of { [accountName]: availableCredit } for all credit accounts.
 * The arithmetic lives in getCreditStatus so every screen agrees on it.
 */
export function useCreditAvailMap(accounts) {
  return useLiveQuery(async () => {
    const map = {}
    const creditAccts = (accounts ?? []).filter(a => a.type === 'credit')
    if (!creditAccts.length) return map

    const allTxs = await db.transactions.toArray()
    for (const acct of creditAccts) {
      map[acct.name] = getCreditStatus(acct, allTxs).availableCredit
    }
    return map
  }, [accounts])
}
