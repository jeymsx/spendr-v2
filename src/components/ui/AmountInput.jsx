import { forwardRef } from 'react'
import { cx } from './cx'

/**
 * The big figure at the top of a sheet, when you can type into it.
 *
 * ── Why the peso is in the VALUE ──
 *
 * It used to be a span beside the input, and every sheet that did it looked
 * subtly wrong: the mark sat at a fixed point on the left while the number
 * drifted somewhere to the right of it, with a gap that changed size as you
 * typed. The reason is that the input was sized with `size={n}` or `n ch`,
 * and neither measures text. `size` is counted in the font's AVERAGE
 * character width, and `ch` is the width of a zero - so a box asked to hold
 * "1,250.00" came out wider than "1,250.00" actually is, and `text-center`
 * then centred the digits inside that slack. The mark could not follow,
 * because it was outside the box doing the drifting.
 *
 * Putting the mark inside the value removes the problem rather than
 * compensating for it. There is one string, it is centred as one string, and
 * "₱" is glued to the first digit at every length because it IS the first
 * character. No measuring, no mirror element, no resize observer.
 *
 * ── And it cannot be deleted ──
 *
 * Because it never reaches the state. Every caller's onChange strips
 * anything that is not a digit or a point, so a backspace that takes the
 * mark out is answered by the next render putting it back, and the parsed
 * amount never sees it. Type over it, select-all and retype, paste "₱500" -
 * all of them land on the same digits.
 *
 * This is the trick TxDetailSheet's edit rows and DebtFormSheet already use.
 * MoneyField deliberately does NOT - see the note in that file: its frame is
 * left-aligned, so a span sits exactly where the text starts and the two can
 * never disagree. The problem here is specific to a CENTRED figure.
 */
const AmountInput = forwardRef(function AmountInput({
  /** The digits only. The mark is added for display. */
  value,
  /** Must strip anything non-numeric - see above. */
  onChange,
  /** What the figure is for, since the mark is decoration to a screen reader. */
  label,
  /** The figure's colour, matching the AmountHero it usually sits in. */
  color,
  /** Shown before the mark: the + or − on a template's amount. */
  sign = '',
  /** Digits only, again - the mark is prepended for you. */
  placeholder = '0',
  /** Layout only. */
  className = '',
  ...rest
}, ref) {
  const mark = `${sign}₱`

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      /* Empty stays empty so the placeholder can show. A lone "₱" is not a
         value, and rendering one would mean the field never looks unfilled. */
      value={value ? mark + value : ''}
      onChange={onChange}
      placeholder={mark + placeholder}
      aria-label={label}
      className={cx(
        /* amount-hero-input, not a Tailwind size: index.css forces every
           input to 16px !important so iOS does not zoom on focus, and a
           utility cannot outrank that. */
        'amount-hero-input w-full min-w-0 bg-transparent outline-none border-0 p-0',
        'text-center font-bold tabular-nums tracking-tight',
        'placeholder:text-slate-300 dark:placeholder:text-slate-600',
        className,
      )}
      style={{ color }}
      {...rest}
    />
  )
})

export default AmountInput
