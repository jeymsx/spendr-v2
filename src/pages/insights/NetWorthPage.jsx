import { useMemo } from 'react'
import SubPage from '../../components/SubPage'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import EmptyState from '../../components/ui/EmptyState'
import SectionHeading from '../../components/ui/SectionHeading'
import SectionLabel from '../../components/ui/SectionLabel'
import { SkeletonHero } from '../../components/ui/Skeleton'
import { IconEmptyLedger } from '../../components/icons'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { useBack } from '../../hooks/useBack'
import { fmt, fmtCompact } from '../../lib/money'
import { monthName, monthKeyOf } from '../../lib/recap'
import { TrendRangeChips } from '../accounts/Trend'
import { NetWorthChart } from './Charts'
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

  const months = useMemo(
    () => (current == null ? [] : monthEnds({ txs: nw.txs, current })),
    [nw.txs, current],
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
                    What came in, less what went out. Moving money between your own accounts doesn&apos;t change it.
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
