import { cx } from './cx'

/**
 * An on/off switch.
 *
 * The same 44x24 track and 20px thumb the Settings toggles and the bill form
 * already draw by hand, as a real control: a button with role="switch" and
 * aria-checked, so a screen reader says "on" or "off" rather than "button".
 * `label` is required for the same reason IconButton's is - a switch has no
 * words of its own.
 *
 * `busy` is for a switch whose change takes a moment - asking the phone for
 * permission, reaching a server. It stops a second tap and dims, but keeps
 * showing the state it is on its way FROM, so it never claims a change that
 * has not happened yet.
 */
export default function Switch({ on, onChange, label, disabled = false, busy = false, className = '' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={() => onChange?.(!on)}
      className={cx(
        'inline-flex items-center shrink-0 w-11 h-6 rounded-full p-0.5',
        'transition-colors duration-200',
        on ? 'bg-primary' : 'bg-slate-200 dark:bg-white/25',
        disabled && 'opacity-40',
        busy && 'opacity-60',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          on ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}
