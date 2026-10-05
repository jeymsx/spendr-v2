import { useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { AccountCard } from '../../pages/dashboard/Tiles'
import { useWalletClip, TAB_H } from '../../pages/dashboard/wallet'
import { cardGradient } from '../../lib/accentTheme'
import BudgetGauge from '../../components/BudgetGauge'
import { useTheme } from '../../context/ThemeContext'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import DataTable from '../ui/DataTable'
import { Segmented } from '../ui/controls'
import { Stat, Money, AccountTile, CategoryTile, Progress, Empty, Skeleton } from '../ui/display'
import { CardSkeleton, RowsSkeleton, StatCardSkeleton } from '../ui/Skeletons'
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
const WALLET_CORNERS = { top: 24, bottom: 24 }

export default function WebHome() {
  const navigate = useNavigate()
  const nameMeta = useLiveQuery(() => db.meta.get('displayName'), [], null)
  const name = nameMeta?.value?.trim() || ''
  const { loading, breakdown, groups, txAll, base, credit } = useAccountsView()
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const period = useMemo(() => ({ range: '1m', month: null }), [])
  const month = useInsightsData(period)
  const { forecast } = useForecast(30)
  const [range, setRange] = useState('6m')
  const { accentColor, theme } = useTheme()
  // The phone's silhouette with the desktop cards' 24px corners.
  const [walletRef, walletClip] = useWalletClip(WALLET_CORNERS)
  const [pilesOpen, setPilesOpen] = useState(() => {
    try { return localStorage.getItem('netWorthBreakdown') !== 'closed' } catch { return true }
  })
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

  const cards = groups.flatMap(g => g.rows.filter(r => r.depth === 0).map(r => r.acct))
  // One row of cards: as many as fit, the last place given to the way to the rest.
  const [gridRef, cols] = useColumns(184, 16)
  const shownCards = cards.length <= cols ? cards : cards.slice(0, Math.max(1, cols - 1))
  const budgetLeft = budget.total - budget.spent
  // The figures wait for every read they are made of, so none shows a zero first.
  const waiting = loading || month.loading || !forecast

  return (
    <Page
      eyebrow={today}
      title={<><span className="d-light">{getGreeting()}{name ? ',' : ''}</span>{name ? ` ${name}!` : ''}</>}
    >
      <div className="grid grid-cols-12 gap-5 mb-8">
        {/* The phone's wallet: its silhouette (the tab hanging off the foot,
            pages/dashboard/wallet.jsx), its stitching and its pocket, in the
            accent - the one card on the page that is a thing rather than a
            figure. The tab folds the piles away, as on the phone. */}
        {/* The body ends level with the cards beside it; the tab hangs below,
            into the gap before Accounts. */}
        <div className="wallet d-home-wallet col-span-5 flex min-w-0" style={{ marginBottom: -TAB_H }}>
          <section
            ref={walletRef}
            className="wallet-card w-full px-7 pt-6 flex flex-col text-white"
            style={{ background: cardGradient(accentColor, theme), clipPath: walletClip }}
            aria-label="Net worth"
          >
            <span className="wallet-stitch" aria-hidden="true" />
            <div className="text-13 font-semibold text-white/70">Net worth</div>
            <div className="mt-1.5 text-[36px] leading-[42px] font-bold tracking-[-0.03em] d-num">{loading ? '—' : <Money value={breakdown.total} />}</div>
            {thisMonthChange != null && (
              <div className="mt-3">
                <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-white/15 text-12 font-semibold d-num">
                  {thisMonthChange >= 0 ? '+' : '−'}{fmt(Math.abs(thisMonthChange))} this month
                </span>
              </div>
            )}
            <div className="flex-1" />
            <div className="wallet-fold -mx-7" data-open={pilesOpen}>
              <div className="pt-5">
                <div className="wallet-pocket px-7 pt-6 pb-5">
                  <div className="grid grid-cols-4 gap-3">
                    <Pile label="Spending" value={breakdown.spending} loading={loading} />
                    <Pile label="Savings" value={breakdown.savings} loading={loading} />
                    <Pile label="Investments" value={breakdown.invested} loading={loading} />
                    <Pile label="You owe" value={breakdown.credit + breakdown.loans} owed loading={loading} />
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="wallet-tab"
              aria-expanded={pilesOpen}
              aria-label={pilesOpen ? 'Hide the breakdown' : 'Show the breakdown'}
              onClick={() => setPilesOpen(v => {
                const next = !v
                try { localStorage.setItem('netWorthBreakdown', next ? 'open' : 'closed') } catch { /* private mode */ }
                return next
              })}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </section>
        </div>

        <div className="col-span-7 grid grid-cols-2 gap-5">
          {waiting ? [0, 1, 2, 3].map(i => <StatCardSkeleton key={i} />) : (
            <>
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
              <Stat
                label="Budget left"
                value={budget.total ? fmt(Math.abs(budgetLeft)) : '—'}
                tone={budget.total && budgetLeft < 0 ? 'neg' : null}
                note={budget.total ? (budgetLeft < 0 ? 'Over the month’s limits' : `${Math.round(budget.pct)}% of ${fmt(budget.total)} used`) : 'No limits set'}
              />
            </>
          )}
        </div>
      </div>

      <section className="mb-8" aria-label="Accounts">
        <div className="d-section-head">
          <h2 className="d-section-title">Accounts</h2>
          <Link to="/accounts" className="d-link text-14">See all</Link>
        </div>
        {cards.length === 0 && !loading ? (
          <Panel><Empty icon={<IWallet size={20} />} title="No accounts yet" body="Add your cash, a bank or an e-wallet." action={<Btn variant="primary" onClick={() => navigate('/accounts/new')}>Add an account</Btn>} /></Panel>
        ) : (
          <div ref={gridRef} className="d-card-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {loading && Array.from({ length: cols }, (_, i) => <CardSkeleton key={i} />)}
            {shownCards.map(a => (
              <AccountCard key={a.id} acct={a} hidden={false} stmt={credit[a.name]} onClick={() => navigate(`/accounts/${a.id}`)} />
            ))}
            {loading ? null : cards.length > shownCards.length ? (
              <Link to="/accounts" className="d-card-more" style={{ aspectRatio: '1.45' }}>
                View all accounts
                <span className="text-12 font-medium text-[var(--d-text-3)]">{cards.length - shownCards.length} more</span>
              </Link>
            ) : shownCards.length < cols ? (
              <Link to="/accounts/new" className="d-card-more" style={{ aspectRatio: '1.45' }}>
                Add an account
              </Link>
            ) : null}
          </div>
        )}
      </section>

      <div className="grid grid-cols-12 gap-5 mb-5">
        <Panel
          className="col-span-8 d-main"
          title="Net worth over time"
          meta={rangeChange == null ? null : `${rangeChange >= 0 ? '+' : '−'}${fmt(Math.abs(rangeChange))} ${NET_RANGE_WORDS[/** @type {keyof typeof NET_RANGE_WORDS} */ (range)] ?? ''}`}
          actions={<Segmented label="Range" value={range} onChange={setRange} options={NET_RANGES.map(r => ({ value: r.key, label: r.key === 'all' ? 'All' : r.key.toUpperCase() }))} />}
        >
          {chart.length > 1 ? <AreaTrend data={chart} height={260} valueLabel="Net worth" /> : series.loading ? <Skeleton className="h-[260px] rounded-[14px]" /> : <div className="h-[260px]" />}
        </Panel>
      <Panel
        className="col-span-4 d-side"
        title="Next 30 days"
          actions={<Btn size="sm" variant="ghost" iconRight={<IChevronRight size={14} />} onClick={() => navigate('/insights/forecast')}>Forecast</Btn>}
          flush
        >
          {!forecast ? <RowsSkeleton rows={5} /> : forecast.events.length === 0 ? (
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
                      <span className="block text-11 font-semibold text-[var(--d-text-3)]">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
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
      </div>

      <div className="grid grid-cols-12 gap-5">
        <Panel
          className="col-span-7 xl:col-span-8"
          title="Recent transactions"
          actions={<Btn size="sm" variant="ghost" iconRight={<IChevronRight size={14} />} onClick={() => navigate('/transactions')}>All</Btn>}
          flush
        >
          <DataTable
            label="Recent transactions"
            rows={recent}
            rowKey={(t) => t.id}
            onRowClick={(t) => navigate(`/transactions?tx=${t.id}`)}
            empty={loading ? <RowsSkeleton rows={5} /> : <Empty icon={<IList size={18} />} title="Nothing yet" body="Your newest transactions show here." />}
            columns={[
              { key: 'date', header: 'Date', width: 84, render: (t) => <span className="d-cell-muted d-num">{shortDate(t.date)}</span> },
              { key: 'desc', header: 'Description', render: (t) => <TxDescription tx={t} catMap={catMap} /> },
              { key: 'cat', header: 'Category', width: 150, optional: true, render: (t) => <TxCategoryText tx={t} catMap={catMap} /> },
              { key: 'amt', header: 'Amount', width: 130, align: 'right', render: (t) => <TxAmount tx={t} /> },
            ]}
          />
        </Panel>

        <div className="col-span-5 xl:col-span-4 flex flex-col gap-5 min-w-0">
          <Panel
            title="Budget"
            meta={budget.total ? `${Math.round(budget.pct)}% used` : null}
            actions={<Btn size="sm" variant="ghost" iconRight={<IChevronRight size={14} />} onClick={() => navigate('/budget')}>Budget</Btn>}
          >
            {budget.total === 0 ? (
              <Empty className="!py-6" icon={<IGauge size={18} />} title="No limits set" body="Give a category a monthly limit to track it here." action={<Btn size="sm" onClick={() => navigate('/settings/budgets')}>Set limits</Btn>} />
            ) : (
              <>
                {/* The phone's Budget gauge: the month's spending as a fan
                    of ticks, the amount inside it. Five columns of twelve
                    below 1280px, so the fan has room for its figure. */}
                <BudgetGauge
                  className="mt-1 d-gauge"
                  accent={accentColor}
                  pct={budget.pct}
                  amount={fmt(budget.spent)}
                  leftNote={`${fmt(Math.abs(budget.total - budget.spent))} ${budget.spent > budget.total ? 'over' : 'left'}`}
                  rightNote={`${fmt(budget.total)} limit`}
                />
                <div className="mt-5 flex flex-col gap-3">
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

/** One of the piles along the foot of the net worth card. @param {{label: string, value: number, owed?: boolean, loading?: boolean}} props */
function Pile({ label, value, owed = false, loading = false }) {
  return (
    <div className="min-w-0">
      <div className="text-12 font-medium text-white/65 truncate">{label}</div>
      <div className="mt-1 text-14 font-semibold d-num truncate text-white">{loading ? '—' : `${owed && value ? '−' : ''}${fmt(Math.abs(value || 0))}`}</div>
    </div>
  )
}

/**
 * How many columns of at least `min` px fit in an element, kept up to date
 * as it resizes.
 *
 * @param {number} min
 * @param {number} gap
 * @returns {[import('react').RefObject<HTMLDivElement|null>, number]}
 */
function useColumns(min, gap) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [cols, setCols] = useState(5)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => setCols(Math.max(2, Math.floor((el.clientWidth + gap) / (min + gap))))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [min, gap])
  return [ref, cols]
}
