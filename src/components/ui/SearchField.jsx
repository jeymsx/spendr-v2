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
 * form rather than a search. Two more - the quick-add sheet and onboarding -
 * are 40px `rounded-2xl` boxes on a flat slate fill, and are not converted
 * yet; they are the last two.
 *
 * The clear button is opt-in. `onClear` absent means no button, which is what
 * a field that doubles as the name you are typing wants - there, clearing is
 * not "stop filtering", it is erasing an answer.
 */
const SearchField = forwardRef(function SearchField({
  value,
  onChange,
  /** Show a clear button, and call this when it is pressed. */
  onClear = null,
  placeholder = 'Search',
  /** Turns the hairline red, the same as Field's `error`. */
  invalid = false,
  /** Layout only - margins, width. */
  className = '',
  ...rest
}, ref) {
  return (
    <div className={cx('flex items-center gap-2.5 px-4 h-[38px] rounded-full',
      fieldSurface(invalid), className)}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="text-slate-400 shrink-0" aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={ref}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="flex-1 min-w-0 bg-transparent text-[13px] text-slate-800 dark:text-white
          placeholder-slate-400 dark:placeholder-slate-500 outline-none"
        {...rest}
      />
      {onClear && value && (
        <button
          onClick={onClear}
          aria-label="Clear search"
          className="text-slate-400 dark:text-slate-500 active:scale-90 transition-transform"
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
