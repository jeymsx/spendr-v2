import { useMemo } from 'react'
import { useLiveQuery } from './useLiveQuery'
import db from '../db/db'
import { getCreditStatus } from '../utils/creditCycle'
import { scheduledCutoff } from '../utils/scheduled'

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

  const loading = accounts === undefined || txAll === undefined

  // Credit accounts are neither spending nor savings — they're a liability.
  const roleOf = (a) => {
    if (a.type === 'credit') return 'credit'
    if (a.role) return a.role
    return ['cash', 'ewallet'].includes(a.type) ? 'spending' : 'savings'
  }

  const balances = useMemo(() => {
    const all = accounts ?? []
    const sum = (role) => all.filter(a => roleOf(a) === role)
      .reduce((s, a) => s + (a.balance ?? 0), 0)
    return { spending: sum('spending'), savings: sum('savings') }
  }, [accounts])

  // Charges beyond today are committed, not spent — the same rule the mobile
  // history uses, so both agree on "this month".
  const monthExpenses = useMemo(() => {
    const n = new Date()
    const pfx = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
    const cutoff = scheduledCutoff()
    return (txAll ?? []).filter(t =>
      t.type === 'expense' && (t.date ?? '').startsWith(pfx) && (t.date ?? '') <= cutoff)
  }, [txAll])

  const creditStatus = useMemo(() => {
    const map = {}
    ;(accounts ?? []).filter(a => a.type === 'credit').forEach(acct => {
      // Unfiltered txAll on purpose: available credit must count every future
      // installment, which is exactly what the history hides.
      map[acct.name] = getCreditStatus(acct, txAll ?? [])
    })
    return map
  }, [accounts, txAll])

  const creditOutstanding = useMemo(() =>
    Object.values(creditStatus).reduce((s, st) => s + (st.currentBalance ?? 0), 0),
    [creditStatus])

  const budgets = useMemo(() => {
    const spent = {}
    monthExpenses.forEach(t => { spent[t.category] = (spent[t.category] ?? 0) + (t.amount ?? 0) })
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
    const owed = (t) => (debts ?? [])
      .filter(d => d.type === t)
      .reduce((s, d) => s + Math.max(0, (d.amount ?? 0) - (d.amountPaid ?? 0)), 0)
    return { iOwe: owed('i_owe'), owedToMe: owed('owed_to_me') }
  }, [debts])

  const catMap = useMemo(() =>
    Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])

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
    netWorth: balances.spending + balances.savings - creditOutstanding,
    monthExpenses,
    monthSpent: monthExpenses.reduce((s, t) => s + (t.amount ?? 0), 0),
    budgets,
    recent,
    upcoming,
    debtTotals,
    roleOf,
  }
}
