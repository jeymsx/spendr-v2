import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import db, { UNSYNCED } from '../db/db'
import { applyBalanceEffect } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import AccountPickerSheet from '../components/AccountPickerSheet'
import SegTabs from '../components/SegTabs'
import { RowGroup, EditRow, RowInput, RowDate } from '../components/FormRows'
import { useAuth } from '../context/AuthContext'
import { deleteDebtRemote } from '../lib/sync'
import { IconPlus, IconChevronLeft } from '../components/icons'

// ── Formatters ─────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _phpFmt.format(Math.abs(n))
}

function fmtCompact(v) {
  const abs = Math.abs(v ?? 0)
  const sign = (v ?? 0) < 0 ? '−₱' : '₱'
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return sign + (abs / 1_000).toFixed(1) + 'K'
  return fmt(v)
}

function fmtDueDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}



// ── Debt helpers ───────────────────────────────────────────────────────────────

function getStatus(amount, amountPaid) {
  const paid = amountPaid ?? 0
  const total = amount ?? 0
  if (total > 0 && paid >= total) return 'paid'
  if (paid > 0) return 'partial'
  return 'unpaid'
}

const isSettled = (d) => getStatus(d.amount, d.amountPaid) === 'paid'
const owedOn    = (d) => Math.max(0, (d.amount ?? 0) - (d.amountPaid ?? 0))

/** Whole days from today to a due date; negative once it has passed. */
function daysToDue(dueDate) {
  if (!dueDate) return null
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0)
  if (Number.isNaN(due.getTime())) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.round((due - now) / 86400000)
}

function getDueStatus(dueDate, isPaid) {
  if (!dueDate || isPaid) return 'none'
  const n = daysToDue(dueDate)
  if (n == null) return 'none'
  if (n < 0)  return 'overdue'
  if (n <= 7) return 'soon'
  return 'ok'
}

function getInitials(name) {
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

function IconChevronDown({ open }) {
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

function IconEdit() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

/** Two people, for a ledger with nobody in it. */
function IconNoDebts() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" />
      <path d="M16.5 5.4a3.2 3.2 0 0 1 0 5.2M18.4 20a6.2 6.2 0 0 0-2.3-4.8" />
    </svg>
  )
}

// ── Pieces ─────────────────────────────────────────────────────────────────────

function SectionLabel({ children, hint, right = null }) {
  return (
    <div className="px-5 mb-2.5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{children}</p>
        {hint && (
          <p className="text-[12px] leading-snug text-slate-500 dark:text-slate-400 mt-0.5">{hint}</p>
        )}
      </div>
      {right}
    </div>
  )
}

function Card({ children, className = '' }) {
  return <div className={`card rounded-2xl overflow-hidden ${className}`}>{children}</div>
}

/** One of the three readings under the headline figure. */
function StatTile({ label, value, tone = '' }) {
  return (
    <Card className="px-2 py-3 text-center">
      <p className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`text-[17px] leading-none font-semibold tabular-nums mt-1.5 ${
        tone || 'text-slate-800 dark:text-white'
      }`}>
        {value}
      </p>
    </Card>
  )
}

// ── Debt Card ──────────────────────────────────────────────────────────────────

/**
 * One debt.
 *
 * It stays a card rather than becoming a row, unlike a bill: a debt is
 * partially payable, so it carries a progress bar and three figures that only
 * make sense together - total, paid, remaining. There is no version of that
 * which fits on one line.
 *
 * What changed is the palette. "Record Payment" was text-blue-600 and the
 * progress bar was bg-blue-400 - a hardcoded blue a few degrees off the app's
 * own accent, which is the sort of thing you cannot see until the two sit on
 * one screen. Both are the accent now, so the card belongs to the same product
 * as everything around it.
 */
function DebtCard({ debt, onEdit, onPayment }) {
  const status    = getStatus(debt.amount, debt.amountPaid)
  const isPaid    = status === 'paid'
  const dueStatus = getDueStatus(debt.dueDate, isPaid)
  const remaining = owedOn(debt)
  const pct       = (debt.amount ?? 0) > 0
    ? Math.min(100, ((debt.amountPaid ?? 0) / debt.amount) * 100)
    : 0

  const avatarColor = getAvatarColor(debt.contact ?? debt.name)
  const initials    = getInitials(debt.contact ?? debt.name)

  const statusConfig = {
    paid:    { label: 'Settled', bg: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400' },
    partial: { label: 'Partial', bg: 'bg-amber-100 dark:bg-amber-500/15',     text: 'text-amber-700 dark:text-amber-400'     },
    unpaid:  { label: 'Unpaid',  bg: 'bg-slate-100 dark:bg-white/[0.08]',     text: 'text-slate-600 dark:text-slate-300'     },
  }
  const sc = statusConfig[status]

  const dueLabel = fmtDueDate(debt.dueDate)
  const days     = daysToDue(debt.dueDate)
  const dueLabelClass =
    dueStatus === 'overdue' ? 'text-red-500 dark:text-red-400 font-semibold' :
    dueStatus === 'soon'    ? 'text-amber-600 dark:text-amber-400 font-medium' :
    'text-slate-500 dark:text-slate-400'

  /* Unpaid is grey, not red.

     It was bg-red-100/text-red-700, which made every untouched debt look like
     a problem - and then overdue had nothing louder left to say. Red is now
     reserved for the due date actually having passed, so a glance down the
     list separates "not started" from "late", which is the distinction that
     matters. */
  const barColor = isPaid ? 'bg-emerald-500' : dueStatus === 'overdue' ? 'bg-red-500' : 'bg-primary'

  return (
    <Card>
      <div className="px-4 pt-4 pb-3.5">
        <div className="flex items-start gap-3">
          <span
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold"
            style={{ backgroundColor: avatarColor }}
            aria-hidden="true"
          >
            {initials}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[15px] text-slate-800 dark:text-white truncate">
                {debt.contact ?? debt.name}
              </span>
              <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>
                {sc.label}
              </span>
            </div>
            {dueLabel ? (
              <p className={`text-[11.5px] mt-0.5 ${dueLabelClass}`}>
                {/* Same vocabulary as a bill's due label - "9d overdue" -
                    so the two pages read the same. */}
                {dueStatus === 'overdue' ? `${Math.abs(days)}d overdue · ` :
                 days === 0             ? 'Today · ' :
                 days === 1             ? 'Tomorrow · ' :
                 'Due '}
                {dueLabel}
              </p>
            ) : (
              <p className="text-[11.5px] mt-0.5 text-slate-400 dark:text-slate-500">No date set</p>
            )}
          </div>

          <button
            onClick={() => onEdit(debt)}
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0
              text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.06]
              active:bg-slate-200 dark:active:bg-white/[0.1] transition-colors"
            aria-label={`Edit ${debt.contact ?? debt.name}`}
          >
            <IconEdit />
          </button>
        </div>

        <div className="mt-3.5 grid grid-cols-3 gap-1">
          {[
            { label: 'Total',     value: fmt(debt.amount),          color: 'text-slate-800 dark:text-white' },
            { label: 'Paid',      value: fmt(debt.amountPaid ?? 0), color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Remaining', value: fmt(remaining),            color: isPaid ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-white' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className="text-[9.5px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">{label}</p>
              <p className={`text-[13px] font-bold tabular-nums mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 h-1.5 bg-slate-100 dark:bg-white/[0.08] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${barColor}`}
            style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%` }}
          />
        </div>

        {debt.notes && (
          <p className="mt-2.5 text-[11.5px] text-slate-500 dark:text-slate-400 line-clamp-2">{debt.notes}</p>
        )}
      </div>

      {!isPaid && (
        <div className="border-t border-slate-100 dark:border-white/[0.06]">
          <button
            onClick={() => onPayment(debt)}
            /* accent-ink, not text-primary. Measured in light mode, the raw
               accent is 2.85:1 here and 13px bold does not qualify for the
               large-text exemption, so it needed the shift. */
            className="w-full py-3 text-[13px] font-semibold accent-ink
              active:bg-primary/[0.06] transition-colors"
          >
            Record a payment
          </button>
        </div>
      )}
    </Card>
  )
}

// ── Settled ────────────────────────────────────────────────────────────────────

/**
 * Settled debts, folded away.
 *
 * Collapsed by default and it should be: a settled debt is history, and the
 * point of this page is what is still open. Not deleted either - "did I pay
 * Nica back?" is a real question and the answer lives here.
 */
function SettledSection({ debts, onEdit }) {
  const [expanded, setExpanded] = useState(false)
  if (!debts.length) return null

  return (
    <section className="mt-7">
      <div className="px-5 mb-2.5">
        <button
          onClick={() => setExpanded(p => !p)}
          className="w-full flex items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <span className="flex-1 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
            Settled
            <span className="ml-1.5 text-slate-400 dark:text-slate-500 tabular-nums font-normal">
              {debts.length}
            </span>
          </span>
          <span className="text-slate-400 dark:text-slate-500">
            <IconChevronDown open={expanded} />
          </span>
        </button>
      </div>

      {expanded && (
        <div className="px-5">
          <Card>
            {debts.map((d, i) => (
              <div key={d.id}>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 opacity-70"
                    style={{ backgroundColor: getAvatarColor(d.contact ?? d.name) }}
                    aria-hidden="true"
                  >
                    {getInitials(d.contact ?? d.name)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-slate-600 dark:text-slate-300 truncate">
                      {d.contact ?? d.name}
                    </p>
                    <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
                      {d.type === 'i_owe' ? 'Paid off' : 'Paid back'}
                    </p>
                  </div>
                  <p className="text-[13px] font-semibold tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                    {fmt(d.amount)}
                  </p>
                  <button
                    onClick={() => onEdit(d)}
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0
                      text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/[0.06]
                      active:bg-slate-200 dark:active:bg-white/[0.1] transition-colors"
                    aria-label={`Edit ${d.contact ?? d.name}`}
                  >
                    <IconEdit />
                  </button>
                </div>
                {i < debts.length - 1 && (
                  <div className="h-px bg-slate-100 dark:bg-white/[0.06] mx-4" />
                )}
              </div>
            ))}
          </Card>
        </div>
      )}
    </section>
  )
}

// ── Empty State ────────────────────────────────────────────────────────────────

/**
 * Nothing here, in the app's own voice.
 *
 * This replaced a 96px tinted disc holding a hand-drawn 44px SVG that changed
 * shape per tab. Every other empty state in the app - Goals, Bills, the trend
 * section - is a quiet glyph over two plain sentences, and a screen that
 * shouts when it has nothing to say is the one that looks least finished.
 */
function EmptyState({ view, onAdd }) {
  /* One line each. These were two sentences apiece explaining how debts work,
     which is not what an empty state is for - it is for saying the list is
     empty and offering the way out of that. */
  const copy = {
    all:        ['No debts yet', 'Track what you owe and what you are owed.'],
    i_owe:      ['You owe nothing', 'Nothing recorded against you.'],
    owed_to_me: ['Nobody owes you', 'Nothing lent out right now.'],
  }[view] ?? ['No debts yet', '']

  return (
    <div className="px-8 py-12 text-center">
      <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center
        bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-slate-500">
        <IconNoDebts />
      </div>
      <p className="mt-4 text-[15px] font-semibold text-slate-800 dark:text-white">{copy[0]}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{copy[1]}</p>
      <button
        onClick={onAdd}
        className="inline-block mt-5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary
          active:scale-[0.97] transition-transform duration-75"
      >
        Add a debt
      </button>
    </div>
  )
}

// ── Debt Form Sheet ────────────────────────────────────────────────────────────

export function DebtFormSheet({ open, onClose, editDebt, defaultTab }) {
  const [closing,    setClosing]    = useState(false)
  const { showToast } = useToast()
  const { user } = useAuth()
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
        setAmountStr(editDebt.amount != null ? numToMoneyStr(editDebt.amount) : '')
        setPaidStr(editDebt.amountPaid != null ? numToMoneyStr(editDebt.amountPaid) : '0')
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
      setDeleting(false)
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
    const amount = parseMoney(amountStr)
    if (!amountStr || amount <= 0) errs.amount = 'Enter a valid amount'
    const paid = parseMoney(paidStr)
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
        showToast('Debt updated')
      } else {
        await db.debts.add({ ...data, createdAt: new Date().toISOString() })
        showToast('Debt saved')
      }
      handleClose()
    } catch (e) {
      console.error('[DebtForm] save failed:', e)
      showToast('Failed to save debt', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    try {
      await db.debts.delete(editDebt.id)
      await deleteDebtRemote(user?.id, editDebt.id)
      handleClose()
    } catch (e) {
      console.error('[DebtForm] delete failed:', e)
      showToast('Failed to delete debt', 'error')
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
              {editDebt ? 'Edit debt' : 'Add debt'}
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

        {/* ── The body ──
            Rebuilt from a stack of six outlined boxes, each with a small-caps
            label above it, into the two shapes the rest of the app uses for
            this job: the amount as the hero, and everything else as native
            settings rows in one card.

            The amount led the change. Every other place in Spendr where you
            type money - Add Expense, Add Inflow, Transfer, and now the payment
            sheet - opens with one big centred figure, because the amount IS
            the transaction. Here it was the third field down, the same size as
            a note, which made a debt feel like a form to fill rather than a
            number to record. */}
        <div className="overflow-y-auto flex-1 px-5">

          <div className="flex flex-col items-center pt-1 pb-5">
            <input
              type="text"
              inputMode="decimal"
              autoFocus={!editDebt}
              placeholder="0.00"
              value={amountStr}
              onChange={e => { moneyChangeHandler(setAmountStr)(e); setErrors(p => ({ ...p, amount: null })) }}
              aria-label="Amount"
              className="amount-input font-semibold tabular-nums bg-transparent text-center w-full
                text-slate-900 dark:text-white outline-none
                placeholder-slate-200 dark:placeholder-slate-800"
            />
            <p className={`text-xs mt-2 tracking-wide ${
              errors.amount ? 'text-red-500 dark:text-red-400 font-medium' : 'text-slate-400 dark:text-slate-500'
            }`}>
              {errors.amount ?? 'Amount'}
            </p>
          </div>

          {/* Direction, as the app's segmented control - and the pill takes
              the colour of the side it is on, so the control itself says
              which way the money goes. Red and green are load-bearing here in
              a way they are not on a chart: they are the two states. */}
          <SegTabs
            tabs={[
              { value: 'i_owe',      label: 'I owe'      },
              { value: 'owed_to_me', label: 'Owed to me' },
            ]}
            value={type}
            onChange={setType}
            color={type === 'i_owe' ? '#ef4444' : '#10b981'}
          />

          <RowGroup className="mt-4">
            <EditRow label={errors.contact ? 'Who *' : 'Who'}>
              <RowInput
                value={contact}
                onChange={e => { setContact(e.target.value); setErrors(p => ({ ...p, contact: null })) }}
                placeholder={type === 'i_owe' ? 'Who you owe' : 'Who owes you'}
                autoFocus={false}
              />
            </EditRow>

            {/* "Already paid" rather than "Amount Paid": this is a debt you
                are recording after the fact, and the question is how much of
                it is behind you. Zero is the answer almost every time, so it
                shows as a placeholder rather than a typed-in 0 you have to
                clear. */}
            <EditRow label={errors.paid ? 'Already paid *' : 'Already paid'}>
              <RowInput
                value={paidStr === '0' ? '' : paidStr}
                onChange={e => { moneyChangeHandler(setPaidStr)(e); setErrors(p => ({ ...p, paid: null })) }}
                placeholder="0.00"
                inputMode="decimal"
              />
            </EditRow>

            <EditRow label="Due date">
              <RowDate
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                display={dueDate ? fmtDueDate(dueDate) : ''}
              />
            </EditRow>

            <EditRow label="Note" isLast>
              <RowInput
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </EditRow>
          </RowGroup>

          {(errors.contact || errors.paid) && (
            <p className="mt-2 px-1 text-xs text-red-500 dark:text-red-400">
              {errors.contact ? 'Say who this debt is with.' : errors.paid}
            </p>
          )}

          <div className="h-4 shrink-0" />
        </div>


        {/* Save */}
        <div className="px-5 pt-3 shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-[15px] rounded-2xl font-semibold text-[15px] text-white
              bg-primary shadow-[0_4px_20px_rgba(var(--color-primary-rgb),0.4)]
              disabled:opacity-40 disabled:shadow-none
              active:scale-[0.98] transition-all duration-100"
          >
            {saving ? 'Saving…' : editDebt ? 'Save Changes' : 'Add debt'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Payment Sheet ──────────────────────────────────────────────────────────────

export function PaymentSheet({ open, onClose, debt }) {
  const [closing,       setClosing]       = useState(false)
  const { showToast } = useToast()
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

  const paymentAmount = parseMoney(amountStr)
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
          synced:      UNSYNCED,
          updatedAt:   now.toISOString(),
        })
        await applyBalanceEffect({ type: txType, amount: paymentAmount, account: account.name })
        const newPaid = Math.min((debt.amountPaid ?? 0) + paymentAmount, debt.amount ?? 0)
        await db.debts.update(debt.id, { amountPaid: newPaid })
      })
      showToast('Payment recorded')
      handleClose()
    } catch (e) {
      console.error('[PaymentSheet] save failed:', e)
      showToast('Failed to record payment', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!open && !closing) return null

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
            'flex flex-col',
          ].join(' ')}
          /* Capped and scrollable, the same as the debt form sheet. The
             amount is a real text input now, so the OS keyboard comes up over
             the bottom of the screen - a fixed-height panel would put the
             confirm button underneath it. */
          style={{
            maxHeight: '92dvh',
            paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          }}
        >
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-5 shrink-0" />

          {/* Everything between the handle and the button scrolls, so the
              panel can give way when the keyboard takes the bottom half of
              the screen instead of pushing the confirm button off it. */}
          <div className="overflow-y-auto flex-1 min-h-0 -mx-5 px-5">
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

            {/* ── Amount ──
                The same field Add Expense, Add Inflow and Transfer use, down to
                the class: one big centred `amount-input`, inputMode="decimal",
                driven by moneyChangeHandler.

                It replaced a bespoke 10-key pad. The pad looked deliberate, and
                was the odd one out - every other place in the app where you type
                money uses the system keyboard, so the one screen with its own
                keypad taught a gesture that worked nowhere else. It also could
                not do the things a real input does for free: no caret, no
                select-all, no paste, no hardware keyboard on the desktop build,
                and no dictation.

                autoFocus so the keyboard arrives on open, which is what the pad
                did by simply being there. */}
            <div className="flex flex-col items-center pt-2 pb-6 shrink-0">
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                placeholder="0.00"
                value={amountStr === '0' ? '' : amountStr}
                onChange={moneyChangeHandler(setAmountStr)}
                aria-label="Payment amount"
                className="amount-input font-semibold tabular-nums bg-transparent text-center w-full
                  text-slate-900 dark:text-white outline-none
                  placeholder-slate-200 dark:placeholder-slate-800"
              />
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 tracking-wide">
                {isIOwe ? 'Paying' : 'Receiving'}
              </p>
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
          </div>


          {/* The keypad carried its own confirm, so losing it means the
              sheet needs one. Full width and the app's accent, the same as
              every other primary action. */}
          <button
            onClick={onConfirmPress}
            disabled={isDisabled || saving}
            className="w-full mt-4 py-[15px] rounded-2xl font-semibold text-[15px] text-white
              bg-primary shadow-[0_4px_20px_rgba(var(--color-primary-rgb),0.4)]
              disabled:opacity-40 disabled:shadow-none
              active:scale-[0.98] transition-all duration-100 shrink-0"
          >
            {saving
              ? 'Saving…'
              : isIOwe ? 'Record payment' : 'Record receipt'}
          </button>
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

const VIEWS = [
  { value: 'all',        label: 'All'        },
  { value: 'i_owe',      label: 'I owe'      },
  { value: 'owed_to_me', label: 'Owed to me' },
]

export default function Debts() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  /**
   * All, by default.
   *
   * Two mutually exclusive tabs meant the page could never answer the
   * question people actually have, which is not "what do I owe" or "what am I
   * owed" but the difference between them - and getting to it meant reading
   * one number, switching tabs, and doing the subtraction yourself. All shows
   * the net position and both sides at once.
   *
   * ?tab= still wins, because the home screen's Upcoming rows deep-link to
   * /debts?tab=i_owe and land you on the side the row was about.
   */
  const [view, setView] = useState(() => {
    const t = searchParams.get('tab')
    return t === 'owed_to_me' || t === 'i_owe' ? t : 'all'
  })

  const [showForm,    setShowForm]    = useState(false)
  const [editDebt,    setEditDebt]    = useState(null)
  const [paymentDebt, setPaymentDebt] = useState(null)
  const [showPayment, setShowPayment] = useState(false)

  useEffect(() => {
    const el = document.getElementById('app-main')
    if (el) el.scrollTop = 0
  }, [])

  const allDebts = useLiveQuery(() => db.debts.orderBy('createdAt').reverse().toArray(), [], undefined)
  /* Memoised because `allDebts ?? []` produces a NEW array on every render
     while the query is still loading, which changed the identity of the
     useCallback below it every pass and defeated the useMemo below that. */
  const rows = useMemo(() => allDebts ?? [], [allDebts])

  const forView = useCallback(
    (v) => v === 'all' ? rows : rows.filter(d => d.type === v),
    [rows],
  )

  const visible = useMemo(() => forView(view), [forView, view])
  const open    = useMemo(() => visible.filter(d => !isSettled(d)), [visible])
  const settled = useMemo(() => visible.filter(isSettled), [visible])

  // In All, the open debts split by direction so each card is unambiguous
  // without needing a marker of its own - the heading above it says which way
  // the money goes.
  const openOwe  = useMemo(() => open.filter(d => d.type === 'i_owe'), [open])
  const openOwed = useMemo(() => open.filter(d => d.type !== 'i_owe'), [open])

  /**
   * Every figure this page shows, from one pass over what is VISIBLE.
   *
   * Visible, not all of them. The first version summed across the whole table
   * so the readings would not move when you changed tabs - which put
   * "Overdue 2" above a list containing one overdue debt, because the second
   * was on the other side. A figure that disagrees with the rows under it is
   * worse than no figure at all.
   *
   * In All, visible IS every debt, so the I owe / Owed to me tiles are still
   * the whole picture there - which is the view whose entire job is the whole
   * picture.
   */
  const totals = useMemo(() => {
    let owe = 0, owed = 0, overdue = 0, dueWeek = 0
    for (const d of visible) {
      if (isSettled(d)) continue
      const left = owedOn(d)
      if (d.type === 'i_owe') owe += left
      else                    owed += left
      const n = daysToDue(d.dueDate)
      if (n == null) continue
      if (n < 0)       overdue += 1
      else if (n <= 7) dueWeek += 1
    }
    return { owe, owed, overdue, dueWeek, net: owed - owe }
  }, [visible])

  const openAdd     = () => { setEditDebt(null); setShowForm(true) }
  const openEdit    = (debt) => { setEditDebt(debt); setShowForm(true) }
  const openPayment = (debt) => { setPaymentDebt(debt); setShowPayment(true) }

  const loading = allDebts === undefined

  /** The headline, which is a different question in each view. */
  const headline = view === 'all'
    ? {
        label: 'Net position',
        value: fmt(Math.abs(totals.net)),
        // Signed, and the sign is the whole point: are you up or down across
        // everyone. Zero gets the neutral colour rather than green, because
        // "settled all round" is not a gain.
        tone: totals.net > 0 ? 'text-emerald-600 dark:text-emerald-400'
            : totals.net < 0 ? 'text-red-500 dark:text-red-400'
            : 'text-slate-900 dark:text-white',
        sub: totals.net > 0 ? 'In your favour'
           : totals.net < 0 ? 'Against you'
           : rows.length ? 'All even' : 'Nothing recorded',
      }
    : view === 'i_owe'
      ? {
          label: 'Total I owe',
          value: fmt(totals.owe),
          tone: totals.owe > 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-900 dark:text-white',
          sub: `${openOwe.length} open ${openOwe.length === 1 ? 'debt' : 'debts'}`,
        }
      : {
          label: 'Total owed to me',
          value: fmt(totals.owed),
          tone: totals.owed > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white',
          sub: `${openOwed.length} open ${openOwed.length === 1 ? 'debt' : 'debts'}`,
        }

  return (
    <div className="pb-nav">
      {/* ── Header ──
          Back, centred title, accent +. The same header Goals, Bills and
          AccountDetail use, because all four are reached from a quick-action
          disc rather than the navbar and all four need the same way out.

          The + is an icon and nothing else. It was a "＋ Add Debt" pill, which
          is the widest possible way to say a thing every other page in the app
          says in 36px. */}
      <header className="flex items-center gap-2 px-4 pt-safe-header pb-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0
            bg-white dark:bg-white/[0.07] border border-slate-200/80 dark:border-white/[0.09]
            text-slate-600 dark:text-slate-300 shadow-sm
            active:scale-90 transition-transform duration-75"
          aria-label="Back"
        >
          <IconChevronLeft />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold text-slate-800 dark:text-white truncate px-1">
          Debts
        </h1>
        <button
          onClick={openAdd}
          className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0
            bg-primary text-white shadow-[0_2px_10px_rgba(var(--color-primary-rgb),0.35)]
            active:scale-90 transition-transform duration-75"
          aria-label="New debt"
        >
          <IconPlus />
        </button>
      </header>

      {loading ? (
        <div className="px-5 mt-6 flex flex-col gap-3">
          <div className="h-24 rounded-2xl bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
          <div className="h-9 rounded-full bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
          <div className="h-40 rounded-2xl bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState view="all" onAdd={openAdd} />
      ) : (
        <>
          {/* ── Where you stand ── */}
          <section className="px-5">
            <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {headline.label}
            </p>
            <p className={`mt-2 text-center text-[38px] leading-none font-semibold tracking-tight tabular-nums ${headline.tone}`}>
              {/* The minus is drawn rather than formatted in, so the figure
                  reads as a magnitude with a direction and fmt() does not have
                  to carry a sign it would also apply to the tiles. */}
              {view === 'all' && totals.net < 0 ? '−' : ''}{headline.value}
            </p>
            <p className="mt-2 text-center text-[13px] text-slate-500 dark:text-slate-400">
              {headline.sub}
            </p>

            <div className="grid grid-cols-3 gap-2.5 mt-5">
              {view === 'all' ? (
                <>
                  <StatTile label="I owe"      value={fmtCompact(totals.owe)}
                    tone={totals.owe > 0 ? 'text-red-500 dark:text-red-400' : ''} />
                  <StatTile label="Owed to me" value={fmtCompact(totals.owed)}
                    tone={totals.owed > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''} />
                  <StatTile label="Overdue"    value={totals.overdue}
                    tone={totals.overdue > 0 ? 'text-red-500 dark:text-red-400' : ''} />
                </>
              ) : (
                <>
                  <StatTile label="Overdue"   value={totals.overdue}
                    tone={totals.overdue > 0 ? 'text-red-500 dark:text-red-400' : ''} />
                  <StatTile label="This week" value={totals.dueWeek} />
                  <StatTile label="Settled"   value={settled.length} />
                </>
              )}
            </div>
          </section>

          {/* ── Which side ── */}
          <div className="px-5 mt-6">
            <SegTabs
              tabs={VIEWS.map(v => ({
                ...v,
                // The count is what is OPEN, not what exists. A tab reading 4
                // that opens onto one live debt and three settled ones is
                // worse than no count at all.
                count: v.value === 'all'
                  ? 0
                  : forView(v.value).filter(d => !isSettled(d)).length,
              }))}
              value={view}
              onChange={setView}
            />
          </div>

          {open.length === 0 && settled.length === 0 ? (
            <div className="mt-2">
              <EmptyState view={view} onAdd={openAdd} />
            </div>
          ) : (
            <>
              {view === 'all' ? (
                <div className="mt-5 flex flex-col gap-6">
                  {openOwe.length > 0 && (
                    <section>
                      <SectionLabel>I owe</SectionLabel>
                      <div className="px-5 flex flex-col gap-3">
                        {openOwe.map(d => (
                          <DebtCard key={d.id} debt={d} onEdit={openEdit} onPayment={openPayment} />
                        ))}
                      </div>
                    </section>
                  )}
                  {openOwed.length > 0 && (
                    <section>
                      <SectionLabel>Owed to me</SectionLabel>
                      <div className="px-5 flex flex-col gap-3">
                        {openOwed.map(d => (
                          <DebtCard key={d.id} debt={d} onEdit={openEdit} onPayment={openPayment} />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              ) : (
                open.length > 0 && (
                  <section className="mt-5">
                    <SectionLabel>Open</SectionLabel>
                    <div className="px-5 flex flex-col gap-3">
                      {open.map(d => (
                        <DebtCard key={d.id} debt={d} onEdit={openEdit} onPayment={openPayment} />
                      ))}
                    </div>
                  </section>
                )
              )}

              <SettledSection debts={settled} onEdit={openEdit} />
            </>
          )}
        </>
      )}

      <DebtFormSheet
        open={showForm}
        onClose={() => setShowForm(false)}
        editDebt={editDebt}
        // A new debt lands on the side you were looking at. In All there is no
        // side to infer, so the form's own default stands.
        defaultTab={view === 'all' ? undefined : view}
      />
      <PaymentSheet
        open={showPayment}
        onClose={() => setShowPayment(false)}
        debt={paymentDebt}
      />
    </div>
  )
}
