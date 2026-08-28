import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useSyncManager } from '../components/SyncManager'
import db, { UNSYNCED } from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import AccountPickerSheet from '../components/AccountPickerSheet'
import CategoryPickerSheet from '../components/CategoryPickerSheet'
import { EXPENSE_PRESETS, INFLOW_PRESETS } from '../lib/phCategories'
import { useScrollLock } from '../hooks/useScrollLock'
import { syncToSheets } from '../lib/sheetsSync'
import { IconCheck, IconChevronRight, IconPlus } from '../components/icons'

// ── Constants ──────────────────────────────────────────────────────────────────

const APP_VERSION = '0.1.0'

const CURRENCIES = [
  { code: 'PHP', symbol: '₱', label: 'Philippine Peso' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
]

const EMOJI_OPTIONS = [
  '🍔', '🛍️', '🚗', '🎮', '💆', '🧾', '📦', '💰',
  '🏠', '💊', '🎓', '✈️', '🐾', '💻', '🎁', '🔧',
  '📱', '🏋️', '🎵', '🍷', '☕', '🎬', '⚽', '🎯',
  '💅', '🧴', '🛒', '🏥', '🌮', '🍕', '🍜', '⛽',
  '🚇', '💳', '🎀', '🧸', '🪴', '🧹', '💈', '🎪',
]

const CAT_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#2D9DFF', '#8b5cf6', '#ec4899', '#14b8a6',
]

const DEFAULT_CAT_NAMES = new Set(['Others', 'Income', 'Transfer', 'Transfer Fee'])

const ACCENT_COLORS = [
  { hex: '#2D9DFF', name: 'Azure'  },
  { hex: '#845EF7', name: 'Cosmos' },
  { hex: '#F06595', name: 'Blush'  },
  { hex: '#51CF66', name: 'Sage'   },
  { hex: '#20C997', name: 'Lagoon' },
  { hex: '#FFB347', name: 'Amber'  },
  { hex: '#FF6B6B', name: 'Ember'  },
  { hex: '#FCC419', name: 'Honey'  },
]

// ── Formatters ─────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

function monthPrefix() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

function fmtRelTime(isoStr) {
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

function buildAndDownloadCSV(transactions) {
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

function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function IconGlobe() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  )
}

function IconSun() {
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

function IconMoon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  )
}

function IconPalette() {
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

function IconWallet() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
      <path d="M16 3H8l-4 4h16l-4-4z" />
      <circle cx="17" cy="13" r="1" fill="currentColor" />
    </svg>
  )
}

function IconTag() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}


function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  )
}

function IconSheets() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="9" x2="9" y2="21" />
    </svg>
  )
}

function IconCloud() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
    </svg>
  )
}

function IconRefresh() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  )
}

function IconInfo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}


function IconFileText() {
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

function IconTarget() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

function IconPencil() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

// ── UI primitives ──────────────────────────────────────────────────────────────

function SectionHeader({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-5 mb-2">
      {children}
    </p>
  )
}

function RowDivider() {
  return <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
}

function SectionCard({ children }) {
  return (
    <div className="card mx-5 rounded-2xl overflow-hidden">
      {children}
    </div>
  )
}

function RowIcon({ color, children }) {
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

function SettingsRow({ iconEl, label, sublabel, right, onTap, destructive = false, disabled = false }) {
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

function FieldLabel({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 px-1">
      {children}
    </p>
  )
}

// ── Profile sheet ──────────────────────────────────────────────────────────────

function SheetsConfigSheet({ open, onClose, onSync, syncing }) {
  const [closing,  setClosing]  = useState(false)
  const [url,      setUrl]      = useState('')
  const [saving,   setSaving]   = useState(false)
  const [lastSync, setLastSync] = useState(null)
  useScrollLock(open)

  useEffect(() => {
    if (!open) return
    db.meta.get('sheetsUrl').then(r => setUrl(r?.value ?? ''))
    db.meta.get('sheetsLastSynced').then(r => setLastSync(r?.value ?? null))
  }, [open])

  const close = useCallback(() => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }, [onClose])

  async function handleSave() {
    setSaving(true)
    await db.meta.put({ key: 'sheetsUrl', value: url.trim() })
    setSaving(false)
  }

  async function handleSync() {
    await handleSave()
    await onSync(url.trim())
    db.meta.get('sheetsLastSynced').then(r => setLastSync(r?.value ?? null))
  }

  const fmtLast = lastSync
    ? new Date(lastSync).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[100]" style={{ touchAction: 'none' }}>
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
        ].join(' ')}
        style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}
      >
        <div className="pt-5 px-5 pb-4 border-b border-slate-50 dark:border-white/[0.04]">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-white">Google Sheets Sync</h3>
          <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">
            Paste your Apps Script Web App URL to enable syncing.
          </p>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 block">
              Apps Script URL
            </label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec"
              className="w-full h-[48px] rounded-xl px-4 text-[13px]
                bg-slate-50 dark:bg-white/[0.05]
                border border-slate-200 dark:border-white/[0.10]
                text-slate-800 dark:text-white
                placeholder:text-slate-400 dark:placeholder:text-slate-600
                focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={handleSave}
              disabled={saving || !url.trim()}
              className="mt-2 text-[12px] font-medium text-primary disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save URL'}
            </button>
          </div>

          {fmtLast && (
            <p className="text-[12px] text-slate-400 dark:text-slate-500">
              Last synced: {fmtLast}
            </p>
          )}

          <button
            onClick={handleSync}
            disabled={syncing || !url.trim()}
            className="w-full py-4 rounded-2xl bg-primary text-white font-semibold text-[15px]
              shadow-[0_4px_16px_rgba(var(--color-primary-rgb),0.35)]
              active:scale-[0.98] transition-all duration-100
              disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {syncing
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Syncing…</>
              : 'Sync Now'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProfileSheet({ open, onClose, displayName: initName, currency: initCurrency }) {
  const { showToast } = useToast()
  const [closing,  setClosing]  = useState(false)
  useScrollLock(open)
  const [saving,   setSaving]   = useState(false)
  const [name,     setName]     = useState('')
  const [currency, setCurrency] = useState('PHP')

  useEffect(() => {
    if (!open) return
    setSaving(false)
    setName(initName || '')
    setCurrency(initCurrency || 'PHP')
  }, [open, initName, initCurrency])

  const close = () => {
    if (saving) return
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await db.meta.put({ key: 'displayName', value: name.trim() })
      await db.meta.put({ key: 'currency',    value: currency })
      close()
    } catch (e) {
      console.error('[ProfileSheet] save failed:', e)
      showToast('Failed to save profile', 'error')
      setSaving(false)
    }
  }

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[100]" style={{ touchAction: 'none' }}>
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
        ].join(' ')}
        style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}
      >
        <div className="pt-5 px-5 pb-3 border-b border-slate-50 dark:border-white/[0.04]">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800 dark:text-white">Edit Profile</h3>
            <button onClick={close} disabled={saving} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
              Cancel
            </button>
          </div>
        </div>

        <div className="px-5 pt-5 flex flex-col gap-5">
          <div>
            <FieldLabel>Display Name</FieldLabel>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              maxLength={40}
              className={inputClass()}
            />
          </div>


          <div className="flex gap-3 pt-1">
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
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Reset confirm modal ────────────────────────────────────────────────────────

function ResetConfirmModal({ open, onClose }) {
  const { showToast } = useToast()
  const [step,    setStep]    = useState(1) // 1=warn 2=typing-confirm
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const { signOut } = useAuth()

  useEffect(() => {
    if (!open) { setStep(1); setInput(''); setLoading(false) }
  }, [open])

  async function handleReset() {
    setLoading(true)
    try {
      await db.transaction('rw', [
        db.transactions, db.balances, db.accounts,
        db.categories, db.debts, db.recurring, db.templates, db.meta,
      ], async () => {
        await db.transactions.clear()
        await db.balances.clear()
        await db.accounts.clear()
        await db.categories.clear()
        await db.debts.clear()
        await db.recurring.clear()
        await db.templates.clear()
        await db.meta.clear()
      })
      // Sign out so the Onboarding auto-sign-in effect doesn't fire on reload
      await signOut()
      window.location.replace('/')
    } catch (e) {
      console.error('[Settings] reset failed:', e)
      showToast('Reset failed', 'error')
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4" style={{ touchAction: 'none' }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-3xl
        bg-white dark:bg-[#111820]
        border border-slate-100 dark:border-white/[0.07]
        shadow-[0_20px_60px_rgba(0,0,0,0.3)]
        p-6 space-y-4">

        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-500/15
          flex items-center justify-center mx-auto text-red-500 dark:text-red-400">
          <IconTrash />
        </div>

        {step === 1 && (
          <>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Reset App?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                This will permanently delete all transactions, accounts, categories, debts, and recurring payments. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold
                  text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.07]
                  active:bg-slate-200 dark:active:bg-white/[0.12] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white
                  bg-red-500 shadow-[0_4px_16px_rgba(239,68,68,0.35)]
                  active:scale-[0.98] transition-all duration-100"
              >
                Continue
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Are you sure?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Type <span className="font-bold text-red-500">RESET</span> to confirm.
              </p>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="RESET"
                className={inputClass()}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold
                  text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.07]
                  disabled:opacity-40 active:bg-slate-200 dark:active:bg-white/[0.12] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={loading || input !== 'RESET'}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white
                  bg-red-500 shadow-[0_4px_16px_rgba(239,68,68,0.35)]
                  disabled:opacity-40 disabled:shadow-none
                  active:scale-[0.98] transition-all duration-100"
              >
                {loading ? 'Resetting…' : 'Reset App'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Budget summary card (inside category manager) ──────────────────────────────

function BudgetSummaryCard({ categories, transactions }) {
  const { totalBudgeted, totalSpent, pct } = useMemo(() => {
    const pfx          = monthPrefix()
    const budgetedCats = (categories ?? []).filter(c => c.type === 'expense' && (c.budget ?? 0) > 0)
    const totalBudgeted = budgetedCats.reduce((s, c) => s + (c.budget ?? 0), 0)
    const monthTxs      = (transactions ?? []).filter(t => t.type === 'expense' && (t.date ?? '').startsWith(pfx))
    const totalSpent    = monthTxs.reduce((s, t) => s + (t.amount ?? 0), 0)
    const pct           = totalBudgeted > 0 ? Math.min((totalSpent / totalBudgeted) * 100, 100) : 0
    return { totalBudgeted, totalSpent, pct }
  }, [categories, transactions])

  if (totalBudgeted === 0) return null

  const over     = totalSpent > totalBudgeted
  const warn     = pct >= 75 && !over
  const barColor = over ? '#ef4444' : warn ? '#f59e0b' : '#22c55e'

  return (
    <div className="mx-5 mb-4 px-4 py-4 rounded-2xl
      bg-white border border-slate-100
      dark:bg-white/[0.04] dark:border-white/[0.07]
      shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Budget — This Month
        </p>
        {over && (
          <span className="text-[10px] font-semibold text-red-500 bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded-full">
            Over budget
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 mb-2.5">
        <span className={`text-xl font-bold tabular-nums ${over ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-white'}`}>
          {fmt(totalSpent)}
        </span>
        <span className="text-sm text-slate-400 dark:text-slate-500">of {fmt(totalBudgeted)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 tabular-nums">
        {fmt(Math.max(0, totalBudgeted - totalSpent))} remaining · {pct.toFixed(0)}% used
      </p>
    </div>
  )
}

// ── Budget manager sheet ───────────────────────────────────────────────────────

function BudgetManagerSheet({ open, onClose }) {
  const { showToast } = useToast()
  const [closing,      setClosing]      = useState(false)
  const [editingId,    setEditingId]    = useState(null)
  const [localBudgets, setLocalBudgets] = useState({})
  const [saving,       setSaving]       = useState(false)
  const inputRef = useRef(null)
  useScrollLock(open)

  const categories   = useLiveQuery(() => db.categories.toArray(), [], [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [])

  const expenseCats = useMemo(() =>
    (categories ?? [])
      .filter(c => c.type === 'expense')
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name)),
    [categories],
  )

  const monthlySpend = useMemo(() => {
    const pfx = monthPrefix()
    const map = {}
    for (const tx of (transactions ?? [])) {
      if (tx.type === 'expense' && (tx.date ?? '').startsWith(pfx)) {
        map[tx.category] = (map[tx.category] ?? 0) + (tx.amount ?? 0)
      }
    }
    return map
  }, [transactions])

  const hasPendingChanges = useMemo(() =>
    Object.entries(localBudgets).some(([id, str]) => {
      const cat = (categories ?? []).find(c => String(c.id) === String(id))
      return cat && parseMoney(str) !== (cat.budget ?? 0)
    }),
    [localBudgets, categories],
  )

  const close = () => {
    setClosing(true)
    setEditingId(null)
    setLocalBudgets({})
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  function startEdit(cat) {
    setEditingId(cat.id)
    setLocalBudgets(prev => ({
      ...prev,
      [cat.id]: prev[cat.id] ?? numToMoneyStr(cat.budget ?? 0),
    }))
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleLocalChange(catId, str) {
    setLocalBudgets(prev => ({ ...prev, [catId]: str }))
  }

  function removeLimit(catId) {
    setLocalBudgets(prev => ({ ...prev, [catId]: '0' }))
    setEditingId(null)
  }

  async function saveAll() {
    setSaving(true)
    try {
      await Promise.all(
        Object.entries(localBudgets).map(([id, str]) => {
          const cat = (categories ?? []).find(c => String(c.id) === String(id))
          if (!cat) return Promise.resolve()
          const newBudget = parseMoney(str) || 0
          if (newBudget === (cat.budget ?? 0)) return Promise.resolve()
          return db.categories.update(Number(id), { budget: newBudget })
        })
      )
      setLocalBudgets({})
      setEditingId(null)
      close()
    } catch (e) {
      console.error('[BudgetManager] save failed:', e)
      showToast('Failed to save budgets', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[100]" style={{ touchAction: 'none' }}>
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px] flex flex-col',
          'bg-slate-50 dark:bg-[#0d1117]',
          'border-t border-slate-100 dark:border-white/[0.04]',
        ].join(' ')}
        style={{ maxHeight: '88vh', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
      >
        {/* Header */}
        <div className="sticky top-0 pt-5 px-5 pb-3 bg-slate-50 dark:bg-[#0d1117] z-10 border-b border-slate-100 dark:border-white/[0.04] shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800 dark:text-white">Monthly Budgets</h3>
            <button onClick={close} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
              {hasPendingChanges ? 'Discard' : 'Done'}
            </button>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Tap a category to set its monthly limit
          </p>
        </div>

        {/* Scrollable list */}
        <div className="overflow-y-auto flex-1 pt-4" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
          <BudgetSummaryCard categories={categories} transactions={transactions} />

          <div className="mx-4 flex flex-col gap-2 mb-6">
            {expenseCats.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-400 dark:text-slate-500">No expense categories yet</p>
              </div>
            ) : expenseCats.map((cat) => {
              const localStr  = localBudgets[cat.id]
              const budget    = localStr !== undefined ? parseMoney(localStr) || 0 : (cat.budget ?? 0)
              const spent     = monthlySpend[cat.name] ?? 0
              const pct       = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0
              const over      = budget > 0 && spent > budget
              const warn      = pct >= 75 && !over
              const accentHex = over ? '#ef4444' : warn ? '#f59e0b' : null
              const isEditing = editingId === cat.id
              const isDirty   = localStr !== undefined && (parseMoney(localStr) || 0) !== (cat.budget ?? 0)

              return (
                <div
                  key={cat.id}
                  className={[
                    'rounded-2xl overflow-hidden transition-all duration-200',
                    isEditing
                      ? 'bg-white dark:bg-[#131c28] border-2 border-primary/40 dark:border-primary/30 shadow-[0_0_0_4px_rgba(var(--color-primary-rgb),0.08)]'
                      : isDirty
                        ? 'bg-white dark:bg-white/[0.04] border border-primary/30 dark:border-primary/20 shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-none active:scale-[0.99]'
                        : 'bg-white dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07] shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-none active:scale-[0.99]',
                  ].join(' ')}
                >
                  {isEditing ? (
                    /* ── Inline edit state ── */
                    <div className="px-4 pt-4 pb-3">
                      <div className="flex items-center gap-2.5 mb-4">
                        <span className="text-xl leading-none">{cat.icon}</span>
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{cat.name}</span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-auto">monthly limit</span>
                      </div>
                      <div className="flex items-baseline gap-1.5 mb-3 px-1">
                        <span className="text-xl font-semibold text-slate-400 dark:text-slate-500 leading-none mb-0.5">₱</span>
                        <input
                          ref={inputRef}
                          type="text"
                          inputMode="decimal"
                          value={(localBudgets[cat.id] ?? '0') === '0' ? '' : (localBudgets[cat.id] ?? '')}
                          onChange={e => {
                            const handler = moneyChangeHandler(str => handleLocalChange(cat.id, str))
                            handler(e)
                          }}
                          placeholder="0"
                          className="flex-1 bg-transparent text-3xl font-bold tabular-nums text-slate-900 dark:text-white outline-none min-w-0 tracking-tight"
                        />
                      </div>
                      {(cat.budget ?? 0) > 0 && (
                        <button
                          onClick={() => removeLimit(cat.id)}
                          className="text-[11px] font-semibold text-red-400 active:opacity-50">
                          Remove limit
                        </button>
                      )}
                    </div>
                  ) : (
                    /* ── Display state ── */
                    <button onClick={() => startEdit(cat)} className="w-full text-left px-4 py-3.5">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[22px] leading-none shrink-0 w-9 text-center">{cat.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{cat.name}</p>
                          {budget > 0 && (
                            <p className="text-[10px] tabular-nums mt-0.5" style={{ color: accentHex ?? 'rgb(148 163 184)' }}>
                              {fmt(spent)} spent
                            </p>
                          )}
                        </div>
                        <div className={[
                          'shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold tabular-nums',
                          over ? 'bg-red-50 dark:bg-red-500/15 text-red-500 dark:text-red-400'
                            : warn ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : budget > 0 ? 'bg-primary/[0.08] dark:bg-primary/[0.14] text-primary'
                            : 'bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-slate-500',
                        ].join(' ')}>
                          {budget > 0 ? fmt(budget) : '+ Limit'}
                        </div>
                      </div>
                      {budget > 0 && (
                        <div className="ml-12 h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${pct}%`,
                              background: accentHex
                                ? `linear-gradient(90deg, ${accentHex}88, ${accentHex})`
                                : 'linear-gradient(90deg, rgba(var(--color-primary-rgb),0.5), rgba(var(--color-primary-rgb),1))',
                            }}
                          />
                        </div>
                      )}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Bottom save bar */}
        <div className="shrink-0 px-5 pt-3 pb-1 border-t border-slate-100 dark:border-white/[0.04]">
          <button
            onClick={saveAll}
            disabled={!hasPendingChanges || saving}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white
              bg-primary shadow-[0_4px_16px_rgba(var(--color-primary-rgb),0.3)]
              disabled:opacity-30 disabled:shadow-none
              active:scale-[0.98] transition-all duration-100 flex items-center justify-center gap-2">
            {saving
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
              : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Category row ───────────────────────────────────────────────────────────────

function CategoryRow({ cat, onTap, onLongPressDelete }) {
  const timerRef     = useRef(null)
  const longFiredRef = useRef(false)
  const [pressed, setPressed] = useState(false)

  const startPress = useCallback(() => {
    longFiredRef.current = false
    setPressed(true)
    timerRef.current = setTimeout(() => {
      longFiredRef.current = true
      setPressed(false)
      onLongPressDelete(cat)
    }, 550)
  }, [cat, onLongPressDelete])

  const endPress = useCallback(() => {
    clearTimeout(timerRef.current)
    setPressed(false)
    if (!longFiredRef.current) onTap(cat)
    longFiredRef.current = false
  }, [cat, onTap])

  const cancelPress = useCallback(() => {
    clearTimeout(timerRef.current)
    setPressed(false)
    longFiredRef.current = false
  }, [])

  return (
    <div
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      className={[
        'flex items-center gap-3 px-4 py-3.5 select-none cursor-pointer transition-colors duration-75',
        pressed ? 'bg-slate-50 dark:bg-white/[0.06]' : 'active:bg-slate-50 dark:active:bg-white/[0.04]',
      ].join(' ')}
    >
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-[20px]"
        style={{ backgroundColor: (cat.color ?? '#2D9DFF') + '22' }}
      >
        {cat.icon ?? '🏷️'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{cat.name}</p>
        {(cat.budget ?? 0) > 0 && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
            {fmt(cat.budget)} / mo
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color ?? '#2D9DFF' }} />
        <span className="text-slate-300 dark:text-slate-600"><IconChevronRight size={14} strokeWidth="2" /></span>
      </div>
    </div>
  )
}

// ── Category presets sheet ─────────────────────────────────────────────────────

function CategoryPresetsSheet({ open, onClose, activeTab, existingCategories }) {
  const { showToast } = useToast()
  const [closing, setClosing] = useState(false)
  useScrollLock(open)
  const [adding,  setAdding]  = useState(null)

  const presets      = activeTab === 'expense' ? EXPENSE_PRESETS : INFLOW_PRESETS
  const existingNames = new Set(
    (existingCategories ?? []).filter(c => c.type === activeTab).map(c => c.name)
  )

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  async function addPreset(preset) {
    if (existingNames.has(preset.name)) return
    setAdding(preset.name)
    try {
      await db.categories.add({ ...preset, budget: 0 })
    } catch (e) {
      console.error('[CategoryPresets] add failed:', e)
      showToast('Failed to add categories', 'error')
    } finally {
      setAdding(null)
    }
  }

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[120]" style={{ touchAction: 'none' }}>
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
          'max-h-[75vh] flex flex-col',
        ].join(' ')}
        style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}
      >
        <div className="pt-5 px-5 pb-4 border-b border-slate-50 dark:border-white/[0.04] shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">Add from Presets</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                {activeTab === 'expense' ? 'Expense' : 'Inflow'} suggestions — tap to add
              </p>
            </div>
            <button onClick={close} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
              Done
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pt-4" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
          <div className="flex flex-wrap gap-2">
            {presets.map(preset => {
              const exists    = existingNames.has(preset.name)
              const isAdding  = adding === preset.name
              return (
                <button
                  key={preset.name}
                  onClick={() => !exists && !isAdding && addPreset(preset)}
                  disabled={exists || !!adding}
                  className={[
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium',
                    'transition-all duration-100',
                    exists
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 cursor-default'
                      : 'bg-white dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 active:scale-95',
                  ].join(' ')}
                >
                  <span>{preset.icon}</span>
                  {preset.name}
                  {exists && <span className="text-[10px] ml-0.5">✓</span>}
                  {isAdding && (
                    <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin ml-0.5" />
                  )}
                </button>
              )
            })}
          </div>
          <div className="h-8 shrink-0" />
        </div>
      </div>
    </div>
  )
}

// ── Sortable category row (for drag-to-reorder) ────────────────────────────────

function SortableCategoryRow({ cat, onTap, onLongPressDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })
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
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="pl-3 pr-0 py-4 text-slate-300 dark:text-slate-600 touch-none shrink-0 cursor-grab active:cursor-grabbing"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
        </svg>
      </button>
      {/* Row content fills remaining space */}
      <div className="flex-1 min-w-0">
        <CategoryRow cat={cat} onTap={onTap} onLongPressDelete={onLongPressDelete} />
      </div>
    </div>
  )
}

// ── Category manager sheet ─────────────────────────────────────────────────────

function CategoryManagerSheet({ open, onClose }) {
  const [closing,        setClosing]        = useState(false)
  useScrollLock(open)
  const [activeTab,      setActiveTab]      = useState('expense')
  const [formOpen,       setFormOpen]       = useState(false)
  const [editingCat,     setEditingCat]     = useState(null)
  const [formStartDelete, setFormStartDelete] = useState(false)
  const [browseOpen,     setBrowseOpen]     = useState(false)
  const isDraggingRef = useRef(false)
  // Local ordered list used during and after drag (separate per tab)
  const [localExpense,   setLocalExpense]   = useState([])
  const [localInflow,    setLocalInflow]    = useState([])

  const categories   = useLiveQuery(() => db.categories.toArray(),   [], [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [])

  const expenseCats = useMemo(() =>
    (categories ?? []).filter(c => c.type === 'expense')
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name)),
    [categories])
  const inflowCats = useMemo(() =>
    (categories ?? []).filter(c => c.type === 'inflow')
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name)),
    [categories])

  // Sync local lists from DB only when not dragging
  useEffect(() => { if (!isDraggingRef.current) setLocalExpense(expenseCats) }, [expenseCats])
  useEffect(() => { if (!isDraggingRef.current) setLocalInflow(inflowCats)   }, [inflowCats])

  const visibleCats    = activeTab === 'expense' ? localExpense   : localInflow
  const setVisibleCats = activeTab === 'expense' ? setLocalExpense : setLocalInflow

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  function handleDragStart() {
    isDraggingRef.current = true
  }

  async function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) {
      isDraggingRef.current = false
      return
    }
    const oldIdx = visibleCats.findIndex(c => c.id === active.id)
    const newIdx = visibleCats.findIndex(c => c.id === over.id)
    if (oldIdx === -1 || newIdx === -1) { isDraggingRef.current = false; return }
    const reordered = arrayMove(visibleCats, oldIdx, newIdx)
    setVisibleCats(reordered)
    const now = new Date().toISOString()
    await Promise.all(reordered.map((cat, i) =>
      db.categories.update(cat.id, { sort_order: i, updatedAt: now })
    ))
    isDraggingRef.current = false
  }

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  function openAdd() { setEditingCat(null); setFormStartDelete(false); setTimeout(() => setFormOpen(true), 0) }
  function openEdit(cat) { setEditingCat(cat); setFormStartDelete(false); setTimeout(() => setFormOpen(true), 0) }
  function openDelete(cat) { setEditingCat(cat); setFormStartDelete(true); setTimeout(() => setFormOpen(true), 0) }

  if (!open && !closing) return null

  return (
    <>
      <div className="fixed inset-0 z-[100]" style={{ touchAction: 'none' }}>
        <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
        <div
          className={[
            closing ? 'sheet-panel-exit' : 'sheet-panel',
            'absolute bottom-0 inset-x-0 rounded-t-[28px] overflow-hidden',
            'bg-slate-50 dark:bg-[#0d1117]',
            'border-t border-slate-100 dark:border-white/[0.07]',
            'max-h-[92vh] flex flex-col',
          ].join(' ')}
        >
          {/* Header */}
          <div className="sticky top-0 pt-5 px-5 pb-3 bg-slate-50 dark:bg-[#0d1117] z-10 border-b border-slate-100 dark:border-white/[0.04] shrink-0">
            <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">Manage Categories</h3>
              <button onClick={close} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
                Done
              </button>
            </div>
            {/* Tab bar */}
            <div className="flex items-center gap-2">
              {['expense', 'inflow'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={[
                    'flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-100',
                    activeTab === tab
                      ? 'bg-primary text-white shadow-[0_2px_12px_rgba(var(--color-primary-rgb),0.4)]'
                      : 'bg-white dark:bg-white/[0.06] text-slate-500 dark:text-slate-400',
                  ].join(' ')}
                >
                  {tab === 'expense' ? '↑ Expense' : '↓ Inflow'}
                  <span className={`ml-1.5 text-[11px] font-medium ${activeTab === tab ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>
                    {tab === 'expense' ? expenseCats.length : inflowCats.length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1 pt-4" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
            {activeTab === 'expense' && (
              <BudgetSummaryCard categories={categories} transactions={transactions} />
            )}

            <div className="mx-5 rounded-2xl overflow-hidden
              bg-white border border-slate-100
              dark:bg-white/[0.04] dark:border-white/[0.07]
              shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none mb-3">
              {visibleCats.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-slate-400 dark:text-slate-500">No {activeTab} categories</p>
                  <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">Tap "Add" below to create one</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={visibleCats.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    {visibleCats.map((cat, i) => (
                      <div key={cat.id}>
                        <SortableCategoryRow
                          cat={cat}
                          onTap={openEdit}
                          onLongPressDelete={openDelete}
                        />
                        {i < visibleCats.length - 1 && <div className="h-px bg-slate-50 dark:bg-white/[0.04] ml-14 mr-4" />}
                      </div>
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>

            <div className="px-5 flex flex-col gap-2 pb-6">
              <button
                onClick={openAdd}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold
                  text-primary bg-primary/[0.07] dark:bg-primary/[0.12]
                  border border-primary/20 dark:border-primary/30
                  active:scale-[0.98] transition-transform duration-100"
              >
                <IconPlus size={15} strokeWidth="2.5" />
                Add {activeTab === 'expense' ? 'Expense' : 'Inflow'} Category
              </button>
              <button
                onClick={() => setBrowseOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold
                  text-slate-500 dark:text-slate-400
                  bg-slate-100 dark:bg-white/[0.05]
                  border border-slate-200 dark:border-white/[0.07]
                  active:scale-[0.98] transition-transform duration-100"
              >
                Browse presets
              </button>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mt-1">
                Hold a category to quickly delete it
              </p>
            </div>
          </div>
        </div>
      </div>

      <CategoryFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        category={editingCat}
        defaultType={activeTab}
        allCategories={categories ?? []}
        startAtDelete={formStartDelete}
        zIndex={110}
      />
      <CategoryPresetsSheet
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        activeTab={activeTab}
        existingCategories={categories ?? []}
      />
    </>
  )
}

// ── Category form sheet ────────────────────────────────────────────────────────

function CategoryFormSheet({ open, onClose, category, defaultType, allCategories, startAtDelete, zIndex = 100 }) {
  const { showToast } = useToast()
  const [closing,        setClosing]        = useState(false)
  useScrollLock(open)
  const [saving,         setSaving]         = useState(false)
  const [mode,           setMode]           = useState('form')
  const [txCount,        setTxCount]        = useState(0)
  const [reassignTarget, setReassignTarget] = useState(null)

  const [name,      setName]      = useState('')
  const [type,      setType]      = useState('expense')
  const [icon,      setIcon]      = useState('📦')
  const [color,     setColor]     = useState(CAT_COLORS[0])
  const [budget,    setBudget]    = useState('0')
  const [nameError, setNameError] = useState(false)

  const isEdit    = !!category?.id
  const isDefault = isEdit && DEFAULT_CAT_NAMES.has(category?.name)

  const reassignOptions = useMemo(() =>
    allCategories.filter(c => c.type === (category?.type ?? type) && c.id !== category?.id),
    [allCategories, category, type])

  useEffect(() => {
    if (!open) return
    setSaving(false)
    setNameError(false)
    setReassignTarget(null)

    if (category?.id) {
      setName(category.name)
      setType(category.type ?? 'expense')
      setIcon(category.icon ?? '📦')
      setColor(category.color ?? CAT_COLORS[0])
      setBudget(numToMoneyStr(category.budget ?? 0))
      if (startAtDelete) runDeleteCheck()
      else setMode('form')
    } else {
      setName('')
      setType(defaultType ?? 'expense')
      setIcon('📦')
      setColor(CAT_COLORS[Math.floor(Math.random() * CAT_COLORS.length)])
      setBudget('0')
      setMode('form')
    }
  }, [open, category?.id, startAtDelete])

  async function runDeleteCheck() {
    const count = await db.transactions.where('category').equals(category.name).count()
    setTxCount(count)
    setMode(count > 0 ? 'reassign' : 'confirm-delete')
  }

  const close = () => {
    if (saving) return
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  async function handleSave() {
    if (!name.trim()) { setNameError(true); return }
    setSaving(true)
    try {
      const data = { name: name.trim(), type, icon, color, budget: parseMoney(budget) || 0 }
      if (isEdit) {
        const oldName = category.name
        const newName = data.name
        const renamedAt = new Date().toISOString()
        await db.transaction('rw', [db.categories, db.transactions], async () => {
          await db.categories.update(category.id, data)
          if (oldName !== newName) {
            await db.transactions.where('category').equals(oldName).modify({ category: newName, synced: UNSYNCED, updatedAt: renamedAt })
          }
        })
      } else {
        await db.categories.add(data)
      }
      close()
    } catch (e) {
      console.error('[CategoryForm] save failed:', e)
      showToast('Failed to save category', 'error')
      setSaving(false)
    }
  }

  async function handleDeleteDirect() {
    setSaving(true)
    try {
      await db.categories.delete(category.id)
      close()
    } catch (e) {
      console.error('[CategoryForm] delete failed:', e)
      showToast('Failed to delete category', 'error')
      setSaving(false)
    }
  }

  async function handleReassignAndDelete() {
    if (!reassignTarget) return
    setSaving(true)
    try {
      await db.transaction('rw', [db.categories, db.transactions], async () => {
        await db.transactions.where('category').equals(category.name).modify({ category: reassignTarget.name })
        await db.categories.delete(category.id)
      })
      close()
    } catch (e) {
      console.error('[CategoryForm] reassign+delete failed:', e)
      showToast('Failed to delete category', 'error')
      setSaving(false)
    }
  }

  if (!open && !closing) return null

  const sheetTitle = {
    form:             isEdit ? 'Edit Category' : 'New Category',
    'confirm-delete': 'Delete Category',
    reassign:         'Reassign Transactions',
  }[mode]

  return (
    <div className="fixed inset-0" style={{ zIndex, touchAction: 'none' }}>
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
        {/* Header */}
        <div className="sticky top-0 pt-5 px-5 pb-3 bg-white dark:bg-[#111820] z-10 border-b border-slate-50 dark:border-white/[0.04]">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800 dark:text-white">{sheetTitle}</h3>
            {mode === 'form' && isEdit && (
              <button onClick={runDeleteCheck}
                className="text-xs font-semibold text-red-500 dark:text-red-400 px-3 py-1.5 rounded-xl
                  bg-red-50 dark:bg-red-500/10 active:bg-red-100 dark:active:bg-red-500/20 transition-colors">
                Delete
              </button>
            )}
            {mode !== 'form' && (
              <button onClick={() => setMode('form')} disabled={saving}
                className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Form mode */}
        {mode === 'form' && (
          <div className="px-5 pt-5 pb-2 flex flex-col gap-5">
            <div>
              <FieldLabel>Category Name</FieldLabel>
              <input value={name} onChange={e => { setName(e.target.value); setNameError(false) }}
                placeholder="e.g. Groceries" maxLength={30} className={inputClass(nameError)} />
              {nameError && <p className="text-xs text-red-500 mt-1.5 px-1">Name is required</p>}
            </div>

            <div>
              <FieldLabel>Type</FieldLabel>
              {isEdit ? (
                <p className="h-[48px] flex items-center px-4 rounded-2xl text-sm font-medium text-slate-700 dark:text-slate-300
                  bg-slate-50 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.09]">
                  {type === 'expense' ? '↑ Expense' : '↓ Inflow'}
                  <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 font-normal">(cannot change)</span>
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {[{ value: 'expense', label: '↑ Expense' }, { value: 'inflow', label: '↓ Inflow' }].map(o => (
                    <button key={o.value} onClick={() => setType(o.value)}
                      className={[
                        'py-3 rounded-2xl text-sm font-semibold transition-all duration-75 active:scale-[0.97]',
                        type === o.value
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-white/[0.07] text-slate-500 dark:text-slate-400',
                      ].join(' ')}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <FieldLabel>Icon</FieldLabel>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]">
                <div className="grid grid-cols-8 gap-1.5">
                  {EMOJI_OPTIONS.map(e => (
                    <button key={e} onClick={() => setIcon(e)}
                      className={[
                        'h-10 rounded-xl flex items-center justify-center text-[20px]',
                        'active:scale-90 transition-all duration-75',
                        icon === e
                          ? 'bg-primary/[0.12] ring-2 ring-primary/40'
                          : 'hover:bg-white dark:hover:bg-white/[0.06]',
                      ].join(' ')}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <FieldLabel>Color</FieldLabel>
              <div className="flex gap-3">
                {CAT_COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className="flex-1 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-transform duration-75 shadow-sm"
                    style={{ backgroundColor: c }}>
                    {color === c && <IconCheck size={13} strokeWidth="3" stroke="white" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl
              bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-[20px] shrink-0"
                style={{ backgroundColor: color + '22' }}>
                {icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">{name || 'Category Name'}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {type === 'expense' ? 'Expense' : 'Inflow'}
                  {parseMoney(budget) > 0 && ` · ${fmt(parseMoney(budget))} / mo`}
                </p>
              </div>
            </div>

            <div>
              <FieldLabel>Monthly Budget (optional)</FieldLabel>
              <input type="text" inputMode="decimal" value={budget === '0' ? '' : budget}
                onChange={moneyChangeHandler(setBudget)} placeholder="0 = no budget" className={inputClass()} />
              {parseMoney(budget) > 0 && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 px-1">
                  Spending alerts when you approach {fmt(parseMoney(budget))} this month
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={close} disabled={saving}
                className="flex-1 py-3.5 rounded-2xl text-sm font-semibold
                  text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06]
                  disabled:opacity-40 active:bg-slate-200 dark:active:bg-white/[0.10] transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
                  bg-primary
                  disabled:opacity-40 disabled:shadow-none active:scale-[0.98] transition-all duration-100">
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Category'}
              </button>
            </div>
          </div>
        )}

        {/* Confirm delete */}
        {mode === 'confirm-delete' && (
          <div className="px-5 pt-6 pb-2">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-[24px]"
                style={{ backgroundColor: (category?.color ?? '#2D9DFF') + '22' }}>
                {category?.icon ?? '📦'}
              </div>
              <p className="text-base font-semibold text-slate-800 dark:text-white">{category?.name}</p>
            </div>
            {isDefault && (
              <div className="mb-5 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Default category</p>
                <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-0.5">
                  This is a built-in Spendr category. Deleting it is permanent.
                </p>
              </div>
            )}
            <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-1">Permanently delete this category?</p>
            <p className="text-xs text-center text-slate-400 dark:text-slate-500 mb-7">No transactions are using it. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setMode('form')} disabled={saving}
                className="flex-1 py-3.5 rounded-2xl text-sm font-semibold
                  text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06] disabled:opacity-40">
                Keep It
              </button>
              <button onClick={handleDeleteDirect} disabled={saving}
                className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
                  bg-red-500 shadow-[0_4px_16px_rgba(239,68,68,0.35)]
                  disabled:opacity-40 disabled:shadow-none active:scale-[0.98] transition-all duration-100">
                {saving ? 'Deleting…' : 'Delete Category'}
              </button>
            </div>
          </div>
        )}

        {/* Reassign mode */}
        {mode === 'reassign' && (
          <div className="px-5 pt-5 pb-2">
            <div className="flex items-start gap-3 px-4 py-3.5 mb-5 rounded-2xl
              bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
              <span className="text-xl shrink-0 mt-0.5">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  {txCount} {txCount === 1 ? 'transaction uses' : 'transactions use'} this category
                </p>
                <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-0.5">
                  Choose a replacement before deleting.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-5 px-1">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 flex-1 min-w-0">
                <span className="text-base shrink-0">{category?.icon ?? '📦'}</span>
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 truncate">{category?.name}</p>
              </div>
              <span className="text-slate-400 dark:text-slate-500 shrink-0 text-sm">→</span>
              <div className={[
                'flex items-center gap-2 px-3 py-2 rounded-xl border flex-1 min-w-0',
                reassignTarget
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20'
                  : 'bg-slate-50 dark:bg-white/[0.04] border-slate-100 dark:border-white/[0.07]',
              ].join(' ')}>
                {reassignTarget ? (
                  <>
                    <span className="text-base shrink-0">{reassignTarget.icon}</span>
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 truncate">{reassignTarget.name}</p>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500">Pick below</p>
                )}
              </div>
            </div>

            <FieldLabel>Reassign to</FieldLabel>
            {reassignOptions.length === 0 ? (
              <div className="py-6 text-center rounded-2xl bg-slate-50 dark:bg-white/[0.04] mb-5">
                <p className="text-sm text-slate-400 dark:text-slate-500">No other categories available</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mb-5">
                {reassignOptions.map(cat => (
                  <button key={cat.id} onClick={() => setReassignTarget(cat)}
                    className={[
                      'flex items-center gap-3 px-4 py-3 rounded-2xl text-left',
                      'active:scale-[0.98] transition-all duration-75',
                      reassignTarget?.id === cat.id
                        ? 'ring-2 ring-primary/40 bg-primary/[0.06] dark:bg-primary/[0.12]'
                        : 'bg-slate-50 dark:bg-white/[0.04] active:bg-slate-100 dark:active:bg-white/[0.08]',
                    ].join(' ')}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[18px] shrink-0"
                      style={{ backgroundColor: (cat.color ?? '#2D9DFF') + '22' }}>
                      {cat.icon ?? '📦'}
                    </div>
                    <p className="flex-1 text-sm font-semibold text-slate-800 dark:text-white truncate">{cat.name}</p>
                    {reassignTarget?.id === cat.id && (
                      <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <IconCheck size={13} strokeWidth="3" stroke="white" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setMode('form')} disabled={saving}
                className="flex-1 py-3.5 rounded-2xl text-sm font-semibold
                  text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06] disabled:opacity-40">
                Cancel
              </button>
              <button onClick={handleReassignAndDelete} disabled={saving || !reassignTarget || reassignOptions.length === 0}
                className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
                  bg-red-500 shadow-[0_4px_16px_rgba(239,68,68,0.35)]
                  disabled:opacity-40 disabled:shadow-none active:scale-[0.98] transition-all duration-100">
                {saving ? 'Moving…' : 'Reassign & Delete'}
              </button>
            </div>
          </div>
        )}
        <div className="h-8" />
      </div>
    </div>
  )
}

// ── Template row ───────────────────────────────────────────────────────────────

const TMPL_TYPE_STYLE = {
  expense:  { bg: 'bg-red-50 dark:bg-red-500/10',      text: 'text-red-500 dark:text-red-400',      label: 'Expense'  },
  inflow:   { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', label: 'Inflow' },
  transfer: { bg: 'bg-blue-50 dark:bg-blue-500/10',    text: 'text-blue-600 dark:text-blue-400',    label: 'Transfer' },
}

const _tFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const tfmt = (v) => '₱' + _tFmt.format(v ?? 0)

function TemplateRow({ tpl, catIcon, onTap, onLongPressDelete }) {
  const timerRef = useRef(null)
  const firedRef = useRef(false)
  const [pressed, setPressed] = useState(false)
  const ts = TMPL_TYPE_STYLE[tpl.type] ?? TMPL_TYPE_STYLE.expense

  const start = useCallback(() => {
    firedRef.current = false; setPressed(true)
    timerRef.current = setTimeout(() => { firedRef.current = true; setPressed(false); onLongPressDelete(tpl) }, 550)
  }, [tpl, onLongPressDelete])
  const end = useCallback(() => {
    clearTimeout(timerRef.current); setPressed(false)
    if (!firedRef.current) onTap(tpl); firedRef.current = false
  }, [tpl, onTap])
  const cancel = useCallback(() => { clearTimeout(timerRef.current); setPressed(false); firedRef.current = false }, [])

  return (
    <div
      onPointerDown={start} onPointerUp={end} onPointerLeave={cancel} onPointerCancel={cancel}
      className={`flex items-center gap-3 px-4 py-3.5 select-none cursor-pointer transition-colors duration-75
        ${pressed ? 'bg-slate-50 dark:bg-white/[0.06]' : ''}`}
    >
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-[18px] shrink-0 ${ts.bg}`}>
        {tpl.type === 'transfer' ? '🔄' : (catIcon ?? '⚡')}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{tpl.name}</p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
          {tpl.type === 'transfer' ? `${tpl.fromAccount} → ${tpl.toAccount}` : (tpl.account ?? '')}
        </p>
      </div>
      <p className={`text-sm font-bold tabular-nums shrink-0 ${ts.text}`}>{tfmt(tpl.amount)}</p>
      <span className="text-slate-300 dark:text-slate-600 shrink-0"><IconChevronRight size={14} strokeWidth="2" /></span>
    </div>
  )
}

// ── Template form sheet ────────────────────────────────────────────────────────

function TemplateFormSheet({ open, onClose, template, allAccounts, allCategories }) {
  const { showToast } = useToast()
  const [closing,   setClosing]   = useState(false)
  useScrollLock(open)
  const [saving,    setSaving]    = useState(false)
  const [name,      setName]      = useState('')
  const [type,      setType]      = useState('expense')
  const [amountStr, setAmountStr] = useState('0')
  const [desc,      setDesc]      = useState('')
  const [category,  setCategory]  = useState(null)
  const [account,   setAccount]   = useState(null)
  const [fromAcct,  setFromAcct]  = useState(null)
  const [toAcct,    setToAcct]    = useState(null)
  const [nameError, setNameError] = useState(false)
  const [showCat,   setShowCat]   = useState(false)
  const [showAcct,  setShowAcct]  = useState(false)
  const [showFrom,  setShowFrom]  = useState(false)
  const [showTo,    setShowTo]    = useState(false)

  const isEdit = !!template?.id
  const expenseCats = (allCategories ?? []).filter(c => c.type === 'expense')
  const inflowCats  = (allCategories ?? []).filter(c => c.type === 'inflow')
  const visibleCats = type === 'inflow' ? inflowCats : expenseCats

  useEffect(() => {
    if (!open) return
    setSaving(false); setNameError(false)
    if (template?.id) {
      setName(template.name ?? '')
      setType(template.type ?? 'expense')
      setAmountStr(numToMoneyStr(template.amount ?? 0))
      setDesc(template.description ?? '')
      setCategory((allCategories ?? []).find(c => c.name === template.category) ?? null)
      setAccount((allAccounts ?? []).find(a => a.name === template.account) ?? null)
      setFromAcct((allAccounts ?? []).find(a => a.name === template.fromAccount) ?? null)
      setToAcct((allAccounts ?? []).find(a => a.name === template.toAccount) ?? null)
    } else {
      setName(''); setType('expense'); setAmountStr('0'); setDesc('')
      setCategory(null); setAccount(null); setFromAcct(null); setToAcct(null)
    }
  }, [open, template?.id])

  const close = () => {
    if (saving) return
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  async function handleSave() {
    if (!name.trim()) { setNameError(true); return }
    setSaving(true)
    try {
      const data = {
        name: name.trim(), type,
        amount: parseMoney(amountStr) || 0,
        description: desc.trim(),
        category: category?.name ?? null,
        account: account?.name ?? null,
        fromAccount: fromAcct?.name ?? null,
        toAccount: toAcct?.name ?? null,
      }
      if (isEdit) {
        await db.templates.update(template.id, data)
      } else {
        await db.templates.add({ ...data, createdAt: new Date().toISOString() })
      }
      close()
    } catch (e) {
      console.error('[TemplateForm] save failed:', e)
      showToast('Failed to save template', 'error')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!isEdit) return
    setSaving(true)
    try { await db.templates.delete(template.id); close() }
    catch (e) {
      console.error('[TemplateForm] delete failed:', e)
      showToast('Failed to delete template', 'error')
      setSaving(false)
    }
  }

  if (!open && !closing) return null

  return (
    <>
      <div className="fixed inset-0 z-[120]" style={{ touchAction: 'none' }}>
        <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
        <div
          className={`${closing ? 'sheet-panel-exit' : 'sheet-panel'} absolute bottom-0 inset-x-0 rounded-t-[28px]
            bg-white dark:bg-[#111820] border-t border-slate-100 dark:border-white/[0.07]
            max-h-[92vh] overflow-y-auto`}
          style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
        >
          {/* Header */}
          <div className="sticky top-0 pt-5 px-5 pb-3 bg-white dark:bg-[#111820] z-10 border-b border-slate-50 dark:border-white/[0.04]">
            <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">
                {isEdit ? 'Edit Template' : 'New Template'}
              </h3>
              <div className="flex items-center gap-3">
                {isEdit && (
                  <button onClick={handleDelete} disabled={saving}
                    className="text-xs font-semibold text-red-500 dark:text-red-400 px-3 py-1.5 rounded-xl
                      bg-red-50 dark:bg-red-500/10 active:bg-red-100 transition-colors">
                    Delete
                  </button>
                )}
                <button onClick={close} disabled={saving}
                  className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
                  Cancel
                </button>
              </div>
            </div>
          </div>

          <div className="px-5 pt-5 pb-2 flex flex-col gap-4">
            {/* Name */}
            <div>
              <FieldLabel>Template Name</FieldLabel>
              <input value={name} onChange={e => { setName(e.target.value); setNameError(false) }}
                placeholder="e.g. Jeep fare" maxLength={40}
                className={inputClass(nameError)} />
              {nameError && <p className="text-xs text-red-500 mt-1.5 px-1">Name is required</p>}
            </div>

            {/* Type */}
            <div>
              <FieldLabel>Type</FieldLabel>
              {isEdit ? (
                <p className="h-[48px] flex items-center px-4 rounded-2xl text-sm font-medium
                  text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-white/[0.04]
                  border border-slate-200/80 dark:border-white/[0.09]">
                  {TMPL_TYPE_STYLE[type]?.label ?? type}
                  <span className="ml-2 text-xs text-slate-400">(cannot change)</span>
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {['expense', 'inflow', 'transfer'].map(t => (
                    <button key={t} onClick={() => { setType(t); setCategory(null); setAccount(null); setFromAcct(null); setToAcct(null) }}
                      className={`py-2.5 rounded-2xl text-xs font-semibold transition-all duration-75 active:scale-[0.97]
                        ${type === t ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-white/[0.07] text-slate-500 dark:text-slate-400'}`}>
                      {TMPL_TYPE_STYLE[t]?.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Amount */}
            <div>
              <FieldLabel>Default Amount</FieldLabel>
              <div className="flex items-center gap-2 px-4 h-[48px] rounded-2xl
                bg-white dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/[0.09]">
                <span className="text-slate-400 dark:text-slate-500 text-sm">₱</span>
                <input type="text" inputMode="decimal" value={amountStr === '0' ? '' : amountStr}
                  onChange={moneyChangeHandler(setAmountStr)}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-sm font-medium text-slate-800 dark:text-white outline-none tabular-nums" />
              </div>
            </div>

            {/* Description */}
            <div>
              <FieldLabel>Default Note <span className="font-normal text-slate-400 normal-case">(optional)</span></FieldLabel>
              <input value={desc} onChange={e => setDesc(e.target.value)}
                placeholder="e.g. Morning commute" maxLength={100}
                className={inputClass()} />
            </div>

            {/* Category (expense/inflow only) */}
            {type !== 'transfer' && (
              <div>
                <FieldLabel>Category</FieldLabel>
                <button onClick={() => setShowCat(true)}
                  className="w-full flex items-center gap-3 px-4 h-[48px] rounded-2xl text-left
                    bg-white dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/[0.09]
                    active:bg-slate-50 dark:active:bg-white/[0.10] transition-colors">
                  <span className="text-[20px] leading-none">{category?.icon ?? '🏷️'}</span>
                  <span className={`flex-1 text-sm ${category ? 'font-medium text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                    {category?.name ?? 'Select category'}
                  </span>
                  <span className="text-slate-300 dark:text-slate-600"><IconChevronRight size={14} strokeWidth="2" /></span>
                </button>
              </div>
            )}

            {/* Account (expense/inflow) or From/To (transfer) */}
            {type !== 'transfer' ? (
              <div>
                <FieldLabel>Account</FieldLabel>
                <button onClick={() => setShowAcct(true)}
                  className="w-full flex items-center gap-3 px-4 h-[48px] rounded-2xl text-left
                    bg-white dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/[0.09]
                    active:bg-slate-50 dark:active:bg-white/[0.10] transition-colors">
                  {account
                    ? <span className="w-5 h-5 rounded-md shrink-0" style={{ backgroundColor: account.color }} />
                    : <span className="w-5 h-5 rounded-md shrink-0 bg-slate-200 dark:bg-white/10" />}
                  <span className={`flex-1 text-sm ${account ? 'font-medium text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                    {account?.name ?? 'Select account'}
                  </span>
                  <span className="text-slate-300 dark:text-slate-600"><IconChevronRight size={14} strokeWidth="2" /></span>
                </button>
              </div>
            ) : (
              <>
                <div>
                  <FieldLabel>From Account</FieldLabel>
                  <button onClick={() => setShowFrom(true)}
                    className="w-full flex items-center gap-3 px-4 h-[48px] rounded-2xl text-left
                      bg-white dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/[0.09]
                      active:bg-slate-50 dark:active:bg-white/[0.10] transition-colors">
                    {fromAcct
                      ? <span className="w-5 h-5 rounded-md shrink-0" style={{ backgroundColor: fromAcct.color }} />
                      : <span className="w-5 h-5 rounded-md shrink-0 bg-slate-200 dark:bg-white/10" />}
                    <span className={`flex-1 text-sm ${fromAcct ? 'font-medium text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                      {fromAcct?.name ?? 'Select account'}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600"><IconChevronRight size={14} strokeWidth="2" /></span>
                  </button>
                </div>
                <div>
                  <FieldLabel>To Account</FieldLabel>
                  <button onClick={() => setShowTo(true)}
                    className="w-full flex items-center gap-3 px-4 h-[48px] rounded-2xl text-left
                      bg-white dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/[0.09]
                      active:bg-slate-50 dark:active:bg-white/[0.10] transition-colors">
                    {toAcct
                      ? <span className="w-5 h-5 rounded-md shrink-0" style={{ backgroundColor: toAcct.color }} />
                      : <span className="w-5 h-5 rounded-md shrink-0 bg-slate-200 dark:bg-white/10" />}
                    <span className={`flex-1 text-sm ${toAcct ? 'font-medium text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                      {toAcct?.name ?? 'Select account'}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600"><IconChevronRight size={14} strokeWidth="2" /></span>
                  </button>
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button onClick={close} disabled={saving}
                className="flex-1 py-3.5 rounded-2xl text-sm font-semibold
                  text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06]
                  disabled:opacity-40 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
                  bg-primary
                  disabled:opacity-40 disabled:shadow-none active:scale-[0.98] transition-all duration-100">
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Template'}
              </button>
            </div>
            <div className="h-8 shrink-0" />
          </div>
        </div>
      </div>

      {/* Nested pickers */}
      <CategoryPickerSheet open={showCat} onClose={() => setShowCat(false)}
        categories={visibleCats} selected={category} onSelect={c => { setCategory(c); setShowCat(false) }} />
      <AccountPickerSheet open={showAcct} onClose={() => setShowAcct(false)}
        accounts={allAccounts ?? []} selected={account} onSelect={a => { setAccount(a); setShowAcct(false) }} />
      <AccountPickerSheet open={showFrom} onClose={() => setShowFrom(false)}
        accounts={allAccounts ?? []} selected={fromAcct} onSelect={a => { setFromAcct(a); setShowFrom(false) }}
        exclude={toAcct ? [toAcct.id] : []} />
      <AccountPickerSheet open={showTo} onClose={() => setShowTo(false)}
        accounts={allAccounts ?? []} selected={toAcct} onSelect={a => { setToAcct(a); setShowTo(false) }}
        exclude={fromAcct ? [fromAcct.id] : []} />
    </>
  )
}

// ── Template manager sheet ─────────────────────────────────────────────────────

function TemplateManagerSheet({ open, onClose }) {
  const [closing,    setClosing]    = useState(false)
  useScrollLock(open)
  const [formOpen,   setFormOpen]   = useState(false)
  const [editingTpl, setEditingTpl] = useState(null)

  const templates  = useLiveQuery(() => db.templates.toArray(), [], [])
  const accounts   = useLiveQuery(() => db.accounts.toArray(),  [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])

  const catMap = useMemo(() =>
    Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  function openAdd()       { setEditingTpl(null); setTimeout(() => setFormOpen(true), 0) }
  function openEdit(tpl)   { setEditingTpl(tpl);  setTimeout(() => setFormOpen(true), 0) }
  async function deleteTpl(tpl) { await db.templates.delete(tpl.id) }

  if (!open && !closing) return null

  return (
    <>
      <div className="fixed inset-0 z-[110]" style={{ touchAction: 'none' }}>
        <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
        <div
          className={`${closing ? 'sheet-panel-exit' : 'sheet-panel'} absolute bottom-0 inset-x-0 rounded-t-[28px] overflow-hidden
            bg-slate-50 dark:bg-[#0d1117] border-t border-slate-100 dark:border-white/[0.07]
            max-h-[92vh] flex flex-col`}
          style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
        >
          {/* Header */}
          <div className="sticky top-0 pt-5 px-5 pb-3 bg-slate-50 dark:bg-[#0d1117] z-10
            border-b border-slate-100 dark:border-white/[0.04] shrink-0">
            <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">Quick Templates</h3>
              <button onClick={close} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
                Done
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1 pt-4" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
            {(templates ?? []).length === 0 ? (
              <div className="py-14 text-center px-8">
                <p className="text-3xl mb-3">⚡</p>
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No templates yet</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Add one below, or toggle "Save as template" when confirming any transaction
                </p>
              </div>
            ) : (
              <div className="mx-5 rounded-2xl overflow-hidden bg-white border border-slate-100
                dark:bg-white/[0.04] dark:border-white/[0.07] shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none mb-3">
                {(templates ?? []).map((tpl, i) => (
                  <div key={tpl.id}>
                    <TemplateRow
                      tpl={tpl}
                      catIcon={catMap[tpl.category]?.icon}
                      onTap={openEdit}
                      onLongPressDelete={deleteTpl}
                    />
                    {i < (templates ?? []).length - 1 && (
                      <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="px-5">
              <button onClick={openAdd}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold
                  text-primary bg-primary/[0.07] dark:bg-primary/[0.12]
                  border border-primary/20 dark:border-primary/30
                  active:scale-[0.98] transition-transform duration-100">
                <IconPlus size={15} strokeWidth="2.5" />
                Add Template
              </button>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mt-2.5">
                Hold a template to quickly delete it
              </p>
            </div>
            <div className="h-8 shrink-0" />
          </div>
        </div>
      </div>

      <TemplateFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        template={editingTpl}
        allAccounts={accounts ?? []}
        allCategories={categories ?? []}
      />
    </>
  )
}

// ── Month picker (custom — avoids browser native dropdown dark-mode issues) ───

function MonthPicker({ months, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = months.find(m => m.year === value.year && m.month === value.month) ?? months[0]

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler) }
  }, [open])

  return (
    <div ref={ref} className="flex-1 relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 h-10 rounded-xl text-sm font-medium
          bg-white dark:bg-primary/[0.07]
          border border-slate-200/80 dark:border-primary/[0.14]
          text-slate-800 dark:text-white
          active:opacity-70 transition-opacity"
      >
        <span>{selected?.label}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-1.5 z-[200] rounded-xl overflow-hidden
          bg-white dark:bg-[#1a2332]
          border border-slate-200/80 dark:border-white/[0.08]
          shadow-[0_8px_32px_rgba(0,0,0,0.28)]
          max-h-52 overflow-y-auto no-scrollbar">
          {months.map(({ year, month, label }) => {
            const active = year === value.year && month === value.month
            return (
              <button
                key={`${year}-${month}`}
                onClick={() => { onChange({ year, month }); setOpen(false) }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                  ${active
                    ? 'font-semibold text-primary bg-primary/[0.08] dark:bg-primary/[0.12]'
                    : 'font-medium text-slate-700 dark:text-slate-300 active:bg-slate-50 dark:active:bg-white/[0.05]'
                  }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Accent color sheet ────────────────────────────────────────────────────────

function AccentColorSheet({ open, onClose, accentColor, setAccentColor }) {
  const [closing, setClosing] = useState(false)
  useScrollLock(open)

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
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
        ].join(' ')}
        style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}
      >
        <div className="pt-5 px-5 pb-4 border-b border-slate-50 dark:border-white/[0.04]">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800 dark:text-white">Accent Color</h3>
            <button onClick={close} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
              Done
            </button>
          </div>
        </div>

        <div className="px-5 pt-5 pb-3">
          <div className="grid grid-cols-2 gap-2.5">
            {ACCENT_COLORS.map(({ hex, name }) => {
              const active = accentColor === hex
              return (
                <button
                  key={hex}
                  aria-label={name}
                  onClick={() => setAccentColor(hex)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-2xl active:scale-[0.97] transition-all duration-150"
                  style={{
                    backgroundColor: active ? `${hex}22` : 'transparent',
                    border: `1.5px solid ${active ? hex : 'transparent'}`,
                    boxShadow: active ? `inset 0 1px 0 ${hex}33` : undefined,
                  }}
                >
                  <span
                    className="w-7 h-7 rounded-xl shrink-0"
                    style={{
                      backgroundColor: hex,
                      boxShadow: `0 2px 8px ${hex}55`,
                    }}
                  />
                  <span
                    className="text-sm font-semibold"
                    style={{ color: active ? hex : undefined }}
                  >
                    {!active && <span className="text-slate-700 dark:text-slate-200">{name}</span>}
                    {active && name}
                  </span>
                  {active && (
                    <svg className="ml-auto shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: hex }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Policy sheet ──────────────────────────────────────────────────────────────

const PRIVACY_SECTIONS = [
  { h: null,                  b: 'Last updated: May 2026' },
  { h: 'What We Store',       b: 'Your financial data — transactions, accounts, categories, and budgets — is stored locally on your device using IndexedDB. Nothing leaves your device unless you explicitly enable cloud sync.' },
  { h: 'Cloud Sync',          b: 'If you sign in with Google and enable Supabase sync, your data is stored in Supabase under your own credentials. The developer has no access to your cloud data.' },
  { h: 'What We Don\'t Collect', b: 'We collect no analytics, usage telemetry, advertising identifiers, or personal information beyond what you voluntarily enter in the app.' },
  { h: 'How Data Is Used',    b: 'All data exists solely to provide the app\'s budgeting and tracking functionality. Your data is never sold, shared, or transmitted to any third party.' },
  { h: 'Data Deletion',       b: 'You can permanently delete all local data at any time via Settings → Reset App. To remove cloud-synced data, contact us at jamesandgen111@gmail.com and we will delete your data from our servers.' },
  { h: 'Security',            b: 'Local data security depends on your device\'s own security settings. Cloud-synced data is protected by Supabase\'s infrastructure and your Google account credentials.' },
  { h: 'Changes',             b: 'This policy may be updated from time to time. Continued use of the app after changes are posted constitutes acceptance of the updated policy.' },
  { h: 'Contact',             b: 'Questions or concerns? Email us at jamesandgen111@gmail.com' },
]

const TERMS_SECTIONS = [
  { h: null,                         b: 'Last updated: May 2026. By using Spendr, you agree to these Terms. If you do not agree, please stop using the app.' },
  { h: 'Permitted Use',              b: 'Spendr is intended for personal, non-commercial financial tracking only. You are solely responsible for the accuracy of any data you enter.' },
  { h: 'No Financial Advice',        b: 'Spendr does not provide financial, investment, tax, or legal advice. All figures and summaries are derived solely from data you enter and are for informational purposes only. Do not make financial decisions based solely on this app.' },
  { h: 'No Institutional Affiliations', b: 'Spendr is an independent tool. It is not affiliated with, endorsed by, sponsored by, or officially connected to GCash, Maya, BPI, BDO, or any other bank, e-wallet, or financial institution whose name appears in the app. Institution names are used only as labels for your own organizational convenience.' },
  { h: 'Intellectual Property',      b: 'The Spendr application, its design, interface, and source code are the intellectual property of James Sablay. All rights reserved.' },
  { h: 'Disclaimer of Warranties',   b: 'The app is provided "as is" and "as available" without warranties of any kind. The developer makes no guarantees regarding accuracy, reliability, uptime, or fitness for a particular purpose.' },
  { h: 'Limitation of Liability',    b: 'To the fullest extent permitted by law, James Sablay shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of or inability to use the app, including any loss of data.' },
  { h: 'Changes to Terms',           b: 'These terms may be revised at any time. Your continued use of the app after changes are posted constitutes acceptance of the revised terms.' },
  { h: 'Governing Law',              b: 'These terms are governed by the laws of the Republic of the Philippines.' },
  { h: 'Contact',                    b: 'Questions? Email us at jamesandgen111@gmail.com' },
]

function PolicySheet({ open, type, onClose }) {
  const [closing, setClosing] = useState(false)
  useScrollLock(open)

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  const title    = type === 'privacy' ? 'Privacy Policy' : 'Terms of Use'
  const badge    = type === 'privacy' ? 'Privacy' : 'Legal'
  const sections = type === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS
  const intro    = sections.find(s => s.h === null)
  const body     = sections.filter(s => s.h !== null)

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[100]" style={{ touchAction: 'none' }}>
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px] overflow-hidden',
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
          'max-h-[88vh] flex flex-col',
        ].join(' ')}
        style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}
      >
        {/* ── Header ── */}
        <div className="pt-5 px-5 pb-4 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-5" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-block text-[10px] font-bold uppercase tracking-widest
                px-2 py-0.5 rounded-full mb-1.5
                bg-primary/10 dark:bg-primary/20 text-primary">
                {badge}
              </span>
              <h3 className="text-[22px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
                {title}
              </h3>
            </div>
            <button
              onClick={close}
              className="shrink-0 mt-1 text-xs font-semibold
                text-slate-600 dark:text-slate-300
                px-3 py-1.5 rounded-xl
                bg-slate-100 dark:bg-white/[0.08]
                active:bg-slate-200 dark:active:bg-white/[0.14] transition-colors"
            >
              Done
            </button>
          </div>
        </div>

        <div className="h-px bg-slate-100 dark:bg-white/[0.05] shrink-0 mx-5" />

        {/* ── Scrollable body ── */}
        <div
          className="overflow-y-auto flex-1 px-5 pt-5"
          style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
        >
          {/* Intro callout */}
          {intro && (
            <div className="mb-6 px-4 py-3.5 rounded-2xl
              bg-slate-50 dark:bg-white/[0.04]
              border border-slate-200/60 dark:border-white/[0.07]">
              <p className="text-[13px] italic leading-relaxed text-slate-500 dark:text-slate-400">
                {intro.b}
              </p>
            </div>
          )}

          {/* Sections */}
          <div className="flex flex-col">
            {body.map((s, i) => {
              const isContact  = s.h === 'Contact'
              const emailMatch = s.b.match(/[\w.-]+@[\w.-]+\.\w+/)
              const beforeEmail = emailMatch ? s.b.slice(0, s.b.indexOf(emailMatch[0])) : s.b
              const afterEmail  = emailMatch ? s.b.slice(s.b.indexOf(emailMatch[0]) + emailMatch[0].length) : ''

              return (
                <div key={i}>
                  {i > 0 && (
                    <div className="h-px bg-slate-100 dark:bg-white/[0.05] my-4" />
                  )}
                  <div className="flex gap-3 items-start">
                    {/* Index badge */}
                    <div
                      className="w-[26px] h-[26px] rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: 'rgba(var(--color-primary-rgb), 0.12)' }}
                    >
                      <span className="text-[11px] font-bold tabular-nums text-primary">{i + 1}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-white mb-1.5 leading-snug">
                        {s.h}
                      </p>
                      <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        {isContact && emailMatch ? (
                          <>
                            {beforeEmail}
                            <a
                              href={`mailto:${emailMatch[0]}`}
                              className="font-semibold text-primary underline underline-offset-2 decoration-primary/40"
                            >
                              {emailMatch[0]}
                            </a>
                            {afterEmail}
                          </>
                        ) : s.b}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="h-8 shrink-0" />
        </div>
      </div>
    </div>
  )
}

// ── Toggle switch ──────────────────────────────────────────────────────────────

function ToggleSwitch({ on }) {
  return (
    <span className={`inline-flex items-center shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors duration-200 ${on ? 'bg-primary' : 'bg-slate-200 dark:bg-white/25'}`}>
      <span className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </span>
  )
}

// ── Main Settings page ─────────────────────────────────────────────────────────

export default function Settings() {
  const navigate               = useNavigate()
  const { theme, toggleTheme, accentColor, setAccentColor } = useTheme()
  const { showToast }          = useToast()
  const { user, signOut }      = useAuth()
  const { status: syncStatus, runSync } = useSyncManager()

  const [profileOpen,  setProfileOpen]  = useState(false)
  const [catMgrOpen,   setCatMgrOpen]   = useState(false)
  const [budgetMgrOpen, setBudgetMgrOpen] = useState(false)
  const [tmplMgrOpen,  setTmplMgrOpen]  = useState(false)
  const [resetOpen,    setResetOpen]    = useState(false)
  const [accentOpen,   setAccentOpen]   = useState(false)
  const [policyOpen,   setPolicyOpen]   = useState(null)
  const [legalOpen,    setLegalOpen]    = useState(false)
  const [exporting,          setExporting]          = useState(false)
  const [backingUp,          setBackingUp]          = useState(false)
  const [showExportConfirm,  setShowExportConfirm]  = useState(false)
  const [showBackupConfirm,  setShowBackupConfirm]  = useState(false)
  const [sheetsOpen,   setSheetsOpen]   = useState(false)
  const [syncing,      setSyncing]      = useState(false)
  const [loggingOut,        setLoggingOut]        = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  const meta        = useLiveQuery(() => db.meta.toArray(), [], [])
  const displayName = useMemo(() => (meta ?? []).find(m => m.key === 'displayName')?.value ?? '', [meta])
  const currency    = useMemo(() => (meta ?? []).find(m => m.key === 'currency')?.value ?? 'PHP',  [meta])
  const lastSync       = useMemo(() => (meta ?? []).find(m => m.key === 'lastSync')?.value       ?? null,  [meta])
  const skipConfirm    = useMemo(() => (meta ?? []).find(m => m.key === 'skipConfirm')?.value    ?? false, [meta])
  const sheetsUrl      = useMemo(() => (meta ?? []).find(m => m.key === 'sheetsUrl')?.value      ?? null,  [meta])
  const sheetsLastSync = useMemo(() => (meta ?? []).find(m => m.key === 'sheetsLastSynced')?.value ?? null, [meta])

  const txCount     = useLiveQuery(() => db.transactions.count(), [], 0)

  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })
  const [generatingReport, setGeneratingReport] = useState(false)

  function getLast12Months() {
    const result = []
    const now = new Date()
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      result.push({
        year:  d.getFullYear(),
        month: d.getMonth() + 1,
        label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      })
    }
    return result
  }

  async function handleGenerateReport() {
    setGeneratingReport(true)
    try {
      const { downloadMonthlyReport } = await import('../utils/reportData.js')
      await downloadMonthlyReport(reportMonth.year, reportMonth.month, accentColor)
      showToast('Report downloaded')
    } catch (e) {
      console.error(e)
      showToast('Failed to generate report', 'error')
    } finally {
      setGeneratingReport(false)
    }
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await signOut()
      // Stay in the app — it works offline without auth
      setLoggingOut(false)
    } catch (e) {
      console.error('[Settings] logout failed:', e)
      showToast('Sign-out failed', 'error')
      setLoggingOut(false)
    }
  }

  async function handleRedoOnboarding() {
    await db.meta.delete('onboarded')
    navigate('/onboarding', { replace: true })
  }

  async function handleSheetsSync(url) {
    if (syncing) return
    setSyncing(true)
    try {
      const { txCount, accountCount } = await syncToSheets(url)
      await db.meta.put({ key: 'sheetsLastSynced', value: new Date().toISOString() })
      showToast(`Synced ${txCount} transactions & ${accountCount} accounts to Google Sheets`, 'success')
    } catch (e) {
      showToast('Sync failed: ' + e.message, 'error')
    } finally {
      setSyncing(false)
    }
  }

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      const txs = await db.transactions.toArray()
      buildAndDownloadCSV(txs)
      showToast(`${txs.length} transaction${txs.length !== 1 ? 's' : ''} exported`)
    } catch (e) {
      console.error('[Settings] export failed:', e)
      showToast('Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  async function handleFullBackup() {
    if (backingUp) return
    setBackingUp(true)
    try {
      const [transactions, accounts, categories, templates, recurring, debts] = await Promise.all([
        db.transactions.toArray(),
        db.accounts.toArray(),
        db.categories.toArray(),
        db.templates.toArray(),
        db.recurring.toArray(),
        db.debts.toArray(),
      ])
      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        transactions, accounts, categories, templates, recurring, debts,
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `spendr-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('Full backup downloaded')
    } catch (e) {
      console.error('[Settings] backup failed:', e)
      showToast('Backup failed')
    } finally {
      setBackingUp(false)
    }
  }

  // Avatar letter
  const avatarLetter = (displayName || 'S').charAt(0).toUpperCase()

  return (
    <div className="pb-10">

      {/* ── Header ── */}
      <div className="px-5 pt-safe-header pb-2">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Settings</h1>
      </div>

      {/* ── Profile card ── */}
      <div className="px-5 pt-4 pb-6">
        <button
          onClick={() => setProfileOpen(true)}
          className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left
            bg-white dark:bg-primary/[0.10]
            border border-slate-100 dark:border-primary/[0.22]
            shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.15),0_0_0_1px_rgba(var(--color-primary-rgb),0.06)]
            active:scale-[0.99] transition-transform duration-100"
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-2xl font-semibold text-primary">{avatarLetter}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-slate-900 dark:text-white truncate">
              {displayName || user?.email?.split('@')[0] || 'Your Name'}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 text-primary">
                {currency}
              </span>
              {user?.email && (
                <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-[160px]">
                  {user.email}
                </span>
              )}
            </div>
          </div>
          <span className="text-slate-300 dark:text-slate-600 shrink-0">
            <IconChevronRight size={14} strokeWidth="2" />
          </span>
        </button>
      </div>

      {/* ══ 1. APPEARANCE ══ */}
      <div className="mb-8">
        <SectionHeader>Appearance</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="slate">{theme === 'dark' ? <IconSun /> : <IconMoon />}</RowIcon>}
            label={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            sublabel={`Currently ${theme}`}
            right={<ToggleSwitch on={theme === 'dark'} />}
            onTap={toggleTheme}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="violet"><IconPalette /></RowIcon>}
            label="Accent Color"
            sublabel={ACCENT_COLORS.find(c => c.hex === accentColor)?.name ?? 'Custom'}
            right={
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
                <IconChevronRight size={14} strokeWidth="2" />
              </div>
            }
            onTap={() => setAccentOpen(true)}
          />
        </SectionCard>
      </div>

      {/* ══ 3. PREFERENCES ══ */}
      <div className="mb-8">
        <SectionHeader>Preferences</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={
              <RowIcon color="green">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </RowIcon>
            }
            label="Skip Confirmation"
            sublabel="Save instantly, no review step"
            right={<ToggleSwitch on={skipConfirm} />}
            onTap={() => db.meta.put({ key: 'skipConfirm', value: !skipConfirm })}
          />
        </SectionCard>
      </div>

      {/* ══ 4. MANAGE ══ */}
      <div className="mb-8">
        <SectionHeader>Manage</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="amber"><IconTag /></RowIcon>}
            label="Categories"
            sublabel="Customize expense and inflow categories"
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => setCatMgrOpen(true)}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="green"><IconTarget /></RowIcon>}
            label="Monthly Budgets"
            sublabel="Set spending limits per category"
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => setBudgetMgrOpen(true)}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="amber"><span className="text-base">⚡</span></RowIcon>}
            label="Quick Templates"
            sublabel="One-tap repeat transactions"
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => setTmplMgrOpen(true)}
          />
        </SectionCard>
      </div>

      {/* ══ 5. DATA & REPORTS ══ */}
      <div className="mb-8">
        <SectionHeader>Data & Reports</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="green"><IconDownload /></RowIcon>}
            label="Export Transactions (CSV)"
            sublabel={exporting ? 'Preparing download…' : `${txCount ?? 0} transactions`}
            right={
              exporting
                ? <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                : <IconChevronRight size={14} strokeWidth="2" />
            }
            onTap={() => setShowExportConfirm(true)}
            disabled={exporting}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="teal"><IconDownload /></RowIcon>}
            label="Full Backup (JSON)"
            sublabel={backingUp ? 'Preparing download…' : 'Accounts, categories, transactions & more'}
            right={
              backingUp
                ? <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                : <IconChevronRight size={14} strokeWidth="2" />
            }
            onTap={() => setShowBackupConfirm(true)}
            disabled={backingUp}
          />
          <RowDivider />
          {/* PDF Report inline */}
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-4 mb-2.5">
              <RowIcon color="blue"><IconFileText /></RowIcon>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">Monthly PDF Report</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Full summary: spending, income, transactions</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-[52px]">
              <select
                value={`${reportMonth.year}-${reportMonth.month}`}
                onChange={e => {
                  const [y, m] = e.target.value.split('-').map(Number)
                  setReportMonth({ year: y, month: m })
                }}
                className="flex-1 text-sm bg-white dark:bg-primary/[0.07] border border-slate-200/80 dark:border-primary/[0.14] rounded-xl px-3 h-10 outline-none"
                style={{ colorScheme: theme === 'dark' ? 'dark' : 'light' }}
              >
                {getLast12Months().map(({ year, month, label }) => (
                  <option key={`${year}-${month}`} value={`${year}-${month}`}>{label}</option>
                ))}
              </select>
              <button
                onClick={handleGenerateReport}
                disabled={generatingReport}
                className="flex items-center justify-center gap-1.5 w-10 h-10 rounded-xl text-white bg-primary disabled:opacity-50 active:scale-95 transition-all duration-100 shrink-0"
              >
                {generatingReport
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <IconDownload />}
              </button>
            </div>
          </div>
          {/* <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="slate"><IconRefresh /></RowIcon>}
            label="Redo Onboarding"
            sublabel="Restart the setup flow"
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={handleRedoOnboarding}
          /> */}
        </SectionCard>
      </div>

      {/* ══ 6. SYNC ══ */}
      <div className="mb-8">
        <SectionHeader>Sync</SectionHeader>
        <SectionCard>
          {user ? (
            <div className="flex items-center gap-4 px-4 py-3.5">
              <RowIcon color="violet">
                <span className={syncStatus === 'syncing' ? 'animate-spin inline-block' : ''}>
                  <IconCloud />
                </span>
              </RowIcon>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-white">Cloud Sync</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                  {syncStatus === 'syncing' ? 'Syncing…'
                    : syncStatus === 'error' ? 'Last sync failed'
                    : `Last synced: ${fmtRelTime(lastSync)}`}
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className={`w-2 h-2 rounded-full ${
                  syncStatus === 'syncing' ? 'bg-primary animate-pulse'
                  : syncStatus === 'error' ? 'bg-red-400'
                  : lastSync               ? 'bg-emerald-400'
                  :                          'bg-slate-300 dark:bg-slate-600'
                }`} />
                <button
                  onClick={runSync}
                  disabled={syncStatus === 'syncing'}
                  className="text-xs font-semibold text-primary px-3 py-1.5 rounded-xl
                    bg-primary/[0.08] dark:bg-primary/[0.12]
                    disabled:opacity-40 active:bg-primary/[0.15] transition-colors"
                >
                  Sync
                </button>
              </div>
            </div>
          ) : (
            <SettingsRow
              iconEl={<RowIcon color="violet"><IconCloud /></RowIcon>}
              label="Enable Cloud Sync"
              sublabel="Sign in with Google to sync across devices"
              right={<IconChevronRight size={14} strokeWidth="2" />}
              onTap={() => navigate('/login')}
            />
          )}
          {user?.email === 'sablayjames@gmail.com' && (<>
            <RowDivider />
            <div className="flex items-center gap-4 px-4 py-3.5">
              <RowIcon color="green">
                <span className={syncing ? 'animate-spin inline-block' : ''}><IconSheets /></span>
              </RowIcon>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-white">Google Sheets</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                  {syncing        ? 'Syncing…'
                  : sheetsLastSync ? `Last synced: ${fmtRelTime(sheetsLastSync)}`
                  : sheetsUrl      ? 'Ready to sync'
                  :                  'Tap Set up to configure'}
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className={`w-2 h-2 rounded-full ${
                  syncing          ? 'bg-primary animate-pulse'
                  : sheetsLastSync ? 'bg-emerald-400'
                  :                  'bg-slate-300 dark:bg-slate-600'
                }`} />
                <button
                  onClick={() => sheetsUrl ? handleSheetsSync(sheetsUrl) : setSheetsOpen(true)}
                  disabled={syncing}
                  className="text-xs font-semibold text-primary px-3 py-1.5 rounded-xl
                    bg-primary/[0.08] dark:bg-primary/[0.12]
                    disabled:opacity-40 active:bg-primary/[0.15] transition-colors"
                >
                  {sheetsUrl ? 'Sync' : 'Set up'}
                </button>
              </div>
            </div>
          </>)}
        </SectionCard>
      </div>

      {/* ══ 7. ACCOUNT (sign-out) ══ */}
      {user && (
        <div className="mb-8">
          <SectionHeader>Account</SectionHeader>
          <SectionCard>
            <SettingsRow
              iconEl={<RowIcon color="red"><IconTrash /></RowIcon>}
              label={loggingOut ? 'Signing out…' : 'Sign Out'}
              sublabel={user.email ?? ''}
              right={loggingOut
                ? <span className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                : <IconChevronRight size={14} strokeWidth="2" />
              }
              onTap={() => setShowSignOutConfirm(true)}
              destructive
              disabled={loggingOut}
            />
          </SectionCard>
        </div>
      )}

      {/* Sign-out confirmation dialog */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4" style={{ touchAction: 'none' }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !loggingOut && setShowSignOutConfirm(false)} />
          <div className="relative w-full max-w-sm rounded-3xl
            bg-white dark:bg-[#111820]
            border border-slate-100 dark:border-white/[0.07]
            shadow-[0_20px_60px_rgba(0,0,0,0.3)]
            p-6 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-500/15
              flex items-center justify-center mx-auto text-red-500 dark:text-red-400">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Sign Out?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your data stays on this device. You can sign back in anytime to sync again.
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowSignOutConfirm(false)}
                disabled={loggingOut}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold
                  text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.07]
                  active:bg-slate-200 dark:active:bg-white/[0.12] transition-colors">
                Cancel
              </button>
              <button
                onClick={async () => { await handleLogout(); setShowSignOutConfirm(false) }}
                disabled={loggingOut}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white
                  bg-red-500 shadow-[0_4px_16px_rgba(239,68,68,0.35)]
                  disabled:opacity-40 disabled:shadow-none
                  active:scale-[0.98] transition-all duration-100">
                {loggingOut ? 'Signing out…' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export CSV confirm */}
      {showExportConfirm && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4" style={{ touchAction: 'none' }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowExportConfirm(false)} />
          <div className="relative w-full max-w-sm rounded-3xl
            bg-white dark:bg-[#111820]
            border border-slate-100 dark:border-white/[0.07]
            shadow-[0_20px_60px_rgba(0,0,0,0.3)]
            p-6 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-500/15
              flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
              <IconDownload />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Export Transactions?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                This will download all {txCount ?? 0} transactions as a CSV file.
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowExportConfirm(false)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold
                  text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.07]
                  active:bg-slate-200 dark:active:bg-white/[0.12] transition-colors">
                Cancel
              </button>
              <button
                onClick={() => { setShowExportConfirm(false); handleExport() }}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white
                  bg-primary shadow-[0_4px_16px_rgba(var(--color-primary-rgb),0.35)]
                  active:scale-[0.98] transition-all duration-100">
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Backup confirm */}
      {showBackupConfirm && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4" style={{ touchAction: 'none' }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowBackupConfirm(false)} />
          <div className="relative w-full max-w-sm rounded-3xl
            bg-white dark:bg-[#111820]
            border border-slate-100 dark:border-white/[0.07]
            shadow-[0_20px_60px_rgba(0,0,0,0.3)]
            p-6 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-teal-100 dark:bg-teal-500/15
              flex items-center justify-center mx-auto text-teal-600 dark:text-teal-400">
              <IconDownload />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Download Full Backup?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Exports all accounts, categories, transactions, templates, recurring, and debts as a JSON file.
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowBackupConfirm(false)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold
                  text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.07]
                  active:bg-slate-200 dark:active:bg-white/[0.12] transition-colors">
                Cancel
              </button>
              <button
                onClick={() => { setShowBackupConfirm(false); handleFullBackup() }}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white
                  bg-primary shadow-[0_4px_16px_rgba(var(--color-primary-rgb),0.35)]
                  active:scale-[0.98] transition-all duration-100">
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 8. DANGER ZONE ══ */}
      <div className="mb-8">
        <SectionHeader>Danger Zone</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="red"><IconTrash /></RowIcon>}
            label="Reset App"
            sublabel="Permanently delete all local data"
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => setResetOpen(true)}
            destructive
          />
        </SectionCard>
      </div>

      {/* ══ 9. LEGAL ══ */}
      <div className="mb-10">
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="slate"><IconFileText /></RowIcon>}
            label="Legal"
            sublabel="Privacy Policy & Terms of Use"
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => setLegalOpen(true)}
          />
        </SectionCard>
      </div>

      {/* Legal picker sheet */}
      {legalOpen && (
        <div className="fixed inset-0 z-[100]" style={{ touchAction: 'none' }}>
          <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm"
            onClick={() => setLegalOpen(false)} />
          <div className="sheet-panel absolute bottom-0 inset-x-0 rounded-t-[28px]
            bg-white dark:bg-[#111820]
            border-t border-slate-100 dark:border-white/[0.07]"
            style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
          >
            <div className="pt-5 px-5 pb-4">
              <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">Legal</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { setLegalOpen(false); setTimeout(() => setPolicyOpen('privacy'), 60) }}
                  className="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left
                    bg-slate-50 dark:bg-white/[0.04]
                    active:bg-slate-100 dark:active:bg-white/[0.08] transition-colors"
                >
                  <RowIcon color="slate"><IconFileText /></RowIcon>
                  <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-white">Privacy Policy</span>
                  <span className="text-slate-300 dark:text-slate-600"><IconChevronRight size={14} strokeWidth="2" /></span>
                </button>
                <button
                  onClick={() => { setLegalOpen(false); setTimeout(() => setPolicyOpen('terms'), 60) }}
                  className="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left
                    bg-slate-50 dark:bg-white/[0.04]
                    active:bg-slate-100 dark:active:bg-white/[0.08] transition-colors"
                >
                  <RowIcon color="slate"><IconInfo /></RowIcon>
                  <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-white">Terms of Use</span>
                  <span className="text-slate-300 dark:text-slate-600"><IconChevronRight size={14} strokeWidth="2" /></span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Spendr footer (no card) ══ */}
      <div className="px-5 pb-8 flex flex-col items-center gap-3 text-center">
        <img
          src="/icons/icon-512.png"
          alt="Spendr"
          className="w-14 h-14 rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.15)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
        />
        <p className="text-base font-bold text-slate-800 dark:text-white tracking-tight">Spendr</p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed max-w-[260px]">
          Spendr is an independent tool and is not affiliated with any financial institutions mentioned within the app.
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} James Sablay · v{APP_VERSION}
        </p>
      </div>

      {/* ── Sheets & modals ── */}
      <SheetsConfigSheet
        open={sheetsOpen}
        onClose={() => setSheetsOpen(false)}
        onSync={handleSheetsSync}
        syncing={syncing}
      />
      <ProfileSheet
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        displayName={displayName}
        currency={currency}
      />
      <CategoryManagerSheet
        open={catMgrOpen}
        onClose={() => setCatMgrOpen(false)}
      />
      <BudgetManagerSheet
        open={budgetMgrOpen}
        onClose={() => setBudgetMgrOpen(false)}
      />
      <TemplateManagerSheet
        open={tmplMgrOpen}
        onClose={() => setTmplMgrOpen(false)}
      />
      <ResetConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
      />
      <AccentColorSheet
        open={accentOpen}
        onClose={() => setAccentOpen(false)}
        accentColor={accentColor}
        setAccentColor={setAccentColor}
      />
      <PolicySheet
        open={!!policyOpen}
        type={policyOpen}
        onClose={() => setPolicyOpen(null)}
      />

    </div>
  )
}
