import Sheet from '../../components/ui/Sheet'
import Card from '../../components/ui/Card'
import SectionLabel from '../../components/ui/SectionLabel'
import Button from '../../components/ui/Button'
import CategoryGlyph from '../../components/CategoryGlyph'
import CategoryRail from '../../components/CategoryRail'
import BrandMark from '../../components/BrandMark'
import BrandWatermark from '../../components/BrandWatermark'
import { accountBrand } from '../../lib/accountBrands'
import { normalizeDesign } from '../../lib/cardDesigns'
import { fmt } from '../../lib/money'
import { DATE_OPTS, AMOUNT_COLOR, fmtTime } from './shared'
import { AmountRangeFilter } from './AmountRange'
import { DateRow } from './QuickFilter'

// ── Filter sheet ───────────────────────────────────────────────────────────────

export function FilterModal({
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
          {/* One card, two rows. They were two full-width date fields each
              under its own caption - four elements to express one range, in
              the only web-form-looking corner of the app. */}
          {dateRange === 'custom' && (
            <Card surface="recessed" clip className="mt-3">
              <DateRow
                label="Start date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
              />
              <DateRow
                label="End date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                isLast
              />
            </Card>
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

export function TxRow({ tx, catMap, onClick }) {
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
export function IconNoTransactions() {
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
