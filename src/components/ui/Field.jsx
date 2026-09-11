import { useId } from 'react'
import { cx } from './cx'

/**
 * One text field, one look, everywhere.
 *
 * ── What it settles ──
 *
 * The app had three field idioms. The add-forms: a 12px sentence-case label
 * above a 52px filled row at radius 16. Settings: an 11px UPPERCASE
 * letter-spaced caption above a 48px row at radius 16, with a focus ring. And
 * several pages had a one-off of their own. Same control, two sizes, two label
 * styles, two shadows.
 *
 * This is the add-forms' version, because that is the one that already read as
 * designed rather than generated - with the radius taken to a capsule to match
 * the buttons. 52px tall, label above in sentence case, filled, a hairline
 * border, and the same inset highlight in dark that the app's other surfaces
 * use.
 *
 * (An earlier attempt cut the label into a notch in the border - the outlined
 * Material look. It worked, and it was still wrong for this app: every other
 * surface here is filled, so an outlined field was the odd one out. What the
 * notch taught about legend geometry is in the git history rather than here.)
 *
 * ── It is a real <input>, and that is the point ──
 *
 * Nothing here fakes a control. A contenteditable or a div-with-a-caret loses
 * the keyboard type - `inputMode="decimal"` is why a money field opens a
 * number pad - and loses autofill, the Done bar, select-all, dictation and
 * VoiceOver with it. Only the styling moved.
 */

/**
 * The words above a field, and above anything else that behaves like one - a
 * segmented control, an icon grid, a colour rail.
 *
 * Exported so there is one answer to "how does a label look". Settings had
 * 11px uppercase with widest tracking and the forms had 12px sentence case;
 * three of the former stacked down a sheet is what reads as machine output,
 * so the forms' version wins.
 */
export function FieldLabel({ children, htmlFor = null, className = '' }) {
  const Tag = htmlFor ? 'label' : 'p'
  return (
    <Tag
      htmlFor={htmlFor ?? undefined}
      className={cx(
        'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 px-1',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

/**
 * The frame every field wears: capsule, filled, hairline, 52px.
 *
 * Exported because plenty of "fields" in this app are not inputs - the
 * account row opens a picker, the date row holds a native date control, the
 * category row is a button. They take the frame and skip the rest.
 */
export function fieldFrame(invalid = false) {
  return cx(
    'flex items-center gap-3 px-5 h-[52px] rounded-full',
    'bg-white dark:bg-primary/[0.07]',
    'shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.08)]',
    'border transition-colors duration-150',
    invalid
      ? 'border-red-300 dark:border-red-500/45'
      : 'border-slate-200/80 dark:border-primary/[0.14]',
  )
}

export default function Field({
  /** The words above the field. */
  label,
  /** Shown under it, muted. */
  hint = null,
  /** A string turns the frame red and replaces the hint. */
  error = null,
  /** Leading content inside the frame - an icon, a currency mark. */
  left = null,
  /** Trailing content inside the frame - a unit, a tick, a chevron. */
  right = null,
  /**
   * Anything other than a plain input: a <select>, or a button that opens a
   * picker. It gets the same frame, so a field that is not a text box still
   * looks like one.
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
      {/* htmlFor only when this wraps a real input: pointing a label at a
          <button> or a native date picker that a caller passed as children
          would name something it does not own. */}
      {label && <FieldLabel htmlFor={children ? null : id}>{label}</FieldLabel>}

      <div className={cx(fieldFrame(invalid), disabled && 'opacity-60')}>
        {left && (
          <span className="shrink-0 flex items-center text-slate-400 dark:text-slate-500">
            {left}
          </span>
        )}

        {children ?? (
          <input
            id={id}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={hint || error ? msgId : undefined}
            className={cx(
              'flex-1 min-w-0 bg-transparent outline-none',
              'text-sm font-medium text-slate-800 dark:text-white',
              'placeholder-slate-400 dark:placeholder-slate-500 placeholder:font-normal',
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
