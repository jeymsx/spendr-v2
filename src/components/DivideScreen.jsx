import { useEffect, useMemo, useState } from 'react'
import Segmented from './ui/Segmented'
import Button from './ui/Button'
import Divider from './ui/Divider'
import CategoryGlyph from './CategoryGlyph'
import CategoryPickerSheet from './CategoryPickerSheet'
import IconButton from './ui/IconButton'
import { IconChevronLeft, IconChevronRight } from './icons'
import { moneyChangeHandler, parseMoney } from '../utils/moneyInput'
import { getInitials, getAvatarColor } from '../pages/debts/shared'
import { fmt } from '../lib/money'

/**
 * Dividing one expense, on a screen of its own.
 *
 * ── Why it is not on the form ──
 *
 * It was, and the form stopped being a form. Logging an expense is meant to be
 * amount, category, account, done - and a category rail followed by a split
 * button followed by a name field followed by an amount field followed by a
 * row of chips is not that. Every one of those controls is for something most
 * expenses never do.
 *
 * So the form keeps ONE row, and everything about dividing lives here. The
 * common case gets its speed back and the uncommon case gets room.
 *
 * ── Why a full-screen surface rather than a sheet ──
 *
 * Two modes, each with a list you add rows to, a running remainder and its own
 * scroll. That is a task with sub-state, which is a page by this app's own
 * rule - and a sheet would also have to open the category picker, which is a
 * sheet over a sheet with no clear way back.
 *
 * It is rendered in the form's tree rather than routed, because the expense
 * does not exist yet. A route would mean marshalling an unsaved draft out and
 * back through history, and losing it to any refresh.
 *
 * ── The two divisions are different questions ──
 *
 * BY CATEGORY splits one expense you paid entirely into several rows you paid
 * entirely. Nothing is owed to anybody; the money is just filed in more than
 * one place.
 *
 * WITH PEOPLE keeps the expense whole and records that part of it is coming
 * back. The full amount still left your account - your bank agrees - so the
 * expense stays at face value and each person's share becomes a receivable
 * that refunds this purchase when they settle.
 *
 * They compose: a dinner can be split across two categories AND owed by three
 * people. The receivables attach to the first leg.
 */
export default function DivideScreen({
  open = true, onClose, total = 0, categories = [], initialCategory = null,
  initialLegs = null, initialPeople = null, onApply,
}) {
  const [tab, setTab] = useState('categories')
  const [head, setHead] = useState(/** @type {any} */ (null))
  const [rest, setRest] = useState(/** @type {any[]} */ ([]))
  const [people, setPeople] = useState(/** @type {any[]} */ ([]))
  const [picking, setPicking] = useState(/** @type {number|'head'|null} */ (null))

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHead(initialCategory ?? categories[0] ?? null)
    setRest(initialLegs ?? [])
    setPeople(initialPeople ?? [])
    setPicking(null)
  }, [open, initialCategory, categories, initialLegs, initialPeople])

  // ── By category ──────────────────────────────────────────────────────────
  const allocated = useMemo(
    () => rest.reduce((s, l) => s + parseMoney(l.amountStr), 0), [rest])
  const headAmount = Math.round((total - allocated) * 100) / 100
  const overCat = headAmount < -0.005

  const usedCats = new Set([head?.name, ...rest.map(l => l.cat?.name)].filter(Boolean))
  const freeCats = categories.filter(c => !usedCats.has(c.name))

  // ── With people ──────────────────────────────────────────────────────────
  const owed = useMemo(
    () => people.reduce((s, p) => s + parseMoney(p.amountStr), 0), [people])
  const mine = Math.round((total - owed) * 100) / 100
  const overPeople = mine < -0.005

  /** Everyone including you, so "split evenly" means what it says. */
  const splitEvenly = () => {
    const heads = people.length + 1
    if (heads < 2) return
    const each = Math.floor((total / heads) * 100) / 100
    setPeople(ps => ps.map(p => ({ ...p, amountStr: String(each) })))
  }

  const addPerson = () => setPeople(ps => [...ps, { name: '', amountStr: '' }])
  const setPerson = (i, patch) =>
    setPeople(ps => ps.map((p, n) => (n === i ? { ...p, ...patch } : p)))
  const removePerson = (i) => setPeople(ps => ps.filter((_, n) => n !== i))

  const setLeg = (i, patch) => setRest(r => r.map((l, n) => (n === i ? { ...l, ...patch } : l)))
  const addLeg = () => {
    const next = freeCats[0]
    if (next) setRest(r => [...r, { cat: next, amountStr: '' }])
  }

  const legsValid = rest.length === 0
    || (headAmount > 0.005 && rest.every(l => l.cat && parseMoney(l.amountStr) > 0))
  const peopleValid = people.length === 0
    || (mine >= -0.005 && people.every(p => p.name.trim() && parseMoney(p.amountStr) > 0))
  const ready = legsValid && peopleValid && (rest.length > 0 || people.length > 0)

  const apply = () => onApply({
    legs: rest.length > 0
      ? [{ category: head.name, amount: headAmount },
         ...rest.map(l => ({ category: l.cat.name, amount: parseMoney(l.amountStr) }))]
      : null,
    people: people.length > 0
      ? people.map(p => ({ name: p.name.trim(), amount: parseMoney(p.amountStr) }))
      : null,
  })

  /* Sized in `ch` from its own contents, the way the budget editor does it.
     A fixed width right-aligns the digits but strands the peso sign at the
     far end of an empty box - "P      50" rather than "P50". `ch` is exact
     here because the figures are tabular. */
  const amountInput = 'shrink-0 text-right text-14 font-semibold tabular-nums '
    + 'bg-transparent outline-none text-slate-800 dark:text-white '
    + 'placeholder-slate-300 dark:placeholder-slate-600'
  /** @param {string} text */
  const amountWidth = (text) => ({ width: text ? `${text.length + 0.5}ch` : '4.5ch' })

  return (
    /* An ordinary page in the route's own slot, NOT an overlay.
 
       It was `fixed inset-0 bg-page` first, and that was visibly wrong: in
       dark mode the app's background is a gradient on <html> and body is
       transparent, so any full-screen element painting its own colour lays a
       flat slab over it. The fix is not a better colour - it is to stop
       covering the page and start BEING it. AddExpense renders this instead
       of the form while it is open, so the real background shows through
       because nothing is in front of it.
 
       That also drops the design-ok waiver this needed as an overlay. */
    <div className="pb-nav">
      <header className="flex items-center gap-3 px-4 pt-safe-header pb-3">
        <IconButton label="Back to the expense" onClick={onClose}>
          <IconChevronLeft />
        </IconButton>
        <div className="flex-1 min-w-0">
          <h1 className="text-17 font-semibold text-slate-900 dark:text-white truncate">
            Divide this expense
          </h1>
          <p className="text-11 text-slate-400 dark:text-slate-500 tabular-nums">
            {fmt(total)} total
          </p>
        </div>
      </header>

      <div className="px-4 pb-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'categories', label: 'By category' },
            { value: 'people', label: 'With people' },
          ]}
        />
      </div>

      <div className="px-4 pb-6">
        {tab === 'categories' ? (
          <>
            <p className="text-12 leading-snug text-slate-400 dark:text-slate-500 mb-3">
              One purchase, filed under more than one category. The first row takes
              whatever is left, so the parts always add up.
            </p>

            <button
              type="button"
              onClick={() => setPicking('head')}
              className="w-full flex items-center gap-3 py-3 text-left"
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
                overCat ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-white'
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
                <div className="flex items-center gap-3 py-3">
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
                  {/* The peso sign belongs on an editable figure as much as on
                      a rendered one - without it the typed rows read as bare
                      numbers next to the formatted first row. */}
                  <span className="flex items-baseline gap-0.5 shrink-0">
                    <span className="text-14 font-medium text-slate-400 dark:text-slate-500">₱</span>
                    <input
                      value={leg.amountStr}
                      onChange={moneyChangeHandler(v => setLeg(i, { amountStr: v }))}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label={`Amount for ${leg.cat?.name ?? 'this category'}`}
                      style={amountWidth(leg.amountStr)}
                      className={amountInput}
                    />
                  </span>
                  <button
                    type="button"
                    onClick={() => setRest(r => r.filter((_, n) => n !== i))}
                    aria-label={`Remove ${leg.cat?.name ?? 'this category'}`}
                    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                      text-slate-400 dark:text-slate-500
                      active:bg-slate-100 dark:active:bg-white/[0.06]"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}

            <Divider />
            <button
              type="button"
              onClick={addLeg}
              disabled={freeCats.length === 0}
              className="w-full py-3 text-left text-14 font-semibold text-primary
                disabled:opacity-40 disabled:text-slate-400"
            >
              + Add category
            </button>

            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-12 text-slate-400 dark:text-slate-500">
                {overCat ? 'Over by' : 'Left for the first row'}
              </span>
              <span className={`text-13 font-semibold tabular-nums ${
                overCat ? 'text-red-500 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
              }`}>
                {fmt(Math.abs(headAmount))} of {fmt(total)}
              </span>
            </div>
          </>
        ) : (
          <>
            <p className="text-12 leading-snug text-slate-400 dark:text-slate-500 mb-3">
              You paid all of it, so the expense stays at {fmt(total)}. Each share
              below becomes something they owe you, and settling it refunds this
              purchase.
            </p>

            {/* You are a row too, so the arithmetic is visible rather than
                implied. Not editable: your share is whatever is left, the same
                rule the category side uses. */}
            <div className="flex items-center gap-3 py-3">
              <span className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center
                text-11 font-bold text-white bg-primary"
              >
                You
              </span>
              <span className="flex-1 min-w-0 text-14 font-semibold text-slate-800 dark:text-white">
                Your share
              </span>
              <span className={`text-14 font-semibold tabular-nums ${
                overPeople ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-white'
              }`}>
                {fmt(mine)}
              </span>
            </div>

            {people.map((p, i) => (
              <div key={i}>
                <Divider />
                <div className="flex items-center gap-3 py-3">
                  <span
                    className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center
                      text-11 font-bold text-white"
                    style={{ background: getAvatarColor(p.name || String(i)) }}
                    aria-hidden="true"
                  >
                    {getInitials(p.name || '?')}
                  </span>
                  <input
                    value={p.name}
                    onChange={e => setPerson(i, { name: e.target.value })}
                    placeholder="Name"
                    aria-label={`Name of person ${i + 1}`}
                    className="flex-1 min-w-0 bg-transparent outline-none
                      text-14 font-semibold text-slate-800 dark:text-white
                      placeholder-slate-300 dark:placeholder-slate-600"
                  />
                  <span className="flex items-baseline gap-0.5 shrink-0">
                    <span className="text-14 font-medium text-slate-400 dark:text-slate-500">₱</span>
                    <input
                      value={p.amountStr}
                      onChange={moneyChangeHandler(v => setPerson(i, { amountStr: v }))}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label={`Amount owed by ${p.name || `person ${i + 1}`}`}
                      style={amountWidth(p.amountStr)}
                      className={amountInput}
                    />
                  </span>
                  <button
                    type="button"
                    onClick={() => removePerson(i)}
                    aria-label={`Remove ${p.name || `person ${i + 1}`}`}
                    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                      text-slate-400 dark:text-slate-500
                      active:bg-slate-100 dark:active:bg-white/[0.06]"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}

            <Divider />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={addPerson}
                className="flex-1 py-3 text-left text-14 font-semibold text-primary"
              >
                + Add someone
              </button>
              {people.length > 0 && (
                <button
                  type="button"
                  onClick={splitEvenly}
                  className="shrink-0 py-2 px-3 text-13 font-semibold text-slate-500
                    dark:text-slate-400 active:opacity-70"
                >
                  Split evenly
                </button>
              )}
            </div>

            {people.length > 0 && (
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-12 text-slate-400 dark:text-slate-500">
                  {overPeople ? 'They owe more than it cost' : 'Coming back to you'}
                </span>
                <span className={`text-13 font-semibold tabular-nums ${
                  overPeople ? 'text-red-500 dark:text-red-400'
                             : 'text-emerald-600 dark:text-emerald-400'
                }`}>
                  {fmt(owed)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="px-4 pb-6 flex gap-2.5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button className="flex-[1.6]" onClick={apply} disabled={!ready}>
          Done
        </Button>
      </div>

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
    </div>
  )
}
