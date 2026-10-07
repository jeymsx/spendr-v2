import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmt } from '../../lib/money'
import { txBase } from '../../lib/fxContext'
import { saveFile } from '../../lib/share'
import { useToast } from '../../context/ToastContext'
import { monthOfPeriod, periodName } from '../../pages/insights/period'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import Popover from '../ui/Popover'
import Sankey from '../ui/Sankey'
import { pctOf } from '../ui/sankeyLayout'
import { Segmented } from '../ui/controls'
import { ICamera, IChevronRight } from '../ui/icons'
import { buildCashFlow } from './cashFlowData'
import { shortDate, TxDescription, TxAmount } from './txParts'

/**
 * The period's money as a flow, and a way into what it is made of.
 *
 * What came in (by what it was) runs into one total and out to where it
 * went - by category, or by account. Hovering a band or a node names it above
 * the chart, with its share and how many transactions are in it; pressing
 * one opens a panel listing those transactions, biggest first, each opening
 * the same detail sheet the other tables do. The camera keeps the chart as a
 * picture (ui/sankeyImage). Both sides are the period's own rows, so they add
 * up to the Spent and Came in figures above (cashFlowData).
 *
 * @typedef {ReturnType<typeof import('../../pages/insights/useInsightsData').useInsightsData>} Data
 * @typedef {import('../ui/Sankey').PickedNode} PickedNode
 * @param {{data: Data, period: any, onPick: (tx: Record<string, any>) => void}} props
 */
export default function CashFlow({ data, period, onPick }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [by, setBy] = useState(/** @type {'category'|'account'} */ ('category'))
  const [hover, setHover] = useState(/** @type {PickedNode|null} */ (null))
  /** The node whose panel is open, and the point it opens from. */
  const [open, setOpen] = useState(/** @type {{id: string, anchor: any}|null} */ (null))
  const [saving, setSaving] = useState(false)

  const flow = useMemo(
    () => buildCashFlow({ inflows: data.inflows, expenses: data.expenses, catMap: data.catMap, acctMap: data.acctMap, by }),
    [data.inflows, data.expenses, data.catMap, data.acctMap, by],
  )

  // Escape closes the panel from wherever focus is: a click on a band leaves it on the chart, not in the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('.sheet-panel')) return
      setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!flow.sources.length && !flow.targets.length) return null
  const rows = Math.max(flow.sources.length, flow.targets.length)
  const height = Math.max(300, Math.min(480, rows * 46 + 60))
  const nodes = [...flow.sources, ...flow.targets]
  const openNode = open ? nodes.find(n => n.id === open.id) ?? (open.id === 'mid' ? 'mid' : null) : null
  const periodLabel = periodName(period).replace(/^./, c => c.toUpperCase())

  /** What the hover readout and the panel say about a node. @param {{id: string, name: string, value: number, side?: string}} n */
  const countOf = (n) => (n.id === 'mid'
    ? data.inflows.length + data.expenses.length
    : nodes.find(x => x.id === n.id)?.txs.length ?? 0)

  /** A point on the screen the panel can drop from. @param {{x: number, y: number}} at */
  const anchorAt = (at) => ({
    getBoundingClientRect: () => /** @type {DOMRect} */ ({ left: at.x, right: at.x + 1, top: at.y, bottom: at.y + 1, width: 1, height: 1, x: at.x, y: at.y, toJSON() {} }),
    contains: () => false,
    focus: () => {},
  })

  const snapshot = async () => {
    setSaving(true)
    try {
      const { cashFlowImage } = await import('../ui/sankeyImage')
      const blob = await cashFlowImage({
        title: 'Cash flow',
        subtitle: `${periodLabel}: where the money came from, and where it went`,
        middle: 'Money in', sources: flow.sources, targets: flow.targets, height,
      })
      const name = `spendr-cash-flow-${period.range === '1m' ? monthOfPeriod(period) : period.range}.png`
      const done = await saveFile(blob, name)
      if (done === 'downloaded' || done === 'shared') showToast(`Saved ${name}`)
    } catch (e) {
      console.error(e)
      showToast('Could not make the picture', 'error')
    } finally {
      setSaving(false)
    }
  }

  // What the readout names: what is under the mouse, else what the panel is open on.
  const shown = hover ?? (openNode && openNode !== 'mid' ? openNode : null)
  const total = Math.max(flow.inTotal, flow.outTotal, 1)

  return (
    <Panel
      className="mb-8"
      title="Cash flow"
      meta={`${periodLabel}: where the money came from, and where it went`}
      actions={
        <>
          <Segmented label="Group spending by" value={by} onChange={(v) => { setOpen(null); setBy(v) }}
            options={[{ value: 'category', label: 'Categories' }, { value: 'account', label: 'Accounts' }]} />
          <Btn variant="ghost" icon={<ICamera size={16} />} label="Save as a picture" disabled={saving} onClick={snapshot} />
        </>
      }
    >
      <div className="d-flow-readout" aria-live="polite">
        {shown ? (
          <>
            {shown.id !== 'mid' && <span className="d-swatch rounded-full" style={{ background: shown.color }} />}
            <span className="font-semibold text-[var(--d-text)] truncate">{shown.name}</span>
            <span className="d-num text-[var(--d-text-2)] whitespace-nowrap">{fmt(shown.value)}</span>
            <span className="text-[var(--d-text-3)] whitespace-nowrap">
              {shown.id === 'mid' ? 'all of it' : `${pctOf((shown.value / total) * 100)}% of money ${nodeSide(shown.id) === 'in' ? 'in' : 'out'}`}
              {countOf(shown) > 0 ? ` · ${countOf(shown)} ${countOf(shown) === 1 ? 'transaction' : 'transactions'}` : ''}
            </span>
          </>
        ) : (
          <span className="text-[var(--d-text-3)]">Click a band or a name to see what is in it.</span>
        )}
      </div>

      <Sankey sources={flow.sources} targets={flow.targets} middle="Money in" height={height}
        selected={open?.id ?? null} onHover={setHover}
        onSelect={(n, at) => setOpen({ id: n.id, anchor: anchorAt(at) })} />

      <Popover
        open={!!open && !!openNode}
        onOpenChange={(o) => { if (!o) setOpen(null) }}
        anchor={open?.anchor ?? null}
        width={392}
        role="dialog"
        label={openNode && openNode !== 'mid' ? `${openNode.name}: transactions` : 'Cash flow summary'}
        className="d-flow-pop"
      >
        {(close) => openNode && (
          openNode === 'mid'
            ? <Summary flow={flow} />
            : <Detail node={openNode} total={total} catMap={data.catMap}
                onPick={(tx) => { close(); onPick(tx) }}
                onOpen={openNode.href ? () => { close(); navigate(/** @type {string} */ (openNode.href)) } : null} />
        )}
      </Popover>
    </Panel>
  )
}

/** Which side of the chart a node is on. @param {string} id */
function nodeSide(id) {
  return id.startsWith('in:') ? 'in' : id === 'mid' ? 'mid' : 'out'
}

/** The words for a node with no transactions of its own. */
const NOTE = /** @type {Record<string, string>} */ ({
  savings: 'More went out than came in this period, so the difference was paid from what you already had.',
  kept: 'Less went out than came in: this is what was left over, and it stays in your accounts.',
})

/**
 * A node's panel: its name and share, then the transactions in it.
 *
 * @param {{node: import('./cashFlowData').FlowSource, total: number, catMap: Record<string, any>,
 *          onPick: (tx: Record<string, any>) => void, onOpen: (() => void)|null}} props
 */
function Detail({ node, total, catMap, onPick, onOpen }) {
  const side = nodeSide(node.id)
  const txs = useMemo(() => [...node.txs].sort((a, b) => Math.abs(txBase(b)) - Math.abs(txBase(a))), [node.txs])
  const LIMIT = 150
  return (
    <div>
      <div className="d-flow-head">
        <span className="d-swatch rounded-full" style={{ background: node.color }} />
        <div className="min-w-0 flex-1">
          <div className="text-15 font-semibold text-[var(--d-text)] truncate">{node.name}</div>
          <div className="text-13 text-[var(--d-text-3)]">
            <span className="d-num">{fmt(node.value)}</span> · {pctOf((node.value / total) * 100)}% of money {side === 'in' ? 'in' : 'out'}
            {txs.length > 0 && ` · ${txs.length} ${txs.length === 1 ? 'transaction' : 'transactions'}`}
          </div>
        </div>
      </div>
      {NOTE[node.kind] && <p className="d-flow-note">{NOTE[node.kind]}</p>}
      {txs.length > 0 && (
        <div className="d-flow-list" role="list">
          {txs.slice(0, LIMIT).map((t, i) => (
            <button key={t.id ?? t.txId ?? i} type="button" role="listitem" className="d-flow-row" onClick={() => onPick(t)}>
              <span className="d-flow-date d-num">{shortDate(t.date)}</span>
              <span className="flex-1 min-w-0"><TxDescription tx={t} catMap={catMap} /></span>
              <TxAmount tx={t} />
            </button>
          ))}
          {txs.length > LIMIT && <div className="d-flow-more">and {txs.length - LIMIT} smaller ones</div>}
        </div>
      )}
      {onOpen && (
        <div className="d-flow-foot">
          <Btn size="sm" variant="ghost" iconRight={<IChevronRight size={14} />} onClick={onOpen}>
            {node.kind === 'account' ? 'Open the account' : 'Open the category'}
          </Btn>
        </div>
      )}
    </div>
  )
}

/**
 * The middle node's panel: the whole period in four lines.
 *
 * @param {{flow: ReturnType<typeof buildCashFlow>}} props
 */
function Summary({ flow }) {
  const drawn = flow.sources.find(s => s.kind === 'savings')
  const kept = flow.targets.find(s => s.kind === 'kept')
  const topIn = flow.sources.find(s => s.kind === 'income' || s.kind === 'other-income')
  const topOut = flow.targets.find(s => s.kind === 'category' || s.kind === 'account')
  /** @param {string} label @param {number} value @param {string} [tone] */
  const line = (label, value, tone) => (
    <div className="d-flow-sum">
      <span className="text-[var(--d-text-2)]">{label}</span>
      <span className={`d-num font-semibold ${tone ?? 'text-[var(--d-text)]'}`}>{fmt(value)}</span>
    </div>
  )
  return (
    <div>
      <div className="d-flow-head">
        <div className="min-w-0 flex-1">
          <div className="text-15 font-semibold text-[var(--d-text)]">The period in short</div>
          <div className="text-13 text-[var(--d-text-3)]">Press a band to see its transactions</div>
        </div>
      </div>
      <div className="d-flow-sums">
        {line('Came in', flow.inTotal)}
        {line('Went out', flow.outTotal)}
        {kept ? line(`Kept, ${pctOf((kept.value / (flow.inTotal || 1)) * 100)}% of what came in`, kept.value, 'd-pos')
          : drawn ? line('Paid from what you had', drawn.value, 'd-neg') : null}
        {topIn && line(`Most came from ${topIn.name}`, topIn.value)}
        {topOut && line(`Most went to ${topOut.name}`, topOut.value)}
      </div>
    </div>
  )
}
