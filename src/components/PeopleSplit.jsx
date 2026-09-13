import { useMemo } from 'react'
import { useTheme } from '../context/ThemeContext'
import CategoryGlyph from './CategoryGlyph'
import Divider from './ui/Divider'
import Button from './ui/Button'
import { getInitials, getAvatarColor } from '../pages/debts/shared'
import { parseMoney } from '../utils/moneyInput'
import { chipClass } from '../pages/accounts/shared'
import { fmt } from '../lib/money'
import { resolveSplit, SPLIT_MODES, MODE_FIELD } from '../lib/splitModes'

/**
 * Dividing an amount between people, wherever that amount comes from.
 *
 * Lifted out of DivideScreen when bills needed the same thing. A shared
 * subscription is the case that forced it: iCloud is one charge every month
 * and three people owe a piece of it, and typing the same division twelve
 * times a year is not a feature, it is a chore with a UI on it.
 *
 * So the editor is a controlled component over one value:
 *
 *     { mode, you: { included, value }, people: [{ name, value, included }] }
 *
 * Values are STRINGS, because they are what somebody typed and half of them
 * are mid-edit. `resolve` turns them into pesos, and that only happens at the
 * point of use - on the expense form when you press Done, and on a bill every
 * time it posts, against whatever the amount is THAT month. Storing the
 * resolved figures instead would go stale the day Apple raises the price.
 */

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
/**
 * A category, as the confirm sheet's chip and the platform's own dropdown at
 * the same time.
 *
 * The select is laid over the chip at zero opacity rather than being styled
 * with appearance-none. Both give a native option list; this one also gives
 * complete control of the closed state, so the chip can carry the category's
 * glyph and match the ones on the confirm sheet exactly - and it sidesteps
 * every browser's own idea of what a <select> arrow looks like.
 *
 * The select keeps the label and the focus, so the wheel on iOS, type-ahead
 * on a keyboard and VoiceOver all still work; the chip underneath is
 * decoration.
 */
function CategoryChipSelect({ categories, value, onChange, dark, label }) {
  const picked = categories.find(c => c.name === value) ?? null

  return (
    <span
      className="relative inline-flex items-center gap-1 pl-2 pr-5 py-1 rounded-full
        text-11 font-semibold bg-slate-100 dark:bg-white/[0.07]
        text-slate-700 dark:text-slate-200 min-w-0"
    >
      {picked && <CategoryGlyph cat={picked} size={12} />}
      <span className="truncate">{picked ? picked.name : 'the whole purchase'}</span>
      <svg
        className="absolute right-1.5 text-slate-400 dark:text-slate-500"
        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 w-full h-full opacity-0"
        style={{ colorScheme: dark ? 'dark' : 'light' }}
      >
        <option value="">the whole purchase</option>
        {categories.map(c => (
          <option key={c.id ?? c.name} value={c.name}>{c.name}</option>
        ))}
      </select>
    </span>
  )
}

function PersonRow({
  avatar, avatarBg, name, included, onToggle, mode, value, onValue,
  share, onRemove, label,
}) {
  const field = MODE_FIELD[mode] ?? MODE_FIELD.equal
  const dim = included ? '' : 'opacity-40'

  /* Exact is the one mode where what you TYPE and what they OWE are the same
     number, and the row was showing it twice - a "₱ 0.00" you could type in
     and a "₱0.00" beside it that only ever echoed it back. So in exact the
     resolved figure IS the field, and the peso sign lives in its value the
     way it does in the sheet heroes.

     Every other mode keeps both, because there the two are genuinely
     different: 30% and ₱300, 2x and ₱400, +₱50 and ₱550. */
  const typedIsTheShare = included && mode === 'exact'

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

      {included && field.kind !== 'none' && !typedIsTheShare && (
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
          money in every mode - and in exact, the thing you type into. */}
      {typedIsTheShare ? (
        <input
          value={value ? `₱${value}` : ''}
          onChange={onChange}
          inputMode="decimal"
          placeholder="₱0.00"
          aria-label={`Amount for ${label}`}
          className="shrink-0 w-[88px] text-right text-14 font-semibold tabular-nums
            bg-transparent outline-none border-0 p-0 text-slate-800 dark:text-white
            placeholder-slate-300 dark:placeholder-slate-600"
        />
      ) : (
        <span className="shrink-0 w-[88px] text-right text-14 font-semibold tabular-nums
          text-slate-800 dark:text-white"
        >
          {included ? fmt(share ?? 0) : '—'}
        </span>
      )}

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

/** The empty value, so callers do not each invent their own. */
export const EMPTY_SPLIT = {
  mode: 'equal',
  you: { included: true, value: '' },
  people: [],
}

/**
 * Resolve a stored split against an amount, as exact pesos per person.
 *
 * Returns `null` when nobody is sharing, so a caller can treat "no split" and
 * "a split of nobody" the same way rather than branching on both.
 *
 * @param {any} split
 * @param {number} total
 */
export function resolveSplitValue(split, total) {
  const people = split?.people ?? []
  if (!people.length) return null
  const r = resolveSplit({
    mode: split.mode ?? 'equal',
    total,
    participants: [
      { id: 'you', included: split.you?.included !== false, value: parseMoney(split.you?.value) },
      ...people.map((p, i) => ({
        id: `p${i}`, included: p.included !== false, value: parseMoney(p.value),
      })),
    ],
  })
  return {
    ...r,
    /* Only people who actually owe something. A zero share is not a debt. */
    owed: people
      .map((p, i) => ({
        name: String(p.name ?? '').trim(),
        amount: r.shares[`p${i}`] ?? 0,
        /* Which part of the purchase their share is against, when the
           purchase was filed under more than one category. Empty means the
           whole thing, which is the default and the common case. */
        category: p.category || null,
      }))
      .filter(p => p.name && p.amount > 0),
    yours: r.shares.you ?? 0,
  }
}

/**
 * @param {object} props
 * @param {number} props.total
 * @param {any} props.value
 * @param {(next: any) => void} props.onChange
 * @param {any[]} [props.legCategories]  the categories this purchase is
 *   filed under, when it is split across more than one. Each person can be
 *   pinned to one of them, so repaying refunds the part their share came
 *   from rather than all of it landing on whichever leg happened to be
 *   written first.
 */
export default function PeopleSplit({ total, value, onChange, legCategories = [] }) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const split = value ?? EMPTY_SPLIT
  const { mode, you, people } = split

  const set = (patch) => onChange({ ...split, ...patch })
  const setPerson = (i, patch) =>
    set({ people: people.map((p, n) => (n === i ? { ...p, ...patch } : p)) })
  const removePerson = (i) => set({ people: people.filter((_, n) => n !== i) })
  const addPerson = () =>
    set({ people: [...people, { name: '', value: '', included: true }] })

  /* Switching mode CLEARS the figures, and that is not tidiness.

     One `value` field serves all five modes and means something different in
     each - so leaving "30" in place when percent becomes +/− turns a 30%
     share into a 30 peso surcharge. Silently: the arithmetic stays valid, the
     total still adds up, and the bill is simply wrong.

     Inclusion survives, because who ate is true whichever way the rest is
     divided. */
  const pickMode = (next) => {
    if (next === mode) return
    set({
      mode: next,
      you: { ...you, value: '' },
      people: people.map(p => ({ ...p, value: '' })),
    })
  }

  const resolved = useMemo(() => resolveSplitValue(split, total), [split, total])
  const owed = resolved?.owed.reduce((s, p) => s + p.amount, 0) ?? 0
  const shares = resolved?.shares ?? {}
  const valid = resolved?.valid ?? true
  const message = resolved?.message ?? null

  return (
    <>
          {/* Five modes, because they are five things people say out loud at
              a table, not variations on one. See lib/splitModes.js. */}
          {/* A grid, not a rail. The set is five fixed labels and they fit
              the width, so a scroller would leave dead space on the right
              and ask people to swipe for something already on screen. Equal
              columns also make the chips read as one control - which they
              are, since picking one un-picks the rest. */}
          <div className="grid grid-cols-5 gap-1.5 mb-1">
            {SPLIT_MODES.map(m => (
              <button
                key={m.value}
                type="button"
                onClick={() => pickMode(m.value)}
                className={`${chipClass(mode === m.value)} w-full px-0`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-11 text-slate-400 dark:text-slate-500 mb-3">
            {SPLIT_MODES.find(m => m.value === mode)?.hint}
          </p>

          <PersonRow
            avatar={<span className="text-11 font-bold text-white">You</span>}
            avatarBg="var(--color-primary)"
            name={<span className="text-14 font-semibold text-slate-800 dark:text-white">You</span>}
            included={you.included !== false}
            onToggle={() => set({ you: { ...you, included: you.included === false } })}
            mode={mode}
            value={you.value ?? ''}
            onValue={v => set({ you: { ...you, value: v } })}
            share={shares.you}
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
                value={p.value ?? ''}
                onValue={v => setPerson(i, { value: v })}
                share={shares[`p${i}`]}
                onRemove={() => removePerson(i)}
                label={p.name || `person ${i + 1}`}
              />

              {/* Only when there is a choice to make. One category is not a
                  question, and a row of dropdowns all reading the same word
                  is the kind of thing that makes a simple screen feel like
                  paperwork. Defaults to the whole purchase, so the common
                  case stays one field: a name and an amount. */}
              {legCategories.length > 1 && p.included !== false && (
                <div className="flex items-center gap-2 pb-3 pl-11">
                  <span className="text-11 text-slate-400 dark:text-slate-500 shrink-0">
                    Their share is for
                  </span>
                  <CategoryChipSelect
                    categories={legCategories}
                    value={p.category ?? ''}
                    onChange={v => setPerson(i, { category: v })}
                    dark={dark}
                    label={`Which category ${p.name || `person ${i + 1}`} is sharing`}
                  />
                </div>
              )}
            </div>
          ))}

          <Divider />

          {/* What is still unaccounted for, above the button rather than
              under it. It is the reason you would press Add someone, and a
              running total that sits below the thing it should prompt is
              read last or not at all. */}
          {people.length > 0 && (
            <div className="flex items-baseline justify-between py-3">
              <span className={`text-12 ${
                valid ? 'text-slate-400 dark:text-slate-500'
                      : 'text-red-500 dark:text-red-400'
              }`}>
                {message ?? 'Coming back to you'}
              </span>
              <span className={`text-13 font-semibold tabular-nums ${
                valid ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-500 dark:text-red-400'
              }`}>
                {valid ? fmt(owed) : ''}
              </span>
            </div>
          )}

          <Button block variant="primary" className="mt-1" onClick={addPerson}>
            Add someone
          </Button>
    </>
  )
}
