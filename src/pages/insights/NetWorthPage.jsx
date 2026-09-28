import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import SubPage from '../../components/SubPage'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import EmptyState from '../../components/ui/EmptyState'
import SectionHeading from '../../components/ui/SectionHeading'
import SectionLabel from '../../components/ui/SectionLabel'
import { SkeletonHero } from '../../components/ui/Skeleton'
import { IconBankUI, IconCardUI, IconDebt, IconEmptyLedger, IconReceipt, IconTrendUp, IconWalletUI } from '../../components/icons'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { useBack } from '../../hooks/useBack'
import { fmt, fmtCompact } from '../../lib/money'
import { netWorthBreakdown } from '../../lib/netWorth'
import useRates from '../../hooks/useRates'
import { monthName, monthKeyOf } from '../../lib/recap'
import { TrendRangeChips } from '../accounts/Trend'
import { NetWorthChart } from './Charts'
import { StackBar } from './Explore'
import { NET_RANGES, NET_RANGE_WORDS, monthEnds, useNetWorthSeries } from './netWorth'
import { setInsights, useInsightsState } from './period'
import { NetWorthSkeleton } from './Skeleton'
import { TrendEmpty } from './Trend'
import { useArrival } from './zoom'

/**
 * Net worth over time - the one question the rest of Insights never
 * answers. Everything else there is about money moving; none of it says
 * whether you are better off than you were in March.
 *
 * Its own page, because it is the one thing on Insights that does not
 * follow the period: its line ends today, whatever month the overview is
 * on, so it has its own range chips - and here they are the only ones on
 * the screen, instead of a second set in the middle of the overview that
 * meant something different from the first.
 *
 * Under the chart, where it stood at the end of each recent month, which is
 * the figure people actually remember.
 */
export default function NetWorthPage() {
  const arrival = useArrival()
  const back = useBack('/insights')
  const base = useBaseCurrency()
  const kept = useInsightsState()
  const nw = useNetWorthSeries(kept.net)
  const { data, current, range } = nw
  const { table: rates } = useRates()
  const navigate = useNavigate()

  /* What today's figure is made of - the same split as Home's wallet, so the
     six tiles there and the lists here add up to the same number. */
  const makeup = useMemo(
    () => (nw.loading ? null : netWorthBreakdown({
      accounts: nw.accounts, transactions: nw.txs, view: base, rates,
      debts: nw.debts, includeDebts: nw.includeDebts,
    })),
    [nw.loading, nw.accounts, nw.txs, base, rates, nw.debts, nw.includeDebts],
  )

  const months = useMemo(
    () => (current == null ? [] : monthEnds({
      txs: nw.txs, current, debts: nw.debts, includeDebts: nw.includeDebts,
    })),
    [nw.txs, nw.debts, nw.includeDebts, current],
  )

  const delta = data.length > 1 ? data.at(-1).value - data[0].value : 0
  const values = data.map(d => d.value)
  const flat = values.length < 2 || Math.max(...values) - Math.min(...values) < 0.005
  const thisMonth = monthKeyOf(new Date())

  return (
    <SubPage title="Net worth" onBack={back}>
      <div className={arrival}>
        {nw.loading ? (
          <>
            <SkeletonHero className="mb-6" />
            <NetWorthSkeleton chips={NET_RANGES.length} />
          </>
        ) : !nw.accounts.length ? (
          <EmptyState icon={<IconEmptyLedger />} title="No accounts yet" body="Add an account and its balance starts your net worth." />
        ) : (
          <>
            <section className="px-5 text-center">
              <SectionLabel inset="none">Today</SectionLabel>
              <p className="mt-2 text-38 leading-none font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
                {fmt(current ?? 0, base)}
              </p>
              {data.length > 1 && (
                <p className={`mt-2 text-13 font-semibold tabular-nums ${
                  Math.abs(delta) < 0.005 ? 'text-slate-500 dark:text-slate-400'
                    : delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                }`}>
                  {Math.abs(delta) < 0.005 ? 'No change' : `${delta > 0 ? '+' : '−'}${fmtCompact(Math.abs(delta), base)}`}
                  <span className="font-normal text-slate-500 dark:text-slate-400"> {NET_RANGE_WORDS[range.key]}</span>
                </p>
              )}
            </section>

            <section className="mt-6">
              {/* Drawn like the Trend chart - dashed guides, dates along the
                  bottom, figures up the side - so the two read as one app. */}
              {flat ? (
                <TrendEmpty kind="netflow" height={160} />
              ) : (
                <NetWorthChart data={data} color={delta >= 0 ? '#10b981' : '#ef4444'} currency={base} rangeKey={range.key} />
              )}
              <div className="mt-2.5 px-5">
                <TrendRangeChips range={range.key} onRange={(key) => setInsights({ net: key })} ranges={NET_RANGES} />
              </div>
            </section>

            {makeup && <Makeup b={makeup} base={base} includeDebts={nw.includeDebts} onOpen={navigate} />}

            {months.length > 0 && (
              <section className="mt-8">
                <SectionHeading>Month by month</SectionHeading>
                <Card clip className="mx-5">
                  {months.map((m, i) => (
                    <div key={m.key}>
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="flex-1 min-w-0">
                          <span className="block text-13 font-medium text-slate-800 dark:text-white truncate">
                            {monthName(m.key)}{m.key === thisMonth ? ', so far' : ''}
                          </span>
                          <span className="block text-11 text-slate-400 dark:text-slate-500">
                            {m.key === thisMonth ? 'Today' : 'At the end of the month'}
                          </span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className="block text-13 font-semibold text-slate-900 dark:text-white tabular-nums">{fmtCompact(m.value, base)}</span>
                          {m.change != null && (
                            <span className={`block text-11 font-semibold tabular-nums ${
                              Math.abs(m.change) < 0.005 ? 'text-slate-400 dark:text-slate-500'
                                : m.change > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                            }`}>
                              {Math.abs(m.change) < 0.005 ? 'No change' : `${m.change > 0 ? '+' : '−'}${fmtCompact(Math.abs(m.change), base)}`}
                            </span>
                          )}
                        </span>
                      </div>
                      {i < months.length - 1 && <Divider inset="row" />}
                    </div>
                  ))}
                </Card>
                <div className="mt-2">
                  <SectionLabel inset="gutter" gap="none">
                    What came in, less what went out, plus any change in your investments&apos; value. Moving money between your own accounts doesn&apos;t change it.
                  </SectionLabel>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </SubPage>
  )
}

/**
 * What the figure is made of: what you have, and what you owe.
 *
 * The same six piles Home's wallet shows, as two cards - each led by its
 * total and a bar of its parts, then a row per pile with its share of that
 * side. People are split the way the wallet's Debts tile is not: what others
 * owe you sits with what you have, what you owe them with what you owe, so
 * both totals are real totals. A row opens where that money lives.
 *
 * @param {{b: ReturnType<typeof netWorthBreakdown>, base: string, includeDebts: boolean,
 *          onOpen: (to: string) => void}} props
 */
function Makeup({ b, base, includeDebts, onOpen }) {
  const have = [
    { key: 'spending', label: 'Spending', note: 'Cash, wallets', value: b.spending, color: '#3b82f6', Icon: IconWalletUI, to: '/accounts' },
    { key: 'savings', label: 'Savings', note: 'Banks, deposits', value: b.savings, color: '#10b981', Icon: IconBankUI, to: '/accounts' },
    b.has.invested && { key: 'invested', label: 'Investments', note: 'At last value', value: b.invested, color: '#8b5cf6', Icon: IconTrendUp, to: '/accounts' },
    b.owedToYou > 0.005 && { key: 'owed', label: 'Owed to you', note: 'Debts', value: b.owedToYou, color: '#14b8a6', Icon: IconDebt, to: '/debts' },
  ].filter(Boolean)
  const owe = [
    { key: 'credit', label: 'Credit cards', note: b.credit > 0.005 ? 'Outstanding' : 'Paid off', value: b.credit, color: '#f59e0b', Icon: IconCardUI, to: '/accounts' },
    b.has.loans && { key: 'loans', label: 'Loans', note: 'Left to pay', value: b.loans, color: '#ef4444', Icon: IconReceipt, to: '/accounts' },
    b.youOwe > 0.005 && { key: 'youowe', label: 'You owe people', note: 'Debts', value: b.youOwe, color: '#ec4899', Icon: IconDebt, to: '/debts' },
  ].filter(Boolean)

  return (
    <section className="mt-8">
      <SectionHeading>What it&apos;s made of</SectionHeading>
      <div className="mx-5 flex flex-col gap-3">
        <MakeupCard title="You have" rows={have} base={base} onOpen={onOpen} />
        <MakeupCard title="You owe" rows={owe} base={base} onOpen={onOpen} owe />
      </div>
      <div className="mt-2">
        <SectionLabel inset="gutter" gap="none">
          {includeDebts
            ? 'Net worth is what you have, less what you owe.'
            : 'Net worth is what you have, less what you owe. Debts with people are left out, as set in Preferences.'}
        </SectionLabel>
      </div>
    </section>
  )
}

/**
 * @param {{title: string, rows: Array<{key: string, label: string, note: string, value: number, color: string,
 *          Icon: import('react').ComponentType<{size?: number}>, to: string}>,
 *          base: string, onOpen: (to: string) => void, owe?: boolean}} props
 */
function MakeupCard({ title, rows, base, onOpen, owe = false }) {
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0)
  return (
    <Card clip>
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-13 font-semibold text-slate-800 dark:text-white">{title}</span>
          <span className={`text-15 font-bold tabular-nums ${owe && total > 0.005 ? 'text-red-500 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
            {fmt(total, base)}
          </span>
        </div>
        {total > 0.005 && (
          <div className="mt-2.5">
            <StackBar parts={rows.filter(r => r.value > 0.005).map(r => ({ name: r.key, value: r.value, color: r.color }))} />
          </div>
        )}
      </div>
      <Divider />
      {rows.map((r, i) => (
        <div key={r.key}>
          <button
            type="button"
            onClick={() => onOpen(r.to)}
            className="press press-fade w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-white/[0.04]"
          >
            <span className="cat-tile w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ '--cat-color': r.color }}>
              <r.Icon size={17} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-13 font-medium text-slate-800 dark:text-white truncate">{r.label}</span>
              <span className="block text-11 text-slate-400 dark:text-slate-500 truncate">{r.note}</span>
            </span>
            <span className="text-right shrink-0">
              <span className="block text-13 font-semibold tabular-nums text-slate-900 dark:text-white">{fmt(r.value, base)}</span>
              {total > 0.005 && (
                <span className="block text-11 tabular-nums text-slate-400 dark:text-slate-500">
                  {sharePct(r.value, total)}
                </span>
              )}
            </span>
          </button>
          {i < rows.length - 1 && <Divider inset="glyph" />}
        </div>
      ))}
    </Card>
  )
}

/** A pile's share of its side: "34%", or "<1%" for a sliver that is not nothing. @param {number} v @param {number} total */
function sharePct(v, total) {
  const pct = (Math.max(0, v) / total) * 100
  return pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`
}
