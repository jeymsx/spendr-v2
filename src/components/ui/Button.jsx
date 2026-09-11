import { cx } from './cx'

/**
 * The app's action button.
 *
 * ── Why this exists ──
 *
 * There were 89 of these written by hand, in 55 distinct class recipes, 35 of
 * which appeared exactly once. They did not merely differ in spelling: some
 * dimmed to 40% when disabled and others to 50%; some answered a press with
 * `active:scale-[0.98]`, some with a background change, and four answered a
 * press with nothing at all. Those are not decisions anyone made - they are
 * what happens when the fifth Cancel button is written by copying the fourth.
 *
 * So the variant owns colour, shape, press feedback and the disabled state,
 * and nothing else may set them.
 *
 * ── className is for layout only ──
 *
 * A button that accepts arbitrary classes is the drift again under a nicer
 * name, so `className` here is for where the button SITS - `w-full`,
 * `flex-1`, `flex-[2]`, a margin - and not for what it looks like. `cx` does
 * not resolve conflicts (see its own note), so a caller passing `bg-emerald-500`
 * gets a visibly fighting class rather than a quiet override, which is the
 * intended outcome: that is a missing variant, and it should be added here.
 *
 * ── Sizes ──
 *
 * The three that existed: 40px, 48px, 56px tall. `md` is the default because
 * it was the most common by a wide margin, and it is the one paired
 * Cancel/Confirm rows use.
 */

/* Every variant gets the same press treatment - a 2% shrink - because that
   is what 35 of the 39 primary buttons already did, and the four that did
   nothing were an oversight rather than a choice. */
const PRESS = 'active:scale-[0.98] transition-transform duration-100'

const VARIANT = {
  /** The one thing this screen is for. */
  primary: 'bg-primary text-white active:bg-primary/90',
  /** Its companion: Cancel, Not now, Back. */
  secondary: 'bg-slate-100 text-slate-600 active:bg-slate-200 ' +
    'dark:bg-white/[0.06] dark:text-slate-300 dark:active:bg-white/[0.10]',
  /** Deletes, removes, wipes. */
  danger: 'bg-red-500 text-white active:bg-red-600',
  /** An accent action that is not the page's main one. */
  tint: 'bg-primary/[0.08] text-primary active:bg-primary/[0.14] ' +
    'dark:bg-primary/[0.14] dark:active:bg-primary/[0.20]',
  /** Destructive, but not the loudest thing on the screen: a washed red for
   *  a Delete that sits next to something more important. */
  dangerTint: 'bg-red-50 text-red-600 active:bg-red-100 ' +
    'dark:bg-red-500/[0.10] dark:text-red-400 dark:active:bg-red-500/20',
  /** A hairline and no fill: the quieter half of a pair on a busy surface. */
  outline: 'border border-slate-200 text-slate-700 active:bg-slate-100 ' +
    'dark:border-white/[0.10] dark:text-slate-300 dark:active:bg-white/[0.06]',
  /** No fill at all - a dismissal under something more prominent. */
  quiet: 'text-slate-500 active:bg-slate-100 ' +
    'dark:text-slate-400 dark:active:bg-white/[0.06]',
}

/* 40 / 44 / 48px tall, and those are exact rather than approximate: every
   size states its line-height, so the height is padding + leading and not
   whatever line-height the button happened to inherit. `text-sm` already
   carries its own 20px leading, which is why md does not repeat it.

   One notch shorter than they were (py-3/3.5/4). The old ladder put the
   common button at 48px and the page's main action at 56, which is taller
   than the platform's own - iOS sign-in and sheet buttons sit at about 44.
   md is exactly 44 now, which is also the minimum touch target, so the
   default cannot be too small. sm is 40 and is only for dismissive halves
   of a pair in dense rows. */
const SIZE = {
  sm: 'py-2.5 text-[13px] leading-5',
  md: 'py-3 text-sm',
  lg: 'py-3.5 text-[15px] leading-5',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  /** Full width. The common case, so it is a prop rather than a class. */
  block = false,
  /** Work in flight: spins, announces itself, and cannot be pressed again. */
  loading = false,
  disabled = false,
  /** Layout only - see the note above. */
  className = '',
  children,
  /* Defaulted, because a bare <button> inside a <form> submits it. Three of
     the originals sat in forms without it. */
  type = 'button',
  ...rest
}) {
  const fill = VARIANT[variant] ?? VARIANT.primary

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'rounded-full font-semibold text-center select-none',
        'inline-flex items-center justify-center gap-2',
        SIZE[size] ?? SIZE.md,
        fill,
        PRESS,
        // The shrink is feedback for a press. A disabled button is not being
        // pressed, so it must not shrink when one lands on it.
        'disabled:opacity-40 disabled:active:scale-100',
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin shrink-0"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  )
}
