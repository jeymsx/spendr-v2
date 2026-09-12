import FadeScroller from '../../components/FadeScroller'
import Divider from '../../components/ui/Divider'
import { TYPE_OPTS } from './shared'

// ── Quick type filter (always visible) ────────────────────────────────────────

/**
 * Filter, then the four types, as chips that fit their own words.
 *
 * It was a segmented control stretched across the full width, so every label
 * got exactly a quarter of the screen whether it was "All" or "Transfer" -
 * "All" sat in 87px of empty box. A chip is the width of what it says; that
 * is the whole idea of a chip, and it is why a row of them reads as a set of
 * options rather than as a table.
 *
 * Filter joins them at the front rather than living as an icon in the header.
 * It does the same job - narrowing the list - so it belongs with the things
 * that narrow the list, and the header is left with the one control that
 * changes the VIEW rather than the contents.
 *
 * The row scrolls sideways, so a fifth type or a longer label costs nothing.
 */

export const CHIP = 'shrink-0 flex items-center gap-1.5 h-8 px-3.5 rounded-full ' +
  'text-xs font-semibold border transition-colors duration-150 active:scale-95'

export const CHIP_ON = 'bg-primary/[0.10] dark:bg-primary/[0.12] ' +
  'border-primary/30 dark:border-primary/[0.25] text-primary'

export const CHIP_OFF = 'bg-white dark:bg-primary/[0.07] ' +
  'border-slate-200/80 dark:border-primary/[0.14] ' +
  'text-slate-500 dark:text-slate-400 ' +
  'shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.08)]'

export function QuickTypeFilter({ typeFilter, setTypeFilter, onOpenFilters, activeFilterCount }) {
  return (
    <FadeScroller axis="x" className="flex items-center gap-2 px-5 mb-3 pb-0.5">
      <button
        onClick={onOpenFilters}
        className={`${CHIP} ${activeFilterCount > 0 ? CHIP_ON : CHIP_OFF}`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="11" y1="18" x2="13" y2="18" />
        </svg>
        Filter
        {activeFilterCount > 0 && (
          <span className="min-w-[16px] h-4 px-1 rounded-full bg-primary text-white
            text-[10px] font-bold flex items-center justify-center tabular-nums">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* A hairline between the action and the selection. They sit in one row
          because they do one job, but tapping Filter opens a sheet and tapping
          Expense changes the list underneath - worth a beat between them. */}
      <span className="shrink-0 w-px h-4 bg-slate-200 dark:bg-white/[0.10]" aria-hidden="true" />

      {TYPE_OPTS.map(o => (
        <button
          key={o.value}
          onClick={() => setTypeFilter(o.value)}
          aria-pressed={typeFilter === o.value}
          className={`${CHIP} ${typeFilter === o.value ? CHIP_ON : CHIP_OFF}`}
        >
          {o.label}
        </button>
      ))}
    </FadeScroller>
  )
}

/**
 * One end of the custom range: a row that says the date and opens the real
 * picker.
 *
 * ── Why the input is invisible rather than styled ──
 *
 * A bare <input type="date"> renders the platform's own control, and on iOS
 * that is a left-aligned "mm/dd/yyyy" with a calendar button at its right
 * edge. You cannot right-align the text, you cannot change the format, and
 * you cannot make two of them look like the rest of the app's rows - the
 * shadow DOM is not yours. Two of them stacked is what this was, and it is
 * the only place in the app that looked like a web form.
 *
 * So the row draws the value itself - "03 Aug 2026" rather than 08/03/2026 -
 * and the real control sits over the whole row at opacity 0. Tapping
 * anywhere opens the native picker, which is the part that must not be
 * reimplemented: it is the wheel on iOS, the calendar on Android, and it
 * carries the locale, the accessibility and the keyboard behaviour with it.
 * This is the same technique RowDate already uses on the edit forms.
 *
 * Not a <label>: the input already covers the row, so every tap lands on it
 * directly. Wrapping it in a label would hand iOS a second activation path
 * for the same gesture, and two picker-opens per tap is a real bug on
 * Safari.
 *
 * [color-scheme] is what makes the native picker itself dark - without it
 * the wheel comes up white on a dark sheet.
 */
const openPicker = (e) => {
  try { e.currentTarget.showPicker?.() } catch { /* older engine: let the default stand */ }
}

export function DateRow({ label, value, onChange, isLast = false }) {
  /* Day first, month from the locale, year plain - assembled rather than
     asked for as one string. A range reads far faster day-first ("03 Aug" to
     "11 Sep" puts the two numbers that differ at the front), but en-GB, the
     obvious way to get that, abbreviates September to "Sept" while the rest
     of the app says "Sep". Four characters where every other month has three
     is the kind of thing you see without being able to name. */
  const display = (() => {
    if (!value) return 'Any'
    const d = new Date(`${value}T00:00:00`)
    const day = String(d.getDate()).padStart(2, '0')
    const mon = d.toLocaleDateString('en-PH', { month: 'short' })
    return `${day} ${mon} ${d.getFullYear()}`
  })()

  return (
    <>
      <div className="relative flex items-center justify-between gap-4 px-4 h-[52px]">
        <span className="text-[13px] text-slate-500 dark:text-slate-400">{label}</span>
        <span className="flex items-center gap-2 shrink-0">
          <span className={`text-[14px] font-medium tabular-nums ${
            value ? 'text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'
          }`}>
            {display}
          </span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </span>
        {/* Chrome opens the calendar only from the indicator icon or a key
            press - clicking the field itself just focuses a segment. The
            indicator is invisible here, so on desktop this row read as dead.
            iOS Safari opens on any tap, so it was a web-only hole.

            showPicker() closes it, and is safe on both: it needs user
            activation, which a click handler has, and calling it while the
            picker is already up (iOS) is a no-op. Chrome 99+, Safari 16+,
            Firefox 101+; older engines throw, and on those versions the
            native tap-to-open is what you already had. */}
        <input
          type="date"
          value={value}
          onChange={onChange}
          onClick={openPicker}
          aria-label={label}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer
            [color-scheme:light] dark:[color-scheme:dark]"
        />
      </div>
      {!isLast && <Divider inset="row" />}
    </>
  )
}
