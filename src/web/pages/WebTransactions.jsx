import { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { scheduledCutoff } from '../../utils/scheduled'
import { isInstallmentRow } from '../../utils/installments'
import TxDetailSheet from '../../components/TxDetailSheet'
import { WebPageHeader, WebPanel, WebEmpty, money } from '../components/WebPanel'
import WebSelect from '../components/WebSelect'

const PAGE = 100

const TYPES = [
  { key: 'all',      label: 'All' },
  { key: 'expense',  label: 'Expenses' },
  { key: 'inflow',   label: 'Income' },
  { key: 'transfer', label: 'Transfers' },
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
    sameYear ? { weekday: 'short', month: 'short', day: 'numeric' }
             : { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmtTime = (s) => s
  ? new Date(s).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
  : ''

export default function WebTransactions() {
  const txAll      = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), [], undefined)
  const accounts   = useLiveQuery(() => db.accounts.toArray(),   [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])

  const [search,   setSearch]   = useState('')
  const [type,     setType]     = useState('all')
  const [account,  setAccount]  = useState('')
  const [category, setCategory] = useState('')
  const [month,    setMonth]    = useState('')
  const [visible,  setVisible]  = useState(PAGE)
  const [selected, setSelected] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const searchRef = useRef(null)

  const deferred = useDeferredValue(search)
  const catMap = useMemo(() =>
    Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])

  // Desktop conventions: "/" jumps to search, Escape steps back out.
  //
  // Both are suppressed while the edit sheet is open — it is a modal with its
  // own inputs and its own Escape — and "/" is suppressed whenever a field has
  // focus, or typing a slash anywhere would yank the caret into the search box.
  useEffect(() => {
    if (sheetOpen) return
    const isTyping = () => {
      const el = document.activeElement
      if (!el) return false
      return el.isContentEditable
        || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
    }
    const onKey = (e) => {
      if (e.key === '/' && !isTyping()) {
        e.preventDefault(); searchRef.current?.focus()
      }
      if (e.key === 'Escape') {
        if (document.activeElement === searchRef.current) searchRef.current.blur()
        else setSelected(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  useEffect(() => { setVisible(PAGE) }, [deferred, type, account, category, month])

  // Months present in the data, newest first — beats a free date picker when
  // you mostly want "show me August".
  const months = useMemo(() => {
    const set = new Set()
    ;(txAll ?? []).forEach(t => { if (t.date) set.add(t.date.slice(0, 7)) })
    return [...set].sort().reverse()
  }, [txAll])

  const filtered = useMemo(() => {
    const q = deferred.trim().toLowerCase()
    // Charges dated ahead are committed, not spent — same rule the mobile
    // history uses, so both agree on what "happened".
    const cutoff = scheduledCutoff()
    return (txAll ?? []).filter(t => {
      if ((t.date ?? '') > cutoff) return false
      if (type !== 'all' && t.type !== type) return false
      if (account && t.account !== account && t.fromAccount !== account && t.toAccount !== account) return false
      if (category && t.category !== category) return false
      if (month && !(t.date ?? '').startsWith(month)) return false
      if (q) {
        const hay = `${t.description ?? ''} ${t.category ?? ''} ${t.account ?? ''} ${t.fromAccount ?? ''} ${t.toAccount ?? ''}`
        if (!hay.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [txAll, deferred, type, account, category, month])

  const totals = useMemo(() => {
    let out = 0, inn = 0
    filtered.forEach(t => {
      if (t.type === 'expense') out += t.amount ?? 0
      if (t.type === 'inflow')  inn += t.amount ?? 0
    })
    return { out, inn }
  }, [filtered])

  const accountOpts = useMemo(() => [
    { value: '', label: 'All accounts' },
    ...(accounts ?? []).map(a => ({ value: a.name, label: a.name })),
  ], [accounts])

  const categoryOpts = useMemo(() => [
    { value: '', label: 'All categories' },
    ...(categories ?? []).map(c => ({ value: c.name, label: `${c.icon ?? ''} ${c.name}`.trim() })),
  ], [categories])

  const monthOpts = useMemo(() => [
    { value: '', label: 'All time' },
    ...months.map(m => ({
      value: m,
      label: new Date(`${m}-01T00:00:00`)
        .toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
    })),
  ], [months])

  const rows = filtered.slice(0, visible)
  const activeFilters = (type !== 'all') + !!account + !!category + !!month

  if (txAll === undefined) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60dvh' }}>
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      <WebPageHeader
        title="Transactions"
        subtitle={`${filtered.length} of ${(txAll ?? []).length} · ${money(totals.out)} out · ${money(totals.inn)} in`}
        actions={activeFilters > 0 ? (
          <button
            onClick={() => { setType('all'); setAccount(''); setCategory(''); setMonth('') }}
            className="h-9 px-4 rounded-xl text-xs font-semibold
              text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/[0.07]
              active:scale-95 transition-transform duration-100"
          >
            Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}
          </button>
        ) : null}
      />

      {/* Controls — one row, which a phone can't do */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-[240px]">
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search description, category or account…  ( / )"
            className="w-full h-9 pl-9 pr-8 rounded-xl text-xs font-medium
              bg-white dark:bg-white/[0.06] text-slate-700 dark:text-slate-200
              placeholder-slate-400 dark:placeholder-slate-500
              border border-slate-200 dark:border-white/[0.09] outline-none
              focus:border-primary dark:focus:border-primary"
          />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
            <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.4" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.05]">
          {TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={[
                'px-3 h-7 rounded-lg text-xs font-semibold transition-colors duration-150',
                type === t.key
                  ? 'bg-white dark:bg-white/[0.12] text-slate-800 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>

        <WebSelect value={account} onChange={setAccount}
          options={accountOpts} ariaLabel="Filter by account" minWidth={160} />

        <WebSelect value={category} onChange={setCategory}
          options={categoryOpts} ariaLabel="Filter by category" minWidth={170} />

        <WebSelect value={month} onChange={setMonth}
          options={monthOpts} ariaLabel="Filter by month" minWidth={160} />
      </div>

      <div className="flex gap-6 items-start min-w-0">
        {/* Table */}
        <div className="flex-1 min-w-0">
          <WebPanel bodyClass="px-0 pb-0">
            {rows.length === 0 ? <WebEmpty>Nothing matches those filters</WebEmpty> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-wide
                    text-slate-400 dark:text-slate-500">
                    <th className="text-left font-semibold px-5 py-2.5">Date</th>
                    <th className="text-left font-semibold px-2 py-2.5">Description</th>
                    <th className="text-left font-semibold px-2 py-2.5">Category</th>
                    <th className="text-left font-semibold px-2 py-2.5">Account</th>
                    <th className="text-right font-semibold px-5 py-2.5">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(t => {
                    const cat = catMap[t.category]
                    const isIn = t.type === 'inflow'
                    const isTr = t.type === 'transfer'
                    const acct = isTr ? `${t.fromAccount ?? '—'} → ${t.toAccount ?? '—'}` : (t.account ?? '—')
                    const active = selected?.id === t.id
                    return (
                      // Rows are the only way into the detail pane, so they
                      // have to be reachable without a mouse: focusable, with
                      // Enter/Space selecting and a visible focus ring.
                      <tr
                        key={t.id}
                        tabIndex={0}
                        role="button"
                        aria-pressed={active}
                        aria-label={`${t.description || t.category || 'Transaction'}, ${money(t.amount)}`}
                        onClick={() => setSelected(t)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault(); setSelected(t)
                          }
                        }}
                        className={[
                          'border-t border-slate-100 dark:border-white/[0.05] cursor-pointer',
                          'outline-none focus-visible:ring-2 focus-visible:ring-primary',
                          'focus-visible:ring-inset',
                          active
                            ? 'bg-primary/[0.07] dark:bg-primary/[0.12]'
                            : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]',
                        ].join(' ')}
                      >
                        <td className="px-5 py-3 whitespace-nowrap align-top">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{fmtDay(t.date)}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">{fmtTime(t.date)}</p>
                        </td>
                        <td className="px-2 py-3 min-w-0 align-top">
                          <p className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[280px]">
                            {t.description || (isTr ? 'Transfer' : t.category) || '—'}
                          </p>
                          {isInstallmentRow(t) && (
                            <span className="inline-block mt-0.5 text-[9px] font-semibold uppercase tracking-wide
                              px-1.5 py-0.5 rounded-full bg-primary/[0.12] text-primary">
                              Installment
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap align-top text-xs text-slate-500 dark:text-slate-400">
                          {cat?.icon} {t.category ?? '—'}
                        </td>
                        <td className="px-2 py-3 align-top text-xs text-slate-500 dark:text-slate-400">
                          <span className="truncate inline-block max-w-[200px]">{acct}</span>
                        </td>
                        <td className={[
                          'px-5 py-3 text-right font-bold tabular-nums whitespace-nowrap align-top',
                          isIn ? 'text-emerald-600 dark:text-emerald-400'
                               : isTr ? 'text-slate-600 dark:text-slate-300'
                                      : 'text-slate-800 dark:text-slate-100',
                        ].join(' ')}>
                          {isIn ? '+' : t.type === 'expense' ? '−' : ''}{money(t.amount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {filtered.length > visible && (
              <div className="px-5 py-4 border-t border-slate-100 dark:border-white/[0.05]">
                <button
                  onClick={() => setVisible(v => v + PAGE)}
                  className="w-full h-9 rounded-xl text-xs font-semibold
                    text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/[0.06]
                    active:scale-[0.99] transition-transform duration-100"
                >
                  Show {Math.min(PAGE, filtered.length - visible)} more
                  <span className="text-slate-400 dark:text-slate-500 font-medium">
                    {' '}· {filtered.length - visible} remaining
                  </span>
                </button>
              </div>
            )}
          </WebPanel>
        </div>

        {/* Detail pane — the landscape win: inspect without losing your place */}
        <aside className="w-[340px] shrink-0 sticky top-0">
          {!selected ? (
            <WebPanel title="Details">
              <p className="text-xs text-slate-400 dark:text-slate-500 py-6 text-center leading-relaxed">
                Select a transaction to see its details.
                <br />
                <span className="text-[11px]">Press <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-white/[0.08] font-mono">/</kbd> to search,
                {' '}<kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-white/[0.08] font-mono">Esc</kbd> to clear.</span>
              </p>
            </WebPanel>
          ) : (
            <WebPanel
              title="Details"
              action={
                <button onClick={() => setSelected(null)} aria-label="Close details"
                  className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              }
            >
              <p className={[
                'text-2xl font-bold tabular-nums mb-1',
                selected.type === 'inflow' ? 'text-emerald-600 dark:text-emerald-400'
                  : selected.type === 'expense' ? 'text-red-500 dark:text-red-400'
                  : 'text-primary',
              ].join(' ')}>
                {selected.type === 'inflow' ? '+' : selected.type === 'expense' ? '−' : ''}
                {money(selected.amount)}
              </p>
              {selected.description && (
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{selected.description}</p>
              )}

              <dl className="flex flex-col gap-2 mb-5">
                {[
                  ['Type',     selected.type],
                  ['Category', `${catMap[selected.category]?.icon ?? ''} ${selected.category ?? '—'}`],
                  ['Account',  selected.type === 'transfer'
                    ? `${selected.fromAccount ?? '—'} → ${selected.toAccount ?? '—'}`
                    : (selected.account ?? '—')],
                  ['Date',     `${fmtDay(selected.date)} · ${fmtTime(selected.date)}`],
                  ...(selected.synced === 1 ? [] : [['Sync', 'Pending upload']]),
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-3">
                    <dt className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">{k}</dt>
                    <dd className="text-xs font-medium text-slate-700 dark:text-slate-200 text-right capitalize">{v}</dd>
                  </div>
                ))}
              </dl>

              {/* Edit and delete delegate to the existing sheet, which owns the
                  balance reversal, tombstones, plan grouping and undo. None of
                  that is reimplemented here. */}
              <button
                onClick={() => setSheetOpen(true)}
                className="w-full h-9 rounded-xl text-xs font-semibold text-white bg-primary
                  active:scale-[0.98] transition-transform duration-100"
              >
                Edit or delete
              </button>
            </WebPanel>
          )}
        </aside>
      </div>

      <TxDetailSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setSelected(null) }}
        transaction={selected}
        accounts={accounts ?? []}
        categories={categories ?? []}
        zIndex={160}
      />
    </>
  )
}
