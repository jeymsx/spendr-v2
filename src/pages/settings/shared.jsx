/**
 * The pieces every Settings screen shares.
 *
 * Settings.jsx was 3,522 lines because six unrelated features lived in it -
 * categories, budgets, templates, profile, backup and the page itself - and
 * every one of them reached for the same dozen helpers. Splitting the features
 * out needed these to have a home first, or each new file would have grown its
 * own copy of SettingsRow, which is exactly the drift the design system work
 * spent this long undoing.
 *
 * Nothing here changed in the move. It is the same code at the same values.
 */
import Divider from '../../components/ui/Divider'
import { fieldFrame } from '../../components/ui/Field'

// ── Constants ──────────────────────────────────────────────────────────────────

export const APP_VERSION = '0.1.0'

export const EMOJI_OPTIONS = [
  '🍔', '🛍️', '🚗', '🎮', '💆', '🧾', '📦', '💰',
  '🏠', '💊', '🎓', '✈️', '🐾', '💻', '🎁', '🔧',
  '📱', '🏋️', '🎵', '🍷', '☕', '🎬', '⚽', '🎯',
  '💅', '🧴', '🛒', '🏥', '🌮', '🍕', '🍜', '⛽',
  '🚇', '💳', '🎀', '🧸', '🪴', '🧹', '💈', '🎪',
]

export const CAT_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#2D9DFF', '#8b5cf6', '#ec4899', '#14b8a6',
]

export const DEFAULT_CAT_NAMES = new Set(['Others', 'Income', 'Transfer', 'Transfer Fee'])

export const ACCENT_COLORS = [
  { hex: '#2D9DFF', name: 'Azure',  hint: 'The default. Cool and quiet.'      },
  { hex: '#845EF7', name: 'Cosmos', hint: 'Deep violet, low glare at night.'  },
  { hex: '#F06595', name: 'Blush',  hint: 'Warm pink, softer than red.'       },
  { hex: '#51CF66', name: 'Sage',   hint: 'Fresh green, reads as positive.'   },
  { hex: '#20C997', name: 'Lagoon', hint: 'Teal. Green without the alarm.'    },
  { hex: '#FFB347', name: 'Amber',  hint: 'Warm orange, high energy.'         },
  { hex: '#FF6B6B', name: 'Ember',  hint: 'Coral red. Bold on dark.'          },
  { hex: '#FCC419', name: 'Honey',  hint: 'Bright yellow, lightest of the set.' },
]

// ── Formatters ─────────────────────────────────────────────────────────────────


export function fmtRelTime(isoStr) {
  if (!isoStr) return 'Never'
  const d    = new Date(isoStr)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

// ── CSV export ─────────────────────────────────────────────────────────────────

export function buildAndDownloadCSV(transactions) {
  const headers = [
    'txId', 'type', 'date', 'description', 'category',
    'payment', 'account', 'fromAccount', 'toAccount', 'amount',
  ]
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [
    headers.join(','),
    ...transactions.map(t => [
      esc(t.txId), esc(t.type), esc(t.date), esc(t.description),
      esc(t.category), esc(t.payment), esc(t.account),
      esc(t.fromAccount), esc(t.toAccount), Number(t.amount ?? 0),
    ].join(',')),
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `spendr-export-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}


// ── Icons ──────────────────────────────────────────────────────────────────────

export function IconSun() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

export function IconMoon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  )
}

export function IconPalette() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  )
}

export function IconTag() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

export function IconDownload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}


export function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  )
}

export function IconSheets() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="9" x2="9" y2="21" />
    </svg>
  )
}

export function IconCloud() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
    </svg>
  )
}


export function IconFileText() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

export function IconTarget() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

// ── UI primitives ──────────────────────────────────────────────────────────────

export function SectionHeader({ children }) {
  return (
    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 px-5 mb-2">
      {children}
    </p>
  )
}

/* Was a local hairline at slate-50 / white-4%, one of the sixteen recipes
   the app had. It is the shared one now; the 8 call sites keep their name. */
export const RowDivider = () => <Divider inset="row" />

export function SectionCard({ children }) {
  return (
    <div className="card mx-5 rounded-2xl overflow-hidden">
      {children}
    </div>
  )
}

export function RowIcon({ color, children }) {
  const colorMap = {
    slate:  'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-300',
    blue:   'bg-primary/[0.10] dark:bg-primary/[0.15] text-primary',
    green:  'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    amber:  'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400',
    violet: 'bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400',
    red:    'bg-red-100 dark:bg-red-500/15 text-red-500 dark:text-red-400',
    teal:   'bg-teal-100 dark:bg-teal-500/15 text-teal-600 dark:text-teal-400',
  }
  return (
    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colorMap[color] ?? colorMap.slate}`}>
      {children}
    </span>
  )
}

export function SettingsRow({ iconEl, label, sublabel, right, onTap, destructive = false, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled || !onTap}
      className={[
        'w-full flex items-center gap-4 px-4 py-3.5 text-left select-none transition-colors',
        onTap && !disabled ? 'cursor-pointer active:bg-slate-50 dark:active:bg-white/[0.04]' : 'cursor-default',
        disabled ? 'opacity-40' : '',
      ].join(' ')}
    >
      {iconEl}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${
          destructive ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-white'
        }`}>
          {label}
        </p>
        {sublabel && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-[200px]">{sublabel}</p>
        )}
      </div>
      {right !== undefined && (
        <div className="shrink-0 ml-1 text-slate-400 dark:text-slate-500">{right}</div>
      )}
    </button>
  )
}

/**
 * The frame, for the inputs in this file that are not <Field>s yet.
 *
 * Built from fieldFrame so there is one capsule, one height and one fill
 * rather than this file's own 48px radius-16 version - which is what made
 * Settings' fields visibly different objects from the add-forms'.
 */
export function inputClass(error = false) {
  return [
    fieldFrame(error).replace('flex items-center gap-3', 'w-full block'),
    'text-sm font-medium text-slate-800 dark:text-white',
    'placeholder-slate-400 dark:placeholder-slate-500',
    'outline-none',
  ].join(' ')
}

/* SectionLabel now comes from ui/Field, so this file and the add-forms cannot
   drift apart again. It was 11px with widest tracking here and 12px
   sentence case there, for the same job. */
