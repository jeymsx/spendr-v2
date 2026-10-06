import { useMemo, useState } from 'react'
import { RowsSkeleton, StatsSkeleton } from '../ui/Skeletons'
import { useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useToast } from '../../context/ToastContext'
import { scheduledCutoff } from '../../utils/scheduled'
import { effectiveLimit, monthKey, prevMonth, sweepable } from '../../lib/rollover'
import { postCardPayment } from '../../db/txHelpers'
import { txBase } from '../../lib/fxContext'
import { isSpend } from '../../lib/flows'
import { fmt } from '../../lib/money'
import SweepSheet from '../../pages/budget/SweepSheet'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import DataTable from '../ui/DataTable'
import { Stat, CategoryTile, Progress, Empty } from '../ui/display'
import { Bars } from '../ui/charts'
import { IChevronLeft, IChevronRight, IEdit, ISparkle } from '../ui/icons'
import { spendingRows } from '../../utils/installments'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 'YYYY-MM' + n months. @param {string} key @param {number} n */
function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + n, 1))
}
/** @param {string} key */
function monthLabel(key, withYear = true) {
  const [y, m] = key.split('-').map(Number)
  return withYear && y !== new Date().getFullYear() ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1]
}

/**
 * The budget on a computer: one month's limits, what each category has
 * spent against its limit and what is left, in a table sorted by how much of
 * it is used - with the months before it a step away.
 *
 * The phone's rules throughout: a limit is the EFFECTIVE limit, with any
 * rollover carried in (lib/rollover effectiveLimit); spending is isSpend in
 * the ledger's currency up to the end of today; last month's leftovers are
 * offered to a goal (SweepSheet, the phone's own) until kept or dismissed.
 */
export default function WebBudget() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const categories = useLiveQuery(() => db.categories.toArray(), [], undefined)
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const meta = useLiveQuery(() => db.meta.toArray(), [], [])
  const goals = useLiveQuery(() => db.goals.toArray(), [], [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])
  const thisMonth = monthKey(new Date())
  const [month, setMonth] = useState(thisMonth)
  const isNow = month === thisMonth
  const globalRollover = useMemo(() => (meta ?? []).find(m => m.key === 'budgetRollover')?.value ?? false, [meta])

  const lastMonth = prevMonth(thisMonth)
  const sweptKey = `swept-${lastMonth}`
  const alreadySwept = !!(meta ?? []).find(m => m.key === sweptKey)?.value
  const leftovers = useMemo(() => sweepable({
    categories: categories ?? [], txs: transactions ?? [], month: lastMonth, globalDefault: globalRollover,
  }), [categories, transactions, lastMonth, globalRollover])
  const [sweepOpen, setSweepOpen] = useState(false)
  const [sweeping, setSweeping] = useState(false)

  const spentByCat = useMemo(() => {
    const cutoff = scheduledCutoff()
    /** @type {Record<string, number>} */
    const m = {}
    // An installment plan is spent in full the month it was bought (utils/installments).
    for (const t of spendingRows(transactions ?? [])) {
      if (!isSpend(t) || monthKey(t.date) !== month || (t.date ?? '') > cutoff) continue
      m[t.category] = (m[t.category] ?? 0) + txBase(t)
    }
    return m
  }, [transactions, month])

  const rows = useMemo(() => (categories ?? [])
    .filter(c => (c.budget ?? 0) > 0)
    .map(c => {
      const { carry, effective } = effectiveLimit({ cat: c, txs: transactions ?? [], month, globalDefault: globalRollover })
      const spent = spentByCat[c.name] ?? 0
      return { ...c, limit: effective, baseBudget: c.budget, carry, spent, left: effective - spent, pct: effective ? (spent / effective) * 100 : 0 }
    })
    .sort((a, b) => b.pct - a.pct), [categories, transactions, month, globalRollover, spentByCat])

  const unbudgeted = useMemo(() => {
    const limited = new Set((categories ?? []).filter(c => (c.budget ?? 0) > 0).map(c => c.name))
    const byName = Object.fromEntries((categories ?? []).map(c => [c.name, c]))
    return Object.entries(spentByCat)
      .filter(([name, amt]) => !limited.has(name) && amt > 0)
      .map(([name, amt]) => ({ ...(byName[name] ?? { name, color: '#94a3b8' }), name, spent: amt }))
      .sort((a, b) => b.spent - a.spent)
  }, [categories, spentByCat])

  const totals = useMemo(() => {
    const limit = rows.reduce((s, c) => s + c.limit, 0)
    const spent = rows.reduce((s, c) => s + c.spent, 0)
    const other = unbudgeted.reduce((s, c) => s + c.spent, 0)
    return { limit, spent, other, left: limit - spent, pct: limit ? (spent / limit) * 100 : 0 }
  }, [rows, unbudgeted])

  const now = new Date()
  const [yy, mm] = month.split('-').map(Number)
  const daysInMonth = new Date(yy, mm, 0).getDate()
  const daysLeft = isNow ? Math.max(1, daysInMonth - now.getDate() + 1) : 0
  const perDay = isNow && totals.left > 0 ? totals.left / daysLeft : 0

  // Six months of spending in the categories with a limit, against the limits.
  const history = useMemo(() => {
    const limited = new Set(rows.map(r => r.name))
    const cutoff = scheduledCutoff()
    /** @type {Record<string, number>} */
    const by = {}
    for (const t of spendingRows(transactions ?? [])) {
      if (!isSpend(t) || !limited.has(t.category) || (t.date ?? '') > cutoff) continue
      const k = monthKey(t.date)
      by[k] = (by[k] ?? 0) + txBase(t)
    }
    return Array.from({ length: 6 }, (_, i) => addMonths(thisMonth, i - 5)).map(k => ({ label: monthLabel(k, false).slice(0, 3), value: by[k] ?? 0 }))
  }, [rows, transactions, thisMonth])

  async function handleSweep(/** @type {any} */ { amount, from, to, goal }) {
    setSweeping(true)
    try {
      await postCardPayment({ cardName: to.name, fromName: from.name, amount })
      await db.meta.put({ key: sweptKey, value: true, updatedAt: new Date().toISOString() })
      showToast(`${fmt(amount)} moved to ${goal.name}`)
      setSweepOpen(false)
    } catch (e) {
      console.error('[WebBudget] sweep failed:', e)
      showToast(/** @type {any} */ (e)?.message ?? 'Could not move that', 'error')
    } finally {
      setSweeping(false)
    }
  }

  const loading = !categories || !transactions
  const over = rows.filter(r => r.left < 0).length

  return (
    <Page
      eyebrow={`${monthLabel(month)}${isNow ? ' · this month' : ''}`}
      title="Budget"
      actions={
        <>
          <div className="flex items-center gap-1">
            <Btn variant="ghost" icon={<IChevronLeft size={16} />} label="Previous month" onClick={() => setMonth(m => addMonths(m, -1))} />
            <Btn variant="ghost" icon={<IChevronRight size={16} />} label="Next month" disabled={isNow} onClick={() => setMonth(m => addMonths(m, 1))} />
          </div>
          {!isNow && <Btn variant="secondary" onClick={() => setMonth(thisMonth)}>This month</Btn>}
          <Btn variant="primary" icon={<IEdit size={14} />} onClick={() => navigate('/settings/budgets')}>Edit limits</Btn>
        </>
      }
    >
      {loading ? <StatsSkeleton /> : (
        <div className="d-stats grid grid-cols-4 gap-5 mb-8">
          <Stat label="Spent" value={fmt(totals.spent)} note={totals.limit ? `${Math.round(totals.pct)}% of ${fmt(totals.limit)}` : 'No limits set'}>
            {totals.limit > 0 && <Progress className="mt-3" value={totals.pct} color={totals.pct > 100 ? 'var(--d-neg)' : totals.pct > 85 ? 'var(--d-warn)' : undefined} />}
          </Stat>
          <Stat label={totals.left < 0 ? 'Over' : 'Left'} value={fmt(Math.abs(totals.left))} tone={totals.left < 0 ? 'neg' : null} note={over ? `${over} ${over === 1 ? 'category is' : 'categories are'} over` : 'Every category within its limit'} />
          <Stat label={isNow ? 'Days left' : 'Days'} value={isNow ? String(daysLeft) : String(daysInMonth)} note={isNow ? `${fmt(perDay)} a day to stay within` : 'The month is over'} />
          <Stat label="Without a limit" value={fmt(totals.other)} note={unbudgeted.length ? `${unbudgeted.length} ${unbudgeted.length === 1 ? 'category' : 'categories'} spent with no limit` : 'Nothing spent outside a limit'} />
        </div>
      )}

      {isNow && leftovers.total > 0 && !alreadySwept && (
        <div className="d-panel mb-6 px-6 py-5 flex items-center gap-4" style={{ borderColor: 'rgba(var(--color-primary-rgb), 0.3)', background: 'rgba(var(--color-primary-rgb), 0.05)' }}>
          <span className="d-tile" style={{ background: 'rgba(var(--color-primary-rgb), 0.14)', color: 'var(--d-accent)' }}><ISparkle size={18} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-15 font-semibold text-[var(--d-text)]">You did not spend {fmt(leftovers.total)} last month</div>
            <div className="text-13 text-[var(--d-text-2)]">Move it into a goal and it stops being this month’s spending.</div>
          </div>
          <Btn onClick={() => db.meta.put({ key: sweptKey, value: true, updatedAt: new Date().toISOString() })}>Dismiss</Btn>
          <Btn variant="primary" onClick={() => setSweepOpen(true)}>Keep it</Btn>
        </div>
      )}

      <div className="grid grid-cols-12 gap-5">
        <Panel className="col-span-8 d-stack" title="By category" meta={rows.length ? `${rows.length} with a limit` : null} flush>
          <DataTable
            label="Budget by category"
            rows={loading ? [] : rows}
            rowKey={(c) => c.id ?? c.name}
            onRowClick={(c) => navigate(`/categories/${encodeURIComponent(c.name)}`)}
            empty={loading ? <RowsSkeleton /> : (
              <Empty art="gauge" title="No limits yet" body="Give a category a monthly limit and track it here." action={<Btn variant="primary" onClick={() => navigate('/settings/budgets')}>Set limits</Btn>} />
            )}
            columns={[
              {
                key: 'name', header: 'Category',
                render: (c) => (
                  <span className="flex items-center gap-3 min-w-0">
                    <CategoryTile cat={c} size="sm" />
                    <span className="truncate font-medium">{c.name}</span>
                    {c.carry ? <span className={`d-badge ${c.carry > 0 ? 'd-badge-accent' : 'd-badge-warn'}`}>{c.carry > 0 ? '+' : '−'}{fmt(Math.abs(c.carry))} carried</span> : null}
                  </span>
                ),
              },
              {
                key: 'progress', header: 'Used', width: '26%',
                render: (c) => (
                  <span className="flex items-center gap-3">
                    <Progress className="flex-1" value={c.pct} color={c.pct > 100 ? 'var(--d-neg)' : c.pct > 85 ? 'var(--d-warn)' : c.color} />
                    <span className={`w-11 text-right text-13 font-semibold d-num ${c.pct > 100 ? 'd-neg' : 'text-[var(--d-text-2)]'}`}>{Math.round(c.pct)}%</span>
                  </span>
                ),
              },
              { key: 'spent', header: 'Spent', width: 116, align: 'right', render: (c) => <span className="d-num font-medium">{fmt(c.spent)}</span> },
              { key: 'limit', header: 'Limit', width: 116, align: 'right', render: (c) => <span className="d-num d-cell-muted">{fmt(c.limit)}</span> },
              {
                key: 'left', header: 'Left', width: 116, align: 'right',
                render: (c) => <span className={`d-num font-semibold ${c.left < 0 ? 'd-neg' : 'd-pos'}`}>{c.left < 0 ? '−' : ''}{fmt(Math.abs(c.left))}</span>,
              },
            ]}
            footer={rows.length ? (
              <tr>
                <td>Total</td>
                <td><Progress value={totals.pct} color={totals.pct > 100 ? 'var(--d-neg)' : undefined} /></td>
                <td className="is-num">{fmt(totals.spent)}</td>
                <td className="is-num d-cell-muted">{fmt(totals.limit)}</td>
                <td className={`is-num ${totals.left < 0 ? 'd-neg' : 'd-pos'}`}>{totals.left < 0 ? '−' : ''}{fmt(Math.abs(totals.left))}</td>
              </tr>
            ) : null}
          />
        </Panel>

        <div className="col-span-4 d-stack-side flex flex-col gap-5 min-w-0">
          <Panel title="Last 6 months" meta="Spent in limited categories">
            <Bars data={history} height={190} valueLabel="Spent" empty={{ title: 'Nothing spent yet' }} />
          </Panel>
          <Panel title="Without a limit" meta={unbudgeted.length ? fmt(totals.other) : null} flush>
            {unbudgeted.length === 0 ? (
              <Empty art="allClear" size="sm" title="Everything had a limit" body="Nothing was spent outside one this month." />
            ) : (
              <div className="pb-2">
                {unbudgeted.slice(0, 8).map(c => (
                  <button key={c.name} type="button" onClick={() => navigate(`/categories/${encodeURIComponent(c.name)}`)} className="w-full flex items-center gap-3 h-12 px-6 hover:bg-[var(--d-hover)] text-left">
                    <CategoryTile cat={c} size="sm" />
                    <span className="flex-1 truncate text-14">{c.name}</span>
                    <span className="d-num text-14 font-medium">{fmt(c.spent)}</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <SweepSheet
        open={sweepOpen}
        onClose={() => setSweepOpen(false)}
        rows={leftovers.rows}
        total={leftovers.total}
        monthLabel={monthLabel(lastMonth)}
        goals={goals ?? []}
        accounts={accounts ?? []}
        onSweep={handleSweep}
        saving={sweeping}
      />
    </Page>
  )
}
