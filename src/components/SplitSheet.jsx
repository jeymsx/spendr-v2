import { useEffect, useMemo, useState } from 'react'
import Sheet from './ui/Sheet'
import Button from './ui/Button'
import CategoryPickerSheet from './CategoryPickerSheet'
import CategoryGlyph from './CategoryGlyph'
import Divider from './ui/Divider'
import { IconChevronRight } from './icons'
import { moneyChangeHandler, parseMoney } from '../utils/moneyInput'
import { fmt } from '../lib/money'

/**
 * One purchase, filed under several categories.
 *
 * ── Allocation, not re-entry ──
 *
 * The total is already known by the time this opens - you typed it on the
 * form. So nothing here asks for an amount again; it asks how to divide one.
 *
 * The trick that makes it quick is that the FIRST leg absorbs whatever is
 * left over. Add Household, type 800, and Groceries silently becomes 2,400.
 * You never do the arithmetic, and the legs cannot fail to add up to the
 * purchase - which matters, because a split that is 20 pesos short of the
 * amount that actually left the account is a ledger that disagrees with the
 * bank for no reason anyone will ever find.
 *
 * Typing into the first leg is therefore not allowed to un-balance it either:
 * it is shown, not editable, and the remainder line explains why.
 *
 * ── What it writes ──
 *
 * N ordinary expenses sharing a splitId - see db/txHelpers.postSplitExpense.
 * Every sum-by-category in the app is already right about them without
 * knowing splits exist, because each leg is simply an expense.
 */
export default function SplitSheet({
  open, onClose, total = 0, categories = [], initialCategory = null, onConfirm,
}) {
  /** Legs after the first. The first is whatever is left. */
  const [rest, setRest] = useState(/** @type {any[]} */ ([]))
  const [head, setHead] = useState(/** @type {any} */ (null))
  const [picking, setPicking] = useState(/** @type {number|'head'|null} */ (null))

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHead(initialCategory ?? categories[0] ?? null)
    setRest([])
    setPicking(null)
  }, [open, initialCategory, categories])

  const allocated = useMemo(
    () => rest.reduce((s, l) => s + parseMoney(l.amountStr), 0), [rest])
  const headAmount = Math.round((total - allocated) * 100) / 100
  const over = headAmount < -0.005

  const used = new Set([head?.name, ...rest.map(l => l.cat?.name)].filter(Boolean))
  const available = categories.filter(c => !used.has(c.name))

  const ready = !!head && headAmount > 0.005
    && rest.length > 0 && rest.every(l => l.cat && parseMoney(l.amountStr) > 0)

  const addLeg = () => {
    const next = available[0]
    if (!next) return
    setRest(r => [...r, { cat: next, amountStr: '' }])
  }

  const setLeg = (i, patch) =>
    setRest(r => r.map((l, n) => (n === i ? { ...l, ...patch } : l)))

  const removeLeg = (i) => setRest(r => r.filter((_, n) => n !== i))

  const confirm = () => onConfirm([
    { category: head.name, amount: headAmount },
    ...rest.map(l => ({ category: l.cat.name, amount: parseMoney(l.amountStr) })),
  ])

  const rowClass = 'flex items-center gap-3 py-3'

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        z={130}
        scrim={55}
        title="Split this purchase"
        footer={(
          <div className="flex gap-2.5">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-[1.6]" onClick={confirm} disabled={!ready}>
              Use this split
            </Button>
          </div>
        )}
      >
        <div className="pb-1">
          {/* The first leg takes the remainder, so it is shown rather than
              typed. Editing both ends of a subtraction is how a split stops
              adding up. */}
          <button
            type="button"
            onClick={() => setPicking('head')}
            className={`${rowClass} w-full text-left`}
          >
            <span
              className="cat-tile w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ '--cat-color': head?.color ?? '#64748b' }}
            >
              <CategoryGlyph cat={head} size={16} emoji="🏷️" />
            </span>
            <span className="flex-1 min-w-0 text-14 font-semibold text-slate-800 dark:text-white truncate">
              {head?.name ?? 'Choose a category'}
            </span>
            <span className={`text-14 font-semibold tabular-nums ${
              over ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-white'
            }`}>
              {fmt(headAmount)}
            </span>
            <span className="text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true">
              <IconChevronRight />
            </span>
          </button>

          {rest.map((leg, i) => (
            <div key={i}>
              <Divider />
              <div className={rowClass}>
                <button
                  type="button"
                  onClick={() => setPicking(i)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <span
                    className="cat-tile w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ '--cat-color': leg.cat?.color ?? '#64748b' }}
                  >
                    <CategoryGlyph cat={leg.cat} size={16} emoji="🏷️" />
                  </span>
                  <span className="flex-1 min-w-0 text-14 font-semibold text-slate-800 dark:text-white truncate">
                    {leg.cat?.name ?? 'Choose'}
                  </span>
                </button>
                <input
                  value={leg.amountStr}
                  onChange={moneyChangeHandler(v => setLeg(i, { amountStr: v }))}
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label={`Amount for ${leg.cat?.name ?? 'this category'}`}
                  className="w-[104px] text-right text-14 font-semibold tabular-nums
                    bg-transparent outline-none text-slate-800 dark:text-white
                    placeholder-slate-300 dark:placeholder-slate-600"
                />
                <button
                  type="button"
                  onClick={() => removeLeg(i)}
                  aria-label={`Remove ${leg.cat?.name ?? 'this category'}`}
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                    text-slate-400 dark:text-slate-500
                    active:bg-slate-100 dark:active:bg-white/[0.06]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          <Divider />

          <button
            type="button"
            onClick={addLeg}
            disabled={available.length === 0}
            className="w-full py-3 text-left text-14 font-semibold text-primary
              disabled:opacity-40 disabled:text-slate-400"
          >
            + Add category
          </button>

          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-12 text-slate-400 dark:text-slate-500">
              {over ? 'Over by' : 'Left for the first category'}
            </span>
            <span className={`text-13 font-semibold tabular-nums ${
              over ? 'text-red-500 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
            }`}>
              {fmt(Math.abs(headAmount))} of {fmt(total)}
            </span>
          </div>
        </div>
      </Sheet>

      <CategoryPickerSheet
        open={picking !== null}
        onClose={() => setPicking(null)}
        categories={categories}
        selected={picking === 'head' ? head : rest[/** @type {number} */ (picking)]?.cat}
        onSelect={(cat) => {
          if (picking === 'head') setHead(cat)
          else setLeg(/** @type {number} */ (picking), { cat })
        }}
      />
    </>
  )
}
