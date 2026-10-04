import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInsightsData, dailySeries } from '../../pages/insights/useInsightsData'
import { MONTHS, changeOf } from '../../pages/insights/period'
import { DailyAreaChart } from '../../pages/insights/Charts'
import { DetailTxRow } from '../../pages/accounts/DetailParts'
import TxDetailSheet from '../../components/TxDetailSheet'
import { editTransaction } from '../../lib/editTransaction'
import { fmt } from '../../lib/money'
import Card from '../../components/ui/Card'
import IconButton from '../../components/ui/IconButton'
import Divider from '../../components/ui/Divider'
import { IconChevronLeft, IconChevronRight } from '../../components/icons'
import { useAddFlow } from '../AddFlow'

/**
 * The right half of Transactions on a computer: what a month adds up to,
 * beside the list of what it was, and the ways to add to it.
 *
 * Transactions was the phone's page alone in a column, a phone's width of
 * rows with the rest of the window empty. Now it is laid out as every other
 * section is (WebTransactionsSection, pages/WebSections.jsx): the list on the
 * left, unchanged, and this beside it.
 *
 * The figures are Insights' own reading of the month (useInsightsData), so
 * the two never disagree about what it cost.
 */
export default function TransactionsSummary() {
  const navigate = useNavigate()
  const { openAdd } = useAddFlow()
  const current = monthKey(new Date())
  const [month, setMonth] = useState(current)
  const period = useMemo(() => ({ range: '1m', month }), [month])
  const data = useInsightsData(period)
  const [selected, setSelected] = useState(/** @type {Record<string, any>|null} */ (null))

  const [y, m] = month.split('-').map(Number)
  const title = `${MONTHS[m - 1]}${y === new Date().getFullYear() ? '' : ` ${y}`}`
  const net = data.totalEarned - data.totalSpent
  const spentChange = data.previous ? changeOf(data.totalSpent, data.previous.spent) : null
  const series = useMemo(() => dailySeries(data.daily).expenses, [data.daily])
  const categories = data.categorySegments.slice(0, 6)
  const biggest = data.rankedExpenses.slice(0, 5)

  return (
    <div className="web-tx-summary pb-10">
      <div className="flex items-center justify-between gap-3 px-5 pt-safe-header pb-4">
        <div className="flex items-center gap-1 -ml-2">
          <IconButton label="Previous month" size="sm" variant="plain" onClick={() => setMonth(k => stepMonth(k, -1))}>
            <IconChevronLeft size={18} />
          </IconButton>
          <h2 className="min-w-[7.5rem] text-center text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h2>
          <IconButton label="Next month" size="sm" variant="plain" disabled={month >= current} onClick={() => setMonth(k => stepMonth(k, 1))}>
            <IconChevronRight size={18} />
          </IconButton>
        </div>
        <div className="flex items-center gap-2">
          <AddButton sign="−" tone="text-red-500" label="Expense" onClick={() => openAdd('expense')} />
          <AddButton sign="+" tone="text-emerald-500" label="Inflow" onClick={() => openAdd('inflow')} />
          <AddButton sign="⇄" tone="text-primary" label="Transfer" onClick={() => openAdd('transfer')} />
        </div>
      </div>

      {/* ── The month in three figures ── */}
      <div className="px-5 grid grid-cols-3 gap-3">
        <Figure
          label="Spent"
          value={fmt(data.totalSpent)}
          note={!spentChange || !data.previous ? '' : spentChange.same ? `Same as ${data.previous.label}` : `${spentChange.up ? '↑' : '↓'} ${spentChange.pct}% vs ${data.previous.label}`}
        />
        <Figure
          label="Came in"
          value={fmt(data.totalEarned)}
          note={data.previous ? `${fmt(data.previous.earned)} in ${data.previous.label}` : ''}
        />
        <Figure
          label="Net"
          value={`${net < 0 ? '−' : '+'}${fmt(Math.abs(net))}`}
          tone={net < 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}
          note={net < 0 ? 'More out than in' : 'More in than out'}
        />
      </div>

      {/* ── Day by day ── */}
      <section className="mt-6 px-5">
        <h3 className="mb-2 text-13 font-semibold text-slate-700 dark:text-slate-200">Spending by day</h3>
        <Card className="pt-4 pb-2 pr-2">
          {data.loading ? <div className="h-[180px]" /> : <DailyAreaChart data={series} chartType="expenses" />}
        </Card>
      </section>

      <div className="mt-6 px-5 grid grid-cols-2 gap-4 items-start">
        {/* ── By category ── */}
        <section>
          <h3 className="mb-2 text-13 font-semibold text-slate-700 dark:text-slate-200">Where it went</h3>
          <Card clip>
            {!data.loading && categories.length === 0 && <Empty />}
            {categories.map((c, i) => (
              <div key={c.name}>
                {i > 0 && <Divider inset="row" />}
                <button
                  type="button"
                  onClick={() => navigate(`/categories/${encodeURIComponent(c.name)}`)}
                  className="w-full px-4 py-3 text-left active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
                >
                  <span className="flex items-center justify-between gap-3 text-13">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} aria-hidden="true" />
                      <span className="font-medium text-slate-800 dark:text-slate-100 truncate">{c.name}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-800 dark:text-slate-100">{fmt(c.value)}</span>
                  </span>
                  <span className="mt-2 block h-1 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden" aria-hidden="true">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (c.value / (data.totalSpent || 1)) * 100)}%`, backgroundColor: c.color }} />
                  </span>
                </button>
              </div>
            ))}
          </Card>
        </section>

        {/* ── The biggest ── */}
        <section>
          <h3 className="mb-2 text-13 font-semibold text-slate-700 dark:text-slate-200">Biggest expenses</h3>
          <Card clip>
            {!data.loading && biggest.length === 0 && <Empty />}
            {biggest.map((tx, i) => (
              <div key={tx.id ?? i}>
                {i > 0 && <Divider inset="row" />}
                <DetailTxRow tx={tx} accountName={tx.account} onSelect={setSelected} catMap={data.catMap} />
              </div>
            ))}
          </Card>
        </section>
      </div>

      <TxDetailSheet
        onEdit={(t) => editTransaction(navigate, t, () => setSelected(null))}
        open={!!selected}
        onClose={() => setSelected(null)}
        transaction={selected}
        accounts={data.accounts}
        categories={data.categories}
      />
    </div>
  )
}

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
const monthKey = (/** @type {Date} */ d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`

/** The month `by` months from `key`. @param {string} key @param {number} by */
function stepMonth(key, by) {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + by, 1))
}

function Empty() {
  return <p className="px-4 py-5 text-13 text-slate-500 dark:text-slate-400">Nothing spent this month.</p>
}

/** @param {{label: string, value: string, tone?: string, note?: string}} props */
function Figure({ label, value, tone = 'text-slate-900 dark:text-white', note = '' }) {
  return (
    <Card padding="md">
      <p className="text-11 font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums tracking-tight truncate ${tone}`}>{value}</p>
      <p className="mt-0.5 min-h-4 text-11 text-slate-500 dark:text-slate-400 truncate">{note}</p>
    </Card>
  )
}

/** @param {{sign: string, tone: string, label: string, onClick: () => void}} props */
function AddButton({ sign, tone, label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="web-tx-add">
      <span className={`text-15 font-bold leading-none ${tone}`} aria-hidden="true">{sign}</span>
      {label}
    </button>
  )
}
