import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useToast } from '../../context/ToastContext'
import { moveToTrash, restoreFromTrash } from '../../db/trash'
import { recategorize, refile } from '../../db/txHelpers'
import { findInstallmentGroup, isInstallmentRow } from '../../utils/installments'
import { scheduledCutoff } from '../../utils/scheduled'
import { isoToDateInput } from '../../utils/txDate'
import { txMatches } from '../../lib/search'
import { foldLoanPayments, unfoldLoanPayment, interestCarried, isLoanPayment } from '../../lib/loans'
import { amountDisplay, isRefund } from '../../lib/txMoney'
import { txGlyphCat, txRowWords } from '../../lib/txRow'
import { txBase, currencyOfTx } from '../../lib/fxContext'
import { editTransaction } from '../../lib/editTransaction'
import { fmt } from '../../lib/money'
import { inDateRange, canRecategorize, DATE_OPTS, fmtTime } from '../../pages/transactions/shared'
import TxDetailSheet from '../../components/TxDetailSheet'
import { shortDate, moneyOf, totalsOf, TxDescription, TxAccount, TxAmount } from './txParts'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import DataTable, { sortRows, nextSort } from '../ui/DataTable'
import Popover, { MenuItem, MenuSep, MenuLabel } from '../ui/Popover'
import Drawer from '../ui/Drawer'
import Dialog from '../ui/Dialog'
import { Segmented, SearchInput } from '../ui/controls'
import { Amount, AccountTile, CategoryTile, Empty, Stat } from '../ui/display'
import {
  ICalendar, IChevronDown, IDownload, ITrash, IEdit, ITag, IX, IWallet, IList, ITransfer, IExternal, ISearch,
} from '../ui/icons'

/**
 * Transactions on a computer: the ledger as a table.
 *
 * Every row the phone lists, with the phone's own rules (lib/search.js for
 * the search, pages/transactions/shared.js for the date ranges and what may
 * be refiled, lib/loans.js to show a loan payment as the one row it was,
 * db/trash.js to delete with Undo). What the desktop adds is what a table
 * is for: columns to sort by, filters in a bar, totals of whatever the
 * filters leave, many rows at once (refile, delete), a row's details in a
 * drawer beside the list, the keyboard, and the filtered rows as a CSV.
 *
 * `?q=` searches (the command palette sends it); `?tx=` opens a row.
 */

const FILTER_KEY = 'spendr-web-tx-filters'

/** @typedef {{type: string, range: string, from: string, to: string, accounts: string[], category: string|null}} Filters */
/** @type {Filters} */
const NO_FILTERS = { type: 'all', range: 'all', from: '', to: '', accounts: [], category: null }

/** @returns {Filters} */
function savedFilters() {
  try {
    const raw = sessionStorage.getItem(FILTER_KEY)
    if (raw) return { ...NO_FILTERS, ...JSON.parse(raw) }
  } catch { /* storage off */ }
  return NO_FILTERS
}

/** @param {string} key 'YYYY-MM-DD' */
function dayLabel(key) {
  if (!key) return 'Unknown'
  const d = new Date(`${key}T00:00:00`)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  const date = d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
  if (d.getTime() === now.getTime()) return `Today · ${date}`
  if (d.getTime() === yest.getTime()) return `Yesterday · ${date}`
  if (d > now) return `${date} · Upcoming`
  return date
}

export default function WebTransactions() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [params, setParams] = useSearchParams()

  const txAll = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), [], undefined)
  const categories = useLiveQuery(() => db.categories.toArray(), [], undefined)
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])
  const trashCount = useLiveQuery(() => db.trash.count(), [], 0)

  const [search, setSearch] = useState(() => params.get('q') ?? '')
  const [seenQ, setSeenQ] = useState(params.get('q'))
  if (params.get('q') !== seenQ) { setSeenQ(params.get('q')); setSearch(params.get('q') ?? '') }
  const q = useDeferredValue(search).trim().toLowerCase()

  const [filters, setFiltersState] = useState(savedFilters)
  const setFilters = useCallback((/** @type {Partial<Filters>} */ patch) => {
    setFiltersState(f => {
      const next = { ...f, ...patch }
      try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(next)) } catch { /* storage off */ }
      return next
    })
  }, [])
  const [sort, setSort] = useState(/** @type {{key: string, dir: 'asc'|'desc'}} */ ({ key: 'date', dir: 'desc' }))
  const [selected, setSelected] = useState(/** @type {Set<string|number>} */ (new Set()))
  const [confirmDelete, setConfirmDelete] = useState(/** @type {Array<Record<string, any>>|null} */ (null))
  const [sheet, setSheet] = useState(/** @type {{tx: Record<string, any>, startWith: 'detail'|'delete'}|null} */ (null))

  const catMap = useMemo(() => Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])
  const acctMap = useMemo(() => Object.fromEntries((accounts ?? []).map(a => [a.name, a])), [accounts])

  const filtered = useMemo(() => {
    const cutoff = scheduledCutoff()
    const f = filters
    return (txAll ?? []).filter(tx => {
      // A charge dated ahead is committed, not spent: hidden unless searched for (as on the phone).
      if (!q && (tx.date ?? '') > cutoff) return false
      if (q && !txMatches(tx, q)) return false
      if (f.type !== 'all' && tx.type !== f.type) return false
      if (f.accounts.length && !f.accounts.includes(tx.account) && !f.accounts.includes(tx.fromAccount) && !f.accounts.includes(tx.toAccount)) return false
      if (f.category && tx.category !== f.category) return false
      if (!inDateRange(tx, f.range, f.from, f.to)) return false
      return true
    })
  }, [txAll, q, filters])

  // A loan payment as the one row it was; totals still read the halves.
  const shown = useMemo(() => foldLoanPayments(filtered), [filtered])
  const totals = useMemo(() => totalsOf(filtered), [filtered])

  const rows = useMemo(() => {
    const value = sort.key === 'date' ? (/** @type {any} */ t) => t.date
      : sort.key === 'amount' ? (/** @type {any} */ t) => Math.abs(txBase(unfoldLoanPayment(t))) + interestCarried(t)
      : sort.key === 'category' ? (/** @type {any} */ t) => t.type === 'transfer' ? null : (t.category || null)
      : sort.key === 'account' ? (/** @type {any} */ t) => t.account ?? t.fromAccount
      : (/** @type {any} */ t) => txRowWords(t, catMap[t.category]).title
    const sorted = sort.key === 'date' && sort.dir === 'desc' ? shown : sortRows(shown, value, sort.dir)
    if (sort.key !== 'date') return sorted
    // By date: a heading for each day, with what it spent and brought in.
    /** @type {any[]} */
    const out = []
    let day = ''
    /** @type {any} */
    let head = null
    /** @type {any[]} */
    let dayRows = []
    const close = () => {
      if (!head) return
      const t = totalsOf(dayRows.flatMap(r => (isLoanPayment(r) ? [unfoldLoanPayment(r)] : [r])))
      head.right = [t.spent ? `−${fmt(t.spent)}` : '', t.earned ? `+${fmt(t.earned)}` : ''].filter(Boolean).join('  ')
    }
    for (const t of sorted) {
      const k = isoToDateInput(t.date) || 'unknown'
      if (k !== day) {
        close()
        day = k
        head = { __group: true, key: k, label: dayLabel(k), right: '' }
        dayRows = []
        out.push(head)
      }
      dayRows.push(t)
      out.push(t)
    }
    close()
    return out
  }, [shown, sort, catMap])

  const narrowed = q !== '' || filters.type !== 'all' || filters.range !== 'all' || filters.accounts.length > 0 || !!filters.category
  const filterKey = JSON.stringify([q, filters, sort])

  // The selection counts only rows still listed: a filter that hides a selected row unselects it.
  const liveSelected = useMemo(() => {
    const ids = new Set(shown.map(t => t.id))
    return new Set([...selected].filter(id => ids.has(id)))
  }, [shown, selected])
  const selectedRows = useMemo(() => shown.filter(t => liveSelected.has(t.id)), [shown, liveSelected])

  // ?tx= opens that row beside the list.
  const openId = params.get('tx') ? Number(params.get('tx')) : null
  const openTx = openId != null ? (txAll ?? []).find(t => t.id === openId) ?? null : null
  const openRow = useCallback((/** @type {Record<string, any>} */ t) => {
    const next = new URLSearchParams(params)
    next.set('tx', String(t.id))
    setParams(next, { replace: true })
  }, [params, setParams])
  const closeRow = useCallback(() => {
    const next = new URLSearchParams(params)
    next.delete('tx')
    setParams(next, { replace: true })
  }, [params, setParams])

  const trash = useCallback(async (/** @type {Array<Record<string, any>>} */ list) => {
    try {
      const moved = await moveToTrash(list.map(unfoldLoanPayment))
      if (!moved) return
      setSelected(new Set())
      const n = list.length
      showToast(
        n > 1 ? `${n} transactions moved to Recently deleted` : moved.count > 1 ? `Deleted with ${moved.count - 1} linked` : 'Moved to Recently deleted',
        'success',
        {
          actionLabel: 'Undo',
          onAction: async () => {
            try {
              const back = await restoreFromTrash(moved.id)
              showToast(back ? 'Restored' : 'Already restored', back ? 'success' : 'warning')
            } catch (e) {
              console.error('[WebTransactions] undo failed:', e)
              showToast('Undo failed', 'error')
            }
          },
        },
      )
    } catch (e) {
      console.error('[WebTransactions] delete failed:', e)
      showToast('Could not delete that. Try again.', 'error')
    }
  }, [showToast])

  /** One row, or the selection: a plan's payment goes to the plan's own confirmation. */
  const askDelete = useCallback((/** @type {Array<Record<string, any>>} */ list) => {
    if (list.length === 1 && isInstallmentRow(list[0])) { setSheet({ tx: list[0], startWith: 'delete' }); return }
    setConfirmDelete(list)
  }, [])

  const refileRows = useCallback(async (/** @type {Array<Record<string, any>>} */ list, /** @type {Record<string, any>} */ cat) => {
    const todo = list.filter(t => canRecategorize(t) && t.category !== cat.name)
    if (!todo.length) return
    // A plan's months move together, as on the phone.
    const ids = new Set()
    const rowsToFile = []
    for (const t of todo) {
      for (const r of isInstallmentRow(t) ? findInstallmentGroup(t, txAll ?? []) : [t]) {
        if (!ids.has(r.id)) { ids.add(r.id); rowsToFile.push(r) }
      }
    }
    try {
      const before = await recategorize(rowsToFile, cat.name)
      showToast(rowsToFile.length > 1 ? `${rowsToFile.length} filed under ${cat.name}` : `Filed under ${cat.name}`, 'success', {
        actionLabel: 'Undo',
        onAction: () => { refile(before).catch(e => console.error('[WebTransactions] refile undo failed:', e)) },
      })
    } catch (e) {
      console.error('[WebTransactions] recategorize failed:', e)
      showToast('Could not change the category', 'error')
    }
  }, [txAll, showToast])

  const columns = useMemo(() => [
    {
      key: 'date', header: 'Date', width: 112, sortable: true,
      render: (/** @type {any} */ t) => (
        <span className="d-cell-muted d-num whitespace-nowrap">{sort.key === 'date' ? fmtTime(t.date) : shortDate(t.date)}</span>
      ),
    },
    {
      key: 'description', header: 'Description', sortable: true,
      render: (/** @type {any} */ t) => <TxDescription tx={t} catMap={catMap} />,
    },
    {
      key: 'category', header: 'Category', width: 190, sortable: true,
      render: (/** @type {any} */ t) => <CategoryCell tx={t} categories={categories ?? []} catMap={catMap} onPick={(c) => refileRows([t], c)} />,
    },
    {
      key: 'account', header: 'Account', width: 220, sortable: true,
      render: (/** @type {any} */ t) => <TxAccount tx={t} acctMap={acctMap} />,
    },
    {
      key: 'amount', header: 'Amount', width: 140, align: /** @type {const} */ ('right'), sortable: true,
      render: (/** @type {any} */ t) => <TxAmount tx={t} />,
    },
  ], [sort.key, catMap, acctMap, categories, refileRows])

  const loading = txAll === undefined || categories === undefined

  return (
    <Page
      title="Transactions"
      subtitle={loading ? ' ' : `${filtered.length.toLocaleString()} ${filtered.length === 1 ? 'transaction' : 'transactions'}${narrowed ? ' match' : ''}`}
      actions={
        <>
          {trashCount > 0 && (
            <Btn variant="ghost" icon={<ITrash size={15} />} onClick={() => navigate('/transactions/deleted')}>
              Recently deleted <span className="d-cell-faint d-num">{trashCount}</span>
            </Btn>
          )}
          <Btn variant="secondary" icon={<IDownload size={15} />} disabled={!filtered.length} onClick={() => exportCsv(shown, catMap)}>Export CSV</Btn>
        </>
      }
    >
      <div className="grid grid-cols-4 gap-5 mb-8">
        <Stat label="Spent" value={fmt(totals.spent)} note={narrowed ? 'In the filtered rows' : 'All time'} />
        <Stat label="Came in" value={fmt(totals.earned)} note={narrowed ? 'In the filtered rows' : 'All time'} />
        <Stat label="Net" value={`${totals.net < 0 ? '−' : totals.net > 0 ? '+' : ''}${fmt(Math.abs(totals.net))}`} tone={totals.net < 0 ? 'neg' : totals.net > 0 ? 'pos' : null} note="Came in less spent" />
        <Stat label="Average spend" value={fmt(avgPerDay(filtered, totals.spent))} note="Per day over the rows shown" />
      </div>

      <Panel flush className="overflow-visible">
        {selectedRows.length > 0 ? (
          <BulkBar
            rows={selectedRows}
            categories={categories ?? []}
            onClear={() => setSelected(new Set())}
            onRefile={(c) => refileRows(selectedRows, c)}
            onDelete={() => askDelete(selectedRows)}
          />
        ) : (
          <FilterBar
            search={search}
            onSearch={(v) => {
              setSearch(v)
              if (params.get('q')) { const next = new URLSearchParams(params); next.delete('q'); setParams(next, { replace: true }); setSeenQ(null) }
            }}
            filters={filters}
            setFilters={setFilters}
            accounts={accounts ?? []}
            categories={categories ?? []}
            narrowed={narrowed}
            onClear={() => { setSearch(''); setFilters(NO_FILTERS) }}
          />
        )}
        <div
          onKeyDown={(e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRows.length) { e.preventDefault(); askDelete(selectedRows) }
          }}
        >
          <DataTable
            label="Transactions"
            columns={columns}
            rows={loading ? [] : rows}
            rowKey={(t) => t.id}
            sort={sort}
            onSort={(key) => setSort(s => nextSort(s, key, key === 'description' || key === 'category' || key === 'account' ? 'asc' : 'desc'))}
            selected={liveSelected}
            onSelectedChange={setSelected}
            onRowClick={openRow}
            activeKey={openId}
            resetKey={filterKey}
            empty={loading ? <div className="h-40" /> : narrowed ? (
              <Empty icon={<ISearch size={18} />} title="Nothing matches" body="Try another search, or clear the filters." action={<Btn size="sm" onClick={() => { setSearch(''); setFilters(NO_FILTERS) }}>Clear filters</Btn>} />
            ) : (
              <Empty icon={<IList size={18} />} title="No transactions yet" body="Add one from the Add button, or import a CSV." />
            )}
            footer={!loading && shown.length > 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <span className="d-cell-muted font-medium">
                    {shown.length.toLocaleString()} rows · <span className="d-neg">{fmt(totals.spent)}</span> spent · <span className="d-pos">{fmt(totals.earned)}</span> in
                  </span>
                </td>
                <td className="is-num">
                  <span className={totals.net < 0 ? 'd-neg' : totals.net > 0 ? 'd-pos' : ''}>{totals.net < 0 ? '−' : totals.net > 0 ? '+' : ''}{fmt(Math.abs(totals.net))}</span>
                </td>
              </tr>
            ) : null}
          />
        </div>
      </Panel>

      <TxDrawer
        tx={openTx}
        catMap={catMap}
        acctMap={acctMap}
        categories={categories ?? []}
        onClose={closeRow}
        onEdit={(t) => editTransaction(navigate, t, closeRow)}
        onDelete={(t) => askDelete([t])}
        onRefile={(t, c) => refileRows([t], c)}
        onMore={(t) => setSheet({ tx: t, startWith: 'detail' })}
      />

      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete && confirmDelete.length > 1 ? `Delete ${confirmDelete.length} transactions?` : 'Delete this transaction?'}
        actions={
          <>
            <Btn onClick={() => setConfirmDelete(null)}>Cancel</Btn>
            <Btn variant="danger-solid" data-autofocus onClick={() => { const list = confirmDelete ?? []; setConfirmDelete(null); closeRow(); trash(list) }}>Delete</Btn>
          </>
        }
      >
        They go to Recently deleted for 30 days, with their balances put back. Linked rows (a refund, a fee, a loan payment's other half) go with them.
      </Dialog>

      <TxDetailSheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        transaction={sheet?.tx ?? null}
        accounts={accounts ?? []}
        categories={categories ?? []}
        startWith={sheet?.startWith ?? 'detail'}
        onEdit={(t) => editTransaction(navigate, t, () => setSheet(null))}
      />
    </Page>
  )
}

/** Spending per day across the span the rows cover. @param {Array<Record<string, any>>} rows @param {number} spent */
function avgPerDay(rows, spent) {
  if (!rows.length || !spent) return 0
  const dates = rows.map(t => t.date).filter(Boolean).sort()
  const first = new Date(dates[0])
  const last = new Date(Math.min(Date.now(), new Date(dates[dates.length - 1]).getTime()))
  const days = Math.max(1, Math.round((last.getTime() - first.getTime()) / 86400000) + 1)
  return spent / days
}

/**
 * The search and the filters, in a bar across the top of the table.
 *
 * @param {{search: string, onSearch: (v: string) => void, filters: Filters, setFilters: (p: Partial<Filters>) => void,
 *          accounts: Array<Record<string, any>>, categories: Array<Record<string, any>>, narrowed: boolean, onClear: () => void}} props
 */
function FilterBar({ search, onSearch, filters, setFilters, accounts, categories, narrowed, onClear }) {
  const rangeLabel = filters.range === 'custom'
    ? [filters.from && shortDate(`${filters.from}T00:00:00`), filters.to && shortDate(`${filters.to}T00:00:00`)].filter(Boolean).join(' – ') || 'Custom'
    : DATE_OPTS.find(o => o.value === filters.range)?.label ?? 'All time'
  const cats = categories
    .filter(c => filters.type === 'all' || filters.type === 'transfer' ? true : c.type === filters.type)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.name.localeCompare(b.name))
  const visibleAccounts = accounts.filter(a => !a.archived).sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))

  return (
    <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--d-border)] flex-wrap">
      <SearchInput value={search} onChange={onSearch} placeholder="Search notes, categories, accounts, amounts" className="flex-1 min-w-[200px] max-w-[320px]" />
      <Segmented
        label="Type"
        value={filters.type}
        onChange={(v) => setFilters({ type: v, category: null })}
        options={[{ value: 'all', label: 'All' }, { value: 'expense', label: 'Expenses' }, { value: 'inflow', label: 'Inflows' }, { value: 'transfer', label: 'Transfers' }]}
      />
      <Popover
        role="dialog"
        label="Date range"
        width={260}
        trigger={<Btn size="sm" variant={filters.range !== 'all' ? 'secondary' : 'ghost'} icon={<ICalendar size={14} />} iconRight={<IChevronDown size={13} />}>{rangeLabel}</Btn>}
      >
        {(close) => (
          <div className="p-1">
            {DATE_OPTS.filter(o => o.value !== 'custom').map(o => (
              <button key={o.value} type="button" className="d-menu-item" aria-checked={filters.range === o.value} onClick={() => { setFilters({ range: o.value }); close() }}>
                <span className="flex-1">{o.label}</span>
                {filters.range === o.value && <span className="text-[var(--d-accent)]">✓</span>}
              </button>
            ))}
            <div className="d-menu-sep" />
            <div className="px-2.5 pt-1.5 pb-2">
              <div className="text-12 font-medium text-[var(--d-text-2)] mb-1.5">Custom range</div>
              <div className="flex items-center gap-1.5">
                <input type="date" className="d-input" aria-label="From" value={filters.from} onChange={e => setFilters({ range: 'custom', from: e.target.value })} />
                <span className="d-cell-faint">–</span>
                <input type="date" className="d-input" aria-label="To" value={filters.to} onChange={e => setFilters({ range: 'custom', to: e.target.value })} />
              </div>
            </div>
          </div>
        )}
      </Popover>
      <Popover
        role="dialog"
        label="Accounts"
        width={260}
        trigger={
          <Btn size="sm" variant={filters.accounts.length ? 'secondary' : 'ghost'} icon={<IWallet size={14} />} iconRight={<IChevronDown size={13} />}>
            {filters.accounts.length === 0 ? 'All accounts' : filters.accounts.length === 1 ? filters.accounts[0] : `${filters.accounts.length} accounts`}
          </Btn>
        }
      >
        <div className="p-1 max-h-[340px] overflow-y-auto">
          {visibleAccounts.map(a => {
            const on = filters.accounts.includes(a.name)
            return (
              <label key={a.id} className="d-menu-item cursor-pointer">
                <input type="checkbox" className="d-check" checked={on} onChange={() => setFilters({ accounts: on ? filters.accounts.filter(n => n !== a.name) : [...filters.accounts, a.name] })} />
                <AccountTile account={a} size="sm" />
                <span className="flex-1 truncate">{a.name}</span>
              </label>
            )
          })}
          {filters.accounts.length > 0 && (
            <>
              <div className="d-menu-sep" />
              <button type="button" className="d-menu-item" onClick={() => setFilters({ accounts: [] })}><span className="d-cell-muted">Any account</span></button>
            </>
          )}
        </div>
      </Popover>
      {filters.type !== 'transfer' && (
        <Popover
          role="menu"
          label="Category"
          width={240}
          trigger={
            <Btn size="sm" variant={filters.category ? 'secondary' : 'ghost'} icon={<ITag size={14} />} iconRight={<IChevronDown size={13} />}>
              {filters.category ?? 'All categories'}
            </Btn>
          }
        >
          <div className="max-h-[340px] overflow-y-auto">
            <MenuItem checked={!filters.category} onSelect={() => setFilters({ category: null })}>All categories</MenuItem>
            <MenuSep />
            {cats.map(c => (
              <MenuItem key={c.id} icon={<CategoryTile cat={c} size="sm" />} checked={filters.category === c.name} onSelect={() => setFilters({ category: c.name })}>{c.name}</MenuItem>
            ))}
          </div>
        </Popover>
      )}
      {narrowed && (
        <Btn size="sm" variant="ghost" icon={<IX size={14} />} onClick={onClear}>Clear</Btn>
      )}
    </div>
  )
}

/**
 * What a row is filed under, and the way to file it elsewhere - a menu of
 * the categories of its own kind. Rows the app files itself (a fee, a debt
 * settled, a correction) and transfers show theirs, unchangeable.
 *
 * @param {{tx: Record<string, any>, categories: Array<Record<string, any>>, catMap: Record<string, any>, onPick: (c: Record<string, any>) => void}} props
 */
function CategoryCell({ tx, categories, catMap, onPick }) {
  if (tx.type === 'transfer') {
    return <span className="d-cell-faint">{isLoanPayment(tx) ? 'Loan payment' : 'Transfer'}</span>
  }
  const cat = txGlyphCat(tx, catMap)
  const label = cat?.name ?? tx.category ?? '—'
  if (!canRecategorize(tx)) {
    return (
      <span className="inline-flex items-center gap-1.5 d-cell-muted min-w-0">
        <span className="d-swatch rounded-full" style={{ background: cat?.color ?? '#94a3b8' }} />
        <span className="truncate">{label}</span>
      </span>
    )
  }
  const options = categories
    .filter(c => c.type === (tx.type === 'inflow' ? 'inflow' : 'expense'))
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.name.localeCompare(b.name))
  return (
    <Popover
      role="menu"
      label={`Category for ${tx.description || label}`}
      width={230}
      trigger={
        <button type="button" data-stop className="group inline-flex items-center gap-1.5 max-w-full h-8 px-2.5 -mx-2.5 rounded-full hover:bg-[var(--d-hover)] text-[var(--d-text-2)] hover:text-[var(--d-text)]">
          <span className="d-swatch rounded-full" style={{ background: cat?.color ?? '#94a3b8' }} />
          <span className="truncate">{label}</span>
          <IChevronDown size={12} className="opacity-0 group-hover:opacity-70 shrink-0" />
        </button>
      }
    >
      <div className="max-h-[320px] overflow-y-auto">
        <MenuLabel>File under</MenuLabel>
        {options.map(c => (
          <MenuItem key={c.id} icon={<CategoryTile cat={c} size="sm" />} checked={c.name === tx.category} onSelect={() => onPick(c)}>{c.name}</MenuItem>
        ))}
      </div>
    </Popover>
  )
}

/**
 * The bar the filters give way to while rows are selected: how many, and
 * what to do with them all.
 *
 * @param {{rows: Array<Record<string, any>>, categories: Array<Record<string, any>>, onClear: () => void,
 *          onRefile: (c: Record<string, any>) => void, onDelete: () => void}} props
 */
function BulkBar({ rows, categories, onClear, onRefile, onDelete }) {
  const refilable = rows.filter(canRecategorize)
  const types = [...new Set(refilable.map(t => (t.type === 'inflow' ? 'inflow' : 'expense')))]
  const options = types.length === 1
    ? categories.filter(c => c.type === types[0]).sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.name.localeCompare(b.name))
    : []
  const { spent, earned } = totalsOf(rows.flatMap(r => (isLoanPayment(r) ? [unfoldLoanPayment(r)] : [r])))
  return (
    <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--d-border)] bg-[var(--d-selected)]" style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
      <Btn size="sm" variant="ghost" icon={<IX size={14} />} label="Clear selection" onClick={onClear} />
      <span className="text-13 font-semibold text-[var(--d-text)]">{rows.length} selected</span>
      <span className="text-12 d-cell-muted d-num">
        {spent ? <span className="d-neg">−{fmt(spent)}</span> : null}
        {spent && earned ? ' · ' : ''}
        {earned ? <span className="d-pos">+{fmt(earned)}</span> : null}
      </span>
      <div className="flex-1" />
      <Popover
        role="menu"
        label="File under"
        align="end"
        width={240}
        trigger={<Btn size="sm" icon={<ITag size={14} />} iconRight={<IChevronDown size={13} />} disabled={!options.length} title={!refilable.length ? 'None of these can be refiled' : types.length > 1 ? 'Pick expenses or inflows, not both' : undefined}>Change category</Btn>}
      >
        <div className="max-h-[320px] overflow-y-auto">
          <MenuLabel>File {refilable.length} under</MenuLabel>
          {options.map(c => (
            <MenuItem key={c.id} icon={<CategoryTile cat={c} size="sm" />} onSelect={() => onRefile(c)}>{c.name}</MenuItem>
          ))}
        </div>
      </Popover>
      <Btn size="sm" variant="danger" icon={<ITrash size={14} />} onClick={onDelete}>Delete</Btn>
    </div>
  )
}

/**
 * A row's details beside the list.
 *
 * @param {{tx: Record<string, any>|null, catMap: Record<string, any>, acctMap: Record<string, any>,
 *          categories: Array<Record<string, any>>, onClose: () => void, onEdit: (t: Record<string, any>) => void,
 *          onDelete: (t: Record<string, any>) => void, onRefile: (t: Record<string, any>, c: Record<string, any>) => void,
 *          onMore: (t: Record<string, any>) => void}} props
 */
function TxDrawer({ tx, catMap, acctMap, categories, onClose, onEdit, onDelete, onRefile, onMore }) {
  const row = tx ? unfoldLoanPayment(tx) : null
  const m = tx ? moneyOf(tx) : null
  const cat = tx ? txGlyphCat(tx, catMap) : null
  const words = tx ? txRowWords(tx, catMap[tx.category]) : null
  const foreign = row && currencyOfTx(row) !== (row.baseCurrency ?? currencyOfTx(row))
  return (
    <Drawer
      open={!!tx}
      onClose={onClose}
      title={tx?.type === 'transfer' ? 'Transfer' : tx?.type === 'inflow' ? 'Inflow' : 'Expense'}
      footer={tx && (
        <>
          <Btn variant="danger" icon={<ITrash size={14} />} onClick={() => onDelete(tx)} className="mr-auto">Delete</Btn>
          <Btn variant="ghost" icon={<IExternal size={14} />} onClick={() => onMore(tx)}>More</Btn>
          <Btn variant="primary" icon={<IEdit size={14} />} onClick={() => onEdit(tx)}>Edit</Btn>
        </>
      )}
    >
      {tx && row && m && words && (
        <div>
          <div className="flex items-center gap-3 mb-5">
            {tx.type === 'transfer'
              ? <span className="d-tile d-tile-lg" style={{ background: 'var(--d-sunken)', color: 'var(--d-text-2)' }}><ITransfer size={18} /></span>
              : <CategoryTile cat={cat} size="lg" />}
            <div className="min-w-0">
              <div className="text-15 font-semibold text-[var(--d-text)] truncate">{words.title}</div>
              <div className="text-12 d-cell-faint truncate">{words.where}{words.kind ? ` · ${words.kind}` : ''}</div>
            </div>
          </div>
          <Amount value={m.value} currency={m.currency} kind={m.kind} className="block text-[28px] leading-9 font-semibold tracking-tight" />
          {foreign && <div className="mt-1 text-12 d-cell-faint d-num">≈ {fmt(Math.abs(txBase(row)))} in your currency</div>}
          <div className="d-divider my-5" />
          <dl className="d-dl">
            {row.type === 'transfer' ? (
              <>
                <dt>From</dt><dd className="flex items-center gap-2"><AccountTile account={acctMap[row.fromAccount] ?? { name: row.fromAccount }} size="sm" />{row.fromAccount}</dd>
                <dt>To</dt><dd className="flex items-center gap-2"><AccountTile account={acctMap[row.toAccount] ?? { name: row.toAccount }} size="sm" />{row.toAccount}</dd>
                {interestCarried(tx) ? (<><dt>Interest</dt><dd className="d-num">{fmt(interestCarried(tx), m.currency)}</dd></>) : null}
              </>
            ) : (
              <>
                <dt>Category</dt>
                <dd><CategoryCell tx={tx} categories={categories} catMap={catMap} onPick={(c) => onRefile(tx, c)} /></dd>
                <dt>Account</dt>
                <dd className="flex items-center gap-2"><AccountTile account={acctMap[row.account] ?? { name: row.account }} size="sm" />{row.account}</dd>
              </>
            )}
            <dt>Date</dt>
            <dd>{new Date(tx.date).toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })} · {fmtTime(tx.date)}</dd>
            {row.description && (<><dt>Note</dt><dd className="break-words">{row.description}</dd></>)}
            {isInstallmentRow(tx) && (<><dt>Plan</dt><dd>One payment of an installment plan</dd></>)}
            {tx.splitId && (<><dt>Split</dt><dd>Shared with others</dd></>)}
            {isRefund(tx) && (<><dt>Refund</dt><dd>Money back on an earlier purchase</dd></>)}
          </dl>
          <p className="mt-6 text-12 d-cell-faint">
            <Link to="/transactions/deleted" className="d-link">Recently deleted</Link> keeps a deleted row for 30 days. More shows refunds, splits and the full history.
          </p>
        </div>
      )}
    </Drawer>
  )
}

/**
 * The rows on screen, as a CSV file: what a spreadsheet wants, in the
 * rows' own currencies, with the ledger's figure beside each.
 *
 * @param {Array<Record<string, any>>} rows
 * @param {Record<string, any>} catMap
 */
function exportCsv(rows, catMap) {
  const head = ['Date', 'Time', 'Type', 'Description', 'Category', 'Account', 'From', 'To', 'Amount', 'Currency', 'Amount (base)']
  const esc = (/** @type {any} */ v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [head.join(',')]
  for (const t of rows.flatMap(r => (isLoanPayment(r) ? [unfoldLoanPayment(r)] : [r]))) {
    const { sign, magnitude, currency } = amountDisplay(t)
    const signed = (sign === '−' ? -1 : 1) * magnitude
    lines.push([
      isoToDateInput(t.date), fmtTime(t.date), t.type, txRowWords(t, catMap[t.category]).title,
      t.type === 'transfer' ? '' : t.category, t.account ?? '', t.fromAccount ?? '', t.toAccount ?? '',
      signed.toFixed(2), currency, ((sign === '−' ? -1 : 1) * Math.abs(txBase(t))).toFixed(2),
    ].map(esc).join(','))
  }
  // A byte-order mark first, so Excel reads the peso sign and accents as UTF-8.
  const blob = new Blob([String.fromCharCode(0xFEFF) + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `spendr-transactions-${isoToDateInput(new Date().toISOString())}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
