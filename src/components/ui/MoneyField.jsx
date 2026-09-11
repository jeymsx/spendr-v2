import { cx } from './cx'
import { fieldFrame } from './Field'

/**
 * A field that takes pesos, and says so before you type.
 *
 * ── Why a span and not a placeholder ──
 *
 * The placeholder was doing this job, and a placeholder is gone the moment
 * there is a value - so an account's balance read "64,906" with nothing on
 * the row saying what unit that was. The one number in this app that is never
 * a count, a day or a percentage was the one with no mark on it.
 *
 * So the peso is a span inside the frame, permanent, and the placeholder goes
 * back to a bare "0.00" because the mark is already there and two would be
 * worse than none.
 *
 * ── Why not prefix the value string ──
 *
 * The other way is what TxDetailSheet's edit rows do: put the peso in the
 * value itself and strip it on the way out. That is the right answer THERE,
 * and the comment in that file says why - a RowInput is right-aligned and
 * flex-1, so a leading span claims the space and pushes the mark back against
 * the label, reading "Amount ₱      300".
 *
 * This frame is left-aligned, so the span sits exactly where the text starts
 * and the two never fight. It also keeps the input's value clean, which means
 * no strip-on-change and no chance of the mark surviving into parseMoney.
 */
export default function MoneyField({
  value,
  onChange,
  placeholder = '0.00',
  /** Turns the frame red, the same as Field's `error`. */
  invalid = false,
  /** Layout only - width, margins. */
  className = '',
  ...rest
}) {
  return (
    <div className={cx(fieldFrame(invalid), className)}>
      <span
        className="shrink-0 text-sm text-slate-400 dark:text-slate-500"
        aria-hidden="true"
      >
        ₱
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent outline-none tabular-nums
          text-sm font-medium text-slate-800 dark:text-white
          placeholder-slate-400 dark:placeholder-slate-500 placeholder:font-normal"
        {...rest}
      />
    </div>
  )
}
