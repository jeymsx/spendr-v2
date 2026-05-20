import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import db from '../db/db'
import { applyBalanceEffect } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import NumericKeypad from '../components/NumericKeypad'
import AccountPickerSheet from '../components/AccountPickerSheet'

// ── Formatters ─────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

function fmtCompact(v) {
  const abs = Math.abs(v ?? 0)
  if (abs >= 1_000_000) return '₱' + ((v ?? 0) / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return '₱' + ((v ?? 0) / 1_000).toFixed(1) + 'K'
  return fmt(v)
}

function fmtDueDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDisplayAmount(str) {
  const [intRaw, decRaw] = str.split('.')
  const intFmt = parseInt(intRaw || '0', 10).toLocaleString('en-PH')
  return str.includes('.') ? intFmt + '.' + (decRaw ?? '') : intFmt
}

function handleAmountKey(prev, key) {
  if (key === 'backspace') return prev.length <= 1 ? '0' : prev.slice(0, -1)
  if (key === '.') return prev.includes('.') ? prev : prev + '.'
  if (prev === '0') return key
  const dotIdx = prev.indexOf('.')
  if (dotIdx !== -1 && prev.length - dotIdx > 2) return prev
  const intLen = dotIdx !== -1 ? dotIdx : prev.length
  if (intLen >= 10) return prev
  return prev + key
}

// ── Debt helpers ───────────────────────────────────────────────────────────────

function getStatus(amount, amountPaid) {
  const paid = amountPaid ?? 0
  const total = amount ?? 0
  if (total > 0 && paid >= total) return 'paid'
  if (paid > 0) return 'partial'
  return 'unpaid'
}

function getDueStatus(dueDate, isPaid) {
  if (!dueDate || isPaid) return 'none'
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const soon = new Date(now); soon.setDate(now.getDate() + 7)
  if (due < now)   return 'overdue'
  if (due <= soon) return 'soon'
  return 'ok'
}

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getAvatarColor(name) {
  const COLORS = ['#ef4444','#f97316','#f59e0b','#22c55e','#2D9DFF','#8b5cf6','#ec4899','#14b8a6','#6366f1','#06b6d4']
  let hash = 0
  for (let i = 0; i < (name?.length ?? 0); i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  return COLORS[Math.abs(hash) % COLORS.length]
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function IconChevronDown({ open }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function IconEdit() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

// ── Debt Card ──────────────────────────────────────────────────────────────────

function DebtCard({ debt, onEdit, onPayment }) {
  const status    = getStatus(debt.amount, debt.amountPaid)
  const isPaid    = status === 'paid'
  const dueStatus = getDueStatus(debt.dueDate, isPaid)
  const remaining = Math.max(0, (debt.amount ?? 0) - (debt.amountPaid ?? 0))
  const pct       = (debt.amount ?? 0) > 0
    ? Math.min(100, ((debt.amountPaid ?? 0) / debt.amount) * 100)
    : 0

  const avatarColor = getAvatarColor(debt.contact ?? debt.name)
  const initials    = getInitials(debt.contact ?? debt.name)

  const statusConfig = {
    paid:    { label: 'Paid',    bg: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400' },
    partial: { label: 'Partial', bg: 'bg-amber-100 dark:bg-amber-500/15',    text: 'text-amber-700 dark:text-amber-400'    },
    unpaid:  { label: 'Unpaid',  bg: 'bg-red-100 dark:bg-red-500/15',        text: 'text-red-700 dark:text-red-400'        },
  }
  const sc = statusConfig[status]

  const dueLabel     = fmtDueDate(debt.dueDate)
  const dueLabelClass =
    dueStatus === 'overdue' ? 'text-red-500 dark:text-red-400 font-semibold' :
    dueStatus === 'soon'    ? 'text-amber-600 dark:text-amber-400 font-medium' :
    'text-slate-400 dark:text-slate-500'

  const barColor =
    isPaid    ? 'bg-emerald-400' :
    pct >= 50 ? 'bg-amber-400'   :
    'bg-blue-400'

  return (
    <div className="bg-white dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.07] rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
      <div className="px-4 pt-4 pb-3">
        {/* Top row */}
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold"
            style={{ backgroundColor: avatarColor }}
          >
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[15px] text-slate-800 dark:text-white truncate">
                {debt.contact ?? debt.name}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>
                {sc.label}
              </span>
            </div>
            {dueLabel && (
              <p className={`text-[11px] mt-0.5 ${dueLabelClass}`}>
                {dueStatus === 'overdue' ? 'Overdue · ' : 'Due '}
                {dueLabel}
              </p>
            )}
          </div>

          <button
            onClick={() => onEdit(debt)}
            className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0
              text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/[0.05]
              active:bg-slate-200 dark:active:bg-white/[0.1] transition-colors"
          >
            <IconEdit />
          </button>
        </div>

        {/* Amount row */}
        <div className="mt-3 grid grid-cols-3 gap-1">
          {[
            { label: 'Total',     value: fmt(debt.amount),           color: 'text-slate-800 dark:text-white' },
            { label: 'Paid',      value: fmt(debt.amountPaid ?? 0),  color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Remaining', value: fmt(remaining),             color: isPaid ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-white' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium">{label}</p>
              <p className={`text-sm font-bold tabular-nums mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-slate-100 dark:bg-white/[0.08] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {debt.notes && (
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 italic line-clamp-1">{debt.notes}</p>
        )}
      </div>

      {!isPaid && (
        <div className="border-t border-slate-100 dark:border-white/[0.05]">
          <button
            onClick={() => onPayment(debt)}
            className="w-full py-2.5 text-xs font-semibold text-blue-600 dark:text-blue-400
              active:bg-blue-50 dark:active:bg-blue-500/[0.08] transition-colors"
          >
            + Record Payment
          </button>
        </div>
      )}
    </div>
  )
}

// ── Summary Row ────────────────────────────────────────────────────────────────

function SummaryRow({ debts, tab }) {
  const now = new Date(); now.setHours(0, 0, 0, 0)

  const outstanding = debts
    .filter(d => getStatus(d.amount, d.amountPaid) !== 'paid')
    .reduce((s, d) => s + Math.max(0, (d.amount ?? 0) - (d.amountPaid ?? 0)), 0)

  const overdueCount = debts.filter(d => {
    if (getStatus(d.amount, d.amountPaid) === 'paid') return false
    if (!d.dueDate) return false
    const due = new Date(d.dueDate); due.setHours(0, 0, 0, 0)
    return due < now
  }).length

  const label      = tab === 'i_owe' ? 'Total I Owe' : 'Total Owed to Me'
  const amountColor = tab === 'i_owe' ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-500'

  return (
    <div className="mx-4 mb-3 px-4 py-3 rounded-2xl
      bg-white dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.07]
      flex items-center justify-between gap-3
      shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">{label}</p>
        <p className={`text-xl font-bold tabular-nums ${amountColor}`}>{fmtCompact(outstanding)}</p>
      </div>
      {overdueCount > 0 ? (
        <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">{overdueCount} overdue</p>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-xl px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">All on time</p>
        </div>
      )}
    </div>
  )
}

// ── Empty State ────────────────────────────────────────────────────────────────

function EmptyState({ tab, onAdd }) {
  const isIOwe = tab === 'i_owe'
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="relative w-24 h-24 mb-5">
        <div className={`absolute inset-0 rounded-full opacity-10 ${isIOwe ? 'bg-red-400' : 'bg-emerald-400'}`} />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
            {isIOwe ? (
              <>
                <rect x="6" y="10" width="36" height="28" rx="4" className="fill-red-400" opacity="0.15" />
                <rect x="6" y="10" width="36" height="28" rx="4" className="stroke-red-400" strokeWidth="2.2" fill="none" />
                <path d="M16 24h16M24 16v16" className="stroke-red-400" strokeWidth="2.2" strokeLinecap="round" />
              </>
            ) : (
              <>
                <rect x="6" y="10" width="36" height="28" rx="4" className="fill-emerald-400" opacity="0.15" />
                <rect x="6" y="10" width="36" height="28" rx="4" className="stroke-emerald-400" strokeWidth="2.2" fill="none" />
                <path d="M16 24h16" className="stroke-emerald-400" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M14 20l4 4-4 4" className="stroke-emerald-400" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </>
            )}
          </svg>
        </div>
      </div>

      <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
        {isIOwe ? 'No debts recorded' : 'No one owes you yet'}
      </p>
      <p className="text-sm text-slate-400 dark:text-slate-500 mb-5 max-w-xs">
        {isIOwe
          ? 'Track money you owe to friends, family, or anyone else.'
          : 'Record loans and IOUs from people who owe you money.'
        }
      </p>
      <button
        onClick={onAdd}
        className="px-5 py-2.5 rounded-2xl text-sm font-semibold text-white
          bg-primary shadow-[0_4px_16px_rgba(45,157,255,0.35)]
          active:scale-95 transition-transform duration-75"
      >
        Add Debt
      </button>
    </div>
  )
}

// ── Settled Section ────────────────────────────────────────────────────────────

function SettledSection({ debts, onEdit }) {
  const [expanded, setExpanded] = useState(false)
  if (!debts.length) return null

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center gap-2 px-5 py-2.5"
      >
        <span className="flex-1 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 text-left">
          Settled ({debts.length})
        </span>
        <span className="text-slate-400 dark:text-slate-500">
          <IconChevronDown open={expanded} />
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2.5">
          {debts.map(d => (
            <div
              key={d.id}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl opacity-55
                bg-white dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.06]"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: getAvatarColor(d.contact ?? d.name) }}
              >
                {getInitials(d.contact ?? d.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate">{d.contact ?? d.name}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">{fmt(d.amount)}</p>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                Settled
              </span>
              <button
                onClick={() => onEdit(d)}
                className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0
                  text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/[0.05]
                  active:bg-slate-200 transition-colors"
              >
                <IconEdit />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Debt Form Sheet ────────────────────────────────────────────────────────────

function DebtFormSheet({ open, onClose, editDebt, defaultTab }) {
  const [closing,    setClosing]    = useState(false)
  const [contact,    setContact]    = useState('')
  const [amountStr,  setAmountStr]  = useState('')
  const [paidStr,    setPaidStr]    = useState('0')
  const [dueDate,    setDueDate]    = useState('')
  const [type,       setType]       = useState('i_owe')
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [errors,     setErrors]     = useState({})
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting,   setDeleting]   = useState(false)

  useEffect(() => {
    if (open) {
      if (editDebt) {
        setContact(editDebt.contact ?? editDebt.name ?? '')
        setAmountStr(editDebt.amount != null ? String(editDebt.amount) : '')
        setPaidStr(editDebt.amountPaid != null ? String(editDebt.amountPaid) : '0')
        setDueDate(editDebt.dueDate ? editDebt.dueDate.slice(0, 10) : '')
        setType(editDebt.type ?? 'i_owe')
        setNotes(editDebt.notes ?? '')
      } else {
        setContact('')
        setAmountStr('')
        setPaidStr('0')
        setDueDate('')
        setType(defaultTab ?? 'i_owe')
        setNotes('')
      }
      setErrors({})
      setConfirmDel(false)
    }
  }, [open, editDebt, defaultTab])

  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }, [onClose])

  const handleCloseRef = useRef(handleClose)
  useEffect(() => { handleCloseRef.current = handleClose }, [handleClose])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') handleCloseRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  async function handleSave() {
    const errs = {}
    if (!contact.trim()) errs.contact = 'Required'
    const amount = parseFloat(amountStr)
    if (!amountStr || isNaN(amount) || amount <= 0) errs.amount = 'Enter a valid amount'
    const paid = parseFloat(paidStr) || 0
    if (paid < 0) errs.paid = 'Cannot be negative'
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    try {
      const data = {
        contact:    contact.trim(),
        amount,
        amountPaid: Math.min(paid, amount),
        dueDate:    dueDate || null,
        type,
        notes:      notes.trim() || null,
      }
      if (editDebt) {
        await db.debts.update(editDebt.id, data)
      } else {
        await db.debts.add({ ...data, createdAt: new Date().toISOString() })
      }
      handleClose()
    } catch (e) {
      console.error('[DebtForm] save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    try {
      await db.debts.delete(editDebt.id)
      handleClose()
    } catch (e) {
      console.error('[DebtForm] delete failed:', e)
      setDeleting(false)
    }
  }

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="sheet-overlay absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-white dark:bg-[#111820] border-t border-slate-100 dark:border-white/[0.07]',
          'flex flex-col',
        ].join(' ')}
        style={{
          maxHeight: '92dvh',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
        }}
      >
        {/* Handle + title */}
        <div className="pt-4 px-5 pb-3 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800 dark:text-white">
              {editDebt ? 'Edit Debt' : 'Add Debt'}
            </h2>
            {editDebt && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={[
                  'text-xs font-semibold px-3 py-1.5 rounded-xl transition-all duration-150',
                  confirmDel
                    ? 'bg-red-500 text-white shadow-[0_2px_8px_rgba(239,68,68,0.4)]'
                    : 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10',
                ].join(' ')}
              >
                {deleting ? 'Deleting…' : confirmDel ? 'Confirm Delete' : 'Delete'}
              </button>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 pb-2 space-y-4">
          {/* Type toggle */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Type</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'i_owe',      label: 'I Owe',      active: 'border-red-400 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' },
                { value: 'owed_to_me', label: 'Owed to Me', active: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setType(opt.value)}
                  className={[
                    'py-2.5 rounded-2xl border text-sm font-semibold transition-all duration-150',
                    type === opt.value
                      ? opt.active
                      : 'border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 bg-white dark:bg-white/[0.03]',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">Contact Name</p>
            <input
              type="text"
              value={contact}
              onChange={e => { setContact(e.target.value); setErrors(p => ({ ...p, contact: null })) }}
              placeholder="e.g. Juan dela Cruz"
              className={[
                'w-full h-[52px] px-4 rounded-2xl text-sm text-slate-800 dark:text-white',
                'bg-white dark:bg-white/[0.05] outline-none',
                'placeholder:text-slate-300 dark:placeholder:text-slate-600',
                errors.contact
                  ? 'border border-red-300 dark:border-red-500/40'
                  : 'border border-slate-200/80 dark:border-white/[0.08]',
              ].join(' ')}
            />
            {errors.contact && <p className="mt-1 text-xs text-red-500">{errors.contact}</p>}
          </div>

          {/* Amount row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">Total Amount</p>
              <div className={[
                'flex items-center h-[52px] px-4 rounded-2xl',
                'bg-white dark:bg-white/[0.05]',
                errors.amount
                  ? 'border border-red-300 dark:border-red-500/40'
                  : 'border border-slate-200/80 dark:border-white/[0.08]',
              ].join(' ')}>
                <span className="text-slate-400 dark:text-slate-500 mr-1 text-sm shrink-0">₱</span>
                <input
                  type="number" min="0"
                  value={amountStr}
                  onChange={e => { setAmountStr(e.target.value); setErrors(p => ({ ...p, amount: null })) }}
                  placeholder="0.00"
                  className="flex-1 bg-transparent outline-none text-sm font-semibold text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 tabular-nums w-0"
                />
              </div>
              {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount}</p>}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">Amount Paid</p>
              <div className={[
                'flex items-center h-[52px] px-4 rounded-2xl',
                'bg-white dark:bg-white/[0.05]',
                errors.paid
                  ? 'border border-red-300 dark:border-red-500/40'
                  : 'border border-slate-200/80 dark:border-white/[0.08]',
              ].join(' ')}>
                <span className="text-slate-400 dark:text-slate-500 mr-1 text-sm shrink-0">₱</span>
                <input
                  type="number" min="0"
                  value={paidStr}
                  onChange={e => { setPaidStr(e.target.value); setErrors(p => ({ ...p, paid: null })) }}
                  placeholder="0.00"
                  className="flex-1 bg-transparent outline-none text-sm font-semibold text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 tabular-nums w-0"
                />
              </div>
              {errors.paid && <p className="mt-1 text-xs text-red-500">{errors.paid}</p>}
            </div>
          </div>

          {/* Due date */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">
              Due Date <span className="normal-case font-normal tracking-normal">(optional)</span>
            </p>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full h-[52px] px-4 rounded-2xl text-sm text-slate-800 dark:text-white
                bg-white dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08]
                outline-none dark:[color-scheme:dark]"
            />
          </div>

          {/* Notes */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">
              Notes <span className="normal-case font-normal tracking-normal">(optional)</span>
            </p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add a note…"
              rows={2}
              className="w-full px-4 py-3 rounded-2xl text-sm text-slate-800 dark:text-white
                bg-white dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08]
                outline-none resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
            />
          </div>
        </div>

        {/* Save */}
        <div className="px-5 pt-3 shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-[15px] rounded-2xl font-semibold text-[15px] text-white
              bg-primary shadow-[0_4px_20px_rgba(45,157,255,0.4)]
              disabled:opacity-40 disabled:shadow-none
              active:scale-[0.98] transition-all duration-100"
          >
            {saving ? 'Saving…' : editDebt ? 'Save Changes' : 'Add Debt'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Payment Sheet ──────────────────────────────────────────────────────────────

function PaymentSheet({ open, onClose, debt }) {
  const [closing,       setClosing]       = useState(false)
  const [amountStr,     setAmountStr]     = useState('0')
  const [account,       setAccount]       = useState(null)
  const [acctError,     setAcctError]     = useState(false)
  const [showAcctSheet, setShowAcctSheet] = useState(false)
  const [saving,        setSaving]        = useState(false)

  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])

  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }, [onClose])

  const handleCloseRef = useRef(handleClose)
  useEffect(() => { handleCloseRef.current = handleClose }, [handleClose])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') handleCloseRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) { setAmountStr('0'); setAccount(null); setAcctError(false) }
  }, [open])

  const paymentAmount = parseFloat(amountStr) || 0
  const remaining     = debt ? Math.max(0, (debt.amount ?? 0) - (debt.amountPaid ?? 0)) : 0
  const isIOwe        = debt?.type === 'i_owe'
  const isDisabled    = paymentAmount <= 0 || paymentAmount > remaining

  function onConfirmPress() {
    if (!account) { setAcctError(true); return }
    handleConfirm()
  }

  async function handleConfirm() {
    if (!debt || paymentAmount <= 0 || !account) return
    setSaving(true)
    try {
      const now    = new Date()
      const txType = isIOwe ? 'expense' : 'inflow'
      const category = isIOwe ? 'Debt Payment' : 'Debt Collection'
      const description = isIOwe
        ? `Payment to ${debt.contact ?? debt.name}`
        : `Received from ${debt.contact ?? debt.name}`

      await db.transaction('rw', [db.transactions, db.accounts, db.balances, db.debts], async () => {
        await db.transactions.add({
          txId:        crypto.randomUUID(),
          type:        txType,
          amount:      paymentAmount,
          description,
          category,
          account:     account.name,
          date:        now.toISOString(),
          synced:      false,
          updatedAt:   now.toISOString(),
        })
        await applyBalanceEffect({ type: txType, amount: paymentAmount, account: account.name })
        const newPaid = Math.min((debt.amountPaid ?? 0) + paymentAmount, debt.amount ?? 0)
        await db.debts.update(debt.id, { amountPaid: newPaid })
      })
      handleClose()
    } catch (e) {
      console.error('[PaymentSheet] save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  if (!open && !closing) return null

  const displayStr  = fmtDisplayAmount(amountStr)
  const fontSize    = displayStr.length <= 9 ? '2.75rem' : displayStr.length <= 12 ? '2.25rem' : '1.75rem'
  const initials    = getInitials(debt?.contact ?? debt?.name ?? '')
  const avatarColor = getAvatarColor(debt?.contact ?? debt?.name ?? '')

  return (
    <>
      <div className="fixed inset-0 z-[100]">
        <div
          className="sheet-overlay absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={handleClose}
        />
        <div
          className={[
            closing ? 'sheet-panel-exit' : 'sheet-panel',
            'absolute bottom-0 inset-x-0 rounded-t-[28px] px-5 pt-5',
            'bg-white dark:bg-[#111820] border-t border-slate-100 dark:border-white/[0.07]',
          ].join(' ')}
          style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
        >
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-5" />

          {/* Contact info */}
          {debt && (
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                  {debt.contact ?? debt.name}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Remaining:{' '}
                  <span className="font-medium tabular-nums text-slate-600 dark:text-slate-300">
                    {fmt(remaining)}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Amount display */}
          <div className="flex items-end justify-center gap-1.5 py-3 mb-3">
            <span className="text-xl font-semibold text-slate-400 dark:text-slate-500 mb-1">₱</span>
            <span
              className="font-bold text-slate-900 dark:text-white tabular-nums transition-[font-size] duration-100"
              style={{ fontSize }}
            >
              {displayStr}
            </span>
          </div>

          {paymentAmount > remaining && remaining > 0 && (
            <p className="text-center text-xs text-amber-600 dark:text-amber-400 mb-3 -mt-1">
              Cannot exceed remaining balance of {fmt(remaining)}
            </p>
          )}

          {/* Account picker */}
          <button
            onClick={() => { setAcctError(false); setShowAcctSheet(true) }}
            className={[
              'w-full flex items-center gap-3 px-4 h-[48px] rounded-2xl text-left mb-3',
              'bg-white dark:bg-white/[0.05] transition-colors',
              'active:bg-slate-50 dark:active:bg-white/[0.08]',
              acctError && !account
                ? 'border border-red-300 dark:border-red-500/40'
                : 'border border-slate-200/80 dark:border-white/[0.08]',
            ].join(' ')}
          >
            <span
              className="w-5 h-5 rounded-md shrink-0"
              style={{ backgroundColor: account?.color ?? '#cbd5e1' }}
            />
            <span className={`flex-1 text-sm ${account ? 'font-medium text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
              {account?.name ?? (isIOwe ? 'Pay from account…' : 'Receive into account…')}
            </span>
            {account && (
              <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                {fmt(account.balance)}
              </span>
            )}
            {acctError && !account && (
              <span className="text-xs text-red-500 shrink-0">Required</span>
            )}
          </button>

          <NumericKeypad
            onKey={key => setAmountStr(prev => handleAmountKey(prev, key))}
            onConfirm={onConfirmPress}
            confirmLabel={isIOwe ? 'Record Payment' : 'Record Receipt'}
            confirmDisabled={isDisabled}
            confirmLoading={saving}
          />
        </div>
      </div>

      <AccountPickerSheet
        open={showAcctSheet}
        onClose={() => setShowAcctSheet(false)}
        accounts={accounts ?? []}
        selected={account}
        onSelect={acct => { setAccount(acct); setAcctError(false) }}
      />
    </>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Debts() {
  const [tab,         setTab]         = useState('i_owe')
  const [showForm,    setShowForm]    = useState(false)
  const [editDebt,    setEditDebt]    = useState(null)
  const [paymentDebt, setPaymentDebt] = useState(null)
  const [showPayment, setShowPayment] = useState(false)

  const allDebts = useLiveQuery(() => db.debts.orderBy('createdAt').reverse().toArray(), [], [])

  const tabDebts = useMemo(
    () => (allDebts ?? []).filter(d => d.type === tab),
    [allDebts, tab],
  )

  const activeDebts  = useMemo(() => tabDebts.filter(d => getStatus(d.amount, d.amountPaid) !== 'paid'),  [tabDebts])
  const settledDebts = useMemo(() => tabDebts.filter(d => getStatus(d.amount, d.amountPaid) === 'paid'),   [tabDebts])

  function openAdd() {
    setEditDebt(null)
    setShowForm(true)
  }

  function openEdit(debt) {
    setEditDebt(debt)
    setShowForm(true)
  }

  function openPayment(debt) {
    setPaymentDebt(debt)
    setShowPayment(true)
  }

  return (
    <div className="flex flex-col page-enter" style={{ minHeight: 'calc(100dvh - 80px)' }}>

      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-5 pb-4">
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">Debts</h1>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-sm font-semibold text-white
            bg-primary shadow-[0_4px_16px_rgba(45,157,255,0.35)]
            active:scale-95 transition-transform duration-75"
        >
          <IconPlus />
          <span>Add Debt</span>
        </button>
      </header>

      {/* Tabs */}
      <div className="px-4 mb-4">
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-white/[0.06] rounded-2xl">
          {[
            { value: 'i_owe',      label: 'I Owe'      },
            { value: 'owed_to_me', label: 'Owed to Me' },
          ].map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={[
                'flex-1 py-2 rounded-xl text-sm font-semibold transition-all duration-150',
                tab === t.value
                  ? 'bg-white dark:bg-white/[0.1] text-slate-800 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary — only when there are debts */}
      {tabDebts.length > 0 && <SummaryRow debts={tabDebts} tab={tab} />}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tabDebts.length === 0 ? (
          <EmptyState tab={tab} onAdd={openAdd} />
        ) : (
          <>
            <div className="px-4 flex flex-col gap-3 pb-2">
              {activeDebts.map(d => (
                <DebtCard key={d.id} debt={d} onEdit={openEdit} onPayment={openPayment} />
              ))}
            </div>
            <SettledSection debts={settledDebts} onEdit={openEdit} />
            <div className="h-6" />
          </>
        )}
      </div>

      {/* Sheets */}
      <DebtFormSheet
        open={showForm}
        onClose={() => setShowForm(false)}
        editDebt={editDebt}
        defaultTab={tab}
      />
      <PaymentSheet
        open={showPayment}
        onClose={() => setShowPayment(false)}
        debt={paymentDebt}
      />
    </div>
  )
}
