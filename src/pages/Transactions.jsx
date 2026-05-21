import { useState, useMemo, useEffect, useCallback } from 'react'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import TxDetailSheet from '../components/TxDetailSheet'

// ── Formatters ─────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

function fmtTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function fmtGroupDate(dateKey) {
  if (!dateKey) return 'Unknown'
  const d = new Date(dateKey + 'T00:00:00')
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (d.getTime() === now.getTime())  return 'Today'
  if (d.getTime() === yest.getTime()) return 'Yesterday'
  const isThisYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric',
    ...(isThisYear ? {} : { year: 'numeric' }),
  })
}

// ── Date range helper ──────────────────────────────────────────────────────────

function inDateRange(tx, range, customFrom, customTo) {
  if (range === 'all') return true
  const txDate = new Date(tx.date ?? 0)
  const today  = new Date(); today.setHours(0, 0, 0, 0)

  if (range === 'week') {
    const start = new Date(today); start.setDate(today.getDate() - today.getDay())
    return txDate >= start
  }
  if (range === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return txDate >= start
  }
  if (range === 'last_month') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const end   = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999)
    return txDate >= start && txDate <= end
  }
  if (range === 'custom') {
    if (customFrom) {
      const from = new Date(customFrom); from.setHours(0, 0, 0, 0)
      if (txDate < from) return false
    }
    if (customTo) {
      const to = new Date(customTo); to.setHours(23, 59, 59, 999)
      if (txDate > to) return false
    }
    return true
  }
  return true
}

// ── Grouping ───────────────────────────────────────────────────────────────────

function groupByDate(txs) {
  const map = new Map()
  txs.forEach(tx => {
    const key = tx.date?.slice(0, 10) ?? 'unknown'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(tx)
  })
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, txs]) => ({ date, txs }))
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

const TYPE_OPTS = [
  { value: 'all',      label: 'All'      },
  { value: 'expense',  label: 'Expense'  },
  { value: 'inflow',   label: 'Inflow'   },
  { value: 'transfer', label: 'Transfer' },
]

const DATE_OPTS = [
  { value: 'all',        label: 'All time'   },
  { value: 'week',       label: 'This week'  },
  { value: 'month',      label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom',     label: 'Custom…'    },
]

const AMOUNT_COLOR = {
  expense:  { cls: 'text-red-500 dark:text-red-400',         sign: '−' },
  inflow:   { cls: 'text-emerald-600 dark:text-emerald-400', sign: '+' },
  transfer: { cls: 'text-blue-500 dark:text-blue-400',       sign: ''  },
}

// ── Filter modal ───────────────────────────────────────────────────────────────

function FilterModal({
  open, onClose,
  typeFilter, setTypeFilter,
  dateRange, setDateRange,
  customFrom, setCustomFrom,
  customTo, setCustomTo,
  accountFilter, setAccountFilter,
  categoryFilter, setCategoryFilter,
  accounts, categories,
  activeCount, onClear,
}) {
  const [closing, setClosing] = useState(false)

  const close = useCallback(() => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open && !closing) return null

  const catOpts = (categories ?? []).filter(c => c.type !== 'transfer')

  function Chip({ label, active, onClick, dot }) {
    return (
      <button
        onClick={onClick}
        className={[
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold',
          'active:scale-95 transition-all duration-75 whitespace-nowrap',
          active
            ? 'bg-primary text-white shadow-[0_2px_8px_rgba(45,157,255,0.35)]'
            : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400',
        ].join(' ')}
      >
        {dot && (
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: active ? 'rgba(255,255,255,0.7)' : dot }} />
        )}
        {label}
      </button>
    )
  }

  function SectionLabel({ children }) {
    return (
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
        {children}
      </p>
    )
  }

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
          'max-h-[80vh] flex flex-col',
        ].join(' ')}
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
      >
        {/* Header */}
        <div className="pt-5 px-5 pb-3 border-b border-slate-50 dark:border-white/[0.04] shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800 dark:text-white">Filters</h3>
            <div className="flex items-center gap-3">
              {activeCount > 0 && (
                <button
                  onClick={onClear}
                  className="text-xs font-semibold text-primary active:opacity-60"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={close}
                className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60"
              >
                Done
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-5">

          {/* Type */}
          <div>
            <SectionLabel>Type</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTS.map(o => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={typeFilter === o.value}
                  onClick={() => setTypeFilter(o.value)}
                />
              ))}
            </div>
          </div>

          {/* Date range */}
          <div>
            <SectionLabel>Date Range</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {DATE_OPTS.map(o => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={dateRange === o.value}
                  onClick={() => setDateRange(o.value)}
                />
              ))}
            </div>
            {dateRange === 'custom' && (
              <div className="flex flex-col gap-2 mt-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-0.5">From</span>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl text-sm font-medium
                      text-slate-700 dark:text-white
                      bg-slate-50 dark:bg-white/[0.06]
                      border border-slate-200/80 dark:border-white/[0.09]
                      outline-none focus:ring-2 focus:ring-primary/30
                      [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-0.5">To</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={e => setCustomTo(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl text-sm font-medium
                      text-slate-700 dark:text-white
                      bg-slate-50 dark:bg-white/[0.06]
                      border border-slate-200/80 dark:border-white/[0.09]
                      outline-none focus:ring-2 focus:ring-primary/30
                      [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Accounts */}
          {(accounts ?? []).length > 0 && (
            <div>
              <SectionLabel>Account</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {(accounts ?? []).map(a => (
                  <Chip
                    key={a.id}
                    label={a.name}
                    active={accountFilter === a.name}
                    dot={a.color}
                    onClick={() => setAccountFilter(accountFilter === a.name ? null : a.name)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Categories */}
          {catOpts.length > 0 && (
            <div>
              <SectionLabel>Category</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {catOpts.map(c => (
                  <Chip
                    key={c.id}
                    label={`${c.icon} ${c.name}`}
                    active={categoryFilter === c.name}
                    onClick={() => setCategoryFilter(categoryFilter === c.name ? null : c.name)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryItem({ label, value, colorCls }) {
  return (
    <div className="text-center">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">
        {label}
      </p>
      <p className={`text-sm font-bold tabular-nums ${colorCls}`}>{value}</p>
    </div>
  )
}

function TxRow({ tx, catMap, onClick }) {
  const cat = catMap[tx.category]
  const { cls, sign } = AMOUNT_COLOR[tx.type] ?? AMOUNT_COLOR.expense

  return (
    <button
      onClick={() => onClick(tx)}
      className="w-full flex items-center gap-3 px-4 py-3 text-left
        active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
    >
      {/* category icon */}
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-[18px]"
        style={{ backgroundColor: (cat?.color ?? '#2D9DFF') + '22' }}
      >
        {cat?.icon ?? '💸'}
      </div>

      {/* description + account */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate leading-snug">
          {tx.description || tx.category || '—'}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
          {tx.type === 'transfer'
            ? `${tx.fromAccount ?? ''} → ${tx.toAccount ?? ''}`
            : (tx.account ?? '')}
          {cat && tx.type !== 'transfer' && (
            <span className="ml-1.5 text-slate-300 dark:text-slate-600">· {cat.name}</span>
          )}
        </p>
      </div>

      {/* amount + time */}
      <div className="text-right shrink-0">
        <p className={`text-[13px] font-bold tabular-nums ${cls}`}>
          {sign}{fmt(tx.amount)}
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{fmtTime(tx.date)}</p>
      </div>
    </button>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <div className="w-20 h-20 rounded-3xl bg-slate-100 dark:bg-white/[0.05] flex items-center justify-center mb-5">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
          <rect x="2" y="5" width="20" height="14" rx="3" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <line x1="6" y1="15" x2="10" y2="15" />
          <line x1="6" y1="18" x2="8" y2="18" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No transactions found</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Try adjusting your filters</p>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Transactions() {
  // ── live data ─────────────────────────────────────────────────────────────────
  const txAll      = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), [], [])
  const accounts   = useLiveQuery(() => db.accounts.toArray(),   [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])

  // ── filter state ──────────────────────────────────────────────────────────────
  const [search,          setSearch]          = useState('')
  const [typeFilter,      setTypeFilter]      = useState('all')
  const [accountFilter,   setAccountFilter]   = useState(null)
  const [categoryFilter,  setCategoryFilter]  = useState(null)
  const [dateRange,       setDateRange]       = useState('all')
  const [customFrom,      setCustomFrom]      = useState('')
  const [customTo,        setCustomTo]        = useState('')
  const [searchExpanded,  setSearchExpanded]  = useState(false)
  const [filterOpen,      setFilterOpen]      = useState(false)

  // ── pagination ────────────────────────────────────────────────────────────────
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // ── detail sheet ─────────────────────────────────────────────────────────────
  const [selectedTx, setSelectedTx] = useState(null)

  // reset pagination when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search, typeFilter, accountFilter, categoryFilter, dateRange, customFrom, customTo])

  // ── derived ───────────────────────────────────────────────────────────────────
  const catMap = useMemo(() =>
    Object.fromEntries((categories ?? []).map(c => [c.name, c])),
    [categories],
  )

  const filteredTx = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (txAll ?? []).filter(tx => {
      if (q && !(tx.description ?? '').toLowerCase().includes(q) &&
               !(tx.category   ?? '').toLowerCase().includes(q)) return false
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false
      if (accountFilter && tx.account !== accountFilter &&
                           tx.fromAccount !== accountFilter &&
                           tx.toAccount   !== accountFilter) return false
      if (categoryFilter && tx.category !== categoryFilter) return false
      if (!inDateRange(tx, dateRange, customFrom, customTo)) return false
      return true
    })
  }, [txAll, search, typeFilter, accountFilter, categoryFilter, dateRange, customFrom, customTo])

  const summary = useMemo(() => {
    let totalIn = 0, totalOut = 0
    filteredTx.forEach(tx => {
      if (tx.type === 'inflow')  totalIn  += tx.amount ?? 0
      if (tx.type === 'expense') totalOut += tx.amount ?? 0
    })
    return { totalIn, totalOut, net: totalIn - totalOut }
  }, [filteredTx])

  const visibleTx = useMemo(() => filteredTx.slice(0, visibleCount), [filteredTx, visibleCount])
  const groups    = useMemo(() => groupByDate(visibleTx), [visibleTx])
  const hasMore   = filteredTx.length > visibleCount

  const activeFilterCount = (typeFilter !== 'all' ? 1 : 0) +
    (dateRange !== 'all' ? 1 : 0) +
    (accountFilter ? 1 : 0) +
    (categoryFilter ? 1 : 0)

  function clearFilters() {
    setTypeFilter('all')
    setDateRange('all')
    setCustomFrom('')
    setCustomTo('')
    setAccountFilter(null)
    setCategoryFilter(null)
  }

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div className="pb-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-safe-header pb-3">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Transactions
        </h1>
        <div className="flex items-center gap-2">
          {/* Filter button */}
          <button
            onClick={() => setFilterOpen(true)}
            className={[
              'relative w-9 h-9 rounded-2xl flex items-center justify-center transition-colors duration-150',
              'border shadow-sm',
              activeFilterCount > 0
                ? 'bg-primary border-primary text-white'
                : 'bg-white dark:bg-primary/[0.10] border-slate-200/80 dark:border-primary/[0.20] text-slate-500 dark:text-slate-300 dark:shadow-[inset_0_1px_0_rgba(45,157,255,0.12)]',
            ].join(' ')}
            aria-label="Filters"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="8" y1="12" x2="16" y2="12" />
              <line x1="11" y1="18" x2="13" y2="18" />
            </svg>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-primary text-[9px] font-bold flex items-center justify-center shadow">
                {activeFilterCount}
              </span>
            )}
          </button>
          {/* Search button */}
          <button
            onClick={() => { setSearchExpanded(v => !v); if (searchExpanded) setSearch('') }}
            className={[
              'w-9 h-9 rounded-2xl flex items-center justify-center transition-colors duration-150',
              'border shadow-sm',
              searchExpanded
                ? 'bg-primary border-primary text-white'
                : 'bg-white dark:bg-primary/[0.10] border-slate-200/80 dark:border-primary/[0.20] text-slate-500 dark:text-slate-300 dark:shadow-[inset_0_1px_0_rgba(45,157,255,0.12)]',
            ].join(' ')}
            aria-label="Toggle search"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Search bar (collapsible) ── */}
      {searchExpanded && (
        <div className="px-5 mb-3">
          <div className="flex items-center gap-3 px-4 h-[44px] rounded-2xl
            bg-white dark:bg-primary/[0.07]
            border border-slate-200/80 dark:border-primary/[0.14]
            shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_rgba(45,157,255,0.08)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 shrink-0">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              autoFocus
              type="text"
              placeholder="Search by description or category…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-slate-800 dark:text-white
                placeholder-slate-400 dark:placeholder-slate-500 outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-400 dark:text-slate-500 active:scale-90 transition-transform">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Active filter summary strip ── */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 px-5 pb-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {typeFilter !== 'all' && (
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold
              bg-primary/10 dark:bg-primary/20 text-primary">
              {TYPE_OPTS.find(o => o.value === typeFilter)?.label}
              <button onClick={() => setTypeFilter('all')} className="ml-0.5 opacity-60 hover:opacity-100">×</button>
            </span>
          )}
          {dateRange !== 'all' && (
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold
              bg-primary/10 dark:bg-primary/20 text-primary">
              {DATE_OPTS.find(o => o.value === dateRange)?.label}
              {dateRange === 'custom' && customFrom && ` ${customFrom}`}
              {dateRange === 'custom' && customTo && `–${customTo}`}
              <button onClick={() => { setDateRange('all'); setCustomFrom(''); setCustomTo('') }} className="ml-0.5 opacity-60 hover:opacity-100">×</button>
            </span>
          )}
          {accountFilter && (
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold
              bg-primary/10 dark:bg-primary/20 text-primary">
              {accountFilter}
              <button onClick={() => setAccountFilter(null)} className="ml-0.5 opacity-60 hover:opacity-100">×</button>
            </span>
          )}
          {categoryFilter && (
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold
              bg-primary/10 dark:bg-primary/20 text-primary">
              {categoryFilter}
              <button onClick={() => setCategoryFilter(null)} className="ml-0.5 opacity-60 hover:opacity-100">×</button>
            </span>
          )}
        </div>
      )}

      {/* ── Summary bar ── */}
      <div className="sticky top-0 z-20 mx-5 mb-4 rounded-2xl overflow-hidden
        bg-white/70 dark:bg-primary/[0.08] backdrop-blur-2xl
        border border-slate-100/80 dark:border-primary/[0.22]
        shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none"
      >
        <div className="flex items-center justify-around py-3 px-2">
          <SummaryItem label="In"  value={fmt(summary.totalIn)}  colorCls="text-emerald-600 dark:text-emerald-400" />
          <div className="w-px h-6 bg-slate-100 dark:bg-white/[0.08]" />
          <SummaryItem label="Out" value={fmt(summary.totalOut)} colorCls="text-red-500 dark:text-red-400" />
          <div className="w-px h-6 bg-slate-100 dark:bg-white/[0.08]" />
          <SummaryItem label="Txns" value={String(filteredTx.length)} colorCls="text-slate-600 dark:text-slate-300" />
        </div>
      </div>

      {/* ── Transaction list ── */}
      {filteredTx.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {groups.map(({ date, txs }) => (
            <div key={date} className="mb-1">
              {/* date group header */}
              <div className="flex items-center gap-3 px-5 py-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {fmtGroupDate(date)}
                </span>
                <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.07]" />
                <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                  {txs.length} {txs.length === 1 ? 'txn' : 'txns'}
                </span>
              </div>

              {/* rows card */}
              <div className="card mx-5 rounded-2xl overflow-hidden">
                {txs.map((tx, i) => (
                  <div key={tx.id}>
                    <TxRow tx={tx} catMap={catMap} onClick={setSelectedTx} />
                    {i < txs.length - 1 && (
                      <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* load more */}
          {hasMore && (
            <div className="flex justify-center mt-4 px-5">
              <button
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                className="px-6 py-2.5 rounded-2xl text-sm font-semibold
                  text-primary bg-primary/8 dark:bg-primary/12
                  border border-primary/20
                  active:scale-95 transition-transform duration-75"
              >
                Load more · {filteredTx.length - visibleCount} remaining
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Filter modal ── */}
      <FilterModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        typeFilter={typeFilter}       setTypeFilter={setTypeFilter}
        dateRange={dateRange}         setDateRange={setDateRange}
        customFrom={customFrom}       setCustomFrom={setCustomFrom}
        customTo={customTo}           setCustomTo={setCustomTo}
        accountFilter={accountFilter} setAccountFilter={setAccountFilter}
        categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
        accounts={accounts ?? []}
        categories={categories ?? []}
        activeCount={activeFilterCount}
        onClear={clearFilters}
      />

      {/* ── Detail / edit sheet ── */}
      <TxDetailSheet
        open={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
        accounts={accounts ?? []}
        categories={categories ?? []}
      />
    </div>
  )
}
