import { useState, useMemo } from 'react'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
// Reused: ~290 lines of debt form plus the partial-payment flow, which writes
// a transaction and adjusts the balance.
import { DebtFormSheet, PaymentSheet } from '../../pages/Debts'
import { WebPageHeader, WebPanel, WebStat, WebEmpty, WebBar, money } from '../components/WebPanel'

const TABS = [
  { key: 'i_owe',      label: 'I owe' },
  { key: 'owed_to_me', label: 'Owed to me' },
]

const remaining = (d) => Math.max(0, (d.amount ?? 0) - (d.amountPaid ?? 0))

function dueInfo(dueDate) {
  if (!dueDate) return null
  const [y, m, dd] = String(dueDate).slice(0, 10).split('-').map(Number)
  if (!y) return null
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const days = Math.round((new Date(y, m - 1, dd) - start) / 864e5)
  return {
    days,
    label: days < 0 ? `${Math.abs(days)}d overdue`
      : days === 0 ? 'Due today'
      : days === 1 ? 'Due tomorrow'
      : `in ${days} days`,
    overdue: days < 0,
  }
}

export default function WebDebts() {
  const debts = useLiveQuery(() => db.debts.toArray(), [], undefined)

  const [tab,       setTab]       = useState('i_owe')
  const [formOpen,  setFormOpen]  = useState(false)
  const [editDebt,  setEditDebt]  = useState(null)
  const [payDebt,   setPayDebt]   = useState(null)

  const forTab = useMemo(() =>
    (debts ?? []).filter(d => d.type === tab), [debts, tab])

  const openItems = useMemo(() =>
    forTab.filter(d => remaining(d) > 0)
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')), [forTab])

  const settled = useMemo(() =>
    forTab.filter(d => remaining(d) <= 0), [forTab])

  const totals = useMemo(() => {
    const sum = (t) => (debts ?? []).filter(d => d.type === t)
      .reduce((s, d) => s + remaining(d), 0)
    return { iOwe: sum('i_owe'), owedToMe: sum('owed_to_me') }
  }, [debts])

  const overdueCount = openItems.filter(d => dueInfo(d.dueDate)?.overdue).length

  if (debts === undefined) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60dvh' }}>
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  const Card = ({ d, dim }) => {
    const rem = remaining(d)
    const paid = d.amountPaid ?? 0
    const pct = (d.amount ?? 0) > 0 ? Math.min(100, (paid / d.amount) * 100) : 0
    const due = dueInfo(d.dueDate)
    return (
      <div className="rounded-xl px-4 py-3.5 bg-slate-50 dark:bg-white/[0.04] min-w-0">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <p className={`text-sm font-semibold truncate ${dim
              ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-white'}`}>
              {d.name || d.contact || 'Unnamed'}
            </p>
            {d.contact && d.name && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{d.contact}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className={`text-sm font-bold tabular-nums ${dim
              ? 'text-slate-500 dark:text-slate-400'
              : tab === 'i_owe' ? 'text-red-600 dark:text-red-400'
                                : 'text-emerald-700 dark:text-emerald-400'}`}>
              {money(dim ? d.amount : rem)}
            </p>
            {!dim && paid > 0 && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {money(paid)} of {money(d.amount)} paid
              </p>
            )}
          </div>
        </div>

        {!dim && paid > 0 && <div className="mb-2"><WebBar pct={pct} tone="good" /></div>}

        <div className="flex items-center justify-between gap-3">
          <p className={`text-[11px] ${due?.overdue
            ? 'text-red-600 dark:text-red-400 font-semibold'
            : 'text-slate-500 dark:text-slate-400'}`}>
            {dim ? 'Settled' : (due?.label ?? 'No due date')}
          </p>
          <div className="flex items-center gap-2">
            {!dim && (
              <button
                onClick={() => setPayDebt(d)}
                className="h-7 px-3 rounded-lg text-[11px] font-semibold text-white bg-primary
                  active:scale-95 transition-transform duration-100"
              >
                Record payment
              </button>
            )}
            <button
              onClick={() => { setEditDebt(d); setFormOpen(true) }}
              className="h-7 px-3 rounded-lg text-[11px] font-semibold
                text-slate-600 dark:text-slate-300 bg-slate-200/70 dark:bg-white/[0.07]
                active:scale-95 transition-transform duration-100"
            >
              Edit
            </button>
          </div>
        </div>

        {d.notes && !dim && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">{d.notes}</p>
        )}
      </div>
    )
  }

  return (
    <>
      <WebPageHeader
        title="Debts"
        subtitle={`${openItems.length} open${overdueCount ? ` · ${overdueCount} overdue` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.05]">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={[
                    'px-3 h-7 rounded-lg text-xs font-semibold transition-colors duration-150',
                    tab === t.key
                      ? 'bg-white dark:bg-white/[0.12] text-slate-800 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setEditDebt(null); setFormOpen(true) }}
              className="h-9 px-4 rounded-xl text-xs font-semibold text-white bg-primary
                active:scale-95 transition-transform duration-100"
            >
              Add debt
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-6 mb-6">
        <WebStat label="I owe"      value={money(totals.iOwe)}
                 tone={totals.iOwe > 0 ? 'bad' : 'good'} hint="Outstanding" />
        <WebStat label="Owed to me" value={money(totals.owedToMe)}
                 tone={totals.owedToMe > 0 ? 'good' : 'default'} hint="Outstanding" />
        <WebStat label="Net"        value={money(totals.owedToMe - totals.iOwe)}
                 tone={totals.owedToMe - totals.iOwe >= 0 ? 'good' : 'bad'} />
      </div>

      {/* items-start so an empty Settled panel sizes to its own content
          rather than matching a long list of open debts. */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <WebPanel title={tab === 'i_owe' ? 'I owe' : 'Owed to me'}
          action={<span className="text-[11px] text-slate-500 dark:text-slate-400">
            {openItems.length} open</span>}>
          {openItems.length === 0 ? <WebEmpty>Nothing outstanding here</WebEmpty> : (
            <div className="flex flex-col gap-3">
              {openItems.map(d => <Card key={d.id} d={d} />)}
            </div>
          )}
        </WebPanel>

        <WebPanel title="Settled"
          action={<span className="text-[11px] text-slate-500 dark:text-slate-400">
            {settled.length}</span>}>
          {settled.length === 0 ? <WebEmpty>Nothing settled yet</WebEmpty> : (
            <div className="flex flex-col gap-3">
              {settled.map(d => <Card key={d.id} d={d} dim />)}
            </div>
          )}
        </WebPanel>
      </div>

      <DebtFormSheet
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditDebt(null) }}
        editDebt={editDebt}
        defaultTab={tab}
      />
      <PaymentSheet
        open={!!payDebt}
        onClose={() => setPayDebt(null)}
        debt={payDebt}
      />
    </>
  )
}
