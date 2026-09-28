import Card from '../../components/ui/Card'
import { ListEnd, useInfiniteList } from '../../components/ui/InfiniteList'
import Divider from '../../components/ui/Divider'
import { fmtCompact } from '../../lib/money'
import { DetailTxRow } from './DetailParts'

// ── Bits ───────────────────────────────────────────────────────────────────────

/** An account's history, a page at a time as you scroll (ui/InfiniteList). */
export function TxList({ txs, accountName, onSelect, catMap }) {
  const list = useInfiniteList(txs, { resetKey: accountName })
  return (
    <div className="mb-4">
      <Card clip>
        {list.visible.map((tx, i) => (
          <div key={tx.id ?? i}>
            <DetailTxRow tx={tx} accountName={accountName} onSelect={onSelect} catMap={catMap} />
            {i < list.visible.length - 1 && <Divider inset="row" />}
          </div>
        ))}
      </Card>
      <ListEnd list={list} done={`All ${txs.length} transactions`} />
    </div>
  )
}

/**
 * Net change across the window, which is the question the chart's shape
 * prompts. For a credit card or a loan a rise is money owed, so the colours
 * invert - the prop is named for the card, which came first.
 */
export function TrendDelta({ data, isCredit, currency }) {
  if (data.length < 2) return null
  const delta = data[data.length - 1].value - data[0].value
  if (Math.abs(delta) < 0.005) {
    return <span className="text-11 text-slate-400 dark:text-slate-500">no change</span>
  }
  const bad  = isCredit ? delta > 0 : delta < 0
  const tone = bad
    ? 'text-red-500 dark:text-red-400'
    : 'text-emerald-600 dark:text-emerald-400'
  return (
    <span className={`text-11 font-semibold tabular-nums ${tone}`}>
      {delta > 0 ? '+' : '−'}{fmtCompact(Math.abs(delta), currency)}
    </span>
  )
}
