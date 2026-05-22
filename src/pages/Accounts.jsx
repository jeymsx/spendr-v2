import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ReactCrop from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { useTheme } from '../context/ThemeContext'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { getCycleRange, getNextCycleRange } from '../utils/creditCycle'
import { PH_ACCOUNTS, PH_GROUPS, POPULAR_ACCOUNTS, TYPE_ICON } from '../lib/phAccounts'
import { useScrollLock } from '../hooks/useScrollLock'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'

// ── Formatters ─────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

function fmtCompact(v) {
  const abs = Math.abs(v ?? 0)
  if (abs >= 1_000_000) return '₱' + ((v ?? 0) / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return '₱' + ((v ?? 0) / 1_000).toFixed(1) + 'K'
  return fmt(v)
}

function fmtTxDate(isoStr) {
  if (!isoStr) return ''
  const d    = new Date(isoStr)
  const now  = new Date(); now.setHours(0, 0, 0, 0)
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (d >= now)  return 'Today'
  if (d >= yest) return 'Yesterday'
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function fmtTxTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PALETTE = [
  '#10b981', '#2D9DFF', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#f97316',
  '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#a78bfa', '#64748b', '#0ea5e9',
]

const TYPE_OPTIONS = [
  { value: 'cash',    label: 'Cash',        shortLabel: 'Cash'     },
  { value: 'ewallet', label: 'E-Wallet',    shortLabel: 'E-Wallet' },
  { value: 'savings', label: 'Savings',     shortLabel: 'Savings'  },
  { value: 'bank',    label: 'Bank',        shortLabel: 'Bank'     },
  { value: 'credit',  label: 'Credit Card', shortLabel: 'Credit'   },
]

const TYPE_LABEL = Object.fromEntries(TYPE_OPTIONS.map(t => [t.value, t.label]))

function defaultRole(type) {
  if (type === 'credit') return 'credit'
  return ['cash', 'ewallet'].includes(type) ? 'spending' : 'savings'
}

const ACCOUNT_GROUPS = [
  { label: 'Cash',          types: ['cash']            },
  { label: 'E-Wallets',     types: ['ewallet']         },
  { label: 'Bank Accounts', types: ['savings', 'bank'] },
  { label: 'Credit Cards',  types: ['credit']          },
]

// ── Date helpers ───────────────────────────────────────────────────────────────

function nextOccurrence(dayOfMonth) {
  if (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 31) return null
  const now = new Date()
  let d = new Date(now.getFullYear(), now.getMonth(), dayOfMonth)
  if (d <= now) d = new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth)
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function nextOccurrenceDate(dayOfMonth) {
  if (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 31) return null
  const now = new Date()
  let d = new Date(now.getFullYear(), now.getMonth(), dayOfMonth)
  if (d <= now) d = new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth)
  return d
}

function fmtCycleDate(date) {
  if (!date) return ''
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconWallet() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
      <path d="M16 13a1 1 0 100 2 1 1 0 000-2z" fill="currentColor" />
      <path d="M20 7V5a2 2 0 00-2-2H6a2 2 0 00-2 2v2" />
    </svg>
  )
}

function IconPhone() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="3" />
      <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" />
    </svg>
  )
}

function IconBank() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 20 7 4 7" fill="currentColor" fillOpacity="0.3" />
    </svg>
  )
}

function IconCard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="3" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}

function IconEye() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconEyeOff() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
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

function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function typeIcon(type) {
  if (type === 'cash')    return <IconWallet />
  if (type === 'ewallet') return <IconPhone />
  if (type === 'credit')  return <IconCard />
  return <IconBank />
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function Label({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 px-1">
      {children}
    </p>
  )
}

function inputClass(error = false) {
  return [
    'w-full h-[48px] px-4 rounded-2xl text-sm font-medium',
    'text-slate-800 dark:text-white',
    'bg-white dark:bg-white/[0.06]',
    error
      ? 'border border-red-300 dark:border-red-500/40'
      : 'border border-slate-200/80 dark:border-white/[0.09]',
    'placeholder-slate-400 dark:placeholder-slate-500',
    'outline-none focus:ring-2 focus:ring-primary/30',
    'shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-none',
  ].join(' ')
}

// ── Summary bar ────────────────────────────────────────────────────────────────

function cardGradient(accentColor, theme) {
  const isBlue = accentColor === '#2D9DFF'
  const isDark = theme === 'dark'
  if (isBlue  && isDark)  return 'linear-gradient(135deg, #0d47a1 0%, #1565c0 35%, #2196f3 70%, #42a5f5 100%)'
  if (isBlue  && !isDark) return 'linear-gradient(135deg, #1565c0 0%, #1e88e5 45%, #64b5f6 100%)'
  if (!isBlue && isDark)  return 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 28%, black) 0%, color-mix(in srgb, var(--color-primary) 48%, black) 40%, color-mix(in srgb, var(--color-primary) 75%, black) 100%)'
  return 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 52%, black) 0%, color-mix(in srgb, var(--color-primary) 80%, black) 50%, var(--color-primary) 100%)'
}

function SummaryBar({ summary, hidden, onToggleHide, accentColor, theme }) {
  return (
    <div
      className="mx-5 mb-6 rounded-3xl p-5 relative overflow-hidden"
      style={{ background: cardGradient(accentColor, theme) }}
    >
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 20% 10%, rgba(255,255,255,0.5) 0%, transparent 60%)' }}
      />
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '16px 16px' }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-white/60">Overview</span>
          <button onClick={onToggleHide} className="text-white/60 hover:text-white/90 transition-colors active:scale-95">
            {hidden ? <IconEyeOff /> : <IconEye />}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-white/55 text-[10px] font-semibold uppercase tracking-wider mb-1">Assets</p>
            <p className="text-white font-bold text-[17px] tabular-nums leading-tight">
              {hidden ? '₱ ••••' : fmtCompact(summary.assets)}
            </p>
          </div>
          <div>
            <p className="text-white/55 text-[10px] font-semibold uppercase tracking-wider mb-1">Credit Used</p>
            <p className="text-white font-bold text-[17px] tabular-nums leading-tight">
              {hidden ? '₱ ••••' : fmtCompact(summary.creditUsed)}
            </p>
          </div>
          <div>
            <p className="text-white/55 text-[10px] font-semibold uppercase tracking-wider mb-1">Net Worth</p>
            <p className="text-white font-bold text-[17px] tabular-nums leading-tight">
              {hidden ? '₱ ••••' : fmtCompact(summary.net)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Account card ───────────────────────────────────────────────────────────────

function AccountCard({ acct, hidden, onTap, stmt, indent = false }) {
  const isCredit    = acct.type === 'credit'
  const thisTotal   = stmt?.thisTotal ?? 0
  const nextTotal   = stmt?.nextTotal ?? 0
  const available   = isCredit ? (acct.creditLimit ?? 0) - thisTotal - nextTotal : null
  const stmtPct     = isCredit && (acct.creditLimit ?? 0) > 0
    ? Math.min((thisTotal / acct.creditLimit) * 100, 100) : 0
  const barColor    = stmtPct > 80 ? '#ef4444' : stmtPct > 60 ? '#f59e0b' : (acct.color ?? '#2D9DFF')
  const nextDue     = isCredit ? nextOccurrence(acct.dueDate) : null

  return (
    <button
      onClick={onTap}
      className={`w-full flex flex-col text-left
        active:bg-slate-50 dark:active:bg-primary/[0.12] transition-colors
        ${indent ? 'pl-10 pr-4 py-3.5' : 'px-4 py-4'}`}
    >
      <div className="flex items-center gap-4 w-full">
        <span
          className={`${indent ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} flex items-center justify-center shrink-0 text-white`}
          style={{ backgroundColor: acct.color ?? '#2D9DFF' }}
        >
          {typeIcon(acct.type)}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{acct.name}</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            {isCredit ? 'Statement balance' : TYPE_LABEL[acct.type]}
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <p className={`text-sm font-bold tabular-nums ${
            isCredit ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-white'
          }`}>
            {hidden ? '••••' : isCredit ? fmt(thisTotal) : fmt(acct.balance)}
          </p>
          <span className="text-slate-300 dark:text-slate-600"><IconChevronRight /></span>
        </div>
      </div>

      {isCredit && (
        <div className="mt-2.5 w-full">
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${stmtPct}%`, backgroundColor: barColor }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              {hidden ? '₱ ••••' : fmtCompact(available ?? 0)} avail
            </p>
            {nextDue && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Due {nextDue}</p>
            )}
          </div>
        </div>
      )}
    </button>
  )
}

// ── Quick-add sheet helpers ────────────────────────────────────────────────────

const RECENT_PRESETS_KEY = 'recentAccountPresets'

function getRecentPresets() {
  try { return JSON.parse(localStorage.getItem(RECENT_PRESETS_KEY) ?? '[]') } catch { return [] }
}
function pushRecentPreset(name) {
  const next = [name, ...getRecentPresets().filter(n => n !== name)].slice(0, 5)
  try { localStorage.setItem(RECENT_PRESETS_KEY, JSON.stringify(next)) } catch {}
}

const TYPE_LABEL_SHORT = { ewallet: 'E-Wallet', bank: 'Bank', credit: 'Credit Card', cash: 'Cash', savings: 'Savings' }

function QASectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0">
        {children}
      </span>
      <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.06]" />
    </div>
  )
}

function AccountChip({ acct, onPick }) {
  return (
    <button
      onClick={() => onPick(acct)}
      className="flex items-center gap-2 px-3 py-2 rounded-2xl border text-sm font-medium
        bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-200
        active:scale-[0.94] transition-all duration-75"
      style={{ borderColor: `${acct.color}40` }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: acct.color }} />
      {acct.name}
    </button>
  )
}

function PopularCard({ acct, onPick }) {
  return (
    <button
      onClick={() => onPick(acct)}
      className="shrink-0 flex flex-col gap-0.5 px-4 py-3 rounded-2xl border text-left
        bg-white dark:bg-white/[0.05] min-w-[108px]
        active:scale-[0.96] transition-all duration-75"
      style={{ borderColor: `${acct.color}45` }}
    >
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: acct.color }} />
      <span className="text-sm font-semibold text-slate-800 dark:text-white mt-2 leading-tight">{acct.name}</span>
      <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{TYPE_LABEL_SHORT[acct.type]}</span>
    </button>
  )
}

// ── Quick-add sheet ────────────────────────────────────────────────────────────

function QuickAddSheet({ open, onClose, onPickPreset, onCustom }) {
  const [closing,     setClosing]     = useState(false)
  const [query,       setQuery]       = useState('')
  const [recentNames, setRecentNames] = useState([])
  useScrollLock(open)

  useEffect(() => {
    if (open) { setQuery(''); setRecentNames(getRecentPresets()) }
  }, [open])

  const close = useCallback(() => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }, [onClose])

  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close }, [close])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function pick(acct) {
    pushRecentPreset(acct.name)
    close()
    setTimeout(() => onPickPreset(acct), 260)
  }

  const q        = query.toLowerCase().trim()
  const filtered = q ? PH_ACCOUNTS.filter(a => a.name.toLowerCase().includes(q)) : null
  const recents  = recentNames.map(n => PH_ACCOUNTS.find(a => a.name === n)).filter(Boolean)

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div
        className={`${closing ? 'sheet-panel-exit' : 'sheet-panel'} absolute bottom-0 inset-x-0
          rounded-t-[28px] overflow-hidden
          bg-white dark:bg-[#111820]
          border-t border-slate-100 dark:border-white/[0.07]
          flex flex-col`}
        style={{ maxHeight: '88dvh' }}
      >
        {/* Header */}
        <div className="pt-4 px-5 pb-3 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-white">Add Account</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Select a preset or create a custom one</p>
            </div>
            <button
              onClick={close}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/[0.08]
                flex items-center justify-center text-slate-500 dark:text-slate-400
                active:bg-slate-200 dark:active:bg-white/[0.14] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 pb-3 shrink-0">
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-slate-500"
              width="14" height="14" viewBox="0 0 20 20" fill="none">
              <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M14.5 14.5L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search accounts…"
              className="w-full h-10 pl-9 pr-8 rounded-2xl text-sm
                bg-slate-100 dark:bg-white/[0.07]
                text-slate-800 dark:text-slate-200
                placeholder:text-slate-400 dark:placeholder:text-slate-600
                border border-slate-200/60 dark:border-white/[0.08]
                focus:outline-none focus:border-primary/40 transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full
                  bg-slate-300/80 dark:bg-white/[0.15] flex items-center justify-center
                  text-slate-600 dark:text-slate-300 active:opacity-70"
              >
                <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
          {filtered ? (
            /* ── Search results ── */
            <div className="pb-4">
              {filtered.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-slate-400 dark:text-slate-500">No results for "{query}"</p>
                  <button
                    onClick={() => { close(); setTimeout(onCustom, 260) }}
                    className="mt-3 text-xs font-semibold text-primary active:opacity-70"
                  >
                    + Create custom account
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {filtered.map(acct => <AccountChip key={acct.name} acct={acct} onPick={pick} />)}
                </div>
              )}
            </div>
          ) : (
            /* ── Browse ── */
            <div className="pb-4 space-y-5">
              {recents.length > 0 && (
                <div>
                  <QASectionLabel>Recent</QASectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {recents.map(acct => <AccountChip key={acct.name} acct={acct} onPick={pick} />)}
                  </div>
                </div>
              )}

              <div>
                <QASectionLabel>Popular</QASectionLabel>
                <div
                  className="flex gap-2.5 overflow-x-auto pb-1 -mx-5 px-5 no-scrollbar"
                >
                  {POPULAR_ACCOUNTS.map(acct => <PopularCard key={acct.name} acct={acct} onPick={pick} />)}
                </div>
              </div>

              {PH_GROUPS.map(group => (
                <div key={group}>
                  <QASectionLabel>{group}</QASectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {PH_ACCOUNTS.filter(a => a.group === group).map(acct => (
                      <AccountChip key={acct.name} acct={acct} onPick={pick} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Custom account footer */}
        <div
          className="px-5 pt-3 shrink-0 border-t border-slate-100 dark:border-white/[0.06]"
          style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => { close(); setTimeout(onCustom, 260) }}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold
              text-slate-600 dark:text-slate-300
              bg-slate-100 dark:bg-white/[0.06]
              border border-slate-200/60 dark:border-white/[0.08]
              active:bg-slate-200 dark:active:bg-white/[0.10] transition-colors"
          >
            <span className="w-5 h-5 rounded-full bg-slate-300 dark:bg-white/[0.15]
              flex items-center justify-center text-[11px] font-bold text-slate-600 dark:text-white">
              +
            </span>
            Custom Account
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Accounts() {
  const { accentColor, theme } = useTheme()
  const [balanceHidden,   setBalanceHidden]   = useState(false)
  const [editingAccount,  setEditingAccount]  = useState(null)
  const [formOpen,        setFormOpen]        = useState(false)
  const [formPrefill,     setFormPrefill]     = useState(null)
  const [quickAddOpen,    setQuickAddOpen]    = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [detailOpen,      setDetailOpen]      = useState(false)
  const [sortOpen,        setSortOpen]        = useState(false)

  const accounts     = useLiveQuery(() => db.accounts.toArray(),     [], [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [])

  const creditStmtMap = useMemo(() => {
    const map = {}
    ;(accounts ?? []).filter(a => a.type === 'credit').forEach(acct => {
      const { cycleStart, cycleEnd } = getCycleRange(acct.cutoffDate)
      const txs = (transactions ?? []).filter(tx => tx.account === acct.name && tx.type === 'expense')
      map[acct.name] = {
        thisTotal: txs
          .filter(tx => { const d = new Date(tx.date); return d >= cycleStart && d <= cycleEnd })
          .reduce((s, tx) => s + (tx.amount ?? 0), 0),
        nextTotal: txs
          .filter(tx => new Date(tx.date) > cycleEnd)
          .reduce((s, tx) => s + (tx.amount ?? 0), 0),
      }
    })
    return map
  }, [accounts, transactions])

  const parentNames = useMemo(() =>
    new Set((accounts ?? []).filter(a => a.parentName).map(a => a.parentName)),
    [accounts],
  )

  const parentAccts = useMemo(() =>
    (accounts ?? [])
      .filter(a => parentNames.has(a.name))
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [accounts, parentNames],
  )

  const flatAccts = useMemo(() =>
    (accounts ?? [])
      .filter(a => !a.parentName && !parentNames.has(a.name))
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [accounts, parentNames],
  )

  const summary = useMemo(() => {
    // Parents have their own real balance; sum all accounts (no double-counting)
    const allAccts   = accounts ?? []
    const assets     = allAccts.filter(a => a.type !== 'credit').reduce((s, a) => s + (a.balance ?? 0), 0)
    const creditUsed = allAccts.filter(a => a.type === 'credit').reduce((s, a) => {
      const stmt = creditStmtMap[a.name]
      return s + (stmt?.thisTotal ?? 0) + (stmt?.nextTotal ?? 0)
    }, 0)
    return { assets, creditUsed, net: assets - creditUsed }
  }, [accounts, creditStmtMap])

  const groups = useMemo(() =>
    ACCOUNT_GROUPS
      .map(g => ({ ...g, accounts: flatAccts.filter(a => g.types.includes(a.type)) }))
      .filter(g => g.accounts.length > 0),
    [flatAccts],
  )

  // Keep selectedAccount in sync with live DB changes
  useEffect(() => {
    if (!selectedAccount || !accounts) return
    const updated = accounts.find(a => a.id === selectedAccount.id)
    if (updated) setSelectedAccount(updated)
  }, [accounts])

  function openAdd() {
    setQuickAddOpen(true)
  }

  function openFormWithPrefill(prefill) {
    setEditingAccount(null)
    setFormPrefill(prefill)
    setFormOpen(true)
  }

  function openFormCustom() {
    setEditingAccount(null)
    setFormPrefill(null)
    setFormOpen(true)
  }

  function openDetail(acct) {
    setSelectedAccount(acct)
    setDetailOpen(true)
  }

  return (
    <div className="pb-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-safe-header pb-5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Accounts</h1>
        <div className="flex items-center gap-2">
          {(accounts ?? []).length > 1 && (
            <button
              onClick={() => setSortOpen(true)}
              className="w-9 h-9 rounded-2xl flex items-center justify-center transition-colors duration-150
                border shadow-sm
                bg-white dark:bg-primary/[0.10]
                border-slate-200/80 dark:border-primary/[0.20]
                text-slate-500 dark:text-slate-300
                dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.12)]
                active:scale-95"
              aria-label="Sort accounts"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 18V6M8 6L5 9M8 6l3 3" />
                <path d="M16 6v12M16 18l-3-3M16 18l3-3" />
              </svg>
            </button>
          )}
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 pl-3 pr-4 h-9 rounded-2xl text-sm font-semibold
              bg-primary text-white
              active:scale-95 transition-transform duration-100"
          >
            <IconPlus />
            Add Account
          </button>
        </div>
      </div>

      {/* ── Summary ── */}
      <SummaryBar
        summary={summary}
        hidden={balanceHidden}
        onToggleHide={() => setBalanceHidden(h => !h)}
        accentColor={accentColor}
        theme={theme}
      />

      {/* ── Empty state ── */}
      {(accounts ?? []).length === 0 && (
        <div className="flex flex-col items-center py-20 text-center px-8">
          <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-white/[0.05] flex items-center justify-center mb-4 text-slate-300 dark:text-slate-600">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="3" /><line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No accounts yet</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Tap "Add Account" to get started</p>
        </div>
      )}

      {/* ── Parent account groups ── */}
      {parentAccts.map(parent => {
        const children = (accounts ?? []).filter(a => a.parentName === parent.name)
        const groupTotal = (parent.balance ?? 0) + children.reduce((s, a) => s + (a.balance ?? 0), 0)
        return (
          <section key={parent.id} className="mb-3">
            <div className="flex items-center gap-3 px-5 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap">
                {parent.name}
              </span>
              <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.07]" />
              <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                {fmt(groupTotal)}
              </span>
            </div>
            <div className="card mx-5 rounded-2xl overflow-hidden">
              {/* Parent itself as first row (it holds real money) */}
              <AccountCard
                acct={parent}
                hidden={balanceHidden}
                onTap={() => openDetail(parent)}
                stmt={creditStmtMap[parent.name]}
              />
              {children.map((acct) => (
                <div key={acct.id}>
                  <div className="h-px bg-slate-50 dark:bg-primary/[0.08] mx-4" />
                  <AccountCard
                    acct={acct}
                    hidden={balanceHidden}
                    onTap={() => openDetail(acct)}
                    stmt={creditStmtMap[acct.name]}
                    indent
                  />
                </div>
              ))}
            </div>
          </section>
        )
      })}

      {/* ── Account groups ── */}
      {groups.map(group => (
        <section key={group.label} className="mb-3">
          <div className="flex items-center gap-3 px-5 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap">
              {group.label}
            </span>
            <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.07]" />
            <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
              {group.label === 'Credit Cards'
                ? fmt(group.accounts.reduce((s, a) => s + (creditStmtMap[a.name]?.thisTotal ?? 0) + (creditStmtMap[a.name]?.nextTotal ?? 0), 0))
                : fmt(group.accounts.reduce((s, a) => s + (a.balance ?? 0), 0))}
            </span>
          </div>

          <div className="card mx-5 rounded-2xl overflow-hidden">
            {group.accounts.map((acct, i) => (
              <div key={acct.id}>
                <AccountCard
                  acct={acct}
                  hidden={balanceHidden}
                  onTap={() => openDetail(acct)}
                  stmt={creditStmtMap[acct.name]}
                />
                {i < group.accounts.length - 1 && (
                  <div className="h-px bg-slate-50 dark:bg-primary/[0.08] mx-4" />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* ── Sheets ── */}
      <AccountSortSheet
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        accounts={accounts ?? []}
      />
      <QuickAddSheet
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onPickPreset={openFormWithPrefill}
        onCustom={openFormCustom}
      />
      <AccountFormSheet
        open={formOpen}
        onClose={() => { setFormOpen(false); setFormPrefill(null) }}
        account={editingAccount}
        prefill={formPrefill}
      />
      <AccountDetailSheet
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        account={selectedAccount}
        transactions={transactions ?? []}
        allAccounts={accounts ?? []}
        onEdit={(acct) => {
          setEditingAccount(acct)
          setFormPrefill(null)
          setFormOpen(true)
        }}
        onAddSubAccount={(parentAcctName) => {
          setEditingAccount(null)
          setFormPrefill({ parentName: parentAcctName })
          setFormOpen(true)
        }}
      />
    </div>
  )
}

// ── Account Sort Sheet ─────────────────────────────────────────────────────────

function SortableAccountItem({ acct, childCount }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: acct.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center',
        isDragging ? 'relative z-10 rounded-2xl bg-white dark:bg-[#1a2130] shadow-2xl ring-1 ring-primary/30 opacity-95 scale-[1.02]' : '',
      ].join(' ')}
    >
      <button
        {...attributes}
        {...listeners}
        className="pl-3 pr-1 py-4 text-slate-300 dark:text-slate-600 touch-none shrink-0 cursor-grab active:cursor-grabbing"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
        </svg>
      </button>
      <div className="flex-1 flex items-center gap-3 px-3 py-3">
        <span
          className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center"
          style={{ backgroundColor: (acct.color ?? '#2D9DFF') + '28' }}
        >
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: acct.color ?? '#2D9DFF' }} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{acct.name}</p>
          {childCount > 0 && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{childCount} sub-account{childCount !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function AccountSortSheet({ open, onClose, accounts }) {
  const [closing,   setClosing]   = useState(false)
  const [localList, setLocalList] = useState([])
  const isDraggingRef = useRef(false)
  useScrollLock(open)

  const parentNames = useMemo(() =>
    new Set(accounts.filter(a => a.parentName).map(a => a.parentName)),
    [accounts],
  )

  const topLevel = useMemo(() =>
    accounts
      .filter(a => parentNames.has(a.name) || !a.parentName)
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [accounts, parentNames],
  )

  const childCountMap = useMemo(() => {
    const map = {}
    accounts.filter(a => a.parentName).forEach(a => {
      map[a.parentName] = (map[a.parentName] ?? 0) + 1
    })
    return map
  }, [accounts])

  useEffect(() => {
    if (open && !isDraggingRef.current) setLocalList(topLevel)
  }, [open, topLevel])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  function handleDragStart() {
    isDraggingRef.current = true
  }

  async function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) { isDraggingRef.current = false; return }
    const oldIdx = localList.findIndex(a => a.id === active.id)
    const newIdx = localList.findIndex(a => a.id === over.id)
    if (oldIdx === -1 || newIdx === -1) { isDraggingRef.current = false; return }
    const reordered = arrayMove(localList, oldIdx, newIdx)
    setLocalList(reordered)
    const now = new Date().toISOString()
    await Promise.all(reordered.map((acct, i) =>
      db.accounts.update(acct.id, { sort_order: i, updatedAt: now })
    ))
    isDraggingRef.current = false
  }

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[100]" style={{ touchAction: 'none' }}>
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-slate-50 dark:bg-[#0d1117]',
          'border-t border-slate-100 dark:border-white/[0.07]',
          'max-h-[80vh] flex flex-col',
        ].join(' ')}
      >
        {/* Header */}
        <div className="pt-5 px-5 pb-3 border-b border-slate-100 dark:border-white/[0.04] shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">Sort Accounts</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Drag to reorder — affects picker order</p>
            </div>
            <button onClick={close} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
              Done
            </button>
          </div>
        </div>

        {/* List */}
        <div
          className="overflow-y-auto flex-1 px-5 pt-4 pb-8"
          style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
        >
          <div className="rounded-2xl overflow-hidden
            bg-white border border-slate-100
            dark:bg-white/[0.04] dark:border-white/[0.07]
            shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={localList.map(a => a.id)} strategy={verticalListSortingStrategy}>
                {localList.map((acct, i) => (
                  <div key={acct.id}>
                    <SortableAccountItem
                      acct={acct}
                      childCount={childCountMap[acct.name] ?? 0}
                    />
                    {i < localList.length - 1 && (
                      <div className="h-px bg-slate-50 dark:bg-white/[0.04] ml-14 mr-4" />
                    )}
                  </div>
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── QR Crop Sheet ─────────────────────────────────────────────────────────────

function QrCropSheet({ open, onClose, onConfirm }) {
  const [closing,       setClosing]       = useState(false)
  const [imgSrc,        setImgSrc]        = useState(null)
  const [crop,          setCrop]          = useState(null)
  const [completedCrop, setCompletedCrop] = useState(null)
  const imgRef    = useRef(null)
  const fileRef   = useRef(null)
  useScrollLock(open)

  useEffect(() => {
    if (!open) { setImgSrc(null); setCrop(null); setCompletedCrop(null) }
  }, [open])

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  function onFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImgSrc(reader.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function onImageLoad(e) {
    const img = e.currentTarget
    const dw = img.width   // display (CSS) pixels
    const dh = img.height
    const aspect = 5 / 7
    let w, h
    if (dw / dh > aspect) { h = dh; w = h * aspect }
    else { w = dw; h = w / aspect }
    const x = (dw - w) / 2
    const y = (dh - h) / 2
    const initial = { unit: 'px', x, y, width: w, height: h }
    setCrop(initial)
    setCompletedCrop(initial)
  }

  function handleConfirm() {
    if (!completedCrop || !imgRef.current) return
    const img = imgRef.current
    const scaleX = img.naturalWidth  / img.width
    const scaleY = img.naturalHeight / img.height
    const canvas = document.createElement('canvas')
    canvas.width  = 500
    canvas.height = 700
    const ctx = canvas.getContext('2d')
    ctx.drawImage(
      img,
      completedCrop.x * scaleX, completedCrop.y * scaleY,
      completedCrop.width * scaleX, completedCrop.height * scaleY,
      0, 0, 500, 700,
    )
    onConfirm(canvas.toDataURL('image/jpeg', 0.82))
    close()
  }

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[150]" style={{ touchAction: 'none' }}>
      <div className="sheet-overlay absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
          'max-h-[92vh] flex flex-col overflow-hidden',
        ].join(' ')}
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
      >
        {/* Header */}
        <div className="pt-5 px-5 pb-4 border-b border-slate-50 dark:border-white/[0.04] shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">Crop QR Photo</h3>
              {imgSrc && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Drag to reposition · 5:7 ratio</p>}
            </div>
            <button onClick={close} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
              Cancel
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-5 py-6 gap-5"
          style={{ touchAction: imgSrc ? 'none' : 'pan-y', overflowY: imgSrc ? 'hidden' : 'auto' }}>
          {!imgSrc ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center gap-3 py-12 rounded-3xl
                border-2 border-dashed border-slate-200 dark:border-white/10
                text-slate-400 dark:text-slate-500
                active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
              </svg>
              <p className="text-sm font-medium">Choose a photo</p>
              <p className="text-xs">Select a screenshot containing your QR code</p>
            </button>
          ) : (
            <div className="w-full flex items-center justify-center" style={{ touchAction: 'none' }}>
              <ReactCrop
                crop={crop}
                onChange={c => setCrop(c)}
                onComplete={c => setCompletedCrop(c)}
                aspect={5 / 7}
                keepSelection
              >
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt="QR source"
                  onLoad={onImageLoad}
                  style={{
                    display: 'block',
                    maxWidth: '100%',
                    // Cap image to available space: sheet is 92vh, header ~100px, footer ~84px, body padding 48px
                    maxHeight: 'calc(92dvh - 232px)',
                    objectFit: 'contain',
                  }}
                />
              </ReactCrop>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pt-2 shrink-0 flex gap-3">
          {!imgSrc ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex-1 py-3.5 rounded-2xl text-sm font-semibold text-white
                bg-primary
                active:scale-[0.98] transition-all duration-100"
            >
              Choose Photo
            </button>
          ) : (
            <>
              <button
                onClick={() => setImgSrc(null)}
                className="flex-1 py-3.5 rounded-2xl text-sm font-semibold
                  text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06]
                  active:bg-slate-200 dark:active:bg-white/[0.10] transition-colors"
              >
                Change
              </button>
              <button
                onClick={handleConfirm}
                disabled={!completedCrop}
                className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
                  bg-primary
                  disabled:opacity-40 disabled:shadow-none
                  active:scale-[0.98] transition-all duration-100"
              >
                Use Photo
              </button>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      </div>
    </div>
  )
}

// ── QR Viewer Modal ────────────────────────────────────────────────────────────

function QrViewerModal({ open, onClose, qrImage, accountName }) {
  useScrollLock(open)
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/90"
      style={{ touchAction: 'none' }}
      onClick={onClose}
    >
      <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-5">
        {accountName}
      </p>
      <img
        src={qrImage}
        alt="Payment QR"
        className="w-full max-w-sm rounded-3xl shadow-2xl"
        style={{ aspectRatio: '5/7', objectFit: 'cover' }}
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="mt-8 px-8 py-3 rounded-2xl text-sm font-semibold text-white
          bg-white/10 active:bg-white/20 transition-colors"
      >
        Done
      </button>
    </div>
  )
}

// ── Account form sheet ─────────────────────────────────────────────────────────

function AccountFormSheet({ open, onClose, account, prefill = null }) {
  const [closing,    setClosing]    = useState(false)
  useScrollLock(open)
  const { showToast } = useToast()
  const [saving,     setSaving]     = useState(false)
  const [mode,       setMode]       = useState('form') // 'form' | 'confirm-delete' | 'adjust'
  const [deleteBlocked, setDeleteBlocked] = useState(null)
  const [adjustBal,  setAdjustBal]  = useState('0')

  const [name,           setName]           = useState('')
  const [type,           setType]           = useState('cash')
  const [role,           setRole]           = useState('spending')
  const [color,          setColor]          = useState(PALETTE[0])
  const [startingBal,    setStartingBal]    = useState('0')
  const [creditLimit,    setCreditLimit]    = useState('0')
  const [statementDay,   setStatementDay]   = useState('')
  const [dueDay,         setDueDay]         = useState('')
  const [cutoffDay,      setCutoffDay]      = useState('')
  const [minPayment,     setMinPayment]     = useState('0')
  const [nameError,      setNameError]      = useState(false)
  const [qrImage,        setQrImage]        = useState(null)
  const [qrCropOpen,     setQrCropOpen]     = useState(false)
  const [parentName,     setParentName]     = useState(null)
  const allAccounts = useLiveQuery(() => db.accounts.toArray(), [], [])

  const isEdit = !!account?.id

  useEffect(() => {
    if (!open) return
    setMode('form')
    setDeleteBlocked(null)
    setSaving(false)
    setNameError(false)
    if (account?.id) {
      const t = account.type ?? 'cash'
      setName(account.name ?? '')
      setType(t)
      setRole(account.role ?? defaultRole(t))
      setColor(account.color ?? PALETTE[0])
      setStartingBal(numToMoneyStr(account.balance ?? 0))
      setCreditLimit(numToMoneyStr(account.creditLimit ?? 0))
      setStatementDay(account.statementDate != null ? String(account.statementDate) : '')
      setDueDay(account.dueDate != null ? String(account.dueDate) : '')
      setCutoffDay(account.cutoffDate != null ? String(account.cutoffDate) : '')
      setMinPayment(numToMoneyStr(account.minimumPayment ?? 0))
      setQrImage(account.qrImage ?? null)
      setParentName(account.parentName ?? null)
    } else {
      const t = prefill?.type ?? 'cash'
      setName(prefill?.name ?? '')
      setType(t)
      setRole(prefill?.role ?? defaultRole(t))
      setColor(prefill?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)])
      setStartingBal('0')
      setCreditLimit('0')
      setStatementDay('')
      setDueDay('')
      setCutoffDay('')
      setMinPayment('0')
      setQrImage(null)
      setParentName(prefill?.parentName ?? null)
    }
  }, [open, account?.id])

  const close = () => {
    if (saving) return
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  async function handleSave() {
    if (!name.trim()) { setNameError(true); return }
    setSaving(true)
    try {
      const cleanName = name.trim()
      const isCredit  = type === 'credit'
      const data = {
        name:           cleanName,
        type,
        role:           isCredit ? 'credit' : role,
        color,
        currency:       'PHP',
        creditLimit:    isCredit ? (parseMoney(creditLimit)  || 0)    : null,
        statementDate:  isCredit ? (parseInt(statementDay)   || null)  : null,
        dueDate:        isCredit ? (parseInt(dueDay)         || null)  : null,
        cutoffDate:     isCredit ? (parseInt(cutoffDay)      || null)  : null,
        minimumPayment: isCredit ? (parseMoney(minPayment)   || 0)    : null,
        qrImage:        qrImage ?? null,
        updatedAt:      new Date().toISOString(),
        parentName:     parentName ?? null,
      }

      if (isEdit) {
        const oldName = account.name
        await db.transaction('rw', [db.accounts, db.balances, db.transactions], async () => {
          await db.accounts.update(account.id, data)
          if (oldName !== cleanName) {
            // Migrate balance record
            const bal = await db.balances.get(oldName)
            if (bal) {
              await db.balances.delete(oldName)
              await db.balances.put({ account: cleanName, balance: bal.balance })
            }
            // Migrate transaction references
            const byAcct = await db.transactions.where('account').equals(oldName).toArray()
            for (const tx of byAcct) await db.transactions.update(tx.id, { account: cleanName })
            const byFrom = await db.transactions.where('fromAccount').equals(oldName).toArray()
            for (const tx of byFrom) await db.transactions.update(tx.id, { fromAccount: cleanName })
            const byTo = await db.transactions.where('toAccount').equals(oldName).toArray()
            for (const tx of byTo) await db.transactions.update(tx.id, { toAccount: cleanName })
            // Update children's parentName reference
            await db.accounts.where('parentName').equals(oldName).modify({ parentName: cleanName })
          }
        })
      } else {
        const balance = parseMoney(startingBal)
        await db.transaction('rw', [db.accounts, db.balances], async () => {
          await db.accounts.add({ ...data, balance })
          await db.balances.put({ account: cleanName, balance })
        })
        // If this new account has a parent, recompute the parent's balance
      }
      showToast(isEdit ? 'Account updated' : 'Account created')
      close()
    } catch (e) {
      console.error('[AccountForm] save failed:', e)
      showToast('Failed to save account', 'error')
      setSaving(false)
    }
  }

  async function handleDeleteCheck() {
    const byAcct = await db.transactions.where('account').equals(account.name).count()
    const byFrom = await db.transactions.where('fromAccount').equals(account.name).count()
    const byTo   = await db.transactions.where('toAccount').equals(account.name).count()
    const txTotal = byAcct + byFrom + byTo
    // Also block if this account has sub-accounts
    const childCount = await db.accounts.where('parentName').equals(account.name).count()
    setDeleteBlocked(childCount > 0 ? `sub-accounts` : txTotal > 0 ? txTotal : null)
    setMode('confirm-delete')
  }

  async function handleDelete() {
    if (deleteBlocked) return
    setSaving(true)
    try {
      await db.transaction('rw', [db.accounts, db.balances], async () => {
        await db.accounts.delete(account.id)
        await db.balances.delete(account.name)
      })
      close()
    } catch (e) {
      console.error('[AccountForm] delete failed:', e)
      setSaving(false)
    }
  }

  async function handleAdjust() {
    const newBal     = parseMoney(adjustBal)
    const currentBal = account?.balance ?? 0
    const diff       = newBal - currentBal
    if (diff === 0) return
    setSaving(true)
    try {
      const now    = new Date()
      const txDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                              now.getHours(), now.getMinutes(), now.getSeconds())
      const dateISO = txDate.toISOString()
      const updISO  = now.toISOString()
      await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
        await db.transactions.add({
          txId:        crypto.randomUUID(),
          type:        diff > 0 ? 'inflow' : 'expense',
          date:        dateISO,
          description: 'Balance adjustment',
          category:    diff > 0 ? 'Income' : 'Others',
          account:     account.name,
          amount:      Math.abs(diff),
          synced:      false,
          updatedAt:   updISO,
        })
        await db.accounts.update(account.id, { balance: newBal, updatedAt: updISO })
        await db.balances.put({ account: account.name, balance: newBal })
      })
      showToast(`Balance adjusted to ${fmt(newBal)}`)
      close()
    } catch (e) {
      console.error('[AccountForm] adjust failed:', e)
      showToast('Failed to adjust balance', 'error')
      setSaving(false)
    }
  }

  const isParentItself = (allAccounts ?? []).some(a => a.parentName === account?.name)
  const potentialParents = (allAccounts ?? []).filter(a =>
    !a.parentName && a.type !== 'credit' && a.name !== name
  )

  if (!open && !closing) return null

  return (
    <>
    <div className="fixed inset-0 z-[100]">
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
          'max-h-[92vh] overflow-y-auto',
        ].join(' ')}
        style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
      >
        {/* sticky handle + title */}
        <div className="sticky top-0 pt-5 px-5 pb-3 bg-white dark:bg-[#111820] z-10
          border-b border-slate-50 dark:border-white/[0.04]">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          {mode === 'form' ? (
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">
                {isEdit ? 'Edit Account' : 'New Account'}
              </h3>
              {isEdit && (
                <div className="flex items-center gap-2">
                  {type !== 'credit' && (
                    <button
                      onClick={() => { setAdjustBal(numToMoneyStr(account?.balance ?? 0)); setMode('adjust') }}
                      className="text-xs font-semibold text-primary px-3 py-1.5 rounded-xl
                        bg-primary/10 dark:bg-primary/15 active:bg-primary/20 transition-colors"
                    >
                      Adjust Balance
                    </button>
                  )}
                  <button
                    onClick={handleDeleteCheck}
                    className="text-xs font-semibold text-red-500 dark:text-red-400 px-3 py-1.5 rounded-xl
                      bg-red-50 dark:bg-red-500/10 active:bg-red-100 dark:active:bg-red-500/20 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ) : mode === 'adjust' ? (
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">Adjust Balance</h3>
              <button onClick={() => setMode('form')} disabled={saving}
                className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
                Cancel
              </button>
            </div>
          ) : (
            <div className="text-center">
              <span className="text-2xl">🗑️</span>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white mt-2">Delete Account?</h3>
            </div>
          )}
        </div>

        {/* ── Form mode ── */}
        {mode === 'form' && (
          <div className="px-5 pt-5 pb-2 flex flex-col gap-4">

            {/* Name */}
            <div>
              <Label>Account Name</Label>
              <input
                value={name}
                onChange={e => { setName(e.target.value); setNameError(false) }}
                placeholder="e.g. BDO Savings"
                maxLength={40}
                className={inputClass(nameError)}
              />
              {nameError && <p className="text-xs text-red-500 mt-1.5 px-1">Name is required</p>}
            </div>

            {/* Type */}
            <div>
              <Label>Account Type</Label>
              {isEdit ? (
                <p className="h-[48px] flex items-center px-4 rounded-2xl text-sm font-medium text-slate-700 dark:text-slate-300
                  bg-slate-50 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.09]">
                  {TYPE_LABEL[type]}
                  <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 font-normal">(cannot change)</span>
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => { setType(o.value); setRole(defaultRole(o.value)) }}
                      className={[
                        'px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-75 active:scale-95',
                        type === o.value
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400',
                      ].join(' ')}
                    >
                      {o.shortLabel}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Counts As — hidden for credit */}
            {type !== 'credit' && (
              <div>
                <Label>Counts As</Label>
                <div className="flex gap-2">
                  {[
                    { value: 'spending', label: 'Spending', icon: '💸' },
                    { value: 'savings',  label: 'Savings',  icon: '🏦' },
                  ].map(o => (
                    <button
                      key={o.value}
                      onClick={() => setRole(o.value)}
                      className={[
                        'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-75 active:scale-95',
                        role === o.value
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400',
                      ].join(' ')}
                    >
                      <span>{o.icon}</span>
                      <span>{o.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 px-1">
                  How this account is grouped on the home screen
                </p>
              </div>
            )}

            {/* Color */}
            <div>
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2.5">
                {PALETTE.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-transform duration-75 shadow-sm"
                    style={{ backgroundColor: c }}
                  >
                    {color === c && <IconCheck />}
                  </button>
                ))}
              </div>
            </div>

            {/* Group under parent */}
            {type !== 'credit' && !isParentItself && potentialParents.length > 0 && (
              <div>
                <Label>Group Under</Label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setParentName(null)}
                    className={[
                      'px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-75 active:scale-95',
                      parentName === null
                        ? 'bg-primary text-white'
                        : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400',
                    ].join(' ')}
                  >
                    None
                  </button>
                  {potentialParents.map(acct => (
                    <button
                      key={acct.id}
                      onClick={() => setParentName(acct.name)}
                      className={[
                        'px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-75 active:scale-95',
                        parentName === acct.name
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400',
                      ].join(' ')}
                    >
                      {acct.name}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 px-1">
                  Group this account under a parent
                </p>
              </div>
            )}

            {/* Starting balance — add mode only */}
            {!isEdit && (
              <div>
                <Label>Starting Balance</Label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={startingBal === '0' ? '' : startingBal}
                  onChange={moneyChangeHandler(setStartingBal)}
                  placeholder="0.00"
                  className={inputClass(false)}
                />
              </div>
            )}

            {/* Credit-only fields */}
            {type === 'credit' && (
              <div className="flex flex-col gap-4 pt-1">
                <div className="h-px bg-slate-100 dark:bg-white/[0.07]" />

                <div>
                  <Label>Credit Limit</Label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={creditLimit === '0' ? '' : creditLimit}
                    onChange={moneyChangeHandler(setCreditLimit)}
                    placeholder="0.00"
                    className={inputClass(false)}
                  />
                </div>

                <div>
                  <Label>Minimum Payment</Label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={minPayment === '0' ? '' : minPayment}
                    onChange={moneyChangeHandler(setMinPayment)}
                    placeholder="0.00"
                    className={inputClass(false)}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Statement</Label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1" max="31"
                      value={statementDay}
                      onChange={e => setStatementDay(e.target.value)}
                      placeholder="1–31"
                      className={inputClass(false)}
                    />
                  </div>
                  <div>
                    <Label>Due</Label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1" max="31"
                      value={dueDay}
                      onChange={e => setDueDay(e.target.value)}
                      placeholder="1–31"
                      className={inputClass(false)}
                    />
                  </div>
                  <div>
                    <Label>Cutoff</Label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1" max="31"
                      value={cutoffDay}
                      onChange={e => setCutoffDay(e.target.value)}
                      placeholder="1–31"
                      className={inputClass(false)}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1 -mt-2">
                  Statement day = billing closes · Due day = payment deadline · Cutoff = new cycle starts
                </p>
              </div>
            )}

            {/* Payment QR */}
            <div>
              <Label>Payment QR <span className="font-normal text-slate-400 normal-case">(optional)</span></Label>
              {qrImage ? (
                <div className="flex items-center gap-3">
                  <img
                    src={qrImage}
                    alt="Payment QR"
                    className="rounded-2xl object-cover"
                    style={{ width: 80, height: 112, aspectRatio: '5/7' }}
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setQrCropOpen(true)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold
                        text-primary bg-primary/[0.08] dark:bg-primary/[0.12]
                        active:bg-primary/[0.15] transition-colors"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={() => setQrImage(null)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold
                        text-red-500 bg-red-50 dark:bg-red-500/10
                        active:bg-red-100 dark:active:bg-red-500/20 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setQrCropOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl
                    border-2 border-dashed border-slate-200 dark:border-white/10
                    text-slate-400 dark:text-slate-500
                    active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                  </svg>
                  <span className="text-sm font-medium">Add Payment QR</span>
                </button>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={close}
                disabled={saving}
                className="flex-1 py-3.5 rounded-2xl text-sm font-semibold
                  text-slate-600 dark:text-slate-300
                  bg-slate-100 dark:bg-white/[0.06]
                  disabled:opacity-40 active:bg-slate-200 dark:active:bg-white/[0.10] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
                  bg-primary
                  disabled:opacity-40 disabled:shadow-none
                  active:scale-[0.98] transition-all duration-100"
              >
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Account'}
              </button>
            </div>
          </div>
        )}

        {/* ── Adjust balance mode ── */}
        {mode === 'adjust' && (() => {
          const newBal = parseMoney(adjustBal)
          const diff   = newBal - (account?.balance ?? 0)
          return (
            <div className="px-5 pt-5 pb-2 flex flex-col gap-4">
              {/* Current balance pill */}
              <div className="px-4 py-3.5 rounded-2xl
                bg-slate-50 dark:bg-white/[0.04]
                border border-slate-100 dark:border-white/[0.07]">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
                  Current Balance
                </p>
                <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {fmt(account?.balance ?? 0)}
                </p>
              </div>

              {/* New balance input */}
              <div>
                <Label>Correct Balance</Label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={adjustBal === '0' ? '' : adjustBal}
                  onChange={moneyChangeHandler(setAdjustBal)}
                  placeholder="0.00"
                  className={inputClass()}
                  autoFocus
                />
              </div>

              {/* Difference preview */}
              {diff !== 0 && (
                <div className={`px-4 py-3 rounded-2xl text-sm font-medium ${
                  diff > 0
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'
                }`}>
                  {diff > 0
                    ? `+${fmt(diff)} will be recorded as an inflow`
                    : `${fmt(Math.abs(diff))} will be recorded as an expense`}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setMode('form')}
                  disabled={saving}
                  className="flex-1 py-3.5 rounded-2xl text-sm font-semibold
                    text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06]
                    disabled:opacity-40 active:bg-slate-200 dark:active:bg-white/[0.10] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdjust}
                  disabled={saving || diff === 0}
                  className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
                    bg-primary
                    disabled:opacity-40 disabled:shadow-none active:scale-[0.98] transition-all duration-100"
                >
                  {saving ? 'Adjusting…' : 'Apply Adjustment'}
                </button>
              </div>
            </div>
          )
        })()}

        {/* ── Confirm delete mode ── */}
        {mode === 'confirm-delete' && (
          <div className="px-5 pt-5 pb-2">
            {deleteBlocked ? (
              <>
                <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-2">
                  Cannot delete <span className="font-semibold text-slate-800 dark:text-white">{account?.name}</span>
                </p>
                <p className="text-xs text-center text-slate-400 dark:text-slate-500 mb-6 leading-relaxed">
                  {deleteBlocked === 'sub-accounts'
                    ? 'This account has sub-accounts. Delete or re-assign them first.'
                    : `This account has ${deleteBlocked} ${deleteBlocked === 1 ? 'transaction' : 'transactions'}. Remove those transactions first.`}
                </p>
                <button
                  onClick={() => setMode('form')}
                  className="w-full py-3.5 rounded-2xl text-sm font-semibold
                    text-slate-600 dark:text-slate-300
                    bg-slate-100 dark:bg-white/[0.06]
                    active:bg-slate-200 transition-colors"
                >
                  Go Back
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-1">
                  Permanently delete <span className="font-semibold text-slate-800 dark:text-white">{account?.name}</span>?
                </p>
                <p className="text-xs text-center text-slate-400 dark:text-slate-500 mb-6">
                  This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setMode('form')}
                    disabled={saving}
                    className="flex-1 py-3.5 rounded-2xl text-sm font-semibold
                      text-slate-600 dark:text-slate-300
                      bg-slate-100 dark:bg-white/[0.06]
                      disabled:opacity-40 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
                      bg-red-500 shadow-[0_4px_16px_rgba(239,68,68,0.35)]
                      disabled:opacity-40 disabled:shadow-none
                      active:scale-[0.98] transition-all duration-100"
                  >
                    {saving ? 'Deleting…' : 'Delete Account'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <div className="h-8" />
      </div>
    </div>

    <QrCropSheet
      open={qrCropOpen}
      onClose={() => setQrCropOpen(false)}
      onConfirm={base64 => setQrImage(base64)}
    />
    </>
  )
}

// ── Account detail sheet ───────────────────────────────────────────────────────

function AccountDetailSheet({ open, onClose, account, transactions, allAccounts = [], onEdit, onAddSubAccount }) {
  const [closing,   setClosing]   = useState(false)
  const [qrVisible, setQrVisible] = useState(false)
  useScrollLock(open)

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  const acctTxs = useMemo(() => {
    if (!account) return []
    return transactions
      .filter(tx =>
        tx.account === account.name ||
        tx.fromAccount === account.name ||
        tx.toAccount === account.name
      )
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }, [transactions, account?.name])

  // Running balance — newest first; start at current balance, reverse each tx to get prior balance
  const txsWithRunning = useMemo(() => {
    if (!account) return []
    const acctIsCredit = account.type === 'credit'
    let bal = account.balance ?? 0
    return acctTxs.map(tx => {
      const balAfter = bal
      if (tx.type === 'expense' && tx.account === account.name)       bal += tx.amount ?? 0
      else if (tx.type === 'inflow' && tx.account === account.name)   bal -= tx.amount ?? 0
      else if (tx.type === 'transfer') {
        if (tx.fromAccount === account.name) bal += tx.amount ?? 0
        // Credit toAccount: payment reduces balance; backward pass adds it back
        if (tx.toAccount   === account.name) bal += acctIsCredit ? (tx.amount ?? 0) : -(tx.amount ?? 0)
      }
      return { ...tx, balAfter }
    })
  }, [acctTxs, account])

  const creditData = useMemo(() => {
    if (!account || account.type !== 'credit') return null
    const { cycleStart, cycleEnd } = getCycleRange(account.cutoffDate)
    const { cycleStart: nextStart, cycleEnd: nextEnd } = getNextCycleRange(account.cutoffDate)

    const thisCharges = txsWithRunning.filter(tx => {
      if (tx.type !== 'expense' || tx.account !== account.name) return false
      const d = new Date(tx.date)
      return d >= cycleStart && d <= cycleEnd
    })
    const nextCharges = txsWithRunning.filter(tx => {
      if (tx.type !== 'expense' || tx.account !== account.name) return false
      return new Date(tx.date) > cycleEnd
    })
    const payments = txsWithRunning.filter(tx =>
      (tx.type === 'inflow'   && tx.account    === account.name) ||
      (tx.type === 'transfer' && tx.toAccount  === account.name)
    )

    const thisTotal = thisCharges.reduce((s, tx) => s + (tx.amount ?? 0), 0)
    const nextTotal = nextCharges.reduce((s, tx) => s + (tx.amount ?? 0), 0)

    const dueDate    = nextOccurrenceDate(account.dueDate)
    const dueSoon    = dueDate && ((dueDate - new Date()) / 864e5) <= 7

    return {
      thisCharges, nextCharges, payments,
      thisTotal, nextTotal,
      cycleStart, cycleEnd, nextStart, nextEnd,
      availableCredit: (account.creditLimit ?? 0) - thisTotal - nextTotal,
      minimumDue:      account.minimumPayment ?? 0,
      nextDue:         nextOccurrence(account.dueDate),
      dueSoon,
    }
  }, [account, txsWithRunning])

  if (!open && !closing) return null
  if (!account) return null

  const childAccounts = allAccounts.filter(a => a.parentName === account.name)
  const isParent      = childAccounts.length > 0
  const isChild       = !!account.parentName

  const isCredit    = account.type === 'credit'
  const ownBal      = account.balance ?? 0
  const totalUsed   = isCredit ? (creditData?.thisTotal ?? 0) + (creditData?.nextTotal ?? 0) : ownBal
  const usedPct     = isCredit && (account.creditLimit ?? 0) > 0
    ? Math.min((totalUsed / account.creditLimit) * 100, 100) : 0

  return (
    <>
    <div className="fixed inset-0 z-[100]">
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
          'max-h-[92vh] overflow-y-auto',
        ].join(' ')}
        style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
      >
        {/* sticky header */}
        <div className="sticky top-0 pt-5 px-5 pb-4 bg-white dark:bg-[#111820] z-10
          border-b border-slate-50 dark:border-white/[0.04]">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />

          <div className="flex items-center gap-3 mb-4">
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: account.color ?? '#2D9DFF' }}
            >
              {typeIcon(account.type)}
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-slate-800 dark:text-white truncate">{account.name}</h3>
              {isChild ? (
                <p className="text-xs text-primary/80 dark:text-primary/70 font-medium">Part of {account.parentName}</p>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500">{TYPE_LABEL[account.type]}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {account.qrImage && (
                <button
                  onClick={() => setQrVisible(true)}
                  className="w-9 h-9 flex items-center justify-center
                    text-emerald-500 dark:text-emerald-400
                    active:opacity-60 transition-opacity"
                  aria-label="Show Payment QR"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none" />
                    <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none" />
                    <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none" />
                    <path d="M14 14h3v3" />
                    <path d="M14 20h7" />
                    <path d="M21 14v7" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => { close(); setTimeout(() => onEdit(account), 260) }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold
                  text-primary bg-primary/[0.08] dark:bg-primary/[0.15]
                  active:bg-primary/[0.15] transition-colors"
              >
                Edit
              </button>
            </div>
          </div>

          {/* balance card */}
          <div className={`px-4 py-3.5 rounded-2xl ${
            isCredit
              ? 'bg-red-50 dark:bg-red-500/[0.08] border border-red-100 dark:border-red-500/20'
              : 'bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]'
          }`}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              {isCredit ? 'Balance Used' : 'Current Balance'}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${
              isCredit ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-white'
            }`}>
              {fmt(totalUsed)}
            </p>

            {isCredit && (account.creditLimit ?? 0) > 0 && (
              <>
                <div className="mt-2.5 h-1.5 rounded-full bg-red-100 dark:bg-red-500/20 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${usedPct}%`,
                      backgroundColor: usedPct > 80 ? '#ef4444' : '#f59e0b',
                    }}
                  />
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
                  {fmt((account.creditLimit ?? 0) - totalUsed)} available
                  {' '}of {fmt(account.creditLimit)} limit ({usedPct.toFixed(0)}% used)
                </p>
              </>
            )}
          </div>
        </div>

        <div className="px-5 pt-5">
          {isCredit && creditData ? (
            <>
              {/* ── Statement summary ── */}
              <div className="mb-5">
                {creditData.dueSoon && creditData.nextDue && (
                  <div className="mb-3 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/[0.08] border border-amber-100 dark:border-amber-500/20 flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                      Payment due {creditData.nextDue} — pay at least {fmt(creditData.minimumDue)}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 px-4 py-3 rounded-2xl bg-red-50 dark:bg-red-500/[0.08] border border-red-100 dark:border-red-500/20 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400 dark:text-red-500 mb-0.5">Statement Balance</p>
                      <p className="text-xl font-bold text-red-500 dark:text-red-400 tabular-nums">{fmt(creditData.thisTotal)}</p>
                      {creditData.nextDue && (
                        <p className="text-[10px] text-red-400 dark:text-red-500 mt-0.5">Due {creditData.nextDue}</p>
                      )}
                    </div>
                    {creditData.nextTotal > 0 && (
                      <div className="text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">Next Statement</p>
                        <p className="text-sm font-bold text-slate-600 dark:text-slate-300 tabular-nums">{fmt(creditData.nextTotal)}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                          Closes {fmtCycleDate(creditData.nextEnd)}
                        </p>
                      </div>
                    )}
                  </div>
                  <StatCard label="Available Credit" value={fmt(creditData.availableCredit)} />
                  <StatCard label="Minimum Due" value={fmt(creditData.minimumDue)} />
                </div>
              </div>

              {/* ── This Statement charges ── */}
              <CreditTxSection
                title="This Statement"
                dateRange={`${fmtCycleDate(creditData.cycleStart)} – ${fmtCycleDate(creditData.cycleEnd)}`}
                txs={creditData.thisCharges}
                total={creditData.thisTotal}
                accountName={account.name}
                emptyLabel="No charges this statement"
                totalColor="text-red-500 dark:text-red-400"
              />

              {/* ── Next Statement charges ── */}
              {creditData.nextCharges.length > 0 && (
                <CreditTxSection
                  title="Next Statement"
                  dateRange={`${fmtCycleDate(creditData.nextStart)} – ${fmtCycleDate(creditData.nextEnd)}`}
                  txs={creditData.nextCharges}
                  total={creditData.nextTotal}
                  accountName={account.name}
                  totalColor="text-slate-600 dark:text-slate-300"
                />
              )}

              {/* ── Payments ── */}
              {creditData.payments.length > 0 && (
                <CreditTxSection
                  title="Payments"
                  txs={creditData.payments}
                  total={creditData.payments.reduce((s, tx) => s + (tx.amount ?? 0), 0)}
                  accountName={account.name}
                  totalColor="text-emerald-600 dark:text-emerald-400"
                  totalSign="−"
                />
              )}
            </>
          ) : isParent ? (
            <>
              {/* ── Parent: sub-accounts list ── */}
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2.5">
                Sub-accounts · {childAccounts.length}
              </p>
              <div
                className="rounded-2xl overflow-hidden mb-3
                  bg-white border border-slate-100
                  dark:bg-white/[0.04] dark:border-white/[0.07]
                  shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none"
              >
                {childAccounts.map((child, i) => (
                  <div key={child.id}>
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: child.color ?? '#2D9DFF' }}
                      >
                        {typeIcon(child.type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">{child.name}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">{TYPE_LABEL[child.type]}</p>
                      </div>
                      <p className="text-[13px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                        {fmt(child.balance ?? 0)}
                      </p>
                    </div>
                    {i < childAccounts.length - 1 && (
                      <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => { close(); setTimeout(() => onAddSubAccount?.(account.name), 250) }}
                className="w-full py-3 rounded-2xl text-sm font-semibold text-primary
                  bg-primary/[0.08] dark:bg-primary/[0.12]
                  active:bg-primary/[0.15] transition-colors mb-4"
              >
                + Add Sub-account
              </button>

              {/* ── Direct transactions on the parent account ── */}
              {acctTxs.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2.5">
                    Direct Transactions · {acctTxs.length}
                  </p>
                  <div
                    className="rounded-2xl overflow-hidden mb-4
                      bg-white border border-slate-100
                      dark:bg-white/[0.04] dark:border-white/[0.07]
                      shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none"
                  >
                    {txsWithRunning.map((tx, i) => (
                      <div key={tx.id}>
                        <DetailTxRow tx={tx} accountName={account.name} />
                        {i < txsWithRunning.length - 1 && (
                          <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {/* ── Regular transaction list ── */}
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2.5">
                Transactions · {acctTxs.length}
              </p>

              {acctTxs.length === 0 ? (
                <div className="py-12 text-center rounded-2xl bg-slate-50 dark:bg-white/[0.03]">
                  <p className="text-sm text-slate-400 dark:text-slate-500">No transactions yet</p>
                  <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">
                    Transactions using this account will appear here
                  </p>
                </div>
              ) : (
                <div
                  className="rounded-2xl overflow-hidden mb-4
                    bg-white border border-slate-100
                    dark:bg-white/[0.04] dark:border-white/[0.07]
                    shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none"
                >
                  {txsWithRunning.map((tx, i) => (
                    <div key={tx.id}>
                      <DetailTxRow tx={tx} accountName={account.name} />
                      {i < txsWithRunning.length - 1 && (
                        <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="h-8" />
      </div>
    </div>

    <QrViewerModal
      open={qrVisible}
      onClose={() => setQrVisible(false)}
      qrImage={account?.qrImage}
      accountName={account?.name}
    />
    </>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value }) {
  return (
    <div className="px-4 py-3 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
        {label}
      </p>
      <p className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">{value}</p>
    </div>
  )
}

// ── Credit statement transaction section ────────────────────────────────────────

function CreditTxSection({ title, dateRange, txs, total, accountName, emptyLabel, totalColor, totalSign = '' }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            {title}
          </p>
          {dateRange && (
            <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">{dateRange}</p>
          )}
        </div>
        <p className={`text-sm font-bold tabular-nums ${totalColor}`}>
          {totalSign}{fmt(total)}
        </p>
      </div>

      {txs.length === 0 && emptyLabel ? (
        <div className="py-6 text-center rounded-2xl bg-slate-50 dark:bg-white/[0.03]">
          <p className="text-xs text-slate-400 dark:text-slate-500">{emptyLabel}</p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden
            bg-white border border-slate-100
            dark:bg-white/[0.04] dark:border-white/[0.07]
            shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none"
        >
          {txs.map((tx, i) => (
            <div key={tx.id ?? i}>
              <DetailTxRow tx={tx} accountName={accountName} />
              {i < txs.length - 1 && (
                <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Detail transaction row ─────────────────────────────────────────────────────

function DetailTxRow({ tx, accountName }) {
  let sign  = ''
  let color = 'text-slate-600 dark:text-slate-300'

  if (tx.type === 'expense' && tx.account === accountName) {
    sign = '−'; color = 'text-red-500 dark:text-red-400'
  } else if (tx.type === 'inflow' && tx.account === accountName) {
    sign = '+'; color = 'text-emerald-600 dark:text-emerald-400'
  } else if (tx.type === 'transfer') {
    if (tx.fromAccount === accountName) { sign = '−'; color = 'text-red-500 dark:text-red-400' }
    if (tx.toAccount   === accountName) { sign = '+'; color = 'text-emerald-600 dark:text-emerald-400' }
  }

  const isTransferFee = tx.type === 'expense' && tx.category === 'Transfer Fee'

  const label = tx.description || (tx.type === 'transfer'
    ? (tx.fromAccount === accountName ? `→ ${tx.toAccount}` : `← ${tx.fromAccount}`)
    : (tx.category ?? '—'))

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate leading-snug">{label}</p>
          {isTransferFee && (
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">
              Fee
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
          {fmtTxDate(tx.date)} · {fmtTxTime(tx.date)}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-[13px] font-bold tabular-nums ${color}`}>
          {sign}{fmt(tx.amount)}
        </p>
      </div>
    </div>
  )
}
