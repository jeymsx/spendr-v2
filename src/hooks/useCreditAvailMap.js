import { useLiveQuery } from './useLiveQuery'
import { getCycleRange } from '../utils/creditCycle'
import db from '../db/db'

/**
 * Returns a map of { [accountName]: availableCredit } for all credit accounts.
 * Correctly accounts for payments (transfers/inflows to the credit account).
 * availableCredit = creditLimit - currentBalance
 * currentBalance  = nextTotal (if stmt paid) else max(0, thisTotal + nextTotal - payments)
 */
export function useCreditAvailMap(accounts) {
  return useLiveQuery(async () => {
    const map = {}
    const creditAccts = (accounts ?? []).filter(a => a.type === 'credit')
    if (!creditAccts.length) return map

    const allTxs = await db.transactions.toArray()

    for (const acct of creditAccts) {
      const { cycleStart, cycleEnd } = getCycleRange(acct.cutoffDate)

      const chargeTxs = allTxs.filter(tx => tx.account === acct.name && tx.type === 'expense')
      const thisTotal = chargeTxs
        .filter(tx => { const d = new Date(tx.date); return d >= cycleStart && d <= cycleEnd })
        .reduce((s, tx) => s + (tx.amount ?? 0), 0)
      const nextTotal = chargeTxs
        .filter(tx => new Date(tx.date) > cycleEnd)
        .reduce((s, tx) => s + (tx.amount ?? 0), 0)
      const totalPayments = allTxs
        .filter(tx =>
          (tx.type === 'inflow'   && tx.account   === acct.name) ||
          (tx.type === 'transfer' && tx.toAccount === acct.name)
        )
        .reduce((s, tx) => s + (tx.amount ?? 0), 0)

      const stmtPaid       = totalPayments >= thisTotal
      const currentBalance = stmtPaid
        ? nextTotal
        : Math.max(0, thisTotal + nextTotal - totalPayments)

      map[acct.name] = (acct.creditLimit ?? 0) - currentBalance
    }
    return map
  }, [accounts])
}
