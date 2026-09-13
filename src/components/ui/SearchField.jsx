import { forwardRef } from 'react'
import { cx } from './cx'
import { fieldSurface } from './Field'

/**
 * A search bar: the app's field, at search size.
 *
 * ── Why it is not just `<Field left={<IconSearch/>}>` ──
 *
 * A field is 52px, and a search bar is not - it sits above a list it filters
 * rather than in a column of things you fill in, and at 52px it reads as the
 * subject of the screen instead of a way to narrow one. So this is 38px with
 * a 13px value, and it takes the fill, hairline and lift from `fieldSurface`
 * so the two cannot drift apart on colour.
 *
 * ── What it settles ──
 *
 * Four search boxes, three looks. Transactions had this one. The account
 * creation flow used the 52px form field with an icon absolutely positioned
 * over it, so the one screen where you search for your bank looked like a
 * form rather than a search. The quick-add sheet and onboarding were 40px
 * `rounded-2xl` boxes on a flat slate fill, each with a clear button drawn as
 * a filled disc rather than a bare cross. All four are this now.
 *
 * The clear button is opt-in. `onClear` absent means no button, which is what
 * a field that doubles as the name you are typing wants - there, clearing is
 * not "stop filtering", it is erasing an answer.
 *
 * ── tone ──
 *
 * `onDark` is the default tone's dark half, applied unconditionally. The
 * onboarding flow paints its own dark ground whatever the theme is, so the
 * theme-answering colours would come out white-on-near-white there. It is
 * the same design with the theme question removed, not a second one.
 */
const TONE = {
  default: {
    input: 'text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500',
    icon:  'text-slate-400',
    clear: 'text-slate-400 dark:text-slate-500',
  },
  onDark: {
    frame: 'bg-primary/[0.07] border border-primary/[0.14] transition-colors duration-150',
    input: 'text-white placeholder-slate-500',
    icon:  'text-slate-500',
    clear: 'text-slate-500',
  },
}

const SearchField = forwardRef(function SearchField({
  value,
  onChange,
  /** Show a clear button, and call this when it is pressed. */
  onClear = null,
  placeholder = 'Search',
  /** Turns the hairline red, the same as Field's `error`. */
  invalid = false,
  /** `onDark` for a surface that is dark whatever the theme. */
  tone = 'default',
  /** Layout only - margins, width. */
  className = '',
  ...rest
}, ref) {
  const t = TONE[tone] ?? TONE.default
  return (
    <div className={cx('flex items-center gap-2.5 px-4 h-[38px] rounded-full',
      t.frame ?? fieldSurface(invalid), className)}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className={cx(t.icon, 'shrink-0')} aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={ref}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={cx('flex-1 min-w-0 bg-transparent text-[13px] outline-none', t.input)}
        {...rest}
      />
      {onClear && value && (
        <button
          onClick={onClear}
          aria-label="Clear search"
          className={cx(t.clear, 'active:scale-90 transition-transform')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  )
})

export default SearchField
