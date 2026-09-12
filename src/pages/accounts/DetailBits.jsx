import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import { fmtCompact } from '../../lib/money'
import { DetailTxRow } from './DetailParts'

// ── Bits ───────────────────────────────────────────────────────────────────────

export function TxList({ txs, accountName, onSelect, catMap }) {
  return (
    <Card clip className="mb-4">
      {txs.map((tx, i) => (
        <div key={tx.id ?? i}>
          <DetailTxRow tx={tx} accountName={accountName} onSelect={onSelect} catMap={catMap} />
          {i < txs.length - 1 && <Divider inset="row" />}
        </div>
      ))}
    </Card>
  )
}

/**
 * Net change across the window, which is the question the chart's shape
 * prompts. For a credit card a rise is money owed, so the colours invert.
 */
export function TrendDelta({ data, isCredit }) {
  if (data.length < 2) return null
  const delta = data[data.length - 1].value - data[0].value
  if (Math.abs(delta) < 0.005) {
    return <span className="text-[11px] text-slate-400 dark:text-slate-500">no change</span>
  }
  const bad  = isCredit ? delta > 0 : delta < 0
  const tone = bad
    ? 'text-red-500 dark:text-red-400'
    : 'text-emerald-600 dark:text-emerald-400'
  return (
    <span className={`text-[11px] font-semibold tabular-nums ${tone}`}>
      {delta > 0 ? '+' : '−'}{fmtCompact(Math.abs(delta))}
    </span>
  )
}
