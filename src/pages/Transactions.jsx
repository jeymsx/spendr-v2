import { useState, useMemo, useCallback, useDeferredValue } from 'react'
import * as RadixSlider from '@radix-ui/react-slider'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import TxDetailSheet from '../components/TxDetailSheet'
import CalendarView from '../components/CalendarView'
import { scheduledCutoff } from '../utils/scheduled'
import { accountBrand } from '../lib/accountBrands'
import { normalizeDesign } from '../lib/cardDesigns'
import BrandMark from '../components/BrandMark'
import BrandWatermark from '../components/BrandWatermark'
import CategoryGlyph from '../components/CategoryGlyph'
import CategoryRail from '../components/CategoryRail'
import Button from '../components/ui/Button'
import Sheet from '../components/ui/Sheet'
import IconButton from '../components/ui/IconButton'
import SectionLabel from '../components/ui/SectionLabel'
import Divider from '../components/ui/Divider'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'

// ── Formatters ─────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _phpFmt.format(Math.abs(n))
}

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

// ── Quick type filter (always visible) ────────────────────────────────────────

function QuickTypeFilter({ typeFilter, setTypeFilter }) {
  const activeIdx = TYPE_OPTS.findIndex(o => o.value === typeFilter)
  return (
    <div className="relative flex items-center mx-5 mb-3">
      <div
        className="absolute top-0 bottom-0 left-0 rounded-xl border bg-primary/[0.10] dark:bg-primary/[0.12] border-primary/30 dark:border-primary/[0.25] pointer-events-none"
        style={{
          width: `${100 / TYPE_OPTS.length}%`,
          transform: `translateX(${activeIdx * 100}%)`,
          transition: 'transform 0.26s cubic-bezier(0.34, 1.4, 0.64, 1)',
        }}
      />
      {TYPE_OPTS.map(o => (
        <button
          key={o.value}
          onClick={() => setTypeFilter(o.value)}
          className={`relative z-10 flex-1 py-1.5 text-xs font-semibold text-center transition-colors duration-200 ${
            typeFilter === o.value ? 'text-primary' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Amount range histogram + slider ───────────────────────────────────────────

/* 48, not 28.
   At 28 buckets across a 350px sheet the bars came out ~9px wide - wide
   enough to read as a bar CHART, which invites you to compare individual
   bars, and there is nothing here to compare: this is a texture showing
   roughly where your amounts cluster, under a slider. Twice as many buckets
   at half the width reads as one shape instead of 28 objects. */
const BUCKETS = 48

function AmountRangeFilter({ allTxs, amountMin, amountMax, onAmountMin, onAmountMax }) {
  // Compute p1 and p99 of transaction amounts — the slider spans this range
  const { scaleMin, scaleMax } = useMemo(() => {
    const amounts = (allTxs ?? []).map(t => t.amount ?? 0).filter(a => a > 0).sort((a, b) => a - b)
    if (!amounts.length) return { scaleMin: 1, scaleMax: 10000 }
    const p1  = amounts[Math.max(0, Math.floor(amounts.length * 0.01) - 1)]
    const p99 = amounts[Math.min(Math.floor(amounts.length * 0.99), amounts.length - 1)]
    return {
      scaleMin: Math.max(1, Math.floor(p1)),
      scaleMax: Math.ceil(p99 / 10) * 10,
    }
  }, [allTxs])

  // Log scale helpers: map amount ↔ slider position 0–100
  const toPos   = useCallback((amt) => {
    if (amt <= scaleMin) return 0
    if (amt >= scaleMax) return 100
    return Math.log(amt / scaleMin) / Math.log(scaleMax / scaleMin) * 100
  }, [scaleMin, scaleMax])

  const fromPos = useCallback((pos) => {
    if (pos <= 0)   return scaleMin
    if (pos >= 100) return scaleMax
    return Math.round(Math.exp(pos / 100 * Math.log(scaleMax / scaleMin)) * scaleMin)
  }, [scaleMin, scaleMax])

  // Histogram buckets on log scale — each bucket covers equal log-space
  const buckets = useMemo(() => {
    const counts = Array(BUCKETS).fill(0)
    ;(allTxs ?? []).forEach(tx => {
      const a = tx.amount ?? 0
      if (a <= 0) return
      const pos = toPos(a)
      const idx = Math.min(Math.floor(pos / 100 * BUCKETS), BUCKETS - 1)
      counts[idx]++
    })
    return counts
  }, [allTxs, toPos])

  const maxCount = Math.max(...buckets, 1)

  const loPos = amountMin != null ? toPos(amountMin) : 0
  const hiPos = amountMax != null ? toPos(amountMax) : 100

  const fmtAmt = (v) => {
    if (v >= 1_000_000) return '₱' + (v / 1_000_000).toFixed(1) + 'M'
    if (v >= 1_000)     return '₱' + (v / 1_000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k'
    return '₱' + Math.round(v)
  }

  return (
    <div>
      {/* Histogram */}
      <div className="flex items-end gap-[3px] h-12 mb-1 px-0.5">
        {buckets.map((count, i) => {
          const bucketLoPos = i / BUCKETS * 100
          const bucketHiPos = (i + 1) / BUCKETS * 100
          const inRange     = bucketHiPos > loPos && bucketLoPos < hiPos
          /* An empty bucket is a 2px dot on the baseline, not a bar. It is
             there so the comb reads as one continuous object across the
             whole range rather than as floating sticks. */
          const heightPct   = count === 0 ? 3.5 : Math.max(10, (count / maxCount) * 100)
          return (
            <div
              key={i}
              className="flex-1 rounded-full transition-colors duration-150"
              style={{
                height: `${heightPct}%`,
                backgroundColor: inRange
                  ? 'rgba(var(--color-primary-rgb), 0.8)'
                  : 'rgba(var(--color-primary-rgb), 0.16)',
              }}
            />
          )
        })}
      </div>

      {/* Dual slider — internal 0–100 log-scale position */}
      <RadixSlider.Root
        className="relative flex items-center select-none touch-none w-full h-5 mt-1"
        min={0}
        max={100}
        step={0.5}
        value={[loPos, hiPos]}
        onValueChange={([lo, hi]) => {
          onAmountMin(lo <= 0.5 ? null : fromPos(lo))
          onAmountMax(hi >= 99.5 ? null : fromPos(hi))
        }}
        minStepsBetweenThumbs={2}
      >
        <RadixSlider.Track className="relative grow rounded-full h-[3px] bg-slate-200 dark:bg-white/[0.12]">
          <RadixSlider.Range className="absolute rounded-full h-full" style={{ backgroundColor: 'rgb(var(--color-primary-rgb))' }} />
        </RadixSlider.Track>
        {[0, 1].map(i => (
          <RadixSlider.Thumb
            key={i}
            className="block w-5 h-5 rounded-full bg-white shadow-[0_1px_6px_rgba(0,0,0,0.25)] border border-slate-200 dark:border-white/20 outline-none focus:ring-2 focus:ring-primary/40 cursor-grab active:cursor-grabbing transition-transform active:scale-110"
          />
        ))}
      </RadixSlider.Root>

      {/* The two ends, as text.

          They were bordered chips, which read as fields you could type into -
          and you cannot; the slider above is the control and these only ever
          report where its handles are. A box around a read-only value is a
          promise the UI does not keep. */}
      <div className="flex items-baseline justify-between mt-3">
        <p className="text-[13px] text-slate-500 dark:text-slate-400">
          Min{' '}
          <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
            {amountMin == null ? 'Any' : fmtAmt(amountMin)}
          </span>
        </p>
        <p className="text-[13px] text-slate-500 dark:text-slate-400">
          Max{' '}
          <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
            {amountMax == null ? 'Any' : fmtAmt(amountMax) + '+'}
          </span>
        </p>
      </div>
    </div>
  )
}

// ── Filter sheet ───────────────────────────────────────────────────────────────

function FilterModal({
  open, onClose,
  typeFilter,
  dateRange, setDateRange,
  customFrom, setCustomFrom,
  customTo, setCustomTo,
  accountFilters, setAccountFilters,
  categoryFilter, setCategoryFilter,
  amountMin, setAmountMin,
  amountMax, setAmountMax,
  accounts, categories, allTxs,
  activeCount, onClear,
  filteredCount,
}) {
  // Show all categories (deduped by name), optionally narrowed to the selected type
  const catOpts = Object.values(
    (categories ?? [])
      .filter(c => c.type !== 'transfer' && (typeFilter === 'all' || c.type === typeFilter || !c.type))
      .reduce((map, c) => { map[c.name] = map[c.name] ?? c; return map }, {})
  )

  /* Sheet owns the overlay, the panel, the grab handle, the 86dvh cap, the
     scroll lock, Escape, the focus trap, the dialog role and the exit
     animation. Its body is a FadeScroller already, so the hand-rolled one
     that used to wrap this content is gone - it was here because the plain
     overflow clip sliced the first row of account cards straight through
     under the header, which is the thing FadeScroller exists to fix.

     "Show N transactions" is the pinned `footer`: it was the last thing in a
     column that scrolled, so on a short screen it sat below the fold. "Clear
     all" rides the title row as `titleAction`, and "Done" is gone - the
     scrim, Escape and the handle all dismiss a sheet now.

     The panel used to float on an inset with its own rounded corners and no
     handle, on the grounds that a floating card has no bottom edge to drag.
     Asking for a height docks it (see the prop's note in Sheet), so the edge
     is back and so is the handle. */
  return (
    <Sheet
      open={open}
      onClose={onClose}
      /* Heavier than a plain scrim because the panel is glass, and glass
         needs something soft behind it - see TxDetailSheet, where black/45
         left the list legible straight through the card. */
      scrim={55}
      maxHeight="86dvh"
      title={(
        <span className="flex items-center gap-2">
          Filters
          {activeCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </span>
      )}
      titleAction={activeCount > 0 && (
        <button
          onClick={onClear}
          className="text-xs font-semibold text-red-500 dark:text-red-400 active:opacity-60"
        >
          Clear all
        </button>
      )}
      footer={(
        <Button size="lg" block onClick={onClose}>
          Show {filteredCount} {filteredCount === 1 ? 'transaction' : 'transactions'}
        </Button>
      )}
    >
      <div className="flex flex-col gap-6 pb-4">
        {/* Amount range */}
        <div>
          <SectionLabel>Amount range</SectionLabel>
          <AmountRangeFilter
            allTxs={allTxs}
            amountMin={amountMin}
            amountMax={amountMax}
            onAmountMin={setAmountMin}
            onAmountMax={setAmountMax}
          />
        </div>

        {/* Date range */}
        <div>
          <SectionLabel>Date range</SectionLabel>
          {/* A fixed three-column grid, not flex-wrap. Five chips wrapped
              to 3 + 2, leaving "Custom…" adrift on a half-empty row - the
              orphan. Here the last chip stretches across the columns the
              row has left over, so both rows are full and every chip is the
              same height. The remainder test generalises: five options span
              two, six span none, seven span one. */}
          <div className="grid grid-cols-3 gap-2">
            {DATE_OPTS.map((o, i) => {
              const rem = DATE_OPTS.length % 3
              const isLast = i === DATE_OPTS.length - 1
              const span = isLast && rem === 2 ? 'col-span-2' : ''
              return (
                <button
                  key={o.value}
                  onClick={() => setDateRange(o.value)}
                  className={[
                    'py-2.5 rounded-xl text-xs font-semibold transition-colors duration-150 active:scale-95',
                    span,
                    dateRange === o.value
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400',
                  ].join(' ')}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
          {dateRange === 'custom' && (
            <div className="flex flex-col gap-2 mt-3">
              <div>
                <SectionLabel>From</SectionLabel>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="block w-full h-[52px] px-4 rounded-2xl text-sm font-medium
                    text-slate-700 dark:text-white
                    bg-slate-50 dark:bg-white/[0.06]
                    border border-slate-200/80 dark:border-white/[0.09]
                    outline-none focus:ring-2 focus:ring-primary/30
                    [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
              <div>
                <SectionLabel>To</SectionLabel>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="block w-full h-[52px] px-4 rounded-2xl text-sm font-medium
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

        {/* Account */}
        {(accounts ?? []).length > 0 && (
          <div>
            <SectionLabel>
              Account{accountFilters.length > 0 ? ` · ${accountFilters.length}` : ''}
            </SectionLabel>
            {/* The same card face the home carousel uses, at picker size.
                It was a stack of grey rows with a colour dot - which is a
                list of strings, when the app has spent real effort making
                each account look like the physical card in your wallet.
                Recognising GCash by its blue is faster than reading the
                word, and it is the same object in both places.

                Multi-select, because "GCash or Maya" used to be two passes
                and a mental merge. Two columns rather than three: at three
                the brand mark and the name both have to shrink past the
                point where the recognition works. */}
            <div className="grid grid-cols-2 gap-2">
              {(accounts ?? []).map(a => {
                const on = accountFilters.includes(a.name)
                const brand = accountBrand(a)
                return (
                  <button
                    key={a.id}
                    onClick={() => setAccountFilters(prev =>
                      on ? prev.filter(n => n !== a.name) : [...prev, a.name])}
                    aria-pressed={on}
                    data-brand={brand.key}
                    data-design={normalizeDesign(a.design)}
                    data-compact
                    className={`acct-card relative rounded-2xl px-3 pt-2.5 pb-2.5 flex flex-col
                      justify-between text-left text-white min-h-[74px] ${
                        on ? 'ring-2 ring-primary' : ''
                      }`}
                    style={{ '--card-from': brand.from, '--card-to': brand.to }}
                  >
                    <BrandWatermark brand={brand} />
                    <span className="flex items-start justify-between gap-2 w-full">
                      <BrandMark mark={brand.mark} size={16} className="shrink-0 opacity-90" />
                      {/* The tick is the only thing that says "picked" other
                          than the ring, which a colourblind user may not
                          separate from the card's own edge. */}
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0
                        transition-opacity duration-150 ${on ? 'opacity-100 bg-white' : 'opacity-0'}`}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
                          className="text-primary">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </span>
                    </span>
                    <span className="block text-[12px] font-semibold leading-tight truncate w-full">
                      {a.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Category */}
        {catOpts.length > 0 && (
          <div>
            <SectionLabel>Category</SectionLabel>
            {/* One scrollable row, the same control the add-expense form
                uses. It was a 3-column grid, which for nine categories is
                three rows of chips and the tallest block in the sheet - and
                a different way of picking a category from the one you used
                to record the transaction.

                Single-select with deselect-on-retap, so the parent does the
                toggling: the rail reports what was tapped and the filter
                decides whether that means set or clear. */}
            <CategoryRail
              categories={catOpts}
              selected={catOpts.find(c => c.name === categoryFilter) ?? null}
              onSelect={c => setCategoryFilter(prev => prev === c.name ? null : c.name)}
              gutter={20}
            />
          </div>
        )}
      </div>
    </Sheet>
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
      <div
        className="cat-tile w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
        style={{ '--cat-color': cat?.color ?? '#64748b' }}
      >
        <CategoryGlyph cat={cat} size={20} emoji="💸" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate leading-snug">
          {tx.description || (tx.type === 'transfer' ? `Transfer to ${tx.toAccount ?? ''}` : tx.category) || '—'}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
          {tx.type === 'transfer'
            ? `${tx.fromAccount ?? ''} → ${tx.toAccount ?? ''}`
            : (tx.account ?? '')}
          {cat && tx.type !== 'transfer' && (
            <span className="ml-1.5 text-slate-400 dark:text-slate-500">· {cat.name}</span>
          )}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className={`text-[13px] font-bold tabular-nums ${cls}`}>
          {sign}{fmt(tx.amount)}
        </p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{fmtTime(tx.date)}</p>
      </div>
    </button>
  )
}

/* The glyph only. The 20px squircle it used to sit in, and the 14/12px text
   under it, were this screen's own design for a moment every other screen
   draws as a 56px disc over 15/13px - so the shape is EmptyState's now and
   the icon is sized to match the rest of the set. */
function IconNoTransactions() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <line x1="2" y1="10" x2="22" y2="10" />
      <line x1="6" y1="15" x2="10" y2="15" />
      <line x1="6" y1="18" x2="8" y2="18" />
    </svg>
  )
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

          {/* Filter button. `relative` is for the count badge, which hangs off
              the corner. */}
          <IconButton
            label="Filters"
            variant={activeFilterCount > 0 ? 'primary' : 'surface'}
            className="relative"
            onClick={() => setFilterOpen(true)}
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
          </IconButton>
        </div>
      </div>

      {/* ── Search bar (always visible) ── */}
      <div className="px-5 mb-3">
        <div className="flex items-center gap-2.5 px-3.5 h-[38px] rounded-xl
          bg-white dark:bg-primary/[0.07]
          border border-slate-200/80 dark:border-primary/[0.14]
          shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.08)]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 shrink-0">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search transactions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[13px] text-slate-800 dark:text-white
              placeholder-slate-400 dark:placeholder-slate-500 outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-slate-400 dark:text-slate-500 active:scale-90 transition-transform">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Type filter (always visible) ── */}
      <QuickTypeFilter typeFilter={typeFilter} setTypeFilter={setTypeFilter} />

      {/* ── Active filter tags (date / account / category only) ── */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 px-5 pb-3 overflow-x-auto no-scrollbar">
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
        </div>
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
