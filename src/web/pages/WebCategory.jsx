import { useMemo, useState } from 'react'
import { RowsSkeleton, StatsSkeleton } from '../ui/Skeletons'
import { Link, useNavigate, useParams } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { scheduledCutoff } from '../../utils/scheduled'
import { txMonthKey } from '../../utils/txDate'
import { effectiveLimit, monthKey } from '../../lib/rollover'
import { isSpend, isIncome, isAdjustment } from '../../lib/flows'
import { txBase } from '../../lib/fxContext'
import { foldLoanPayments } from '../../lib/loans'
import { editTransaction } from '../../lib/editTransaction'
import { fmt } from '../../lib/money'
import TxDetailSheet from '../../components/TxDetailSheet'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import DataTable from '../ui/DataTable'
import { Segmented } from '../ui/controls'
import { Stat, CategoryTile, Progress, Empty, Skeleton } from '../ui/display'
import { Bars } from '../ui/charts'
import { shortDate, TxDescription, TxAccount, TxAmount } from './txParts'
import { IChevronLeft, IEdit } from '../ui/icons'

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * One category on a computer: this month against its limit, month by month
 * for a year (or six months), and every transaction filed under it.
 *
 * The phone's rules: matched on the category's NAME (the join key the
 * ledger uses, so a deleted category still has its history); an inflow
 * category counts money in, an expense category money out (lib/flows); the
 * limit is the effective one, rollover included (lib/rollover), so this and
 * the Budget row that opened it agree; nothing dated after today.
 */
export default function WebCategory() {
  const { name = '' } = useParams()
  const navigate = useNavigate()
  const categories = useLiveQuery(() => db.categories.toArray(), [], undefined)
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const globalRollover = useLiveQuery(async () => !!(await db.meta.get('budgetRollover'))?.value, [], false)
  const [span, setSpan] = useState('12')
  const [selected, setSelected] = useState(/** @type {Record<string, any>|null} */ (null))

  const cat = (categories ?? []).find(c => c.name === name) ?? null
  const isInflow = cat?.type === 'inflow'
  const counts = isInflow ? isIncome : isSpend
  const thisMonth = monthKey(new Date())

  const catTxs = useMemo(() => {
    const cutoff = scheduledCutoff()
    return (transactions ?? []).filter(t => t.category === name && (t.date ?? '') <= cutoff)
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
  }, [transactions, name])

  const monthTotal = useMemo(() => catTxs.filter(t => counts(t) && txMonthKey(t.date) === thisMonth).reduce((s, t) => s + txBase(t), 0), [catTxs, counts, thisMonth])
  const limit = useMemo(() => {
    if (!cat || isInflow || !((cat.budget ?? 0) > 0)) return 0
    return effectiveLimit({ cat, txs: transactions ?? [], month: thisMonth, globalDefault: globalRollover }).effective
  }, [cat, isInflow, transactions, thisMonth, globalRollover])

  const months = useMemo(() => {
    /** @type {Record<string, number>} */
    const by = {}
    for (const t of catTxs) {
      if (isAdjustment(t) || !counts(t)) continue
      const k = monthKey(t.date)
      by[k] = (by[k] ?? 0) + txBase(t)
    }
    const n = Number(span)
    const now = new Date()
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
      return { label: `${SHORT[d.getMonth()]}${d.getMonth() === 0 ? ` ’${String(d.getFullYear()).slice(2)}` : ''}`, value: by[monthKey(d)] ?? 0 }
    })
  }, [catTxs, counts, span])
  const past = months.slice(0, -1).filter(m => m.value > 0)
  const usual = past.length ? past.reduce((s, m) => s + m.value, 0) / past.length : 0

  const catMap = useMemo(() => Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])
  const acctMap = useMemo(() => Object.fromEntries((accounts ?? []).map(a => [a.name, a])), [accounts])
  const rows = useMemo(() => foldLoanPayments(catTxs), [catTxs])
  const verb = isInflow ? 'Received' : 'Spent'
  const pct = limit ? (monthTotal / limit) * 100 : 0
  const left = limit - monthTotal

  // Its figures, chart and rows wait for the ledger, so none says nothing first.
  const loading = categories === undefined || transactions === undefined
  if (!loading && !cat && catTxs.length === 0) {
    return (
      <Page title={name}>
        <Panel><Empty art="notFound" title="Nothing filed under this" body="It may have been renamed or deleted." action={<Btn onClick={() => navigate('/budget')}>Back to budget</Btn>} /></Panel>
      </Page>
    )
  }

  return (
    <Page
      eyebrow={<Link to="/budget" className="inline-flex items-center gap-1 hover:text-[var(--d-text)]"><IChevronLeft size={13} />Budget</Link>}
      title={<span className="flex items-center gap-3"><CategoryTile cat={cat ?? { name, color: '#94a3b8' }} size="lg" /><span className="truncate">{name}</span></span>}
      subtitle={isInflow ? 'Money coming in' : limit ? `${fmt(limit)} a month` : 'No monthly limit'}
      actions={!isInflow && <Btn variant="secondary" icon={<IEdit size={14} />} onClick={() => navigate('/settings/budgets')}>{limit ? 'Edit limit' : 'Set a limit'}</Btn>}
    >
      {loading ? <StatsSkeleton /> : (
        <div className="d-stats grid grid-cols-4 gap-5 mb-8">
          <Stat label={`${verb} this month`} value={fmt(monthTotal)} note={limit ? `${Math.round(pct)}% of the limit` : ' '}>
            {limit > 0 && <Progress className="mt-3" value={pct} color={pct > 100 ? 'var(--d-neg)' : pct > 85 ? 'var(--d-warn)' : cat?.color} />}
          </Stat>
          <Stat label={limit ? (left < 0 ? 'Over' : 'Left') : 'Limit'} value={limit ? fmt(Math.abs(left)) : '—'} tone={limit && left < 0 ? 'neg' : null} note={limit ? `Of ${fmt(limit)}` : 'Set one in Budget limits'} />
          <Stat label="Usually" value={fmt(usual)} note={past.length ? `A month, over ${past.length} ${past.length === 1 ? 'month' : 'months'}` : 'Not enough history yet'} />
          <Stat label="Transactions" value={catTxs.length.toLocaleString()} note={catTxs[0] ? `Last on ${shortDate(catTxs[0].date)}` : 'None yet'} />
        </div>
      )}

      <Panel
        className="mb-5"
        title={`${verb} by month`}
        actions={<Segmented label="Span" value={span} onChange={setSpan} options={[{ value: '6', label: '6 months' }, { value: '12', label: '12 months' }]} />}
      >
        {loading ? <Skeleton className="h-[220px] rounded-[14px]" /> : <Bars data={months} height={220} color={cat?.color ?? 'var(--d-accent)'} valueLabel={verb} empty={{ title: isInflow ? 'Nothing received yet' : 'Nothing spent yet' }} />}
      </Panel>

      <Panel title="Transactions" meta={loading ? null : `${rows.length.toLocaleString()} rows`} flush>
        <DataTable
          label={`Transactions in ${name}`}
          rows={rows}
          rowKey={(t) => t.id}
          onRowClick={(t) => setSelected(t)}
          empty={loading ? <RowsSkeleton /> : <Empty art="ledger" size="sm" title="Nothing filed under this yet" />}
          columns={[
            { key: 'date', header: 'Date', width: 100, render: (t) => <span className="d-cell-muted d-num">{shortDate(t.date)}</span> },
            { key: 'desc', header: 'Description', render: (t) => <TxDescription tx={t} catMap={catMap} /> },
            { key: 'acct', header: 'Account', width: 220, render: (t) => <TxAccount tx={t} acctMap={acctMap} /> },
            { key: 'amt', header: 'Amount', width: 140, align: 'right', render: (t) => <TxAmount tx={t} /> },
          ]}
        />
      </Panel>

      <TxDetailSheet
        open={!!selected}
        onClose={() => setSelected(null)}
        transaction={selected}
        accounts={accounts ?? []}
        categories={categories ?? []}
        onEdit={(t) => editTransaction(navigate, t, () => setSelected(null))}
      />
    </Page>
  )
}
