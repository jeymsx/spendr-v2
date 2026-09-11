import { useId } from 'react'
import { cx } from './cx'

/**
 * A text field whose label sits in a notch in its own border.
 *
 * Replaces the pattern this app used everywhere: an 11px uppercase
 * letter-spaced caption floating above an input, which stacks two objects and
 * a gap for every field and reads like a form generated rather than designed.
 * Here the label belongs to the field.
 *
 * ── It is a real input, and it has to be ──
 *
 * The frame is decoration; the control inside is an ordinary <input>. That is
 * not a detail on iOS: a contenteditable or a div-with-a-caret loses the
 * keyboard type (`inputMode="decimal"` is why the amount field opens a number
 * pad), loses autofill, loses the Done bar, loses select-all and dictation,
 * and is invisible to VoiceOver. So nothing here fakes a field - the styling
 * moves, the element does not.
 *
 * (The app's viewport is `maximum-scale=1, user-scalable=no`, so iOS will not
 * zoom on focus whatever the font size. The 15px here is for reading, not to
 * dodge that.)
 *
 * ── How the notch is cut ──
 *
 * A <fieldset> with a <legend> in it, which is the one construction where a
 * border has a genuine hole rather than something painted over it. The
 * alternative - a label with a background colour matching the surface - is
 * fine until the field sits on a card, a gradient or a coloured sheet, and
 * then the chip shows. This app has all three, so: a hole.
 *
 * The legend is one pixel tall and invisible - it cuts the hole and nothing
 * else. The visible label is a real <label>, positioned on the border line,
 * which is also what gives the input its accessible name; the fieldset is
 * aria-hidden, so a screen reader hears one label rather than a group
 * announcement and then a field.
 *
 * Why one pixel: see the note on the legend itself. Briefly, a legend only
 * straddles the top border when the fieldset sizes itself to its content, and
 * this one cannot - it is an absolute overlay. So the gap was landing 10px
 * below the line while the label sat on it.
 */
export default function Field({
  /** The words in the notch. */
  label,
  /** Shown under the field, muted. */
  hint = null,
  /** A string turns the frame red and replaces the hint. */
  error = null,
  /** Trailing content inside the frame - a unit, a tick, a chevron. */
  right = null,
  /**
   * Anything other than a plain input: a <select>, or a button that opens a
   * picker. It gets the same frame and the same notch, so a field that is not
   * a text box still looks like a field.
   */
  children = null,
  className = '',
  inputClassName = '',
  id: idProp = null,
  disabled = false,
  ...rest
}) {
  const autoId = useId()
  const id = idProp ?? autoId
  const msgId = `${id}-msg`
  const invalid = !!error

  return (
    <div className={cx('w-full', className)}>
      <div className={cx('relative', disabled && 'opacity-60')}>
        {/* The frame: exactly the row's box, so the value sits on the frame's
            centre line.

            px-4 puts the notch 16px in. On a capsule the top border only goes
            properly horizontal past the 25px cap, but between 16 and 25 it
            has risen all of 1.7px - so the gap costs nothing visible there,
            and 16px keeps the label and the value near the edge instead of
            34px inside it. */}
        <fieldset
          aria-hidden="true"
          className={cx(
            'absolute inset-0 rounded-full border px-4 pointer-events-none',
            'transition-colors duration-150',
            invalid
              ? 'border-red-300 dark:border-red-500/50'
              : 'border-slate-200/90 dark:border-white/[0.10]',
          )}
        >
          {/* A ONE-PIXEL legend, which is the whole trick.

              A legend only straddles its fieldset's top border when the
              fieldset is sized by its content. This one is an absolute
              overlay with a fixed height, so the legend does not straddle
              anything: its box hangs 16px DOWN from the border, and the gap
              goes with it. Measured, after wondering why the label looked
              like it was floating above the notch - it was: the notch was
              10px lower.

              At 1px tall the gap is exactly the border line, wherever that
              line is, and the words go back to being positioned on their
              own. The invisible span inside sets the width, so the hole is
              always as wide as the label plus its padding. */}
          <legend className="block h-px p-0">
            <span className="block px-1.5 text-[11px] leading-none invisible">
              {label}
            </span>
          </legend>
        </fieldset>

        <label
          htmlFor={id}
          className={cx(
            /* Centred on the border: an 11px line at -6px sits half above the
               1px gap and half below it. */
            'absolute -top-[6px] left-4 px-1.5 text-[11px] font-medium leading-none',
            invalid
              ? 'text-red-500 dark:text-red-400'
              : 'text-slate-400 dark:text-slate-500',
          )}
        >
          {label}
        </label>

        {/* pl-[22px] is the fieldset's px-4 plus the legend's own px-1.5, so
            the value and its label start on the same vertical line. */}
        <div className="relative flex items-center gap-2 pl-[22px] pr-4">
          {children ?? (
            <input
              id={id}
              disabled={disabled}
              aria-invalid={invalid || undefined}
              aria-describedby={hint || error ? msgId : undefined}
              className={cx(
                'peer flex-1 min-w-0 h-[50px] bg-transparent outline-none',
                'text-[15px] font-medium',
                'text-slate-800 dark:text-white',
                'placeholder:text-slate-400 dark:placeholder:text-slate-600',
                'placeholder:font-normal',
                inputClassName,
              )}
              {...rest}
            />
          )}
          {right && (
            <span className="shrink-0 flex items-center text-slate-400 dark:text-slate-500">
              {right}
            </span>
          )}
        </div>
      </div>

      {(error || hint) && (
        <p
          id={msgId}
          className={cx(
            'mt-1.5 px-1 text-[11.5px] leading-snug',
            invalid
              ? 'text-red-500 dark:text-red-400'
              : 'text-slate-400 dark:text-slate-500',
          )}
        >
          {error || hint}
        </p>
      )}
    </div>
  )
}
