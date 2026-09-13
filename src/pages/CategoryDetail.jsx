import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useBack } from '../hooks/useBack'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { scheduledCutoff } from '../utils/scheduled'
import SubPage from '../components/SubPage'
import CategoryGlyph from '../components/CategoryGlyph'
import TxDetailSheet from '../components/TxDetailSheet'
import Card from '../components/ui/Card'
import Divider from '../components/ui/Divider'
import SectionLabel from '../components/ui/SectionLabel'
import EmptyState from '../components/ui/EmptyState'
import ProgressBar from '../components/ui/ProgressBar'
import { SkeletonHero, SkeletonList } from '../components/ui/Skeleton'
import { budgetTone } from '../components/BudgetMeter'
import {
  RANGE_TITLE, SPEND_TREND_RANGES, DAY_MS,
  buildSpendTrend, spendSpan, spendBaseline,
  TrendRangeChips, BalanceTrend, IconEmptyLedger,
} from './accounts/Trend'
import { DetailTxRow } from './accounts/DetailParts'
import { fmt, fmtCompact } from '../lib/money'

/**
 * One category.
 *
 * ── What it is for ──
 *
 * The budget page can tell you Food is at 108%. It cannot tell you WHY, and
 * "why" is always the next question - which is a list of the things you
 * actually bought, and a line showing whether the overspend was one bad
 * Saturday or a steady drift all month. Both of those need a screen.
 *
 * It is deliberately the account page's shape: the same chart, the same range
 * chips, the same transaction rows. A category and an account are two ways of
 * slicing one ledger, and a reader who has learned one screen should not have
 * to learn the other.
 *
 * ── The chart is not a balance ──
 *
 * An account's line ends at the balance the page shows. A category has no
 * balance - only a total over a window - so its line starts at zero on the
 * left and climbs to what the window cost. See lib/trend.js. The figure
 * beside the range title is that line's right-hand end, which is the same
 * promise the account page makes about its own.
 *
 * ── Which rows ──
 *
 * Everything filed under this category, minus anything dated ahead. Same
 * cutoff as the Budget page, the Transactions list and Insights: an
 * installment plan books every month's charge the day you buy, and those rows
 * are real for available credit but are not money spent. The account page is
 * where they stay visible, because that is where what-is-owed lives.
 */
export default function CategoryDetail() {
  /* Not decoded here, however much it looks like it should be. React Router
     has already run the segment through decodeURIComponent, so a second pass
     is not a no-op - it is a crash. A category called "50% off" arrives as
     "50%25%20off" in the URL, comes back as "50% off" from useParams, and
     decoding THAT throws URIError on the stray percent. Found by opening the
     route, not by reading the docs. */
  const { name = '' } = useParams()
  const back = useBack('/budget')

  const [trendRange, setTrendRange] = useState('1m')
  const [selectedTx, setSelectedTx] = useState(null)

  const categories   = useLiveQuery(() => db.categories.toArray(), [], undefined)
  const accounts     = useLiveQuery(() => db.accounts.toArray(), [], [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], undefined)

  /* One clock reading for the whole render, like the Budget page - otherwise
     the month total and the cutoff can straddle midnight, and every memo
     below has to leave the date out of its deps to stay stable. */
  const now = useMemo(() => new Date(), [])

  const cat = useMemo(
    () => (categories ?? []).find(c => c.name === name) ?? null,
    [categories, name],
  )

  /* Matched on the NAME, not the id. A transaction stores its category as a
     string and renaming one rewrites every row, so the name is the join key
     the rest of the app already uses - and a category that has since been
     deleted still has a page with its history on it. */
  const catTxs = useMemo(() => {
    if (!transactions) return null
    const cutoff = scheduledCutoff()
    return transactions
      .filter(t => t.category === name && (t.date ?? '') <= cutoff)
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
  }, [transactions, name])

  // An inflow category counts money arriving. Same arithmetic, different word
  // on it - calling a salary "spent" would be nonsense.
  const isInflow = cat?.type === 'inflow'
  const verb = isInflow ? 'Received' : 'Spent'

  const monthTotal = useMemo(() => {
    if (!catTxs) return 0
    const pfx = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return catTxs
      .filter(t => (t.date ?? '').startsWith(pfx))
      .reduce((sum, t) => sum + (t.amount ?? 0), 0)
  }, [catTxs, now])

  const range = useMemo(
    () => SPEND_TREND_RANGES.find(r => r.key === trendRange) ?? SPEND_TREND_RANGES[1],
    [trendRange],
  )

  /* The dashed reference: what a window this long usually costs you, taken
     from the history BEFORE this one. Null when there is not enough of it -
     and null on ALL always, because a window that is your whole history has
     nothing left over to be compared against. See lib/trend.js. */
  const span = useMemo(
    () => spendSpan({ txs: catTxs ?? [], range, now: now.getTime() }),
    [catTxs, range, now],
  )
  const baseline = useMemo(
    () => spendBaseline({ txs: catTxs ?? [], span, now: now.getTime() }),
    [catTxs, span, now],
  )
  const usualTotal = baseline ? baseline.dailyRate * (span / DAY_MS) : null

  const trend = useMemo(
    () => buildSpendTrend({
      txs: catTxs ?? [], range, now: now.getTime(),
      usualPerDay: baseline?.dailyRate ?? null,
    }),
    [catTxs, range, now, baseline],
  )
  const rangeTotal = trend.length ? trend[trend.length - 1].value : 0

  const budget = cat?.budget ?? 0
  const pct    = budget > 0 ? (monthTotal / budget) * 100 : 0
  const tone   = budgetTone(pct)
  const left   = budget - monthTotal

  const catMap = useMemo(
    () => Object.fromEntries((categories ?? []).map(c => [c.name, c])),
    [categories],
  )

  const loading = !categories || !transactions

  return (
    <SubPage title={name || 'Category'} onBack={back}>
      {loading ? (
        <div className="px-5">
          <SkeletonHero />
          <SkeletonList rows={5} />
        </div>
      ) : (
        <>
          {/* ── What it has cost this month ──────────────────────────────

              This month rather than the chart's range, on purpose: it is the
              figure the Budget row you tapped was showing, and a detail
              screen whose headline disagrees with the row that opened it is
              a detail screen you stop trusting. The range total lives beside
              the chart, where the range is. ── */}
          <section className="px-5 mt-2">
            <Card padding="md">
              <div className="flex items-center gap-3.5">
                <span
                  className="cat-tile w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ '--cat-color': cat?.color ?? '#64748b' }}
                  aria-hidden="true"
                >
                  <CategoryGlyph cat={cat} size={24} emoji="💸" />
                </span>
                <div className="min-w-0">
                  <p className="text-11 font-semibold text-slate-400 dark:text-slate-500">
                    {verb} this month
                  </p>
                  <p className="text-28 font-bold tabular-nums text-slate-900 dark:text-white leading-tight">
                    {fmt(monthTotal)}
                  </p>
                </div>
              </div>

              {budget > 0 ? (
                <>
                  <ProgressBar className="mt-3.5" value={pct} color={tone.color} />
                  <p className="mt-2 text-11 tabular-nums text-slate-500 dark:text-slate-400">
                    <span className={`font-semibold ${tone.textClass}`}>
                      {Math.round(pct)}%
                    </span>
                    {' of '}{fmt(budget)}{' · '}
                    {left >= 0 ? `${fmtCompact(left)} left` : `${fmtCompact(-left)} over`}
                  </p>
                </>
              ) : (
                /* Not an error, and not a nudge either. A category with no
                   limit is an ordinary thing - most have none - so this says
                   what is true and stops. */
                <p className="mt-3 text-11 text-slate-400 dark:text-slate-500">
                  No monthly limit set
                </p>
              )}
            </Card>
          </section>

          {/* ── Over time ─────────────────────────────────────────────────

              The account page's chart, chips below it for the same reason:
              the reading order is "here is the shape, and here is the span
              it covers". ── */}
          <section className="px-5 mt-7">
            {/* In a card, where the account page leaves its chart on the
                page. Both readings are defensible there and only one is here:
                that page opens on a card face, so the chart below it is
                clearly part of the same object, while this one opens on a
                card of its own - and a chart floating under a card reads as
                having come loose from it.

                The card owns the side padding, so the chart is told not to
                add the page gutter it would otherwise assume. */}
            <Card padding="md">
              <div className="flex items-start justify-between">
                <SectionLabel inset="none" gap="none">{RANGE_TITLE[range.key]}</SectionLabel>
                <div className="text-right shrink-0">
                  <p className="text-11 font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                    {fmtCompact(rangeTotal)}
                  </p>
                  {/* The dashed line, named. An unexplained reference on a
                      chart is a mystery the reader has to solve before they
                      can use it, and the same slate this line is drawn in is
                      what ties the two together. */}
                  {usualTotal != null && (
                    <p className="text-10 tabular-nums text-slate-400 dark:text-slate-500 mt-0.5">
                      usually {fmtCompact(usualTotal)}
                    </p>
                  )}
                </div>
              </div>
              <BalanceTrend
                data={trend}
                color={cat?.color ?? '#64748b'}
                rangeKey={range.key}
                rangeTitle={RANGE_TITLE[range.key]}
                valueLabel={verb}
                emptyTitle={`Nothing · ${RANGE_TITLE[range.key].toLowerCase()}`}
                emptyBody={isInflow ? 'No income in this category' : 'No spending in this category'}
                baselineKey={usualTotal != null ? 'usual' : null}
                baselineLabel="Usually"
                padClass=""
              />
              <div className="mt-2.5">
                <TrendRangeChips
                  range={range.key}
                  onRange={setTrendRange}
                  ranges={SPEND_TREND_RANGES}
                />
              </div>
            </Card>
          </section>

          {/* ── The rows themselves ─────────────────────────────────────── */}
          <section className="px-5 mt-7">
            <SectionLabel gap="loose">
              Transactions · {catTxs?.length ?? 0}
            </SectionLabel>
            {!catTxs?.length ? (
              <EmptyState
                icon={<IconEmptyLedger />}
                title="Nothing here yet"
                body={`Anything you file under ${name} will show up`}
              />
            ) : (
              <Card clip className="mb-4">
                {catTxs.map((tx, i) => (
                  <div key={tx.id ?? i}>
                    {/* The account, where an account page prints the category.
                        Both rows answer "and the other axis?" - naming the
                        category here would only repeat the title. accountName
                        is the row's own account, which is what makes an
                        expense read as money leaving rather than arriving. */}
                    <DetailTxRow
                      tx={tx}
                      accountName={tx.account}
                      onSelect={setSelectedTx}
                      catMap={catMap}
                      label={tx.description || tx.account || name}
                      meta={tx.description ? tx.account : ''}
                    />
                    {i < catTxs.length - 1 && <Divider inset="row" />}
                  </div>
                ))}
              </Card>
            )}
          </section>
        </>
      )}

      <TxDetailSheet
        open={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
        accounts={accounts ?? []}
        categories={categories ?? []}
      />
    </SubPage>
  )
}
