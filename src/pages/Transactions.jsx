import { useState, useMemo, useDeferredValue } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import TxDetailSheet from '../components/TxDetailSheet'
import CategoryPickerSheet from '../components/CategoryPickerSheet'
import SwipeRow from '../components/ui/SwipeRow'
import { useToast } from '../context/ToastContext'
import { moveToTrash, restoreFromTrash } from '../db/trash'
import { recategorize, refile } from '../db/txHelpers'
import { findInstallmentGroup, isInstallmentRow, foldPlans, planFactor } from '../utils/installments'
import { fmt } from '../lib/money'
import { currencyOfTx } from '../lib/fxContext'
import CalendarView from '../components/CalendarView'
import { scheduledCutoff } from '../utils/scheduled'
import IconButton from '../components/ui/IconButton'
import Divider from '../components/ui/Divider'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import { PresenceItem, RowDivider, useRowMotion } from '../components/ui/Presence'
import {
  inDateRange,
  groupByDate,
  PAGE_SIZE,
  DATE_OPTS,
} from './transactions/shared'
import { ListEnd, useInfiniteList } from '../components/ui/InfiniteList'
import { QuickTypeFilter } from './transactions/QuickFilter'
import { FilterModal, TxRow } from './transactions/FilterSheet'
import Rail from '../components/ui/Rail'
import SearchField from '../components/ui/SearchField'
import SearchResults from './transactions/SearchResults'
import LedgerSkeleton from './transactions/ListSkeleton'
import { searchEverything, txMatches } from '../lib/search'
import { foldLoanPayments, unfoldLoanPayment } from '../lib/loans'
import { baseSymbol } from '../lib/money'
import { editTransaction } from '../lib/editTransaction'

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
  const navigate = useNavigate()
  const { showToast } = useToast()
  /* undefined until read, not [], so the first frame can tell "still loading"
     from "no transactions". Categories wait too: a row drawn before them
     has no glyph to show and swaps it in a frame later. */
  const txAll      = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), [], undefined)
  const accounts   = useLiveQuery(() => db.accounts.toArray(),   [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], undefined)
  const loading    = txAll === undefined || categories === undefined

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
  const [selectedTx,     setSelectedTx]     = useState(null)
  // Opened from a swipe on a plan's payment: straight to the delete confirmation.
  const [detailIntent,   setDetailIntent]   = useState('detail')
  const [quickCatTx,     setQuickCatTx]     = useState(null)
  const trashCount = useLiveQuery(() => db.trash.count(), [], 0)
  const [amountMin,      setAmountMin]      = useState(null)
  const [amountMax,      setAmountMax]      = useState(null)
  const [viewMode,       setViewMode]       = useState('list')
  const [calYear,        setCalYear]        = useState(() => new Date().getFullYear())
  const [calMonth,       setCalMonth]       = useState(() => new Date().getMonth())
  const [calSelected,    setCalSelected]    = useState(null)

  /* Back to the first page whenever the filters change - ui/InfiniteList
     resets on this signature in the same render, so a new filter never
     draws once with the old list's hundreds of rows. A signature rather
     than the arrays themselves: `accountFilters` is rebuilt with the same
     names in it often. */
  const filterSig = [
    search, typeFilter, accountFilters.join('\u001f'), categoryFilter,
    dateRange, customFrom, customTo, amountMin, amountMax,
  ].join('\u001e')

  const catMap = useMemo(() =>
    Object.fromEntries((categories ?? []).map(c => [c.name, c])),
    [categories],
  )

  // The filter re-scans the whole history, so let React keep the input
  // responsive and apply results a tick behind rather than blocking every
  // keystroke on a full pass.
  /* Only fetched once the query is long enough to search with, so the page
     does not read four extra tables on every visit for a feature most visits
     never use. */
  const wantsWide = search.trim().length >= 2
  const wideData = useLiveQuery(async () => (wantsWide ? {
    recurring: await db.recurring.toArray(),
    goals:     await db.goals.toArray(),
    debts:     await db.debts.toArray(),
  } : null), [wantsWide], null)

  const deferredSearch = useDeferredValue(search)

  /* Everything that is not a transaction. The ledger below answers the same
     query on its own. */
  const wideHits = useMemo(() => searchEverything(deferredSearch, {
    accounts, categories,
    recurring: wideData?.recurring,
    goals:     wideData?.goals,
    debts:     wideData?.debts,
  }), [deferredSearch, accounts, categories, wideData])

  /* An installment plan as its purchase, once, its whole price - and its
     later payments, the card's, not listed (utils/installments). */
  const foldedTx = useMemo(() => foldPlans(txAll ?? []), [txAll])

  const filteredTx = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase()
    // Installments write their whole schedule up front; a charge dated beyond
    // today is committed, not spent, so it stays out of the history until then.
    const cutoff = scheduledCutoff()
    return foldedTx.filter(tx => {
      /* Unless you are searching for it.
       *
       * A charge dated beyond today is committed rather than spent, so it
       * stays out of the history - right for an installment plan, and a trap
       * for anything that lands there by accident. A date typed wrongly, or
       * corrected across a timezone boundary, put a row past the cutoff and
       * there was then no way to reach it at all: not in the list, and not by
       * searching, because this test ran BEFORE the query did.
       *
       * Typing a query is asking to be shown something. Hiding a match
       * because of when it is dated answers a question nobody asked, and the
       * day heading above the row says plainly that it is ahead. */
      if (!q && (tx.date ?? '') > cutoff) return false
      /* Was description-and-category only. An account name and the amount
         are both things people search by, and neither used to work - see
         lib/search.js. */
      if (q && !txMatches(tx, q)) return false
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false
      // Any of the picked accounts, on any of the three sides a transaction
      // can name one.
      if (accountFilters.length && !accountFilters.includes(tx.account) &&
                                   !accountFilters.includes(tx.fromAccount) &&
                                   !accountFilters.includes(tx.toAccount)) return false
      if (categoryFilter && tx.category !== categoryFilter) return false
      if (!inDateRange(tx, dateRange, customFrom, customTo)) return false
      if (amountMin != null && (tx.amount ?? 0) * planFactor(tx) < amountMin) return false
      if (amountMax != null && (tx.amount ?? 0) * planFactor(tx) > amountMax) return false
      return true
    })
  }, [foldedTx, deferredSearch, typeFilter, accountFilters, categoryFilter, dateRange, customFrom, customTo, amountMin, amountMax])

  /* Each loan payment as the one row it was, not its two halves - see
     lib/loans.js foldLoanPayments. Only what the list draws: the calendar,
     the filter's count and every total still read filteredTx. */
  const shownTx = useMemo(() => foldLoanPayments(filteredTx), [filteredTx])

  /* A page at a time, the next one added before you reach the end - no
     "Load more" to tap. See components/ui/InfiniteList. */
  const list      = useInfiniteList(shownTx, { page: PAGE_SIZE, resetKey: filterSig })
  const visibleTx = list.visible
  const groups    = useMemo(() => groupByDate(visibleTx), [visibleTx])

  /* Rows that arrive and leave - see components/ui/Presence.jsx. The view is
     everything filteredTx is computed from, with the DEFERRED search: the
     list changes when that does, and keying on the raw input would let a
     filtering keystroke read as rows being deleted. */
  /* The whole filtered list, not the page on screen: scrolling another page
     in is not fifty rows arriving, and counted as that it redrew the list
     every time the end came near. */
  const allIds     = useMemo(() => (txAll ?? []).map(t => t.id), [txAll])
  const visibleIds = useMemo(() => filteredTx.map(t => t.id), [filteredTx])
  const viewKey = [
    deferredSearch, typeFilter, accountFilters.join('\u001f'), categoryFilter,
    dateRange, customFrom, customTo, amountMin, amountMax,
  ].join('\u001e')
  const rows = useRowMotion({ scope: 'ledger', ready: !loading, allIds, visibleIds, viewKey })

  // Type is now inline — only count date/account/category as "hidden" filter state
  const activeFilterCount = (dateRange !== 'all' ? 1 : 0) +
    (accountFilters.length ? 1 : 0) +
    (categoryFilter ? 1 : 0) +
    (amountMin != null || amountMax != null ? 1 : 0)
  /* Whether anything at all is narrowing the list - the search, the type
     chips or the filter sheet - which is what an empty list means depends
     on. */
  const narrowed = activeFilterCount > 0 || typeFilter !== 'all' || deferredSearch.trim() !== ''

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

  /* A row swiped away: into Recently deleted, with Undo on the toast. A
     plan's payment goes to the plan's own confirmation instead - one gesture
     should not take every month of it without saying so - and the row
     slides back. */
  async function swipeDelete(tx) {
    if (isInstallmentRow(tx)) {
      setDetailIntent('delete')
      setSelectedTx(tx)
      return false
    }
    try {
      const moved = await moveToTrash([tx])
      if (!moved) return false
      showToast(moved.count > 1 ? `Deleted with ${moved.count - 1} linked` : 'Moved to Recently deleted', 'success', {
        actionLabel: 'Undo',
        onAction: async () => {
          try {
            const n = await restoreFromTrash(moved.id)
            showToast(n ? 'Transaction restored' : 'Already restored', n ? 'success' : 'warning')
          } catch (e) {
            console.error('[Transactions] undo failed:', e)
            showToast('Undo failed', 'error')
          }
        },
      })
      return true
    } catch (e) {
      console.error('[Transactions] delete failed:', e)
      showToast('Could not delete that. Try again.', 'error')
      return false
    }
  }

  /* The tile, tapped: file the row under another category. A plan's months
     move together, so the plan is not left half in one category. */
  async function refileTx(tx, cat) {
    if (!cat || cat.name === tx.category) return
    const rows = isInstallmentRow(tx) ? findInstallmentGroup(tx, txAll ?? []) : [tx]
    try {
      const before = await recategorize(rows, cat.name)
      showToast(rows.length > 1 ? `${rows.length} payments filed under ${cat.name}` : `Filed under ${cat.name}`, 'success', {
        actionLabel: 'Undo',
        onAction: () => { refile(before).catch(e => console.error('[Transactions] refile undo failed:', e)) },
      })
    } catch (e) {
      console.error('[Transactions] recategorize failed:', e)
      showToast('Could not change the category', 'error')
    }
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

      <SearchResults groups={wideHits} />

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
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-11 font-semibold
              bg-primary/10 dark:bg-primary/20 text-primary">
              {DATE_OPTS.find(o => o.value === dateRange)?.label}
              {dateRange === 'custom' && customFrom && ` ${customFrom}`}
              {dateRange === 'custom' && customTo && `–${customTo}`}
              <button onClick={() => { setDateRange('all'); setCustomFrom(''); setCustomTo('') }} className="ml-0.5 opacity-60 hover:opacity-100 active:opacity-100">×</button>
            </span>
          )}
          {accountFilters.map(name => (
            <span key={name} className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-11 font-semibold
              bg-primary/10 dark:bg-primary/20 text-primary">
              {name}
              <button
                onClick={() => setAccountFilters(prev => prev.filter(n => n !== name))}
                className="ml-0.5 opacity-60 hover:opacity-100 active:opacity-100"
                aria-label={`Remove ${name} filter`}
              >×</button>
            </span>
          ))}
          {categoryFilter && (
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-11 font-semibold
              bg-primary/10 dark:bg-primary/20 text-primary">
              {categoryFilter}
              <button onClick={() => setCategoryFilter(null)} className="ml-0.5 opacity-60 hover:opacity-100 active:opacity-100">×</button>
            </span>
          )}
          {(amountMin != null || amountMax != null) && (
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-11 font-semibold
              bg-primary/10 dark:bg-primary/20 text-primary">
              {amountMin != null ? `${baseSymbol()}${amountMin.toLocaleString()}` : `${baseSymbol()}0`}
              {' – '}
              {amountMax != null ? `₱${amountMax.toLocaleString()}` : 'any'}
              <button onClick={() => { setAmountMin(null); setAmountMax(null) }} className="ml-0.5 opacity-60 hover:opacity-100 active:opacity-100">×</button>
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
      ) : loading ? (
        <LedgerSkeleton />
      ) : filteredTx.length === 0 ? (
        /* Two different moments. Narrowed, there are rows and none of them
           match. Not narrowed, there are simply none yet - and "adjust your
           filters" sent someone new looking for filters they never set. */
        narrowed ? (
          <EmptyState art="notFound" title="No transactions found" body="Try adjusting your filters" />
        ) : (
          <EmptyState art="ledger" title="No transactions yet" body="Everything you spend or receive shows up here." />
        )
      ) : (
        <>
          {/* Keyed by the epoch, so a change of view redraws the list rather
              than animating every row in and out of it. */}
          <AnimatePresence key={rows.epoch} initial={false}>
            {groups.map(({ date, txs }) => {
              /* A day that is new as a whole arrives as a whole - its heading
                 and card together - rather than as an empty card whose row
                 then opens inside it. */
              const dayArrival = txs.every(t => rows.arrival(t.id) !== 'none')
                ? rows.arrival(txs[0].id) : 'none'
              return (
                // pb-1, not mb-1: padding closes with the day when it leaves.
                <PresenceItem key={date} appear={dayArrival} className="pb-1">
                  <div className="flex items-center gap-3 px-5 py-2">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {fmtGroupDate(date)}
                    </span>
                    <Divider className="flex-1" />
                    <span className="text-11 text-slate-400 dark:text-slate-500 tabular-nums">
                      {txs.length} {txs.length === 1 ? 'txn' : 'txns'}
                    </span>
                  </div>

                  <Card clip className="mx-5">
                    <AnimatePresence initial={false}>
                      {txs.map((tx, i) => (
                        <PresenceItem
                          key={tx.id}
                          appear={dayArrival === 'none' ? rows.arrival(tx.id) : 'none'}
                        >
                          <SwipeRow
                            label={`Delete ${tx.description || tx.category || 'transaction'}`}
                            onDelete={() => swipeDelete(unfoldLoanPayment(tx))}
                          >
                            <TxRow tx={tx} catMap={catMap} onClick={(t) => { setDetailIntent('detail'); setSelectedTx(t) }} onCategory={setQuickCatTx} />
                          </SwipeRow>
                          {/* Under the text, not under the tile: the row is led
                              by a 40px glyph, so the line starts where the row's
                              content does rather than cutting the card in half. */}
                          <RowDivider hidden={i === txs.length - 1} />
                        </PresenceItem>
                      ))}
                    </AnimatePresence>
                  </Card>
                </PresenceItem>
              )
            })}
          </AnimatePresence>

          <ListEnd list={list} done={`All ${shownTx.length} transactions`} />
        </>
      )}

      {/* The way back to what was deleted, at the foot of where it was
          deleted from - only while there is something there. */}
      {viewMode === 'list' && !loading && trashCount > 0 && (
        <div className="flex justify-center mt-6 px-5">
          <Link
            to="/transactions/deleted"
            className="press press-fade active:opacity-60 text-13 font-semibold text-slate-500 dark:text-slate-400 px-3 py-2"
          >
            Recently deleted · {trashCount}
          </Link>
        </div>
      )}

      {/* The tile's own sheet: this row, filed somewhere else. */}
      <CategoryPickerSheet
        open={!!quickCatTx}
        onClose={() => setQuickCatTx(null)}
        title="Change category"
        categories={(categories ?? []).filter(c => c.type === quickCatTx?.type)}
        selected={quickCatTx ? catMap[quickCatTx.category] : null}
        onSelect={(cat) => { if (quickCatTx) refileTx(quickCatTx, cat) }}
        intro={quickCatTx && (
          <p className="mb-4 text-13 text-slate-500 dark:text-slate-400 truncate">
            <span className="font-semibold text-slate-800 dark:text-white">{quickCatTx.description || quickCatTx.category}</span>
            {' · '}{fmt(Math.abs(quickCatTx.amount ?? 0), currencyOfTx(quickCatTx))}
            {isInstallmentRow(quickCatTx) ? ' · every payment in the plan' : ''}
          </p>
        )}
      />

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
        /* Editing opens the form that created it, not five rows in a
           panel. See components/TxDetailSheet.jsx onEdit. */
        onEdit={(t) => editTransaction(navigate, t, () => setSelectedTx(null))}
        open={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
        accounts={accounts ?? []}
        categories={categories ?? []}
        startWith={detailIntent}
      />
    </div>
  )
}
