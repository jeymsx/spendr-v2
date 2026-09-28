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
import { fmt, fmtCompact } from '../../lib/money'
import { netWorthBreakdown } from '../../lib/netWorth'
import useRates from '../../hooks/useRates'
import { monthName, monthKeyOf } from '../../lib/recap'
import { TrendRangeChips } from '../accounts/Trend'
import { NetWorthChart } from './Charts'
import { NET_RANGES, NET_RANGE_WORDS, monthEnds, useNetWorthSeries } from './netWorth'
import { setInsights, useInsightsState } from './period'
import { NetWorthSkeleton } from './Skeleton'
import { TrendEmpty } from './Trend'
import { useArrival, useZoomBack } from './zoom'

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
 * Under the chart, what today's figure is made of, and where it stood at
 * the end of each recent month, which is the figure people actually
 * remember.
 */
export default function NetWorthPage() {
  const back = useZoomBack('/insights')
  const base = useBaseCurrency()
  const kept = useInsightsState()
  const nw = useNetWorthSeries(kept.net)
  // Grown out of its card once its figures are in (zoom.js).
  const arrival = useArrival(!nw.loading)
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
              <p className={`mt-2 ${heroSize(fmt(current ?? 0, base))} leading-none font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white`}>
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
                  <MonthBars months={months} thisMonth={thisMonth} />
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
                    Transfers between your own accounts don&apos;t count.
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
 * The same six piles Home's wallet shows. First the two sides against each
 * other, on one scale, so the answer to "why is it this number" is a
 * picture: the shorter bar is short by exactly your net worth, and that
 * stretch is drawn dashed. Each side had its own card with a bar scaled to
 * itself, which made a ₱120K side and a ₱420K side look the same length.
 *
 * Then a row per pile with its share of its side. People are split the way
 * the wallet's Debts tile is not: what others owe you sits with what you
 * have, what you owe them with what you owe, so both totals are real totals.
 * A row opens where that money lives.
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
      <Balance have={have} owe={owe} base={base} />
      <div className="mt-5">
        <SectionLabel inset="gutter">You have</SectionLabel>
        <PileCard rows={have} base={base} onOpen={onOpen} />
      </div>
      <div className="mt-5">
        <SectionLabel inset="gutter">You owe</SectionLabel>
        <PileCard rows={owe} base={base} onOpen={onOpen} />
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
 * @typedef {{key: string, label: string, note: string, value: number, color: string,
 *   Icon: import('react').ComponentType<{size?: number}>, to: string}} Pile
 */

/** @param {Pile[]} rows */
const sideTotal = (rows) => rows.reduce((s, r) => s + Math.max(0, r.value), 0)

/**
 * The two sides on one scale, and what is left between them.
 *
 * @param {{have: Pile[], owe: Pile[], base: string}} props
 */
function Balance({ have, owe, base }) {
  const hasTotal = sideTotal(have)
  const owesTotal = sideTotal(owe)
  const scale = Math.max(hasTotal, owesTotal)
  const net = hasTotal - owesTotal
  const even = Math.abs(net) < 0.005
  /* The dashes are the gap between two bars. With nothing on one side there
     is no gap to show - the other bar is the whole answer - and a bar of
     dashes over "You owe ₱0.00" read as something owed. */
  const both = hasTotal > 0.005 && owesTotal > 0.005
  return (
    <Card className="mx-5 px-4 pt-3.5 pb-4">
      <BalanceBar label="You have" rows={have} total={hasTotal} scale={scale} base={base}
        short={both && net < -0.005 ? -net : 0} shortTone="red" />
      <BalanceBar label="You owe" rows={owe} total={owesTotal} scale={scale} base={base}
        short={both && net > 0.005 ? net : 0} shortTone="green" className="mt-3.5" />
      <Divider className="mt-4 mb-3" />
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-13 font-semibold text-slate-800 dark:text-white">Net worth</span>
        <span className={`text-15 font-bold tabular-nums ${
          even ? 'text-slate-900 dark:text-white'
            : net > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
        }`}>
          {fmt(net, base)}
        </span>
      </div>
    </Card>
  )
}

const SHORT_TONE = {
  red: 'border-red-400/70 bg-red-500/[0.07] dark:border-red-400/60 dark:bg-red-400/[0.08]',
  green: 'border-emerald-500/70 bg-emerald-500/[0.07] dark:border-emerald-400/60 dark:bg-emerald-400/[0.08]',
}

/**
 * One side: its total, and a bar of its piles as long as the side is against
 * the larger one. The side that comes up short gets the difference drawn in
 * dashes after its bar - the net worth, as a length.
 *
 * @param {{label: string, rows: Pile[], total: number, scale: number, base: string,
 *          short: number, shortTone: 'red'|'green', className?: string}} props
 */
function BalanceBar({ label, rows, total, scale, base, short, shortTone, className = '' }) {
  const parts = rows.filter(r => r.value > 0.005)
  const width = scale > 0 ? (total / scale) * 100 : 0
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-12 font-medium text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-14 font-semibold tabular-nums text-slate-900 dark:text-white">{fmt(total, base)}</span>
      </div>
      {/* A track only for a side with nothing on it. Otherwise the bar and
          the dashes after it fill the width between them, and a grey ground
          showed through the dashes. */}
      <div className={`mt-1.5 h-3 flex items-stretch gap-[3px] rounded-full${width > 0 || short > 0 ? '' : ' bg-slate-100 dark:bg-white/[0.06]'}`} aria-hidden="true">
        {width > 0 && (
          <span className="grow-x h-full flex gap-[2px] rounded-full overflow-hidden" style={{ width: `${width}%` }}>
            {parts.map(p => (
              <span key={p.key} className="h-full" style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} />
            ))}
          </span>
        )}
        {short > 0 && scale > 0 && (
          <span
            className={`balance-short flex-1 min-w-[6px] rounded-full border border-dashed ${SHORT_TONE[shortTone]}`}
          />
        )}
      </div>
    </div>
  )
}

/**
 * A side's piles, one row each, with its share of the side.
 *
 * @param {{rows: Pile[], base: string, onOpen: (to: string) => void}} props
 */
function PileCard({ rows, base, onOpen }) {
  const total = sideTotal(rows)
  return (
    <Card clip className="mx-5">
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
              {/* No share for an empty pile: "₱0.00 · 0%" says nothing twice. */}
              {total > 0.005 && r.value > 0.005 && (
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

/**
 * The hero figure's size for its length. 38px holds fourteen characters in
 * the width of a 360px phone; a net worth in the tens of millions, owed,
 * is sixteen, and ran off both edges.
 *
 * @param {string} text
 */
function heroSize(text) {
  return text.length <= 14 ? 'text-38' : text.length <= 17 ? 'text-32' : 'text-28'
}

/** A pile's share of its side: "34%", or "<1%" for a sliver that is not nothing. @param {number} v @param {number} total */
function sharePct(v, total) {
  const pct = (Math.max(0, v) / total) * 100
  return pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`
}

const BARS_PX = 64

/**
 * The change in each month as a bar, oldest on the left, over the list that
 * gives the figures - the shape of the last six months before the numbers.
 * Gains rise from the zero line and losses hang from it; the line sits in
 * the middle only when there are both. This month is paler: it is not over.
 *
 * @param {{months: Array<{key: string, value: number, change: number|null}>, thisMonth: string}} props
 */
function MonthBars({ months, thisMonth }) {
  const cols = [...months].reverse()
  const changes = cols.map(m => m.change ?? 0)
  const max = Math.max(...changes.map(Math.abs))
  if (cols.length < 2 || !(max > 0.005)) return null
  const up = changes.some(c => c > 0.005)
  const down = changes.some(c => c < -0.005)
  const zero = up ? (down ? BARS_PX / 2 : BARS_PX) : 0
  return (
    <>
      <div className="px-4 pt-4 pb-3" aria-hidden="true">
        <div className="relative flex gap-2" style={{ height: BARS_PX }}>
          {/* design-ok: a chart's zero line, not a divider between rows */}
          <span className="absolute inset-x-0 h-px bg-slate-200 dark:bg-white/10" style={{ top: zero }} />
          {cols.map((m, i) => {
            const c = changes[i]
            const room = c > 0 ? zero : BARS_PX - zero
            const h = Math.abs(c) < 0.005 ? 0 : Math.max(3, (Math.abs(c) / max) * room)
            return (
              <span key={m.key} className="relative flex-1">
                {h > 0 && (
                  <span
                    className={`grow-y absolute inset-x-0 mx-auto max-w-[28px] ${
                      c > 0 ? 'rounded-t-md bg-emerald-500 dark:bg-emerald-400' : 'rounded-b-md bg-red-500 dark:bg-red-400'
                    }${m.key === thisMonth ? ' opacity-50' : ''}`}
                    style={{
                      height: h, top: c > 0 ? zero - h : zero,
                      transformOrigin: c > 0 ? 'bottom' : 'top',
                      animationDelay: `${i * 45}ms`,
                    }}
                  />
                )}
              </span>
            )
          })}
        </div>
        <div className="mt-2 flex gap-2">
          {cols.map(m => (
            <span key={m.key} className={`flex-1 text-center text-10 tabular-nums ${
              m.key === thisMonth ? 'font-semibold text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'
            }`}>
              {monthName(m.key).slice(0, 3)}
            </span>
          ))}
        </div>
      </div>
      <Divider />
    </>
  )
}
