import { useState, useMemo, useEffect } from 'react'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { getCreditStatus, getNextCycleRange } from '../../utils/creditCycle'
import { isInstallmentRow } from '../../utils/installments'
import TxDetailSheet from '../../components/TxDetailSheet'
// Reused rather than rebuilt — AccountFormSheet alone is ~700 lines of
// validated form logic, and QuickAddSheet carries the 48 PH presets.
import { AccountFormSheet, QuickAddSheet } from '../../pages/Accounts'
import { WebPageHeader, WebPanel, WebStat, WebEmpty, WebBar, money, moneyCompact } from '../components/WebPanel'

const GROUPS = [
  { key: 'cash',    label: 'Cash',          types: ['cash'] },
  { key: 'ewallet', label: 'E-Wallets',     types: ['ewallet'] },
  { key: 'bank',    label: 'Bank Accounts', types: ['bank', 'savings'] },
  { key: 'credit',  label: 'Credit Cards',  types: ['credit'] },
]

function fmtDay(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const tmrw = new Date(now); tmrw.setDate(now.getDate() + 1)
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (d >= now && d < tmrw) return 'Today'
  if (d >= yest && d < now) return 'Yesterday'
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-PH',
    sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

const cycleDay = (d) => d
  ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  : '—'

function nextOccurrence(day) {
  if (!day) return null
  const now = new Date()
  const clamp = (y, m) => Math.min(day, new Date(y, m + 1, 0).getDate())
  let y = now.getFullYear(), m = now.getMonth()
  if (now.getDate() > clamp(y, m)) { m += 1; if (m > 11) { m = 0; y += 1 } }
  return new Date(y, m, clamp(y, m))
}

/** One row of an account's ledger. Tappable so it reaches TxDetailSheet. */
function LedgerRow({ tx, accountName, catMap, onSelect }) {
  let sign = '', tone = 'text-slate-700 dark:text-slate-200'
  if (tx.type === 'expense' && tx.account === accountName) { sign = '−'; tone = 'text-red-500 dark:text-red-400' }
  else if (tx.type === 'inflow' && tx.account === accountName) { sign = '+'; tone = 'text-emerald-600 dark:text-emerald-400' }
  else if (tx.type === 'transfer') {
    if (tx.fromAccount === accountName) { sign = '−'; tone = 'text-red-500 dark:text-red-400' }
    if (tx.toAccount === accountName)   { sign = '+'; tone = 'text-emerald-600 dark:text-emerald-400' }
  }
  const label = tx.description || (tx.type === 'transfer'
    ? (tx.fromAccount === accountName ? `→ ${tx.toAccount}` : `← ${tx.fromAccount}`)
    : (tx.category ?? '—'))

  return (
    <button
      onClick={() => onSelect(tx)}
      className="w-full text-left flex items-center gap-3 px-5 py-2.5
        border-t border-slate-100 dark:border-white/[0.05]
        hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
    >
      <span className="w-6 text-base shrink-0">{catMap[tx.category]?.icon ?? '📦'}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-100 truncate">{label}</span>
        <span className="block text-[10px] text-slate-400 dark:text-slate-500">
          {fmtDay(tx.date)}{isInstallmentRow(tx) ? ' · installment' : ''}
        </span>
      </span>
      <span className={`text-[13px] font-bold tabular-nums shrink-0 ${tone}`}>
        {sign}{money(tx.amount)}
      </span>
    </button>
  )
}

export default function WebAccounts() {
  const accounts     = useLiveQuery(() => db.accounts.toArray(),     [], undefined)
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [])
  const categories   = useLiveQuery(() => db.categories.toArray(),   [], [])

  const [selectedName, setSelectedName] = useState(null)
  const [selectedTx,   setSelectedTx]   = useState(null)
  const [quickOpen,    setQuickOpen]    = useState(false)
  const [formOpen,     setFormOpen]     = useState(false)
  const [formPrefill,  setFormPrefill]  = useState(null)
  const [editing,      setEditing]      = useState(null)

  const catMap = useMemo(() =>
    Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])

  // Select the first account once loaded so the detail side is never blank.
  useEffect(() => {
    if (!selectedName && (accounts ?? []).length) setSelectedName(accounts[0].name)
  }, [accounts, selectedName])

  const selected = useMemo(() =>
    (accounts ?? []).find(a => a.name === selectedName) ?? null, [accounts, selectedName])

  // Unfiltered on purpose — available credit must see future installments,
  // which is exactly what the history hides.
  const creditStatus = useMemo(() => {
    const m = {}
    ;(accounts ?? []).filter(a => a.type === 'credit').forEach(a => {
      m[a.name] = getCreditStatus(a, transactions ?? [])
    })
    return m
  }, [accounts, transactions])

  const totals = useMemo(() => {
    const assets = (accounts ?? []).filter(a => a.type !== 'credit')
      .reduce((s, a) => s + (a.balance ?? 0), 0)
    const credit = Object.values(creditStatus).reduce((s, st) => s + (st.currentBalance ?? 0), 0)
    return { assets, credit, net: assets - credit }
  }, [accounts, creditStatus])

  const grouped = useMemo(() => GROUPS.map(g => ({
    ...g,
    items: (accounts ?? []).filter(a => g.types.includes(a.type)),
  })).filter(g => g.items.length), [accounts])

  const ledger = useMemo(() => {
    if (!selected) return []
    return (transactions ?? [])
      .filter(t => t.account === selected.name || t.fromAccount === selected.name || t.toAccount === selected.name)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }, [transactions, selected])

  const st = selected?.type === 'credit' ? (creditStatus[selected.name] ?? {}) : null

  if (accounts === undefined) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60dvh' }}>
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      <WebPageHeader
        title="Accounts"
        subtitle={`${(accounts ?? []).length} account${(accounts ?? []).length === 1 ? '' : 's'}`}
        actions={
          <button
            onClick={() => setQuickOpen(true)}
            className="h-9 px-4 rounded-xl text-xs font-semibold text-white bg-primary
              active:scale-95 transition-transform duration-100"
          >
            Add account
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <WebStat label="Assets"      value={money(totals.assets)} hint="Cash, wallets & banks" />
        <WebStat label="Credit used" value={money(totals.credit)} tone={totals.credit > 0 ? 'bad' : 'good'}
                 hint="Outstanding on cards" />
        <WebStat label="Net worth"   value={money(totals.net)} tone={totals.net < 0 ? 'bad' : 'default'} />
      </div>

      <div className="flex gap-6 items-start min-w-0">
        {/* Master */}
        <div className="w-[320px] shrink-0 flex flex-col gap-4">
          {grouped.map(g => (
            <WebPanel key={g.key} title={g.label} bodyClass="px-2 pb-2"
              action={<span className="text-[11px] font-semibold tabular-nums text-slate-400 dark:text-slate-500">
                {moneyCompact(g.key === 'credit'
                  ? g.items.reduce((s, a) => s + (creditStatus[a.name]?.currentBalance ?? 0), 0)
                  : g.items.reduce((s, a) => s + (a.balance ?? 0), 0))}
              </span>}>
              {g.items.map(a => {
                const active = a.name === selectedName
                const cs = creditStatus[a.name]
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedName(a.name)}
                    className={[
                      'w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl',
                      'transition-colors duration-150',
                      active ? 'bg-primary/[0.10] dark:bg-primary/[0.16]'
                             : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]',
                    ].join(' ')}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: a.color || 'var(--color-primary)' }} />
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[13px] font-medium truncate
                        ${active ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>
                        {a.name}
                      </span>
                      {a.type === 'credit' && (
                        <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                          {money((a.creditLimit ?? 0) - (cs?.currentBalance ?? 0))} avail
                        </span>
                      )}
                    </span>
                    <span className={`text-[13px] font-bold tabular-nums shrink-0
                      ${a.type === 'credit' ? 'text-red-500 dark:text-red-400'
                                            : 'text-slate-700 dark:text-slate-200'}`}>
                      {moneyCompact(a.type === 'credit' ? (cs?.currentBalance ?? 0) : (a.balance ?? 0))}
                    </span>
                  </button>
                )
              })}
            </WebPanel>
          ))}
        </div>

        {/* Detail */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          {!selected ? (
            <WebPanel title="Account"><WebEmpty>No accounts yet</WebEmpty></WebPanel>
          ) : (
            <>
              <WebPanel
                title={selected.name}
                action={
                  <button
                    onClick={() => { setEditing(selected); setFormPrefill(null); setFormOpen(true) }}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Edit
                  </button>
                }
              >
                {selected.type === 'credit' ? (
                  <>
                    <div className="flex items-end justify-between gap-4 mb-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          Balance used
                        </p>
                        <p className="text-3xl font-bold tabular-nums text-red-500 dark:text-red-400">
                          {money(st.currentBalance ?? 0)}
                        </p>
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 text-right">
                        {money((selected.creditLimit ?? 0) - (st.currentBalance ?? 0))} available
                        <br />of {money(selected.creditLimit)} limit
                      </p>
                    </div>
                    <WebBar
                      pct={(selected.creditLimit ?? 0) > 0 ? ((st.currentBalance ?? 0) / selected.creditLimit) * 100 : 0}
                      tone={((st.currentBalance ?? 0) / Math.max(selected.creditLimit ?? 1, 1)) >= 0.9 ? 'bad'
                          : ((st.currentBalance ?? 0) / Math.max(selected.creditLimit ?? 1, 1)) >= 0.7 ? 'warn' : 'accent'}
                    />
                    <div className="grid grid-cols-4 gap-3 mt-5">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Statement</p>
                        <p className={`text-sm font-bold tabular-nums mt-0.5 ${st.stmtPaid
                          ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-white'}`}>
                          {st.stmtPaid ? 'Paid' : money(st.thisTotal ?? 0)}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">
                          {cycleDay(st.cycleStart)} – {cycleDay(st.cycleEnd)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Unbilled</p>
                        <p className="text-sm font-bold tabular-nums mt-0.5 text-slate-800 dark:text-white">
                          {money(st.nextTotal ?? 0)}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">
                          from {cycleDay(getNextCycleRange(selected.cutoffDate).cycleStart)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Paid</p>
                        <p className="text-sm font-bold tabular-nums mt-0.5 text-emerald-600 dark:text-emerald-400">
                          {money(st.totalPayments ?? 0)}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">since cutoff</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Due</p>
                        <p className="text-sm font-bold tabular-nums mt-0.5 text-slate-800 dark:text-white">
                          {cycleDay(nextOccurrence(selected.dueDate))}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">
                          min {moneyCompact(selected.minimumPayment ?? 0)}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Balance
                      </p>
                      <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {money(selected.balance)}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 text-right capitalize">
                      {selected.type}{selected.role ? ` · ${selected.role}` : ''}
                      <br />{ledger.length} transaction{ledger.length === 1 ? '' : 's'}
                    </p>
                  </div>
                )}
              </WebPanel>

              <WebPanel
                title="Ledger"
                flush
                action={<span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {ledger.length} entr{ledger.length === 1 ? 'y' : 'ies'}
                </span>}
              >
                {ledger.length === 0 ? <WebEmpty>No activity on this account</WebEmpty> : (
                  <div className="max-h-[520px] overflow-y-auto">
                    {ledger.slice(0, 200).map(t => (
                      <LedgerRow key={t.id} tx={t} accountName={selected.name}
                        catMap={catMap} onSelect={setSelectedTx} />
                    ))}
                  </div>
                )}
              </WebPanel>
            </>
          )}
        </div>
      </div>

      {/* All three sheets are the mobile components, reused as-is. */}
      <QuickAddSheet
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onPickPreset={(preset) => {
          setQuickOpen(false); setEditing(null); setFormPrefill(preset)
          setTimeout(() => setFormOpen(true), 0)
        }}
        onCustom={() => {
          setQuickOpen(false); setEditing(null); setFormPrefill(null)
          setTimeout(() => setFormOpen(true), 0)
        }}
      />
      <AccountFormSheet
        open={formOpen}
        onClose={() => { setFormOpen(false); setFormPrefill(null); setEditing(null) }}
        account={editing}
        prefill={formPrefill}
      />
      <TxDetailSheet
        open={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
        accounts={accounts ?? []}
        categories={categories ?? []}
        zIndex={160}
      />
    </>
  )
}
