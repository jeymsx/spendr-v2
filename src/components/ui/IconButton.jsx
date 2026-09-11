import { cx } from './cx'

/**
 * A round button holding one glyph: back, close, sort, add, edit.
 *
 * ── label is required, and that is the point ──
 *
 * There are 43 of these in the app and 10 of them had no accessible name at
 * all, so a screen reader announced "button" and stopped. Nothing about the
 * markup made that visible - the glyph is right there, and it reads fine to
 * anyone who can see it. Making `label` a required prop means the eleventh
 * one cannot be written without a name; it becomes aria-label, and the glyph
 * inside stays decorative.
 *
 * ── One surface, not three ──
 *
 * The header icons were spelled three ways: white/7% with a white/9% border
 * and a 90% press, primary/10% with a primary/20% border, an inset highlight
 * and a 95% press, and a plain slate fill. Same control, same job, three
 * looks - so `surface` here is the neutral one that every subpage header
 * already used, and the two primary-tinted ones on Accounts join it.
 *
 * ── The glyph is white in dark mode, never the accent ──
 *
 * A header icon was three different colours depending on which page you were
 * on: slate-300 on the sub-pages, white on a filled accent disc for every
 * "+", and the accent itself on a washed accent disc for Settings and Sort.
 * Three colours for one job, and the accent ones read as the loudest thing
 * on a screen whose actual subject is a number.
 *
 * So the chip is quiet everywhere and the glyph is white. `primary` survives
 * for the one case that earns it - a control whose accent fill means "this
 * is ON", like the calendar toggle on Transactions - and not for chrome.
 */

const PRESS = 'active:scale-90 transition-transform duration-75'

const VARIANT = {
  /** The default: a raised neutral chip, for back and toolbar actions. */
  surface: 'bg-white text-slate-600 border border-slate-200/80 shadow-sm ' +
    'dark:bg-primary/[0.10] dark:text-white dark:border-primary/[0.20] ' +
    'dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.12)]',
  /** Filled with the accent - an add button, a confirm. */
  primary: 'bg-primary text-white',
  /** A washed accent, for a secondary action that still wants the colour. */
  tint: 'bg-primary/[0.08] text-primary dark:bg-primary/[0.14]',
  /** Destructive. */
  danger: 'bg-red-500 text-white',
  /** Nothing but the glyph, for dense rows and overlays. */
  plain: 'text-slate-400 dark:text-slate-500',
}

/* Fixed classes, not `w-${n}`: Tailwind scans source text, so a class name
   built at runtime is never generated. */
const SIZE = {
  sm: 'w-8 h-8',
  md: 'w-9 h-9',
  lg: 'w-10 h-10',
  xl: 'w-11 h-11',
}

export default function IconButton({
  /** What the button does, for anyone who cannot see the glyph. Required. */
  label,
  variant = 'surface',
  size = 'md',
  disabled = false,
  className = '',
  children,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      aria-label={label}
      disabled={disabled}
      className={cx(
        'rounded-full shrink-0 flex items-center justify-center',
        SIZE[size] ?? SIZE.md,
        VARIANT[variant] ?? VARIANT.surface,
        PRESS,
        'disabled:opacity-40 disabled:active:scale-100',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
