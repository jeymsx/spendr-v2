import { useMemo, useState } from 'react'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useBaseCurrency } from '../../context/CurrencyContext'
import useRates from '../../hooks/useRates'
import { getCreditStatus } from '../../utils/creditCycle'
import { sumInBase } from '../../lib/fx'
import { txBase } from '../../lib/fxContext'
import { buildNetWorthTrend } from '../../lib/trend'
import SectionHeading from '../../components/ui/SectionHeading'
import { TREND_RANGES, TrendRangeChips } from '../accounts/Trend'
import { TrendDelta } from '../accounts/DetailBits'
import { NetWorthChart } from './Charts'
import { TrendEmpty } from './Trend'

/**
 * Net worth over time - the one question the rest of Insights never answers.
 *
 * Everything else on this page is about FLOW: what came in, what went out,
 * where it went. None of it says whether you are better or worse off than you
 * were in March, which is the thing a spending tracker is ultimately for.
 *
 * ── It keeps its own range, and ignores the page's ──
 *
 * Insights browses back through calendar months, and a net-worth line cannot
 * follow it there: it is anchored to TODAY's figure and walks backwards from
 * it, the way an account's balance chart does. Tying it to the month arrows
 * would mean flipping to August and still seeing a line that ends now. So it
 * has its own chips, and they measure back from the present.
 *
 * Longer ranges only. Net worth over an hour or a day is noise: it moves when
 * you buy lunch, and says nothing about whether things are going well.
 *
 * ── Which net worth ──
 *
 * The combined one, in the ledger's currency, whatever the wallet on the home
 * screen is set to show. A line needs one unit to be drawn in, and "separate"
 * has several - it is a reading of the present, not a history.
 */

const RANGES = TREND_RANGES.filter(r => ['1m', '3m', '6m', '1y', 'all'].includes(r.key))

export default function NetWorthTrend() {
  const base = useBaseCurrency()
  const { table: rates } = useRates()
  const [key, setKey] = useState('6m')

  const accounts = useLiveQuery(() => db.accounts.toArray(), [], undefined)
  const txs = useLiveQuery(() => db.transactions.toArray(), [], undefined)

  const range = RANGES.find(r => r.key === key) ?? RANGES[2]

  /* Today's figure, computed the same way the wallet does - assets at their
     balance, cards at what they currently owe - so the right-hand end of this
     line and the big number on the home screen are the same number. */
  const current = useMemo(() => {
    if (!accounts || !txs) return null
    const assets = sumInBase(accounts.filter(a => a.type !== 'credit'), base, rates).total
    const owed = sumInBase(
      accounts.filter(a => a.type === 'credit'), base, rates,
      a => getCreditStatus(a, txs).currentBalance ?? 0,
    ).total
    return assets - owed
  }, [accounts, txs, base, rates])

  const data = useMemo(() => {
    if (current == null || !txs) return []
    return buildNetWorthTrend({ txs, current, range, valueOf: txBase })
  }, [txs, current, range])

  // Nothing to draw a history of, and no account to have one.
  if (!accounts?.length || !data.length) return null

  const rising = data.at(-1).value >= data[0].value
  const values = data.map(d => d.value)
  const flat = Math.max(...values) - Math.min(...values) < 0.005

  return (
    <div>
      <SectionHeading
        action={<TrendDelta data={data} isCredit={false} currency={base} />}
      >
        Net worth
      </SectionHeading>
      {/* Drawn like the Trend chart below it - dashed guides, dates along
          the bottom, figures up the side - so the two read as one page. */}
      {flat ? (
        <TrendEmpty kind="netflow" height={160} />
      ) : (
        <NetWorthChart
          data={data}
          color={rising ? '#10b981' : '#ef4444'}
          currency={base}
          rangeKey={range.key}
        />
      )}
      <div className="mt-2.5 px-5">
        <TrendRangeChips range={range.key} onRange={setKey} ranges={RANGES} />
      </div>
    </div>
  )
}
