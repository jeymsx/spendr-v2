import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import useForecast from '../../hooks/useForecast'
import { useInsightsData } from '../../pages/insights/useInsightsData'
import { changeOf } from '../../pages/insights/period'
import { useNetWorthSeries, monthEnds, NET_RANGES, NET_RANGE_WORDS } from '../../pages/insights/netWorth'
import { getGreeting } from '../../pages/dashboard/shared'
import { scheduledCutoff } from '../../utils/scheduled'
import { txMonthKey } from '../../utils/txDate'
import { foldLoanPayments } from '../../lib/loans'
import { isSpend } from '../../lib/flows'
import { txBase } from '../../lib/fxContext'
import { fmt } from '../../lib/money'
import { useAccountsView } from '../data/accounts'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import DataTable from '../ui/DataTable'
import { Segmented } from '../ui/controls'
import { Stat, Money, AccountTile, CategoryTile, Progress, Empty } from '../ui/display'
import { AreaTrend } from '../ui/charts'
import { shortDate, TxDescription, TxAmount, TxCategoryText } from './txParts'
import { IChevronRight, IWallet, IList, ICalendar, IGauge } from '../ui/icons'

/**
 * Home on a computer: where the money stands, at a glance.
 *
 * Four figures across the top - net worth and how it has moved this month,
 * what this month has spent and brought in, what is safe to spend before
 * payday. Under them the net worth over time beside the accounts, and what
 * just happened beside what is coming and the budget.
 *
 * Every figure is the phone's own reading: the wallet's net worth
 * (lib/netWorth via data/accounts), Insights' month (useInsightsData),
 * the forecast's safe to spend and next 30 days (useForecast), Home's
 * budget and Recent rules.
 */
export default function WebHome() {
  const navigate = useNavigate()
  const nameMeta = useLiveQuery(() => db.meta.get('displayName'), [], null)
  const name = nameMeta?.value?.trim() || ''
  const { loading, breakdown, groups, txAll, base } = useAccountsView()
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const period = useMemo(() => ({ range: '1m', month: null }), [])
  const month = useInsightsData(period)
  const { forecast } = useForecast(30)
  const [range, setRange] = useState('6m')
  const series = useNetWorthSeries(range)

  const { current: nwNow, txs: nwTxs, debts: nwDebts, includeDebts: nwInclude } = series
  const ends = useMemo(() => (nwNow == null || !nwTxs.length ? [] : monthEnds({
    txs: nwTxs, current: nwNow, months: 2, debts: nwDebts, includeDebts: nwInclude,
  })), [nwNow, nwTxs, nwDebts, nwInclude])
  const thisMonthChange = ends[0]?.change ?? null

  const catMap = useMemo(() => Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])
  const acctMap = useMemo(() => Object.fromEntries(groups.flatMap(g => g.rows).map(r => [r.acct.name, r.acct])), [groups])

  const recent = useMemo(() => {
    const cutoff = scheduledCutoff()
    return foldLoanPayments(txAll.filter(t => (t.date ?? '') <= cutoff).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))).slice(0, 8)
  }, [txAll])

  const budget = useMemo(() => {
    const pfx = txMonthKey(new Date().toISOString())
    const cutoff = scheduledCutoff()
    /** @type {Record<string, number>} */
    const spentBy = {}
    for (const t of txAll) {
      if (isSpend(t) && txMonthKey(t.date) === pfx && (t.date ?? '') <= cutoff) spentBy[t.category] = (spentBy[t.category] ?? 0) + txBase(t)
    }
    const rows = (categories ?? []).filter(c => c.budget > 0).map(c => ({ ...c, spent: spentBy[c.name] ?? 0 }))
      .sort((a, b) => b.spent / b.budget - a.spent / a.budget)
    const total = rows.reduce((s, c) => s + c.budget, 0)
    const spent = rows.reduce((s, c) => s + c.spent, 0)
    return { rows, total, spent, pct: total ? (spent / total) * 100 : 0 }
  }, [txAll, categories])

  const spentChange = month.previous ? changeOf(month.totalSpent, month.previous.spent) : null
  const net = month.totalEarned - month.totalSpent
  const safe = forecast?.safeToSpend ?? null
  const payday = forecast?.safeUntil ? new Date(forecast.safeUntil).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' })

  const chart = series.data.map(d => ({ label: d.day, value: d.value }))
  const rangeChange = chart.length > 1 ? chart[chart.length - 1].value - chart[0].value : null

  return (
    <Page title={`${getGreeting()}${name ? `, ${name}` : ''}`} subtitle={today}>
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Stat
          label="Net worth"
          value={loading ? '—' : <Money value={breakdown.total} />}
          note={thisMonthChange == null ? 'What you have, less what you owe' : `${thisMonthChange >= 0 ? '+' : '−'}${fmt(Math.abs(thisMonthChange))} this month`}
        />
        <Stat
          label={`Spent in ${monthName}`}
          value={fmt(month.totalSpent)}
          note={!spentChange || !month.previous ? ' ' : spentChange.same ? `Same as ${month.previous.label}` : `${spentChange.up ? '↑' : '↓'} ${spentChange.pct}% vs ${month.previous.label}`}
        />
        <Stat
          label={`Came in, ${monthName}`}
          value={fmt(month.totalEarned)}
          note={`${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))} after spending`}
        />
        <Stat
          label="Safe to spend"
          value={safe == null ? '—' : fmt(Math.max(0, safe))}
          tone={forecast?.firstNegative ? 'neg' : null}
          note={forecast?.firstNegative ? 'You may run short before payday' : payday ? `Until payday, ${payday}` : 'For the next 2 weeks'}
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <Panel
          className="col-span-2"
          title="Net worth"
          meta={rangeChange == null ? null : `${rangeChange >= 0 ? '+' : '−'}${fmt(Math.abs(rangeChange))} ${NET_RANGE_WORDS[/** @type {keyof typeof NET_RANGE_WORDS} */ (range)] ?? ''}`}
          actions={<Segmented label="Range" value={range} onChange={setRange} options={NET_RANGES.map(r => ({ value: r.key, label: r.key === 'all' ? 'All' : r.key.toUpperCase() }))} />}
        >
          {chart.length > 1 ? <AreaTrend data={chart} height={268} valueLabel="Net worth" /> : <div className="h-[268px]" />}
          <div className="grid grid-cols-5 gap-3 mt-4 pt-4 border-t border-[var(--d-border)]">
            <Pile label="Spending" value={breakdown.spending} />
            <Pile label="Savings" value={breakdown.savings} />
            <Pile label="Investments" value={breakdown.invested} />
            <Pile label="Credit owed" value={breakdown.credit} owed />
            <Pile label="Loans" value={breakdown.loans} owed />
          </div>
        </Panel>

        <Panel title="Accounts" actions={<Btn size="sm" variant="ghost" iconRight={<IChevronRight size={14} />} onClick={() => navigate('/accounts')}>All</Btn>} flush>
          <div className="max-h-[424px] overflow-y-auto py-1">
            {groups.length === 0 && !loading && (
              <Empty icon={<IWallet size={18} />} title="No accounts yet" body="Add your cash, a bank or an e-wallet." action={<Btn size="sm" onClick={() => navigate('/accounts/new')}>Add an account</Btn>} />
            )}
            {groups.map(g => (
              <div key={g.key} className="pb-1">
                <div className="flex items-center justify-between px-4 pt-2.5 pb-1 text-12 font-medium text-[var(--d-text-3)]">
                  <span>{g.label}</span>
                  <Money value={g.owed ? -g.total : g.total} className="text-[var(--d-text-2)]" />
                </div>
                {g.rows.filter(r => r.depth === 0).map(r => (
                  <Link key={r.acct.id} to={`/accounts/${r.acct.id}`} className="flex items-center gap-2.5 h-10 px-4 hover:bg-[var(--d-hover)]">
                    <AccountTile account={r.acct} size="sm" />
                    <span className="flex-1 min-w-0 truncate text-13 text-[var(--d-text)]">{r.acct.name}</span>
                    <Money value={g.owed ? -r.value : r.value} currency={r.currency} className="text-13 font-medium text-[var(--d-text)]" />
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Panel
          className="col-span-2"
          title="Recent transactions"
          actions={<Btn size="sm" variant="ghost" iconRight={<IChevronRight size={14} />} onClick={() => navigate('/transactions')}>All</Btn>}
          flush
        >
          <DataTable
            label="Recent transactions"
            rows={recent}
            rowKey={(t) => t.id}
            onRowClick={(t) => navigate(`/transactions?tx=${t.id}`)}
            empty={<Empty icon={<IList size={18} />} title="Nothing yet" body="Your newest transactions show here." />}
            columns={[
              { key: 'date', header: 'Date', width: 84, render: (t) => <span className="d-cell-muted d-num">{shortDate(t.date)}</span> },
              { key: 'desc', header: 'Description', render: (t) => <TxDescription tx={t} catMap={catMap} /> },
              { key: 'cat', header: 'Category', width: 150, render: (t) => <TxCategoryText tx={t} catMap={catMap} /> },
              { key: 'amt', header: 'Amount', width: 130, align: 'right', render: (t) => <TxAmount tx={t} /> },
            ]}
          />
        </Panel>

        <div className="flex flex-col gap-4 min-w-0">
          <Panel
            title="Next 30 days"
            actions={<Btn size="sm" variant="ghost" iconRight={<IChevronRight size={14} />} onClick={() => navigate('/insights/forecast')}>Forecast</Btn>}
            flush
          >
            {!forecast || forecast.events.length === 0 ? (
              <Empty icon={<ICalendar size={18} />} title="Nothing due" body="Bills, pay and card statements show here." />
            ) : (
              <div className="py-1">
                {forecast.events.slice(0, 6).map(e => {
                  const cat = e.category ? catMap[e.category] : null
                  const acct = acctMap[e.name] ?? (e.account ? acctMap[e.account] : null)
                  const d = new Date(e.date)
                  return (
                    <div key={e.key} className="flex items-center gap-3 h-11 px-4">
                      <span className="w-9 shrink-0 text-center leading-tight">
                        <span className="block text-10 font-semibold uppercase text-[var(--d-text-3)]">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
                        <span className="block text-14 font-semibold text-[var(--d-text)] d-num">{d.getDate()}</span>
                      </span>
                      {e.kind === 'card' || e.kind === 'loan'
                        ? <AccountTile account={acct ?? { name: e.name }} size="sm" />
                        : <CategoryTile cat={cat ?? { name: e.name, color: '#94a3b8' }} size="sm" />}
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-13 font-medium text-[var(--d-text)]">{e.name}</span>
                        <span className="block truncate text-11 text-[var(--d-text-3)]">
                          {e.overdue ? <span className="d-neg font-medium">Overdue</span> : e.kind === 'card' ? 'Card statement' : e.kind === 'loan' ? 'Loan payment' : e.learned ? 'Usual pay' : (e.account ?? '')}
                        </span>
                      </span>
                      <span className={`d-num text-13 font-semibold ${e.sign > 0 ? 'd-pos' : ''}`}>{e.sign > 0 ? '+' : '−'}{fmt(Math.abs(e.amount))}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>

          <Panel
            title="Budget"
            meta={budget.total ? `${Math.round(budget.pct)}% used` : null}
            actions={<Btn size="sm" variant="ghost" iconRight={<IChevronRight size={14} />} onClick={() => navigate('/budget')}>Budget</Btn>}
          >
            {budget.total === 0 ? (
              <Empty className="!py-6" icon={<IGauge size={18} />} title="No limits set" body="Give a category a monthly limit to track it here." action={<Btn size="sm" onClick={() => navigate('/settings/budgets')}>Set limits</Btn>} />
            ) : (
              <>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-13 text-[var(--d-text-2)]"><Money value={budget.spent} className="font-semibold text-[var(--d-text)]" /> of <Money value={budget.total} /></span>
                  <span className={`text-12 font-medium ${budget.spent > budget.total ? 'd-neg' : 'text-[var(--d-text-3)]'}`}>{fmt(Math.abs(budget.total - budget.spent))} {budget.spent > budget.total ? 'over' : 'left'}</span>
                </div>
                <Progress value={budget.pct} color={budget.pct > 100 ? 'var(--d-neg)' : budget.pct > 85 ? 'var(--d-warn)' : undefined} label="Budget used" />
                <div className="mt-4 flex flex-col gap-3">
                  {budget.rows.slice(0, 4).map(c => {
                    const pct = (c.spent / c.budget) * 100
                    return (
                      <Link key={c.id} to={`/categories/${encodeURIComponent(c.name)}`} className="block group">
                        <div className="flex items-center justify-between gap-2 mb-1 text-12">
                          <span className="flex items-center gap-1.5 min-w-0 text-[var(--d-text)] group-hover:underline underline-offset-2">
                            <span className="d-swatch rounded-full" style={{ background: c.color }} />
                            <span className="truncate">{c.name}</span>
                          </span>
                          <span className="d-num text-[var(--d-text-3)]">{fmt(c.spent)} / {fmt(c.budget)}</span>
                        </div>
                        <Progress value={pct} color={pct > 100 ? 'var(--d-neg)' : c.color} />
                      </Link>
                    )
                  })}
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>
      <p className="mt-6 text-12 text-[var(--d-text-3)]">Figures in {base}. Net worth counts every account at today’s rate.</p>
    </Page>
  )
}

/** One of the piles under the net worth chart. @param {{label: string, value: number, owed?: boolean}} props */
function Pile({ label, value, owed = false }) {
  return (
    <div className="min-w-0">
      <div className="text-12 text-[var(--d-text-3)] truncate">{label}</div>
      <div className="mt-0.5 text-14 font-semibold d-num truncate text-[var(--d-text)]">{owed && value ? '−' : ''}{fmt(Math.abs(value || 0))}</div>
    </div>
  )
}
