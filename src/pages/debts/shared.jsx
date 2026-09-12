/** "Sep 12, 2026", or null when a debt carries no due date. */
export function fmtDueDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Debt helpers ───────────────────────────────────────────────────────────────

export function getStatus(amount, amountPaid) {
  const paid = amountPaid ?? 0
  const total = amount ?? 0
  if (total > 0 && paid >= total) return 'paid'
  if (paid > 0) return 'partial'
  return 'unpaid'
}

export const isSettled = (d) => getStatus(d.amount, d.amountPaid) === 'paid'
export const owedOn    = (d) => Math.max(0, (d.amount ?? 0) - (d.amountPaid ?? 0))

/** Whole days from today to a due date; negative once it has passed. */
export function daysToDue(dueDate) {
  if (!dueDate) return null
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0)
  if (Number.isNaN(due.getTime())) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.round((due - now) / 86400000)
}

export function getDueStatus(dueDate, isPaid) {
  if (!dueDate || isPaid) return 'none'
  const n = daysToDue(dueDate)
  if (n == null) return 'none'
  if (n < 0)  return 'overdue'
  if (n <= 7) return 'soon'
  return 'ok'
}

export function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function getAvatarColor(name) {
  /* Solved for white initials, not picked for looks.
 
     The first version used the raw Tailwind 500s, and measured against white
     14px bold text every single one failed AA - from #6366f1 indigo at 4.47:1
     down to #f59e0b amber at 2.15:1, which is barely legible. Each is darkened
     to the least amount that clears 4.6:1, so the hue survives (these still
     read as red, orange, amber, green...) while the initials are readable.
 
     Pre-computed rather than solved at runtime: the palette is fixed, so there
     is nothing to solve per render, and the values can be asserted in a test. */
  const COLORS = [
    '#d53d3d', '#bd5711', '#a26907', '#178640', '#2378c4',
    '#8458ea', '#cb3e84', '#0e8377', '#6264ed', '#048096',
  ]
  let hash = 0
  for (let i = 0; i < (name?.length ?? 0); i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  return COLORS[Math.abs(hash) % COLORS.length]
}

// ── Icons ──────────────────────────────────────────────────────────────────────

export function IconChevronDown({ open }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function IconEdit() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

/** Two people, for a ledger with nobody in it. */
export function IconNoDebts() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" />
      <path d="M16.5 5.4a3.2 3.2 0 0 1 0 5.2M18.4 20a6.2 6.2 0 0 0-2.3-4.8" />
    </svg>
  )
}
