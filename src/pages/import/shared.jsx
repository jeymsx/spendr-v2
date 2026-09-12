// ── Constants ──────────────────────────────────────────────────────────────────

export const NEW_REQUIRED_COLS    = ['tx_id', 'type', 'transaction_date', 'description', 'category', 'from_account', 'to_account', 'amount']
// No 'synced' here on purpose. The app's own CSV export never writes that
// column, and mapLegacyRows sets synced: UNSYNCED itself rather than reading
// it — so requiring it made Spendr reject its own export file.
export const LEGACY_REQUIRED_COLS = ['txId', 'type', 'date', 'description', 'category', 'payment', 'account', 'fromAccount', 'toAccount', 'amount']
export const VALID_TYPES = new Set(['expense', 'inflow', 'transfer'])

export const TRANSFER_RE = /Transfer:\s*(.+?)\s*→\s*(.+)/

export function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Icons ──────────────────────────────────────────────────────────────────────


export function IconFile() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}


export function IconWarning() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

export function IconArrowLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

export function IconSuccess() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

// ── Step indicator ─────────────────────────────────────────────────────────────

export function StepDots({ step }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-6">
      {[1, 2, 3, 4, 5].map(s => (
        <div
          key={s}
          className={[
            'rounded-full transition-all duration-300',
            s === step
              ? 'w-6 h-2 bg-primary'
              : s < step
                ? 'w-2 h-2 bg-primary/40'
                : 'w-2 h-2 bg-slate-200 dark:bg-white/10',
          ].join(' ')}
        />
      ))}
    </div>
  )
}
