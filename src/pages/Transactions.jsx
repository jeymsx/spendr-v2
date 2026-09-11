import { useState, useMemo, useEffect, useCallback, useDeferredValue } from 'react'
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
import FadeScroller from '../components/FadeScroller'

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

const BUCKETS = 28

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
      <div className="flex items-end gap-[2px] h-14 mb-1 px-0.5">
        {buckets.map((count, i) => {
          const bucketLoPos = i / BUCKETS * 100
          const bucketHiPos = (i + 1) / BUCKETS * 100
          const inRange     = bucketHiPos > loPos && bucketLoPos < hiPos
          const heightPct   = count === 0 ? 4 : Math.max(8, (count / maxCount) * 100)
          return (
            <div
              key={i}
              className="flex-1 rounded-sm transition-colors duration-150"
              style={{
                height: `${heightPct}%`,
                backgroundColor: inRange
                  ? 'rgba(var(--color-primary-rgb), 0.75)'
                  : 'rgba(var(--color-primary-rgb), 0.15)',
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

      {/* Min / Max labels */}
      <div className="flex justify-between mt-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Min</span>
          <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-white/[0.06] border border-slate-200/60 dark:border-white/[0.07]">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {amountMin == null ? 'Any' : fmtAmt(amountMin)}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1 items-end">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Max</span>
          <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-white/[0.06] border border-slate-200/60 dark:border-white/[0.07]">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {amountMax == null ? 'Any' : fmtAmt(amountMax) + '+'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Filter sheet ───────────────────────────────────────────────────────────────

/* Hoisted out of FilterModal.

   Declaring a component inside another makes a NEW component type on every
   render, so React unmounts the old subtree and mounts a fresh one each time
   the parent re-renders - any state or focus inside it is discarded.
   Harmless for a label, wrong as a habit, and the rule cannot tell which it
   is looking at. */
function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="w-[3px] h-3.5 rounded-full bg-primary shrink-0" />
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {children}
      </p>
    </div>
  )
}

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

  // Show all categories (deduped by name), optionally narrowed to the selected type
  const catOpts = Object.values(
    (categories ?? [])
      .filter(c => c.type !== 'transfer' && (typeFilter === 'all' || c.type === typeFilter || !c.type))
      .reduce((map, c) => { map[c.name] = map[c.name] ?? c; return map }, {})
  )

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Heavier than a plain scrim because the panel is glass, and glass
          needs something soft behind it - see TxDetailSheet, where black/45
          and a 4px blur left the list legible straight through the card. */}
      <div className="sheet-overlay absolute inset-0 bg-black/55 backdrop-blur-xl" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'card absolute inset-x-3 rounded-[28px]',
          'bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))]',
          'max-h-[86dvh] flex flex-col',
        ].join(' ')}
      >
        {/* Header. No grab handle: this floats now, so there is no edge to
            drag it down from and a handle would promise a gesture that does
            not exist. "Done" closes it, and so does the backdrop. */}
        <div className="pt-5 px-5 pb-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">Filters</h3>
              {activeCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-white">
                  {activeCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {activeCount > 0 && (
                <button
                  onClick={onClear}
                  className="text-xs font-semibold text-red-500 dark:text-red-400 active:opacity-60"
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

        {/* Scrollable body, feathered at whichever edge it has run past.
            It was a plain overflow clip, so the first row of account cards
            was sliced straight through under the header - the exact thing
            FadeScroller exists for, and this sheet predates it. */}
        <FadeScroller
          className="flex-1 px-5 pb-4 flex flex-col gap-6"
          style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
        >

          {/* Amount Range */}
          <div>
            <SectionLabel>Amount Range</SectionLabel>
            <AmountRangeFilter
              allTxs={allTxs}
              amountMin={amountMin}
              amountMax={amountMax}
              onAmountMin={setAmountMin}
              onAmountMax={setAmountMax}
            />
          </div>

          {/* Date Range */}
          <div>
            <SectionLabel>Date Range</SectionLabel>
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
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 px-0.5">From</p>
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
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 px-0.5">To</p>
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
        </FadeScroller>

        {/* Footer CTA */}
        <div
          className="px-5 pt-3 shrink-0 border-t border-slate-100 dark:border-white/[0.06]"
          /* The panel carries its own inset from the screen edge now, so the
             footer needs padding rather than a safe-area reach-through. */
          style={{ paddingBottom: '16px' }}
        >
          <button
            onClick={close}
            className="w-full py-4 rounded-2xl text-sm font-semibold text-white
              bg-primary shadow-[0_4px_16px_rgba(var(--color-primary-rgb),0.3)]
              active:scale-[0.98] transition-all duration-100"
          >
            Show {filteredCount} {filteredCount === 1 ? 'transaction' : 'transactions'}
          </button>
        </div>
      </div>
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

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search, typeFilter, accountFilters, categoryFilter, dateRange, customFrom, customTo, amountMin, amountMax])

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
          {/* Single view mode toggle — icon swaps between list and calendar */}
          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')}
            className={[
              'w-9 h-9 rounded-2xl flex items-center justify-center transition-colors duration-150',
              'border shadow-sm',
              viewMode === 'calendar'
                ? 'bg-primary border-primary text-white'
                : 'bg-white dark:bg-primary/[0.10] border-slate-200/80 dark:border-primary/[0.20] text-slate-500 dark:text-slate-300 dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.12)]',
            ].join(' ')}
            aria-label={viewMode === 'list' ? 'Switch to calendar view' : 'Switch to list view'}
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
          </button>

          {/* Filter button */}
          <button
            onClick={() => setFilterOpen(true)}
            className={[
              'relative w-9 h-9 rounded-2xl flex items-center justify-center transition-colors duration-150',
              'border shadow-sm',
              activeFilterCount > 0
                ? 'bg-primary border-primary text-white'
                : 'bg-white dark:bg-primary/[0.10] border-slate-200/80 dark:border-primary/[0.20] text-slate-500 dark:text-slate-300 dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.12)]',
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
        <EmptyState />
      ) : (
        <>
          {groups.map(({ date, txs }) => (
            <div key={date} className="mb-1">
              <div className="flex items-center gap-3 px-5 py-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {fmtGroupDate(date)}
                </span>
                <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.07]" />
                <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                  {txs.length} {txs.length === 1 ? 'txn' : 'txns'}
                </span>
              </div>

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
