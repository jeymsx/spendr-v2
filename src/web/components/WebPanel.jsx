import { Link } from 'react-router-dom'

/**
 * Shared desktop building blocks. Every web page composes these so the whole
 * shell stays visually consistent as pages land one at a time.
 *
 * Styling reuses the existing `.card` class and `--color-primary`, so the
 * accent picker and dark mode keep working with no extra wiring.
 */

const _php = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const money = (v) => '₱' + _php.format(v ?? 0)

export function moneyCompact(v) {
  const abs = Math.abs(v ?? 0)
  if (abs >= 1_000_000) return '₱' + ((v ?? 0) / 1_000_000).toFixed(1) + 'M'
  if (abs >= 10_000)    return '₱' + ((v ?? 0) / 1_000).toFixed(1) + 'K'
  return money(v)
}

/** Page title row with optional right-hand actions. */
export function WebPageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {subtitle && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}

/**
 * A titled card. `to` turns the header into a link.
 *
 * `flush` is for a table that should run to the card's edges: it removes the
 * body's horizontal padding, and the table's own first and last cells carry
 * px-5 so their content still lines up with the header above. Passing
 * bodyClass by hand to achieve that is how one panel ended up with no
 * horizontal padding at all, so prefer this.
 */
export function WebPanel({ title, action, to, children, className = '', bodyClass = '', flush = false }) {
  const body = bodyClass || (flush ? 'px-0 pb-2' : 'px-5 pb-5')
  return (
    <section className={`card rounded-2xl flex flex-col min-w-0 ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
          {action ?? (to && (
            <Link to={to} className="text-xs font-semibold text-primary hover:underline">
              View all
            </Link>
          ))}
        </header>
      )}
      <div className={`min-w-0 ${body}`}>{children}</div>
    </section>
  )
}

/** Big number tile for the top row of an overview. */
export function WebStat({ label, value, hint, tone = 'default' }) {
  const toneClass = {
    default: 'text-slate-900 dark:text-white',
    good:    'text-emerald-600 dark:text-emerald-400',
    bad:     'text-red-500 dark:text-red-400',
    accent:  'text-primary',
  }[tone] ?? 'text-slate-900 dark:text-white'

  return (
    <div className="card rounded-2xl px-5 py-4 min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums mt-1.5 truncate ${toneClass}`}>{value}</p>
      {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">{hint}</p>}
    </div>
  )
}

export function WebEmpty({ children }) {
  return (
    <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">{children}</p>
  )
}

/** Thin progress bar used by budgets and credit utilisation. */
export function WebBar({ pct, tone = 'accent' }) {
  const bg = {
    accent: 'bg-primary',
    good:   'bg-emerald-500',
    warn:   'bg-amber-500',
    bad:    'bg-red-500',
  }[tone] ?? 'bg-primary'
  return (
    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/[0.07] overflow-hidden">
      <div className={`h-full rounded-full ${bg} transition-[width] duration-300`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}
