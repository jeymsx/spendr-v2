import { useState, useMemo, useDeferredValue } from 'react'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import TxDetailSheet from '../components/TxDetailSheet'
import CalendarView from '../components/CalendarView'
import { scheduledCutoff } from '../utils/scheduled'
import IconButton from '../components/ui/IconButton'
import Divider from '../components/ui/Divider'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import {
  inDateRange,
  groupByDate,
  PAGE_SIZE,
  DATE_OPTS,
} from './transactions/shared'
import { QuickTypeFilter } from './transactions/QuickFilter'
import { FilterModal, TxRow, IconNoTransactions } from './transactions/FilterSheet'
import Rail from '../components/ui/Rail'
import SearchField from '../components/ui/SearchField'

// ── Formatters ─────────────────────────────────────────────────────────────────

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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Transactions() {
  const txAll      = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), [], [])
  const accounts   = useLiveQuery(() => db.accounts.toArray(),   [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])

  const [search,         setSearch]         = useState('')
  const [typeFilter,     setTypeFilter]     = useState('all')
  // A list, not a name. Filtering to one account at a time meant
  // "GCash or Maya" was two passes and a mental merge.
  const [accountFilters, setAccountFilters] = useState([])
  const [categoryFilter, setCategoryFilter] = useState(null)
  const [dateRange,      setDateRange]      = useState('all')
  const [customFrom,     setCustomFrom]     = useState('')
  const [customTo,       setCustomTo]       = useState('')
  const [filterOpen,     setFilterOpen]     = useState(false)
  const [visibleCount,   setVisibleCount]   = useState(PAGE_SIZE)
  const [selectedTx,     setSelectedTx]     = useState(null)
  const [amountMin,      setAmountMin]      = useState(null)
  const [amountMax,      setAmountMax]      = useState(null)
  const [viewMode,       setViewMode]       = useState('list')
  const [calYear,        setCalYear]        = useState(() => new Date().getFullYear())
  const [calMonth,       setCalMonth]       = useState(() => new Date().getMonth())
  const [calSelected,    setCalSelected]    = useState(null)

  /* Back to the first page whenever the filters change.

     Adjusted during render rather than in an effect. The effect committed
     one paint with the NEW filter and the OLD count, so changing a filter
     after several rounds of "Load more" rendered hundreds of rows purely to
     throw all but the first page away on the next pass. Comparing a
     signature is content-based too, where the effect re-ran whenever
     `accountFilters` was rebuilt with the same names in it. */
  const filterSig = [
    search, typeFilter, accountFilters.join('\u001f'), categoryFilter,
    dateRange, customFrom, customTo, amountMin, amountMax,
  ].join('\u001e')
  const [prevFilterSig, setPrevFilterSig] = useState(filterSig)
  if (prevFilterSig !== filterSig) {
    setPrevFilterSig(filterSig)
    setVisibleCount(PAGE_SIZE)
  }

  const catMap = useMemo(() =>
    Object.fromEntries((categories ?? []).map(c => [c.name, c])),
    [categories],
  )

  // The filter re-scans the whole history, so let React keep the input
  // responsive and apply results a tick behind rather than blocking every
  // keystroke on a full pass.
  const deferredSearch = useDeferredValue(search)

  const filteredTx = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase()
    // Installments write their whole schedule up front; a charge dated beyond
    // today is committed, not spent, so it stays out of the history until then.
    const cutoff = scheduledCutoff()
    return (txAll ?? []).filter(tx => {
      if ((tx.date ?? '') > cutoff) return false
      if (q && !(tx.description ?? '').toLowerCase().includes(q) &&
               !(tx.category   ?? '').toLowerCase().includes(q)) return false
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false
      // Any of the picked accounts, on any of the three sides a transaction
      // can name one.
      if (accountFilters.length && !accountFilters.includes(tx.account) &&
                                   !accountFilters.includes(tx.fromAccount) &&
                                   !accountFilters.includes(tx.toAccount)) return false
      if (categoryFilter && tx.category !== categoryFilter) return false
      if (!inDateRange(tx, dateRange, customFrom, customTo)) return false
      if (amountMin != null && (tx.amount ?? 0) < amountMin) return false
      if (amountMax != null && (tx.amount ?? 0) > amountMax) return false
      return true
    })
  }, [txAll, deferredSearch, typeFilter, accountFilters, categoryFilter, dateRange, customFrom, customTo, amountMin, amountMax])

  const visibleTx = useMemo(() => filteredTx.slice(0, visibleCount), [filteredTx, visibleCount])
  const groups    = useMemo(() => groupByDate(visibleTx), [visibleTx])
  const hasMore   = filteredTx.length > visibleCount

  // Type is now inline — only count date/account/category as "hidden" filter state
  const activeFilterCount = (dateRange !== 'all' ? 1 : 0) +
    (accountFilters.length ? 1 : 0) +
    (categoryFilter ? 1 : 0) +
    (amountMin != null || amountMax != null ? 1 : 0)

  function handlePrevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
    setCalSelected(null)
  }

  function handleNextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
    setCalSelected(null)
  }

  function clearFilters() {
    setTypeFilter('all')
    setDateRange('all')
    setCustomFrom('')
    setCustomTo('')
    setAccountFilters([])
    setCategoryFilter(null)
    setAmountMin(null)
    setAmountMax(null)
  }

  return (
    <div className="pb-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-safe-header pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Transactions
        </h1>
        <div className="flex items-center gap-2">
          {/* Single view mode toggle — icon swaps between list and calendar.

              The accent fill is the one header accent left in the app, and it
              is not chrome: it means calendar mode is ON. Same for the filter
              button beside it. */}
          <IconButton
            label={viewMode === 'list' ? 'Switch to calendar view' : 'Switch to list view'}
            variant={viewMode === 'calendar' ? 'primary' : 'surface'}
            onClick={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')}
          >
            {viewMode === 'list' ? (
              /* Calendar icon — shown in list mode to indicate "switch to calendar" */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            ) : (
              /* List icon — shown in calendar mode to indicate "switch to list" */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            )}
          </IconButton>

        </div>
      </div>

      {/* ── Search bar (always visible) ── */}
      <div className="px-5 mb-3">
        {/* Fully round, like every other field and button in the app - it
            was the last rounded-xl control on the page. The markup that used
            to be spelled out here is components/ui/SearchField.jsx now; the
            account creation flow needed the same bar and had grown a
            different one. */}
        <SearchField
          value={search}
          onChange={e => setSearch(e.target.value)}
          onClear={() => setSearch('')}
        />
      </div>

      {/* ── Type filter (always visible) ── */}
      <QuickTypeFilter
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        onOpenFilters={() => setFilterOpen(true)}
        activeFilterCount={activeFilterCount}
      />

      {/* ── Active filter tags (date / account / category only) ── */}
      {activeFilterCount > 0 && (
        <Rail className="items-center gap-2 px-5 pb-3">
          {dateRange !== 'all' && (
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold
              bg-primary/10 dark:bg-primary/20 text-primary">
              {DATE_OPTS.find(o => o.value === dateRange)?.label}
              {dateRange === 'custom' && customFrom && ` ${customFrom}`}
              {dateRange === 'custom' && customTo && `–${customTo}`}
              <button onClick={() => { setDateRange('all'); setCustomFrom(''); setCustomTo('') }} className="ml-0.5 opacity-60 hover:opacity-100">×</button>
            </span>
          )}
          {accountFilters.map(name => (
            <span key={name} className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold
              bg-primary/10 dark:bg-primary/20 text-primary">
              {name}
              <button
                onClick={() => setAccountFilters(prev => prev.filter(n => n !== name))}
                className="ml-0.5 opacity-60 hover:opacity-100"
                aria-label={`Remove ${name} filter`}
              >×</button>
            </span>
          ))}
          {categoryFilter && (
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold
              bg-primary/10 dark:bg-primary/20 text-primary">
              {categoryFilter}
              <button onClick={() => setCategoryFilter(null)} className="ml-0.5 opacity-60 hover:opacity-100">×</button>
            </span>
          )}
          {(amountMin != null || amountMax != null) && (
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold
              bg-primary/10 dark:bg-primary/20 text-primary">
              {amountMin != null ? `₱${amountMin.toLocaleString()}` : '₱0'}
              {' – '}
              {amountMax != null ? `₱${amountMax.toLocaleString()}` : 'any'}
              <button onClick={() => { setAmountMin(null); setAmountMax(null) }} className="ml-0.5 opacity-60 hover:opacity-100">×</button>
            </span>
          )}
        </Rail>
      )}

      {/* ── Transaction list / Calendar view ── */}
      {viewMode === 'calendar' ? (
        <CalendarView
          transactions={filteredTx}
          year={calYear}
          month={calMonth}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onGoToNow={() => {
            const n = new Date()
            setCalYear(n.getFullYear())
            setCalMonth(n.getMonth())
            setCalSelected(null)
          }}
          selectedDate={calSelected}
          onSelectDate={setCalSelected}
          catMap={catMap}
          onTxClick={setSelectedTx}
        />
      ) : filteredTx.length === 0 ? (
        <EmptyState
          icon={<IconNoTransactions />}
          title="No transactions found"
          body="Try adjusting your filters"
        />
      ) : (
        <>
          {groups.map(({ date, txs }) => (
            <div key={date} className="mb-1">
              <div className="flex items-center gap-3 px-5 py-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {fmtGroupDate(date)}
                </span>
                <Divider className="flex-1" />
                <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                  {txs.length} {txs.length === 1 ? 'txn' : 'txns'}
                </span>
              </div>

              <Card clip className="mx-5">
                {txs.map((tx, i) => (
                  <div key={tx.id}>
                    <TxRow tx={tx} catMap={catMap} onClick={setSelectedTx} />
                    {/* Under the text, not under the tile: the row is led by a
                        40px glyph, so the line starts where the row's content
                        does rather than cutting the card in half. */}
                    {i < txs.length - 1 && <Divider inset="glyph" />}
                  </div>
                ))}
              </Card>
            </div>
          ))}

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

      {/* ── Filter sheet ── */}
      <FilterModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        typeFilter={typeFilter}
        dateRange={dateRange}         setDateRange={setDateRange}
        customFrom={customFrom}       setCustomFrom={setCustomFrom}
        customTo={customTo}           setCustomTo={setCustomTo}
        accountFilters={accountFilters} setAccountFilters={setAccountFilters}
        categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
        amountMin={amountMin}         setAmountMin={setAmountMin}
        amountMax={amountMax}         setAmountMax={setAmountMax}
        accounts={accounts ?? []}
        categories={categories ?? []}
        allTxs={txAll ?? []}
        activeCount={activeFilterCount}
        onClear={clearFilters}
        filteredCount={filteredTx.length}
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
