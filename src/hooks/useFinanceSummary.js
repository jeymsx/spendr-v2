import { useMemo } from 'react'
import { useLiveQuery } from './useLiveQuery'
import db from '../db/db'
import { getCreditStatus } from '../utils/creditCycle'
import { scheduledCutoff } from '../utils/scheduled'
import { txMonthKey } from '../utils/txDate'
import { sumInBase } from '../lib/fx'
import { useBaseCurrency } from '../context/CurrencyContext'
import { useRates } from './useRates'
import { txBase } from '../lib/fxContext'
import { isSpend } from '../lib/flows'
import { bucketOf } from '../lib/accountMeta'
import { netWorthBreakdown } from '../lib/netWorth'
import useNetWorthDebts from './useNetWorthDebts'

/**
 * The figures every overview screen needs, derived once.
 *
 * The volatile part — credit cycles — already lives in getCreditStatus, and
 * scheduled-charge filtering in scheduledCutoff, so this hook only assembles
 * sums on top of them. Nothing here reimplements either.
 *
 * Note: the mobile Dashboard still computes these inline. Unifying the two
 * means editing that page, which was explicitly off-limits, so it's left as
 * known duplication — recorded here rather than forgotten. Any fix to a
 * calculation below needs applying to pages/Dashboard.jsx too.
 */
export function useFinanceSummary() {
  const accounts   = useLiveQuery(() => db.accounts.toArray(),     [], undefined)
  const categories = useLiveQuery(() => db.categories.toArray(),   [], [])
  const debts      = useLiveQuery(() => db.debts.toArray(),        [], [])
  const recurring  = useLiveQuery(() => db.recurring.toArray(),    [], [])
  const txAll      = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const nameMeta   = useLiveQuery(() => db.meta.get('displayName'), [], null)
  const baseCurrency = useBaseCurrency()
  const { table: rates } = useRates()
  const nwDebts = useNetWorthDebts()

  const loading = accounts === undefined || txAll === undefined

  // Which pile an account is in - lib/accountMeta.js decides, for every screen.
  /** @param {Account} a */
  const roleOf = (a) => bucketOf(a)

  /* In the ledger's currency, not in each account's. A dollar account adds
     what it is worth today, and an account whose rate is missing is reported
     rather than silently valued at nothing - see lib/fx.js. */
  const balances = useMemo(() => {
    const all = accounts ?? []
    /** @param {string} role */
    const sum = (role) => sumInBase(all.filter(a => roleOf(a) === role), baseCurrency, rates)
    const spending = sum('spending')
    const savings = sum('savings')
    return {
      spending: spending.total,
      savings: savings.total,
      unconverted: [...new Set([...spending.missing, ...savings.missing])].sort(),
    }
  }, [accounts, baseCurrency, rates])

  // Charges beyond today are committed, not spent — the same rule the mobile
  // history uses, so both agree on "this month".
  const monthExpenses = useMemo(() => {
    const n = new Date()
    const pfx = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
    const cutoff = scheduledCutoff()
    return (txAll ?? []).filter(t =>
      isSpend(t) && txMonthKey(t.date) === pfx && (t.date ?? '') <= cutoff)
  }, [txAll])

  const creditStatus = useMemo(() => {
    /** @type {Record<string, any>} */
    const map = {}
    ;(accounts ?? []).filter(a => a.type === 'credit').forEach(acct => {
      // Unfiltered txAll on purpose: available credit must count every future
      // installment, which is exactly what the history hides.
      map[acct.name] = getCreditStatus(acct, txAll ?? [])
    })
    return map
  }, [accounts, txAll])

  const creditOutstanding = useMemo(() =>
    sumInBase(
      (accounts ?? []).filter(a => a.type === 'credit'),
      baseCurrency,
      rates,
      a => creditStatus[a.name]?.currentBalance ?? 0,
    ).total,
    [accounts, creditStatus, baseCurrency, rates])

  const budgets = useMemo(() => {
    /** @type {Record<string, number>} */
    const spent = {}
    monthExpenses.forEach(t => { spent[t.category] = (spent[t.category] ?? 0) + txBase(t) })
    return (categories ?? [])
      .filter(c => (c.budget ?? 0) > 0)
      .map(c => ({ ...c, spent: spent[c.name] ?? 0 }))
      .sort((a, b) => (b.spent / b.budget) - (a.spent / a.budget))
  }, [categories, monthExpenses])

  const recent = useMemo(() => {
    const cutoff = scheduledCutoff()
    return (txAll ?? [])
      .filter(t => (t.date ?? '') <= cutoff)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }, [txAll])

  const upcoming = useMemo(() =>
    (recurring ?? [])
      .filter(r => r.active && r.nextDate)
      .sort((a, b) => (a.nextDate ?? '').localeCompare(b.nextDate ?? '')),
    [recurring])

  const debtTotals = useMemo(() => {
    /** @param {string} t */
    const owed = (t) => (debts ?? [])
      .filter(d => d.type === t)
      .reduce((s, d) => s + Math.max(0, (d.amount ?? 0) - (d.amountPaid ?? 0)), 0)
    return { iOwe: owed('i_owe'), owedToMe: owed('owed_to_me') }
  }, [debts])

  const catMap = useMemo(() =>
    Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])

  /* The same net worth Home and Insights show, investments, loans and (when
     counted) debts included - lib/netWorth.js. */
  const breakdown = useMemo(() => netWorthBreakdown({
    accounts: accounts ?? [], transactions: txAll ?? [], view: baseCurrency, rates,
    creditStatus, debts: nwDebts.debts, includeDebts: nwDebts.include,
  }), [accounts, txAll, baseCurrency, rates, creditStatus, nwDebts.debts, nwDebts.include])

  return {
    loading,
    userName: nameMeta?.value || 'there',
    accounts: accounts ?? [],
    categories: categories ?? [],
    catMap,
    txAll: txAll ?? [],
    balances,
    creditStatus,
    creditOutstanding,
    netWorth: breakdown.total,
    breakdown,
    monthExpenses,
    monthSpent: monthExpenses.reduce((s, t) => s + txBase(t), 0),
    budgets,
    recent,
    upcoming,
    debtTotals,
    roleOf,
  }
}
