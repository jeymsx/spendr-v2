import { IconWarning } from './shared'

// ── Small helpers ──────────────────────────────────────────────────────────────

export function WarnBanner({ title, body }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl
      bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
      <span className="text-amber-500 dark:text-amber-400 shrink-0 mt-0.5"><IconWarning /></span>
      <div>
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{title}</p>
        <p className="text-xs text-amber-600/80 dark:text-amber-500 mt-0.5">{body}</p>
      </div>
    </div>
  )
}

export const TYPE_STYLES = {
  expense:  'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400',
  inflow:   'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  transfer: 'bg-blue-100 dark:bg-primary/15 text-blue-600 dark:text-primary',
}

export function TypeBadge({ type }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_STYLES[type] ?? 'bg-slate-100 dark:bg-white/10 text-slate-500'}`}>
      {type || '?'}
    </span>
  )
}
