import Card from './ui/Card'
import Divider from './ui/Divider'

/**
 * The app's native form rows.
 *
 * A label on the left, the value on the right, hairlines between, all inside
 * one card - the way a settings screen works, rather than a stack of outlined
 * boxes each with a small-caps label above it.
 *
 * They were written inside TxDetailSheet, which is where the shape was worked
 * out: the point is that detail and edit are the SAME layout with the same
 * rows in the same places, and only the values become typeable. That is what
 * makes tapping Edit feel like a mode rather than a different screen.
 *
 * They live here because the debt form needed them too, and the alternative
 * was a second copy. Everything in this file is presentation only - no state,
 * no db - so sharing it costs nothing.
 */

/** The frame: a card with hairline-separated rows. */
export function RowGroup({ children, className = '' }) {
  return <Card clip className={className}>{children}</Card>
}

export function EditRow({ label, isLast, children }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 min-h-[48px] py-2">
        <span className="text-13 text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
        <div className="flex-1 min-w-0 flex items-center justify-end gap-2">{children}</div>
      </div>
      {!isLast && <Divider inset="row" />}
    </>
  )
}

/** Right-aligned, borderless, transparent: the row is the field. */
export function RowInput({ value, onChange, placeholder, inputMode = 'text', ...rest }) {
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      inputMode={inputMode}
      className="min-w-0 flex-1 bg-transparent outline-none text-right
        text-15 font-medium text-slate-800 dark:text-white
        placeholder-slate-300 dark:placeholder-slate-600"
      {...rest}
    />
  )
}

/**
 * A row whose value opens the OS date picker.
 *
 * The date input is present but invisible, stretched over the whole row, with
 * the formatted date drawn underneath it. A raw <input type="date"> cannot be
 * made to look native here: the control has an intrinsic width wider than its
 * text and puts its own calendar button at its right edge, so inside a
 * right-aligned row the date sat hard against the label with dead space after
 * it, and `text-right` does not move text inside a date control on any engine
 * I would trust.
 *
 * Drawing the value ourselves gives the full "Wed, Sep 9, 2026" rather than
 * 09/09/2026, and tapping anywhere on the row still opens the real picker.
 */
export function RowDate({ value, onChange, display }) {
  return (
    <span className="relative flex-1 min-w-0 flex items-center justify-end gap-2">
      <span className="text-15 font-medium text-slate-800 dark:text-white truncate">
        {display || 'Pick a date'}
      </span>
      <IconChevron />
      {/* Chrome opens the calendar only from the indicator icon or a key
          press - clicking the field itself just focuses a segment, and the
          indicator is invisible here, so on desktop this row read as dead.
          iOS Safari opens on any tap, so it was a web-only hole. */}
      <input
        type="date"
        value={value}
        onChange={onChange}
        onClick={e => { try { e.currentTarget.showPicker?.() } catch { /* older engine */ } }}
        aria-label="Date"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer
          [color-scheme:light] dark:[color-scheme:dark]"
      />
    </span>
  )
}

export function IconChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className="text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

/** A value that opens a picker. Chevron included, because it goes somewhere. */
export function RowPicker({ label, dot, icon, placeholder, onClick }) {
  return (
    <button onClick={onClick} className="flex-1 min-w-0 flex items-center justify-end gap-2 active:opacity-60">
      {dot && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />}
      {icon && <span className="text-15 leading-none shrink-0">{icon}</span>}
      <span className={`text-15 font-medium truncate ${
        label ? 'text-slate-800 dark:text-white' : 'text-slate-300 dark:text-slate-600'
      }`}>
        {label ?? placeholder}
      </span>
      <IconChevron />
    </button>
  )
}
