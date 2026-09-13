import { useEffect, useMemo, useState } from 'react'
import Segmented from './ui/Segmented'
import Button from './ui/Button'
import Divider from './ui/Divider'
import CategoryGlyph from './CategoryGlyph'
import IconButton from './ui/IconButton'
import { IconChevronLeft } from './icons'
import { moneyChangeHandler, parseMoney } from '../utils/moneyInput'
import { getInitials, getAvatarColor } from '../pages/debts/shared'
import { fmt } from '../lib/money'
import FadeScroller from './FadeScroller'
import { RAIL_TOUCH } from './ui/Rail'
import { chipClass } from '../pages/accounts/shared'
import { resolveSplit, SPLIT_MODES, MODE_FIELD } from '../lib/splitModes'
import { useTheme } from '../context/ThemeContext'

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
/**
 * A category, as the platform's own dropdown.
 *
 * A picker sheet is right when choosing the category IS the task - the add
 * form's rail is a grid of glyphs you swipe, and it earns its screen. Here it
 * is one field in a row, repeated per row, and opening a full sheet for each
 * one is a lot of ceremony to change a word. The native control also brings
 * the wheel on iOS, type-ahead on a keyboard, and VoiceOver for free.
 *
 * The glyph stays beside it, because a bare <select> cannot show one and the
 * colour is most of how a category is recognised.
 *
 * colorScheme is not decoration: without it the OPTION LIST renders in the
 * system theme rather than the app's, so a dark app opens a white dropdown.
 * Same fix the report month selector uses.
 */
function CategorySelect({ categories, value, onChange, label }) {
  const { theme } = useTheme()
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(categories.find(c => c.name === e.target.value))}
      aria-label={label}
      className="flex-1 min-w-0 bg-transparent outline-none text-14 font-semibold
        text-slate-800 dark:text-white"
      style={{ colorScheme: theme === 'dark' ? 'dark' : 'light' }}
    >
      {!value && <option value="">Choose a category</option>}
      {categories.map(c => (
        <option key={c.id ?? c.name} value={c.name}>{c.name}</option>
      ))}
    </select>
  )
}

/**
 * One participant, in whatever shape the current mode needs.
 *
 * The row is the same in every mode; only the middle field changes, and the
 * resolved peso amount is always on the right. That last part matters: in
 * percent, shares and adjustment you are typing something that is NOT money,
 * and without the resolved figure beside it you would be dividing a bill
 * blind until you pressed Done.
 *
 * Tapping the avatar includes or excludes. "I did not eat" is a normal thing
 * to say about a bill, and it is the only way `equal` can mean anything other
 * than everybody.
 */
function PersonRow({
  avatar, avatarBg, name, included, onToggle, mode, value, onValue,
  share, onRemove, label,
}) {
  const field = MODE_FIELD[mode] ?? MODE_FIELD.equal
  const dim = included ? '' : 'opacity-40'

  /* Digits only for shares, digits and one point for the rest. Written out
     rather than reusing moneyChangeHandler because a percent and a share
     count are not money and must not be grouped with separators. */
  const onChange = (e) => {
    const raw = String(e.target.value)
    if (field.kind === 'integer') return onValue(raw.replace(/[^0-9]/g, ''))
    const neg = mode === 'adjust' && raw.trim().startsWith('-')
    const body = raw.replace(/[^0-9.]/g, '')
    const parts = body.split('.')
    const clean = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : body
    onValue((neg ? '-' : '') + clean)
  }

  return (
    <div className={`flex items-center gap-3 py-3 ${dim}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={included}
        aria-label={included ? `Leave ${label} out` : `Include ${label}`}
        className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center
          text-11 font-bold text-white relative"
        style={{ background: avatarBg }}
      >
        {avatar}
        {!included && (
          <span className="absolute inset-0 rounded-full flex items-center justify-center
            bg-slate-900/60 dark:bg-black/60"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </span>
        )}
      </button>

      <span className="flex-1 min-w-0">{name}</span>

      {included && field.kind !== 'none' && (
        <span className="flex items-baseline gap-0.5 shrink-0">
          {field.prefix && (
            <span className="text-13 font-medium text-slate-400 dark:text-slate-500">
              {field.prefix}
            </span>
          )}
          <input
            value={value}
            onChange={onChange}
            inputMode={field.kind === 'integer' ? 'numeric' : 'decimal'}
            placeholder={field.placeholder}
            aria-label={`${mode} value for ${label}`}
            style={{ width: value ? `${value.length + 0.5}ch` : '3.5ch' }}
            className="shrink-0 text-right text-13 font-semibold tabular-nums
              bg-transparent outline-none text-slate-800 dark:text-white
              placeholder-slate-300 dark:placeholder-slate-600"
          />
          {field.suffix && (
            <span className="text-13 font-medium text-slate-400 dark:text-slate-500">
              {field.suffix}
            </span>
          )}
        </span>
      )}

      {/* The resolved figure, always. It is the only thing on the row that is
          money in every mode. */}
      <span className="shrink-0 w-[88px] text-right text-14 font-semibold tabular-nums
        text-slate-800 dark:text-white"
      >
        {included ? fmt(share ?? 0) : '—'}
      </span>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center
            text-slate-400 dark:text-slate-500
            active:bg-slate-100 dark:active:bg-white/[0.06]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  )
}

export default function DivideScreen({
  open = true, onClose, total = 0, categories = [], initialCategory = null,
  initialLegs = null, initialPeople = null, onApply,
}) {
  const [tab, setTab] = useState('categories')
  const [head, setHead] = useState(/** @type {any} */ (null))
  const [rest, setRest] = useState(/** @type {any[]} */ ([]))
  const [people, setPeople] = useState(/** @type {any[]} */ ([]))
  const [mode, setMode] = useState('equal')
  /** You are a participant, not the remainder - every mode needs the head. */
  const [youIn, setYouIn] = useState(true)
  const [youValue, setYouValue] = useState('')

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHead(initialCategory ?? categories[0] ?? null)
    setRest(initialLegs ?? [])
    setPeople(initialPeople ?? [])
    setMode('equal')
    setYouIn(true)
    setYouValue('')
  }, [open, initialCategory, categories, initialLegs, initialPeople])

  // ── By category ──────────────────────────────────────────────────────────
  const allocated = useMemo(
    () => rest.reduce((s, l) => s + parseMoney(l.amountStr), 0), [rest])
  const headAmount = Math.round((total - allocated) * 100) / 100
  const overCat = headAmount < -0.005

  const usedCats = new Set([head?.name, ...rest.map(l => l.cat?.name)].filter(Boolean))
  const freeCats = categories.filter(c => !usedCats.has(c.name))

  // ── With people ──────────────────────────────────────────────────────────
  /* One shape for all five modes: `value` means pesos, a percent, a count of
     shares or a plus-or-minus, and lib/splitModes decides which. */
  const participants = useMemo(() => [
    { id: 'you', included: youIn, value: parseMoney(youValue) },
    ...people.map((p, i) => ({
      id: `p${i}`, included: p.included !== false, value: parseMoney(p.valueStr),
    })),
  ], [youIn, youValue, people])

  const split = useMemo(
    () => resolveSplit({ mode, total, participants }), [mode, total, participants])

  const owed = useMemo(() => people.reduce(
    (s, _, i) => s + (split.shares[`p${i}`] ?? 0), 0), [people, split])
  const addPerson = () => setPeople(ps => [...ps, { name: '', valueStr: '', included: true }])

  /* Switching mode CLEARS the figures, and that is not tidiness.
 
     One `value` field serves all five modes, and it means something different
     in each - so leaving "30" in place when percent becomes +/− turns a 30%
     share into a 30 peso surcharge. Silently: the arithmetic is valid, the
     total still adds up, and the bill is simply wrong. Caught by driving the
     modes in order and reading the result.
 
     Inclusion survives, because "Mika did not eat" is true whichever way the
     rest is divided. */
  const pickMode = (next) => {
    if (next === mode) return
    setMode(next)
    setYouValue('')
    setPeople(ps => ps.map(p => ({ ...p, valueStr: '' })))
  }
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
    || (split.valid && people.every(p => p.name.trim()))
  const ready = legsValid && peopleValid && (rest.length > 0 || people.length > 0)

  const apply = () => onApply({
    legs: rest.length > 0
      ? [{ category: head.name, amount: headAmount },
         ...rest.map(l => ({ category: l.cat.name, amount: parseMoney(l.amountStr) }))]
      : null,
    /* Resolved to exact pesos here, so nothing downstream has to know a mode
       existed. A person owing nothing is not a debt. */
    people: people.length > 0
      ? people
          .map((p, i) => ({ name: p.name.trim(), amount: split.shares[`p${i}`] ?? 0 }))
          .filter(p => p.amount > 0)
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
            <p className="text-12 text-slate-400 dark:text-slate-500 mb-3">
              The first row takes whatever is left.
            </p>

            <div className="flex items-center gap-3 py-3">
              <span
                className="cat-tile w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ '--cat-color': head?.color ?? '#64748b' }}
                aria-hidden="true"
              >
                <CategoryGlyph cat={head} size={16} emoji="🏷️" />
              </span>
              <CategorySelect
                categories={categories}
                value={head?.name}
                onChange={setHead}
                label="Category for the first row"
              />
              <span className={`text-14 font-semibold tabular-nums shrink-0 ${
                overCat ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-white'
              }`}>
                {fmt(headAmount)}
              </span>
            </div>

            {rest.map((leg, i) => (
              <div key={i}>
                <Divider />
                <div className="flex items-center gap-3 py-3">
                  <span
                    className="cat-tile w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ '--cat-color': leg.cat?.color ?? '#64748b' }}
                    aria-hidden="true"
                  >
                    <CategoryGlyph cat={leg.cat} size={16} emoji="🏷️" />
                  </span>
                  <CategorySelect
                    categories={categories}
                    value={leg.cat?.name}
                    onChange={cat => setLeg(i, { cat })}
                    label={`Category for row ${i + 2}`}
                  />
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
            <p className="text-12 text-slate-400 dark:text-slate-500 mb-3">
              You paid. Their shares become debts they owe you.
            </p>

            {/* Five modes, because they are five things people say out loud at
                a table, not variations on one. See lib/splitModes.js. */}
            <FadeScroller
              axis="x"
              style={RAIL_TOUCH}
              className="flex items-center gap-1.5 mb-1 -mx-4 px-4 pb-0.5"
            >
              {SPLIT_MODES.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => pickMode(m.value)}
                  className={chipClass(mode === m.value)}
                >
                  {m.label}
                </button>
              ))}
            </FadeScroller>
            <p className="text-11 text-slate-400 dark:text-slate-500 mb-3">
              {SPLIT_MODES.find(m => m.value === mode)?.hint}
            </p>

            <PersonRow
              avatar={<span className="text-11 font-bold text-white">You</span>}
              avatarBg="var(--color-primary)"
              name={<span className="text-14 font-semibold text-slate-800 dark:text-white">You</span>}
              included={youIn}
              onToggle={() => setYouIn(v => !v)}
              mode={mode}
              value={youValue}
              onValue={setYouValue}
              share={split.shares.you}
              label="you"
            />

            {people.map((p, i) => (
              <div key={i}>
                <Divider />
                <PersonRow
                  avatar={getInitials(p.name || '?')}
                  avatarBg={getAvatarColor(p.name || String(i))}
                  name={(
                    <input
                      value={p.name}
                      onChange={e => setPerson(i, { name: e.target.value })}
                      placeholder="Name"
                      aria-label={`Name of person ${i + 1}`}
                      className="w-full min-w-0 bg-transparent outline-none
                        text-14 font-semibold text-slate-800 dark:text-white
                        placeholder-slate-300 dark:placeholder-slate-600"
                    />
                  )}
                  included={p.included !== false}
                  onToggle={() => setPerson(i, { included: p.included === false })}
                  mode={mode}
                  value={p.valueStr}
                  onValue={v => setPerson(i, { valueStr: v })}
                  share={split.shares[`p${i}`]}
                  onRemove={() => removePerson(i)}
                  label={p.name || `person ${i + 1}`}
                />
              </div>
            ))}

            <Divider />
            <button
              type="button"
              onClick={addPerson}
              className="w-full py-3 text-left text-14 font-semibold text-primary"
            >
              + Add someone
            </button>

            {people.length > 0 && (
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-12 text-slate-400 dark:text-slate-500">
                  {split.message ?? 'Coming back to you'}
                </span>
                <span className={`text-13 font-semibold tabular-nums ${
                  split.valid ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-500 dark:text-red-400'
                }`}>
                  {split.valid ? fmt(owed) : ''}
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
    </div>
  )
}
