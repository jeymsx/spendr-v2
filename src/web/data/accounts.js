import { useMemo } from 'react'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import useRates from '../../hooks/useRates'
import useNetWorthDebts from '../../hooks/useNetWorthDebts'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { getCreditStatus } from '../../utils/creditCycle'
import { netWorthBreakdown } from '../../lib/netWorth'
import { bucketOf } from '../../lib/accountMeta'
import { sumInBase } from '../../lib/fx'

/**
 * The accounts as the desktop lists them: in the phone's five piles
 * (lib/accountMeta bucketOf - the rule Home's wallet and the Accounts page
 * both use), each with its figure and its pile's total in the ledger's
 * currency, and the net worth they add up to (lib/netWorth).
 *
 * An account's figure is what it means: a card's is what it owes (from its
 * statement, utils/creditCycle - its stored balance is stale), a loan's what
 * is left to pay (stored negative), anything else its balance. A
 * sub-account sits under its parent.
 */

export const GROUPS = /** @type {const} */ ([
  { key: 'spending', label: 'Spending', owed: false },
  { key: 'savings', label: 'Savings', owed: false },
  { key: 'invested', label: 'Investments', owed: false },
  { key: 'credit', label: 'Credit cards', owed: true },
  { key: 'loan', label: 'Loans', owed: true },
])

/**
 * @typedef {{acct: Record<string, any>, value: number, currency: string, depth: number, credit?: any}} AccountRow
 * @typedef {{key: string, label: string, owed: boolean, rows: AccountRow[], total: number}} AccountGroup
 */

/** What an account's figure is. @param {Record<string, any>} a @param {Record<string, any>} credit */
export function accountValue(a, credit) {
  if (a.type === 'credit') return credit[a.name]?.currentBalance ?? 0
  if (a.type === 'loan') return -(a.balance ?? 0)
  return a.balance ?? 0
}

export function useAccountsView() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], undefined)
  const txAll = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const base = useBaseCurrency()
  const { table: rates } = useRates()
  const nwDebts = useNetWorthDebts()

  const credit = useMemo(() => {
    /** @type {Record<string, any>} */
    const map = {}
    for (const a of accounts ?? []) if (a.type === 'credit') map[a.name] = getCreditStatus(a, txAll ?? [])
    return map
  }, [accounts, txAll])

  const breakdown = useMemo(() => netWorthBreakdown({
    accounts: accounts ?? [], transactions: txAll ?? [], view: base, ledger: base, rates,
    creditStatus: credit, debts: nwDebts.debts, includeDebts: nwDebts.include,
  }), [accounts, txAll, base, rates, credit, nwDebts.debts, nwDebts.include])

  const groups = useMemo(() => {
    const all = (accounts ?? []).filter(a => !a.archived)
    const order = (/** @type {any} */ a, /** @type {any} */ b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || String(a.name).localeCompare(String(b.name))
    const children = new Map()
    for (const a of all) {
      if (!a.parentName) continue
      if (!children.has(a.parentName)) children.set(a.parentName, [])
      children.get(a.parentName).push(a)
    }
    const names = new Set(all.map(a => a.name))
    /** @type {AccountGroup[]} */
    const out = []
    for (const g of GROUPS) {
      // A sub-account whose parent is gone stands on its own.
      const top = all.filter(a => (!a.parentName || !names.has(a.parentName)) && bucketOf(a) === g.key).sort(order)
      if (!top.length) continue
      /** @type {AccountRow[]} */
      const rows = []
      const members = []
      for (const a of top) {
        rows.push({ acct: a, value: accountValue(a, credit), currency: a.currency || base, depth: 0, credit: credit[a.name] })
        members.push(a)
        for (const c of (children.get(a.name) ?? []).sort(order)) {
          rows.push({ acct: c, value: accountValue(c, credit), currency: c.currency || base, depth: 1, credit: credit[c.name] })
          members.push(c)
        }
      }
      const total = sumInBase(members, base, rates, (a) => accountValue(a, credit)).total
      out.push({ ...g, rows, total })
    }
    return out
  }, [accounts, credit, base, rates])

  return {
    loading: accounts === undefined || txAll === undefined || !nwDebts.ready,
    accounts: accounts ?? [], txAll: txAll ?? [], credit, breakdown, groups, base, rates,
  }
}
