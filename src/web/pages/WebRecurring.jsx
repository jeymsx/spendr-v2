import { useState, useMemo } from 'react'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useToast } from '../../context/ToastContext'
import { toMonthlyAmount } from '../../utils/recurring'
import { postRecurringCharge } from '../../db/txHelpers'
import OverdrawWarningSheet from '../../components/OverdrawWarningSheet'
// Reused: ~370 lines of validated form, frequency handling and delete flow.
import { RecurringFormSheet } from '../../pages/Recurring'
import { WebPageHeader, WebPanel, WebStat, WebEmpty, money, moneyCompact } from '../components/WebPanel'

const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }

function daysAway(nextDate) {
  const [y, m, d] = String(nextDate ?? '').slice(0, 10).split('-').map(Number)
  if (!y) return null
  const start = new Date(); start.setHours(0, 0, 0, 0)
  return Math.round((new Date(y, m - 1, d) - start) / 864e5)
}

function dueLabel(n) {
  if (n == null) return '—'
  if (n < 0)  return `${Math.abs(n)}d overdue`
  if (n === 0) return 'Due today'
  if (n === 1) return 'Due tomorrow'
  return `in ${n} days`
}

export default function WebRecurring() {
  const { showToast } = useToast()
  const items      = useLiveQuery(() => db.recurring.toArray(),  [], undefined)
  const accounts   = useLiveQuery(() => db.accounts.toArray(),   [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])

  const [formOpen, setFormOpen] = useState(false)
  const [editRec,  setEditRec]  = useState(null)
  const [posting,  setPosting]  = useState(null)
  const [overdraw, setOverdraw] = useState(null)

  const catMap = useMemo(() =>
    Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])

  const active = useMemo(() => (items ?? []).filter(r => r.active !== false), [items])
  const paused = useMemo(() => (items ?? []).filter(r => r.active === false), [items])

  const monthlyTotal = useMemo(() =>
    active.reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0), [active])

  const sorted = useMemo(() =>
    [...active].sort((a, b) => (a.nextDate ?? '').localeCompare(b.nextDate ?? '')), [active])

  const dueNow = sorted.filter(r => { const d = daysAway(r.nextDate); return d != null && d <= 0 })

  // Same handler shape as the mobile page: postRecurringCharge owns the write,
  // and an OverdrawError becomes a sheet the user can override.
  async function handlePost(rec, { force = false } = {}) {
    setPosting(rec.id)
    try {
      await postRecurringCharge(rec, { allowOverdraw: force })
      showToast(`${rec.name} posted!`)
    } catch (e) {
      if (e?.name === 'OverdrawError') {
        setOverdraw({ rec, accountName: e.account, balance: e.balance, amount: e.amount })
        return
      }
      console.error('[WebRecurring] post failed:', e)
      showToast('Failed to post', 'error')
    } finally {
      setPosting(null)
    }
  }

  async function toggle(rec) {
    try {
      await db.recurring.update(rec.id, { active: rec.active === false, updatedAt: new Date().toISOString() })
    } catch (e) {
      console.error('[WebRecurring] toggle failed:', e)
      showToast('Failed to update', 'error')
    }
  }

  if (items === undefined) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60dvh' }}>
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  const Row = ({ r, dim }) => {
    const d = daysAway(r.nextDate)
    const late = d != null && d < 0
    const due = d != null && d <= 0
    return (
      <tr className="border-t border-slate-100 dark:border-white/[0.05]">
        <td className="px-5 py-3 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-base shrink-0">{catMap[r.category]?.icon ?? '🔄'}</span>
            <div className="min-w-0">
              <p className={`text-sm font-medium truncate ${dim
                ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
                {r.name}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                {r.category} · {r.account}
              </p>
            </div>
          </div>
        </td>
        <td className="px-2 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {FREQ_LABEL[r.frequency] ?? r.frequency}
        </td>
        <td className="px-2 py-3 whitespace-nowrap">
          <span className={`text-xs font-medium ${late
            ? 'text-red-500 dark:text-red-400'
            : due ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400'}`}>
            {dueLabel(d)}
          </span>
        </td>
        <td className="px-2 py-3 text-right font-bold tabular-nums whitespace-nowrap
          text-slate-800 dark:text-slate-100">
          {money(r.amount)}
        </td>
        <td className="px-5 py-3 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-2">
            {!dim && (
              <button
                onClick={() => handlePost(r)}
                disabled={posting === r.id}
                className="h-8 px-3 rounded-lg text-xs font-semibold text-white bg-primary
                  disabled:opacity-40 active:scale-95 transition-transform duration-100"
              >
                {posting === r.id ? 'Posting…' : 'Post now'}
              </button>
            )}
            <button
              onClick={() => { setEditRec(r); setFormOpen(true) }}
              className="h-8 px-3 rounded-lg text-xs font-semibold
                text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06]
                active:scale-95 transition-transform duration-100"
            >
              Edit
            </button>
            <button
              onClick={() => toggle(r)}
              className="h-8 px-3 rounded-lg text-xs font-semibold
                text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]
                transition-colors"
            >
              {dim ? 'Resume' : 'Pause'}
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <>
      <WebPageHeader
        title="Recurring"
        subtitle={`${active.length} active · ${paused.length} paused`}
        actions={
          <button
            onClick={() => { setEditRec(null); setFormOpen(true) }}
            className="h-9 px-4 rounded-xl text-xs font-semibold text-white bg-primary
              active:scale-95 transition-transform duration-100"
          >
            Add recurring
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <WebStat label="Monthly commitment" value={money(monthlyTotal)}
                 hint="All frequencies normalised" />
        <WebStat label="Due now" value={String(dueNow.length)}
                 tone={dueNow.length ? 'bad' : 'good'}
                 hint={dueNow.length ? money(dueNow.reduce((s, r) => s + (r.amount ?? 0), 0)) : 'Nothing outstanding'} />
        <WebStat label="Yearly" value={moneyCompact(monthlyTotal * 12)} hint="At current rate" />
      </div>

      <WebPanel title="Active" bodyClass="px-0 pb-2">
        {sorted.length === 0 ? <WebEmpty>No recurring payments yet</WebEmpty> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <th className="text-left font-semibold px-5 py-2.5">Bill</th>
                <th className="text-left font-semibold px-2 py-2.5">Frequency</th>
                <th className="text-left font-semibold px-2 py-2.5">Next</th>
                <th className="text-right font-semibold px-2 py-2.5">Amount</th>
                <th className="text-right font-semibold px-5 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>{sorted.map(r => <Row key={r.id} r={r} />)}</tbody>
          </table>
        )}
      </WebPanel>

      {paused.length > 0 && (
        <div className="mt-6">
          <WebPanel title="Paused" bodyClass="px-0 pb-2">
            <table className="w-full text-sm">
              <tbody>{paused.map(r => <Row key={r.id} r={r} dim />)}</tbody>
            </table>
          </WebPanel>
        </div>
      )}

      <RecurringFormSheet
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditRec(null) }}
        editRec={editRec}
        categories={categories ?? []}
        accounts={accounts ?? []}
      />
      <OverdrawWarningSheet
        open={!!overdraw}
        onClose={() => setOverdraw(null)}
        onSaveAnyway={() => {
          const pending = overdraw
          setOverdraw(null)
          if (pending) handlePost(pending.rec, { force: true })
        }}
        accountName={overdraw?.accountName}
        balance={overdraw?.balance}
        amount={overdraw?.amount}
      />
    </>
  )
}
