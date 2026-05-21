import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import db from '../db/db'
import { applyBalanceEffect } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { advanceNextDate, toMonthlyAmount } from '../utils/recurring'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import CategoryPickerSheet from '../components/CategoryPickerSheet'
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

// ── Date helpers ───────────────────────────────────────────────────────────────

function parseDateLocal(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const due = parseDateLocal(dateStr)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.round((due - now) / 86400000)
}

function fmtDaysUntil(n) {
  if (n == null) return null
  if (n < 0)  return { label: `${Math.abs(n)}d overdue`, class: 'text-red-500 dark:text-red-400 font-semibold' }
  if (n === 0) return { label: 'Today',                  class: 'text-red-500 dark:text-red-400 font-semibold' }
  if (n === 1) return { label: 'Tomorrow',               class: 'text-amber-600 dark:text-amber-400 font-medium' }
  if (n <= 7)  return { label: `${n} days`,              class: 'text-amber-600 dark:text-amber-400 font-medium' }
  if (n <= 14) return { label: '1 week',                 class: 'text-slate-500 dark:text-slate-400' }
  return       { label: `${Math.round(n / 7)}w`,         class: 'text-slate-400 dark:text-slate-500' }
}

function fmtDate(str) {
  if (!str) return ''
  return parseDateLocal(str).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

// ── Constants ──────────────────────────────────────────────────────────────────

const FREQ_OPTIONS = [
  { value: 'daily',   label: 'Daily',   short: 'day'  },
  { value: 'weekly',  label: 'Weekly',  short: 'wk'   },
  { value: 'monthly', label: 'Monthly', short: 'mo'   },
  { value: 'yearly',  label: 'Yearly',  short: 'yr'   },
]

const FREQ_ORDER = ['monthly', 'weekly', 'yearly', 'daily']

const FREQ_LABEL = Object.fromEntries(FREQ_OPTIONS.map(f => [f.value, f.label]))
const FREQ_SHORT = Object.fromEntries(FREQ_OPTIONS.map(f => [f.value, f.short]))

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function IconRepeat() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  )
}

function IconFlash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L4.09 12.78A1 1 0 005 14h6v8l8.91-10.78A1 1 0 0019 10h-6V2z" />
    </svg>
  )
}

// ── Monthly Summary Card ───────────────────────────────────────────────────────

function MonthlySummaryCard({ items }) {
  const active = items.filter(r => r.active)
  const totalMonthly = active.reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0)
  const byFreq = FREQ_ORDER.map(f => ({
    freq:  f,
    label: FREQ_LABEL[f],
    count: active.filter(r => r.frequency === f).length,
    total: active.filter(r => r.frequency === f).reduce((s, r) => s + (r.amount ?? 0), 0),
  })).filter(g => g.count > 0)

  return (
    <div className="mx-4 mb-4 rounded-2xl overflow-hidden
      bg-gradient-to-br from-violet-500 to-blue-500
      shadow-[0_8px_32px_rgba(139,92,246,0.35)]">
      <div className="px-5 pt-4 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/60 mb-1">
          Monthly Cost (Active)
        </p>
        <p className="text-3xl font-bold text-white tabular-nums">
          {fmtCompact(totalMonthly)}
          <span className="text-base font-medium text-white/60 ml-1">/mo</span>
        </p>
        <p className="text-xs text-white/60 mt-0.5">{active.length} active payment{active.length !== 1 ? 's' : ''}</p>
      </div>

      {byFreq.length > 0 && (
        <div className="flex border-t border-white/10">
          {byFreq.map((g, i) => (
            <div
              key={g.freq}
              className={`flex-1 px-3 py-2.5 ${i > 0 ? 'border-l border-white/10' : ''}`}
            >
              <p className="text-[10px] text-white/50 uppercase tracking-wider font-semibold">{g.label}</p>
              <p className="text-sm font-bold text-white tabular-nums mt-0.5">{fmtCompact(g.total)}</p>
              <p className="text-[10px] text-white/50">{g.count} item{g.count !== 1 ? 's' : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Upcoming Card ──────────────────────────────────────────────────────────────

function UpcomingCard({ rec, onEdit, onPost, posting }) {
  const days    = daysUntil(rec.nextDate)
  const dueInfo = fmtDaysUntil(days)
  const isUrgent = days != null && days <= 1

  return (
    <div className={[
      'bg-white dark:bg-white/[0.05] border rounded-2xl overflow-hidden',
      'shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none',
      isUrgent
        ? 'border-red-200 dark:border-red-500/20'
        : 'border-slate-200/80 dark:border-white/[0.07]',
    ].join(' ')}>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Category icon */}
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: (rec._catColor ?? '#6366f1') + '20' }}
          >
            {rec._catIcon ?? '🔄'}
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[15px] text-slate-800 dark:text-white truncate">{rec.name}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              {rec.account} · {FREQ_LABEL[rec.frequency] ?? rec.frequency}
            </p>
          </div>

          <div className="text-right shrink-0">
            <p className="font-bold text-[15px] text-slate-800 dark:text-white tabular-nums">{fmt(rec.amount)}</p>
            {dueInfo && (
              <p className={`text-[11px] mt-0.5 ${dueInfo.class}`}>{dueInfo.label}</p>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            <IconRepeat />
            <span>Next: {fmtDate(rec.nextDate)}</span>
          </div>

          <button
            onClick={() => onEdit(rec)}
            className="text-[11px] font-medium text-slate-400 dark:text-slate-500 px-2 py-1 rounded-lg
              active:bg-slate-100 dark:active:bg-white/[0.07] transition-colors"
          >
            Edit
          </button>

          <button
            onClick={() => onPost(rec)}
            disabled={posting === rec.id}
            className={[
              'flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold',
              'transition-all duration-100 active:scale-95',
              'text-white shadow-[0_2px_8px_rgba(139,92,246,0.4)]',
              posting === rec.id
                ? 'bg-violet-400 opacity-60'
                : 'bg-violet-500',
            ].join(' ')}
          >
            <IconFlash />
            {posting === rec.id ? 'Posting…' : 'Post now'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── All Tab Row ────────────────────────────────────────────────────────────────

function RecurringRow({ rec, onEdit, onToggle, toggling }) {
  return (
    <button
      onClick={() => onEdit(rec)}
      className="w-full flex items-center gap-3 px-4 py-3 text-left
        active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
        style={{ backgroundColor: (rec._catColor ?? '#6366f1') + '20' }}
      >
        {rec._catIcon ?? '🔄'}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${rec.active ? 'text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
          {rec.name}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
          {rec.account} · next {fmtDate(rec.nextDate)}
        </p>
      </div>

      <div className="text-right shrink-0 mr-2">
        <p className={`text-sm font-bold tabular-nums ${rec.active ? 'text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
          {fmt(rec.amount)}
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">/{FREQ_SHORT[rec.frequency] ?? rec.frequency}</p>
      </div>

      {/* Active toggle */}
      <button
        onClick={e => { e.stopPropagation(); onToggle(rec) }}
        disabled={toggling === rec.id}
        className={[
          'w-11 h-6 rounded-full shrink-0 relative transition-all duration-200',
          rec.active ? 'bg-violet-500' : 'bg-slate-200 dark:bg-white/[0.1]',
          toggling === rec.id ? 'opacity-50' : '',
        ].join(' ')}
        aria-label={rec.active ? 'Pause' : 'Resume'}
      >
        <span className={[
          'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm',
          'transition-all duration-200',
          rec.active ? 'left-5' : 'left-0.5',
        ].join(' ')} />
      </button>

      <IconChevronRight />
    </button>
  )
}

// ── Empty State ────────────────────────────────────────────────────────────────

function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="relative w-24 h-24 mb-5">
        <div className="absolute inset-0 rounded-full bg-violet-400 opacity-10" />
        <div className="absolute inset-0 flex items-center justify-center text-violet-400">
          <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
            <path d="M24 8C15.16 8 8 15.16 8 24s7.16 16 16 16 16-7.16 16-16"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M32 8l4 4-4 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M24 16v8l5 3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">No recurring payments</p>
      <p className="text-sm text-slate-400 dark:text-slate-500 mb-5 max-w-xs">
        Track subscriptions, bills, and any payment that repeats on a schedule.
      </p>
      <button
        onClick={onAdd}
        className="px-5 py-2.5 rounded-2xl text-sm font-semibold text-white
          bg-violet-500 shadow-[0_4px_16px_rgba(139,92,246,0.35)]
          active:scale-95 transition-transform duration-75"
      >
        Add Recurring
      </button>
    </div>
  )
}

// ── Recurring Form Sheet ───────────────────────────────────────────────────────

function RecurringFormSheet({ open, onClose, editRec, categories, accounts }) {
  const [closing,      setClosing]      = useState(false)
  const { showToast } = useToast()
  const [name,         setName]         = useState('')
  const [amountStr,    setAmountStr]    = useState('')
  const [category,     setCategory]     = useState(null)
  const [account,      setAccount]      = useState(null)
  const [frequency,    setFrequency]    = useState('monthly')
  const [nextDate,     setNextDate]     = useState('')
  const [active,       setActive]       = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [errors,       setErrors]       = useState({})
  const [confirmDel,   setConfirmDel]   = useState(false)
  const [deleting,     setDeleting]     = useState(false)
  const [showCatPick,  setShowCatPick]  = useState(false)
  const [showAcctPick, setShowAcctPick] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editRec) {
      setName(editRec.name ?? '')
      setAmountStr(editRec.amount != null ? numToMoneyStr(editRec.amount) : '')
      setCategory(categories.find(c => c.name === editRec.category) ?? null)
      setAccount(accounts.find(a => a.name === editRec.account) ?? null)
      setFrequency(editRec.frequency ?? 'monthly')
      setNextDate(editRec.nextDate ? editRec.nextDate.slice(0, 10) : '')
      setActive(editRec.active !== false)
    } else {
      setName('')
      setAmountStr('')
      setCategory(null)
      setAccount(null)
      setFrequency('monthly')
      const today = new Date().toISOString().slice(0, 10)
      setNextDate(today)
      setActive(true)
    }
    setErrors({})
    setConfirmDel(false)
  }, [open, editRec, categories, accounts])

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
    if (!name.trim()) errs.name = 'Required'
    const amount = parseMoney(amountStr)
    if (!amountStr || amount <= 0) errs.amount = 'Enter a valid amount'
    if (!category) errs.category = 'Select a category'
    if (!account)  errs.account  = 'Select an account'
    if (!nextDate) errs.nextDate = 'Required'
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    try {
      const data = {
        name:      name.trim(),
        amount,
        category:  category.name,
        account:   account.name,
        frequency,
        nextDate,
        active,
      }
      if (editRec) {
        await db.recurring.update(editRec.id, data)
        showToast('Recurring updated')
      } else {
        await db.recurring.add(data)
        showToast('Recurring saved')
      }
      handleClose()
    } catch (e) {
      console.error('[RecurringForm] save failed:', e)
      showToast('Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    try {
      await db.recurring.delete(editRec.id)
      handleClose()
    } catch (e) {
      console.error('[RecurringForm] delete failed:', e)
      setDeleting(false)
    }
  }

  const expenseCategories = useMemo(
    () => (categories ?? []).filter(c => c.type === 'expense')
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name)),
    [categories],
  )

  if (!open && !closing) return null

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
                {editRec ? 'Edit Recurring' : 'Add Recurring'}
              </h2>
              {editRec && (
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

          {/* Scrollable fields */}
          <div className="overflow-y-auto flex-1 px-5 space-y-4">

            {/* Name */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">Name</p>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: null })) }}
                placeholder="e.g. Netflix, Rent, Gym"
                className={[
                  'w-full h-[52px] px-4 rounded-2xl text-sm text-slate-800 dark:text-white',
                  'bg-white dark:bg-white/[0.05] outline-none',
                  'placeholder:text-slate-300 dark:placeholder:text-slate-600',
                  errors.name
                    ? 'border border-red-300 dark:border-red-500/40'
                    : 'border border-slate-200/80 dark:border-white/[0.08]',
                ].join(' ')}
              />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>

            {/* Amount */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">Amount</p>
              <div className={[
                'flex items-center h-[52px] px-4 rounded-2xl',
                'bg-white dark:bg-white/[0.05]',
                errors.amount
                  ? 'border border-red-300 dark:border-red-500/40'
                  : 'border border-slate-200/80 dark:border-white/[0.08]',
              ].join(' ')}>
                <span className="text-slate-400 dark:text-slate-500 mr-1.5 text-sm shrink-0">₱</span>
                <input
                  type="text" inputMode="decimal"
                  value={amountStr}
                  onChange={e => { moneyChangeHandler(setAmountStr)(e); setErrors(p => ({ ...p, amount: null })) }}
                  placeholder="0.00"
                  className="flex-1 bg-transparent outline-none text-sm font-semibold text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 tabular-nums w-0"
                />
              </div>
              {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount}</p>}
            </div>

            {/* Frequency */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Frequency</p>
              <div className="grid grid-cols-4 gap-2">
                {FREQ_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFrequency(opt.value)}
                    className={[
                      'py-2.5 rounded-2xl border text-sm font-semibold transition-all duration-150',
                      frequency === opt.value
                        ? 'border-violet-400 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300'
                        : 'border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 bg-white dark:bg-white/[0.03]',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">Category</p>
              <button
                onClick={() => setShowCatPick(true)}
                className={[
                  'w-full h-[52px] px-4 rounded-2xl flex items-center gap-3 text-left',
                  'bg-white dark:bg-white/[0.05]',
                  'active:bg-slate-50 dark:active:bg-white/[0.08] transition-colors',
                  errors.category
                    ? 'border border-red-300 dark:border-red-500/40'
                    : 'border border-slate-200/80 dark:border-white/[0.08]',
                ].join(' ')}
              >
                {category ? (
                  <>
                    <span className="text-xl leading-none">{category.icon}</span>
                    <span className="flex-1 text-sm font-medium text-slate-800 dark:text-white">{category.name}</span>
                  </>
                ) : (
                  <span className="flex-1 text-sm text-slate-400 dark:text-slate-500">Select category</span>
                )}
                <span className="text-slate-300 dark:text-slate-600"><IconChevronRight /></span>
              </button>
              {errors.category && <p className="mt-1 text-xs text-red-500">{errors.category}</p>}
            </div>

            {/* Account */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">Account</p>
              <button
                onClick={() => setShowAcctPick(true)}
                className={[
                  'w-full h-[52px] px-4 rounded-2xl flex items-center gap-3 text-left',
                  'bg-white dark:bg-white/[0.05]',
                  'active:bg-slate-50 dark:active:bg-white/[0.08] transition-colors',
                  errors.account
                    ? 'border border-red-300 dark:border-red-500/40'
                    : 'border border-slate-200/80 dark:border-white/[0.08]',
                ].join(' ')}
              >
                {account ? (
                  <>
                    <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: account.color ?? '#2D9DFF' }} />
                    <span className="flex-1 text-sm font-medium text-slate-800 dark:text-white">{account.name}</span>
                  </>
                ) : (
                  <span className="flex-1 text-sm text-slate-400 dark:text-slate-500">Select account</span>
                )}
                <span className="text-slate-300 dark:text-slate-600"><IconChevronRight /></span>
              </button>
              {errors.account && <p className="mt-1 text-xs text-red-500">{errors.account}</p>}
            </div>

            {/* Next date */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">Next Due Date</p>
              <input
                type="date"
                value={nextDate}
                onChange={e => { setNextDate(e.target.value); setErrors(p => ({ ...p, nextDate: null })) }}
                className={[
                  'block w-full h-[52px] px-4 rounded-2xl text-sm text-slate-800 dark:text-white',
                  'bg-white dark:bg-white/[0.05] outline-none dark:[color-scheme:dark]',
                  errors.nextDate
                    ? 'border border-red-300 dark:border-red-500/40'
                    : 'border border-slate-200/80 dark:border-white/[0.08]',
                ].join(' ')}
              />
              {errors.nextDate && <p className="mt-1 text-xs text-red-500">{errors.nextDate}</p>}
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between px-4 py-3.5 rounded-2xl
              bg-white dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08]">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-white">Active</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {active ? 'Will appear in upcoming' : 'Paused — not shown in upcoming'}
                </p>
              </div>
              <button
                onClick={() => setActive(p => !p)}
                className={[
                  'w-12 h-6.5 rounded-full relative transition-all duration-200 shrink-0',
                  active ? 'bg-violet-500' : 'bg-slate-200 dark:bg-white/[0.1]',
                ].join(' ')}
                style={{ height: '26px', width: '46px' }}
              >
                <span className={[
                  'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200',
                  active ? 'left-[22px]' : 'left-0.5',
                ].join(' ')} />
              </button>
            </div>
            <div className="h-4 shrink-0" />
          </div>

          {/* Save */}
          <div className="px-5 pt-3 shrink-0">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-[15px] rounded-2xl font-semibold text-[15px] text-white
                bg-violet-500 shadow-[0_4px_20px_rgba(139,92,246,0.4)]
                disabled:opacity-40 disabled:shadow-none
                active:scale-[0.98] transition-all duration-100"
            >
              {saving ? 'Saving…' : editRec ? 'Save Changes' : 'Add Recurring'}
            </button>
          </div>
        </div>
      </div>

      {/* Nested pickers at z-[110] */}
      <CategoryPickerSheet
        open={showCatPick}
        onClose={() => setShowCatPick(false)}
        categories={expenseCategories}
        selected={category}
        onSelect={cat => { setCategory(cat); setErrors(p => ({ ...p, category: null })) }}
      />
      <AccountPickerSheet
        open={showAcctPick}
        onClose={() => setShowAcctPick(false)}
        accounts={accounts ?? []}
        selected={account}
        onSelect={acct => { setAccount(acct); setErrors(p => ({ ...p, account: null })) }}
      />
    </>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Recurring() {
  const [tab,      setTab]      = useState('upcoming')
  const [showForm, setShowForm] = useState(false)
  const [editRec,  setEditRec]  = useState(null)
  const [posting,  setPosting]  = useState(null)
  const [toggling, setToggling] = useState(null)

  const allRec    = useLiveQuery(() => db.recurring.toArray(), [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const accounts   = useLiveQuery(() => db.accounts.toArray(), [], [])

  // Enrich recurring items with category icon/color
  const enriched = useMemo(() => {
    const catMap = Object.fromEntries((categories ?? []).map(c => [c.name, c]))
    return (allRec ?? []).map(r => ({
      ...r,
      _catIcon:  catMap[r.category]?.icon  ?? '🔄',
      _catColor: catMap[r.category]?.color ?? '#6366f1',
    }))
  }, [allRec, categories])

  // Upcoming: active items due within 30 days, sorted by nextDate asc
  const upcomingItems = useMemo(() => {
    const now   = new Date(); now.setHours(0, 0, 0, 0)
    const limit = new Date(now); limit.setDate(now.getDate() + 30)
    return enriched
      .filter(r => {
        if (!r.active) return false
        const d = parseDateLocal(r.nextDate)
        return d != null && d <= limit
      })
      .sort((a, b) => (a.nextDate ?? '').localeCompare(b.nextDate ?? ''))
  }, [enriched])

  // All tab: grouped by frequency
  const groupedAll = useMemo(() =>
    FREQ_ORDER
      .map(freq => ({
        freq,
        label: FREQ_LABEL[freq],
        items: enriched.filter(r => r.frequency === freq),
      }))
      .filter(g => g.items.length > 0),
    [enriched],
  )

  async function handlePost(rec) {
    setPosting(rec.id)
    try {
      const now         = new Date().toISOString()
      const newNextDate = advanceNextDate(rec.nextDate, rec.frequency)
      await db.transaction('rw', [db.transactions, db.accounts, db.balances, db.recurring], async () => {
        await db.transactions.add({
          txId:      crypto.randomUUID(),
          type:      'expense',
          amount:    rec.amount,
          description: rec.name,
          category:  rec.category,
          payment:   rec.account,
          account:   rec.account,
          date:      now,
          synced:    false,
          updatedAt: now,
        })
        await applyBalanceEffect({ type: 'expense', amount: rec.amount, account: rec.account })
        await db.recurring.update(rec.id, { nextDate: newNextDate })
      })
    } catch (e) {
      console.error('[Recurring] post failed:', e)
    } finally {
      setPosting(null)
    }
  }

  async function handleToggle(rec) {
    setToggling(rec.id)
    try {
      await db.recurring.update(rec.id, { active: !rec.active })
    } catch (e) {
      console.error('[Recurring] toggle failed:', e)
    } finally {
      setToggling(null)
    }
  }

  function openAdd() {
    setEditRec(null)
    setShowForm(true)
  }

  function openEdit(rec) {
    setEditRec(rec)
    setShowForm(true)
  }

  return (
    <div className="flex flex-col page-enter" style={{ minHeight: 'calc(100dvh - 80px)' }}>

      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-safe-header pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Recurring</h1>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-sm font-semibold text-white
            bg-violet-500 shadow-[0_4px_16px_rgba(139,92,246,0.3)]
            active:scale-95 transition-transform duration-75"
        >
          <IconPlus />
          <span>Add</span>
        </button>
      </header>

      {/* Monthly summary — only when there are active items */}
      {enriched.some(r => r.active) && (
        <MonthlySummaryCard items={enriched} />
      )}

      {/* Tabs */}
      <div className="px-4 mb-4">
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-white/[0.06] rounded-2xl">
          {[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'all',      label: 'All'      },
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
              {t.value === 'upcoming' && upcomingItems.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full
                  bg-violet-500 text-white text-[9px] font-bold">
                  {upcomingItems.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {enriched.length === 0 ? (
          <EmptyState onAdd={openAdd} />
        ) : tab === 'upcoming' ? (
          upcomingItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="text-base font-semibold text-slate-700 dark:text-slate-200">All clear</p>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">No payments due in the next 30 days.</p>
            </div>
          ) : (
            <div className="px-4 flex flex-col gap-3 pb-6">
              {upcomingItems.map(r => (
                <UpcomingCard
                  key={r.id}
                  rec={r}
                  onEdit={openEdit}
                  onPost={handlePost}
                  posting={posting}
                />
              ))}
            </div>
          )
        ) : (
          <div className="pb-6">
            {groupedAll.map(({ freq, label, items }) => (
              <div key={freq} className="mb-2">
                <p className="px-5 py-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {label}
                </p>
                <div className="mx-4 bg-white dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.07] rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-white/[0.05]">
                  {items.map(r => (
                    <RecurringRow
                      key={r.id}
                      rec={r}
                      onEdit={openEdit}
                      onToggle={handleToggle}
                      toggling={toggling}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form sheet */}
      <RecurringFormSheet
        open={showForm}
        onClose={() => setShowForm(false)}
        editRec={editRec}
        categories={categories ?? []}
        accounts={accounts ?? []}
      />
    </div>
  )
}
