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
import { useBack } from '../hooks/useBack'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useSyncManager } from '../components/SyncManager'
import SubPage from '../components/SubPage'
import db, { UNSYNCED } from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import AccountPickerSheet from '../components/AccountPickerSheet'
import CategoryPickerSheet from '../components/CategoryPickerSheet'
import { EXPENSE_PRESETS, INFLOW_PRESETS } from '../lib/phCategories'
import { syncToSheets } from '../lib/sheetsSync'
import { IconCheck, IconChevronRight, IconPlus, IconUpload,
  IconTick, IconWarning, IconTemplate, IconTransferUI } from '../components/icons'
import CategoryGlyph, { presetCategoryIcon as CATEGORY_ICON_BY_NAME } from '../components/CategoryGlyph'
import SegTabs from '../components/SegTabs'
import { deleteCategoryRemote, deleteTemplateRemote } from '../lib/sync'
import { inspectBackup, restoreBackup } from '../lib/backup'
import { setViewMode, getViewPreference } from '../web/useViewMode'
import Button from '../components/ui/Button'
import Sheet from '../components/ui/Sheet'
import Divider from '../components/ui/Divider'
import SectionLabel from '../components/ui/SectionLabel'
import Field, { fieldFrame } from '../components/ui/Field'
import SwatchRail from '../components/ui/SwatchRail'
import IconButton from '../components/ui/IconButton'

// ── Constants ──────────────────────────────────────────────────────────────────

const APP_VERSION = '0.1.0'

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

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _phpFmt.format(Math.abs(n))
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

// ── UI primitives ──────────────────────────────────────────────────────────────

function SectionHeader({ children }) {
  return (
    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 px-5 mb-2">
      {children}
    </p>
  )
}

/* Was a local hairline at slate-50 / white-4%, one of the sixteen recipes
   the app had. It is the shared one now; the 8 call sites keep their name. */
const RowDivider = () => <Divider inset="row" />

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

/**
 * The frame, for the inputs in this file that are not <Field>s yet.
 *
 * Built from fieldFrame so there is one capsule, one height and one fill
 * rather than this file's own 48px radius-16 version - which is what made
 * Settings' fields visibly different objects from the add-forms'.
 */
function inputClass(error = false) {
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

// ── Profile sheet ──────────────────────────────────────────────────────────────

export function SheetsConfigSheet({ open, onClose, onSync, syncing }) {
  const [url,      setUrl]      = useState('')
  const [saving,   setSaving]   = useState(false)
  const [lastSync, setLastSync] = useState(null)

  /* No `closing` flag, no scroll lock and no local close(): Sheet owns the
     overlay, the panel, the grab handle, the scroll lock, Escape, the focus
     trap and the exit animation, and `open` is the only thing that decides
     any of it. */

  useEffect(() => {
    if (!open) return
    db.meta.get('sheetsUrl').then(r => setUrl(r?.value ?? ''))
    db.meta.get('sheetsLastSynced').then(r => setLastSync(r?.value ?? null))
  }, [open])

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

  return (
    /* The same z and the same 45% scrim it drew by hand, and Sheet's default
       white/[#111820] panel is the surface it already had.

       No maxHeight: this panel never asked for a height, so it keeps floating
       while it fits and lets Sheet dock it when it does not. The line under
       the heading moves into the body rather than staying in the header -
       Sheet's title slot holds text only, so a second paragraph cannot leak
       into the dialog's accessible name. */
    <Sheet
      open={open}
      onClose={onClose}
      z={100}
      scrim={45}
      title="Google Sheets sync"
      footer={(
        <Button size="lg" block onClick={handleSync} disabled={syncing || !url.trim()}>
          {syncing
            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Syncing…</>
            : 'Sync Now'}
        </Button>
      )}
    >
      <div className="pt-1 flex flex-col gap-4">
        <p className="text-[12px] text-slate-400 dark:text-slate-500">
          Paste your Apps Script Web App URL to enable syncing.
        </p>

        <div>
          <label className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2 block">
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
      </div>
    </Sheet>
  )
}

export function ProfileSheet({ open, onClose, displayName: initName, currency: initCurrency }) {
  const { showToast } = useToast()
  const [saving,   setSaving]   = useState(false)
  const [name,     setName]     = useState('')
  const [currency, setCurrency] = useState('PHP')

  /* No `closing` flag and no scroll lock: Sheet owns the overlay, the panel,
     the grab handle, the scroll lock, Escape, the focus trap and the exit
     animation. Closing is just onClose now. */

  useEffect(() => {
    if (!open) return
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaving(false)
    setName(initName || '')
    setCurrency(initCurrency || 'PHP')
  }, [open, initName, initCurrency])

  async function handleSave() {
    setSaving(true)
    try {
      await db.meta.put({ key: 'displayName', value: name.trim() })
      await db.meta.put({ key: 'currency',    value: currency })
      /* Straight to onClose rather than through the old close(), which
         opened with `if (saving) return`. That guard only ever passed here
         because it read the pre-click `saving` out of a stale closure;
         calling it with the current value would have refused to close the
         sheet it had just finished saving. */
      onClose()
    } catch (e) {
      console.error('[ProfileSheet] save failed:', e)
      showToast('Failed to save profile', 'error')
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={100}
      scrim={45}
      title="Edit profile"
      /* The header's Cancel, in the slot built for it - outside the <h3>, so
         the word does not become part of the dialog's accessible name. */
      titleAction={(
        <button
          onClick={onClose}
          disabled={saving}
          className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60"
        >
          Cancel
        </button>
      )}
      /* The other half of the old close()'s `if (saving) return`: a sheet
         that is writing the profile must not be dismissed by the scrim or by
         Escape out from under the write. */
      dismissible={!saving}
      footer={(
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-[2]" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </Button>
        </div>
      )}
    >
      <div className="pt-2">
        <SectionLabel>Display name</SectionLabel>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your name"
          maxLength={40}
          className={inputClass()}
        />
      </div>
    </Sheet>
  )
}

// ── Restore-from-backup sheet ──────────────────────────────────────────────────

export function RestoreBackupSheet({ open, onClose }) {
  const { showToast } = useToast()
  const [step,    setStep]    = useState(1) // 1=pick file, 2=typed confirm
  const [info,    setInfo]    = useState(null)
  const [raw,     setRaw]     = useState(null)
  const [error,   setError]   = useState('')
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const fileRef = useRef(null)

  /* No scroll lock and no `closing` flag: Sheet owns the overlay, the panel,
     the scroll lock, Escape, the focus trap and the exit animation. */

  useEffect(() => {
    if (!open) return
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // Resetting on the way IN rather than on the way out also keeps the
    // panel intact for the 240ms the exit animation runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(1); setInfo(null); setRaw(null); setError(''); setInput(''); setLoading(false)
  }, [open])

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    if (!file.name.toLowerCase().endsWith('.json')) {
      setError('Pick the .json backup file.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result)
        setInfo(inspectBackup(text))
        setRaw(text)
        setStep(2)
      } catch (err) {
        setError(err.message)
      }
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
  }

  async function handleRestore() {
    setLoading(true)
    try {
      const res = await restoreBackup(raw)
      showToast(`Restored ${res.counts.transactions} transactions`)
      // Reload so every live query re-reads from scratch rather than
      // reconciling a wholesale table replacement.
      window.location.replace('/')
    } catch (err) {
      console.error('[Restore] failed:', err)
      showToast('Restore failed', 'error')
      setLoading(false)
    }
  }

  const c = info?.counts ?? {}
  const summary = [
    [c.transactions, 'transactions'], [c.accounts, 'accounts'],
    [c.categories, 'categories'], [c.recurring, 'recurring'],
    [c.debts, 'debts'], [c.templates, 'templates'],
  ].filter(([n]) => n > 0)

  return (
    /* Was a hand-rolled centred card. It stays centred on desktop - that is
       what `html.web .sheet-panel` does to every sheet - so the geometry is
       the primitive's now, and only the z-index and the scrim depth of the
       old overlay are carried across by hand. */
    <Sheet
      open={open}
      onClose={onClose}
      z={200}
      scrim={60}
      /* It had no grab handle as a centred card, and gains none here. */
      handle={false}
      /* The headings stay in the body, centred under the icon, so the dialog
         is named here rather than through Sheet's title slot. */
      ariaLabel="Restore backup"
      footer={step === 1 ? (
        <div className="flex flex-col gap-2.5">
          <Button block onClick={() => fileRef.current?.click()}>
            Choose file
          </Button>
          <Button variant="secondary" block onClick={onClose}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <Button
            variant="danger"
            block
            onClick={handleRestore} disabled={input.trim().toUpperCase() !== 'RESTORE' || loading}
          >
            {loading ? 'Restoring…' : 'Replace my data'}
          </Button>
          <Button variant="secondary" block onClick={onClose} disabled={loading}>
            Cancel
          </Button>
        </div>
      )}
    >
      {/* pt-6 for the old card's p-6 top edge: with no handle and no title
          there is nothing above the icon to hold it off the panel edge. */}
      <div className="pt-6 space-y-4">

        <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-500/15
          flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
          <IconUpload />
        </div>

        {step === 1 && (
          <>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Restore backup</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Pick a <span className="font-semibold">.json</span> backup. Its contents replace
                what's on this device — anything not in the file is removed.
              </p>
            </div>
            {error && (
              <p className="text-xs text-red-500 dark:text-red-400 text-center px-2">{error}</p>
            )}
            {/* The `hidden` ATTRIBUTE as well as the class, because Sheet's
                Tab trap skips nodes by the attribute: a display:none input
                left in the ring is focusable to querySelectorAll but not to
                focus(), and Tab dead-ends on it. */}
            <input ref={fileRef} type="file" accept=".json,application/json"
              onChange={handleFile} className="hidden" hidden />
          </>
        )}

        {step === 2 && (
          <>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Replace all data?</h3>
              {info?.exportedAt && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
                  Backup from {new Date(info.exportedAt).toLocaleString('en-PH', {
                    dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-slate-50 dark:bg-white/[0.04] px-4 py-3 flex flex-col gap-1.5">
              {summary.map(([n, label]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
                  <span className="text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">{n}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 text-center px-1">
              Your name, currency and theme are kept. If you're signed in, the next
              sync pushes this state to the cloud.
            </p>

            <div>
              <SectionLabel>Type RESTORE to confirm</SectionLabel>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="RESTORE"
                autoCapitalize="characters"
                className="w-full px-4 py-3 rounded-2xl text-sm font-semibold tracking-wide
                  bg-slate-50 dark:bg-white/[0.05] text-slate-800 dark:text-white
                  border border-slate-200 dark:border-white/[0.09] outline-none
                  focus:border-primary dark:focus:border-primary"
              />
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}

// ── Reset confirm modal ────────────────────────────────────────────────────────

export function ResetConfirmModal({ open, onClose }) {
  const { showToast } = useToast()
  const [step,    setStep]    = useState(1) // 1=warn 2=typing-confirm
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const { signOut } = useAuth()

  /* No scroll lock and no `closing` flag: Sheet owns the overlay, the panel,
     the scroll lock, Escape, the focus trap and the exit animation. */

  useEffect(() => {
    if (!open) return
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // Resetting on the way IN rather than on the way out also keeps the
    // panel intact for the 240ms the exit animation runs - a confirmation
    // that snaps back to step 1 mid-slide reads as a glitch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(1); setInput(''); setLoading(false)
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

  return (
    /* Same story as RestoreBackupSheet: a hand-rolled centred card, which is
       what `html.web .sheet-panel` already makes of every sheet on desktop.
       Only the z-index and the scrim depth carry across by hand. */
    <Sheet
      open={open}
      onClose={onClose}
      z={200}
      scrim={60}
      /* It had no grab handle as a centred card, and gains none here. */
      handle={false}
      /* Both headings live in the body, centred under the icon, so the
         dialog is named here rather than through Sheet's title slot. */
      ariaLabel="Reset app"
      footer={step === 1 ? (
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="flex-1"
            onClick={() => setStep(2)}
          >
            Continue
          </Button>
        </div>
      ) : (
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={onClose} disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="flex-1"
            onClick={handleReset} disabled={loading || input !== 'RESET'}
          >
            {loading ? 'Resetting…' : 'Reset app'}
          </Button>
        </div>
      )}
    >
      {/* pt-6 for the old card's p-6 top edge: with no handle and no title
          there is nothing above the icon to hold it off the panel edge. */}
      <div className="pt-6 space-y-4">

        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-500/15
          flex items-center justify-center mx-auto text-red-500 dark:text-red-400">
          <IconTrash />
        </div>

        {step === 1 && (
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Reset app?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This will permanently delete all transactions, accounts, categories, debts, and recurring payments. This cannot be undone.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Are you sure?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Type <span className="font-bold text-red-500">RESET</span> to confirm.
            </p>
            {/* Still autoFocus rather than Sheet's initialFocus: the field
                only exists once Continue has been pressed, so the keyboard
                is wanted at that moment and not when the sheet opens. */}
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="RESET"
              className={inputClass()}
              autoFocus
            />
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ── Budget summary card (inside category manager) ──────────────────────────────

/* BudgetSummaryCard lived here: a headline total with a progress bar,
   shown at the top of both budget screens. The Budget page opens with
   the same figure inside its gauge, and the limit editor now hangs off
   that page - so it was the same number three times. Deleted with its
   last caller rather than left for someone to find and reuse. */


// ── Budget manager sheet ───────────────────────────────────────────────────────

/**
 * Monthly budgets: one implementation, two presentations.
 *
 * `variant="page"` is the mobile route at /settings/budgets, with the app's
 * standard sub-page header. `variant="sheet"` is the modal the DESKTOP
 * settings uses - src/web/pages/WebSettings.jsx imports BudgetManagerSheet and
 * presents it over a two-pane layout, where a full-page route would be wrong.
 *
 * A variant rather than two components, because everything that matters here
 * is the state and the save semantics - pending edits held locally until you
 * commit them - and duplicating that to get two shells would be duplicating
 * the only part with any behaviour in it.
 */
function BudgetManager({ open, onClose, variant = 'sheet' }) {
  const asPage = variant === 'page'
  const { showToast } = useToast()
  const [localBudgets, setLocalBudgets] = useState({})
  const [saving,       setSaving]       = useState(false)
  /* No `closing` flag and no scroll lock any more: the sheet variant is a
     <Sheet>, and it owns the overlay, the panel, the grab handle, the scroll
     lock, Escape, the focus trap and the 240ms exit. `open` decides all of
     it. The page variant never locked scroll in the first place. */

  /* No transactions query any more. This screen read EVERY transaction in the
     database to colour a progress bar and print a "spent" figure under each
     row - both of which the Budget page shows already, and this screen now
     hangs off that page. Setting a limit is the one job here. */
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])

  const expenseCats = useMemo(() =>
    (categories ?? [])
      .filter(c => c.type === 'expense')
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name)),
    [categories],
  )

  const hasPendingChanges = useMemo(() =>
    Object.entries(localBudgets).some(([id, str]) => {
      const cat = (categories ?? []).find(c => String(c.id) === String(id))
      return cat && parseMoney(str) !== (cat.budget ?? 0)
    }),
    [localBudgets, categories],
  )

  /* Dropping the pending edits in the same breath as closing is safe on the
     sheet too: Sheet holds on to what it was showing for the length of the
     exit, so the fields do not empty themselves on the way out. */
  const close = () => {
    setLocalBudgets({})
    onClose()
  }

  function handleLocalChange(catId, str) {
    setLocalBudgets(prev => ({ ...prev, [catId]: str }))
  }

  async function saveAll() {
    setSaving(true)
    try {
      await Promise.all(
        Object.entries(localBudgets).map(([id, str]) => {
          const cat = (categories ?? []).find(c => String(c.id) === String(id))
          if (!cat) return Promise.resolve()
          // An empty field is no limit: parseMoney('') is 0, and 0 is how
          // "no limit" has always been stored.
          const newBudget = parseMoney(str) || 0
          if (newBudget === (cat.budget ?? 0)) return Promise.resolve()
          return db.categories.update(Number(id), { budget: newBudget })
        })
      )
      setLocalBudgets({})
      close()
    } catch (e) {
      console.error('[BudgetManager] save failed:', e)
      showToast('Failed to save budgets', 'error')
    } finally {
      setSaving(false)
    }
  }


  /* Only the page may bail out on !open. The sheet has to keep rendering
     while it slides away, and Sheet stops itself once the exit is over -
     returning null here would unmount it mid-slide. */
  if (asPage && !open) return null

  /* The list and the save button are shared; only the shell around them
     differs. The page lets the document scroll and puts the button after the
     list; the sheet scrolls internally and pins the button to the panel. */
  /* One inset card of rows, not a stack of cards that change shape when you
     tap them. Each row is a label and a field, which is what setting a number
     is; the glyph keeps the category recognisable at a glance.

     No summary card at the top either: this screen hangs off the Budget page,
     which opens with the same figure in its gauge. */
  const listBody = (
    <>
            <div className="mx-4 mb-6 rounded-2xl overflow-hidden
              bg-white border border-slate-100
              dark:bg-white/[0.04] dark:border-white/[0.07]">
              {expenseCats.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-slate-400 dark:text-slate-500">No expense categories yet</p>
                </div>
              ) : expenseCats.map((cat, i) => {
                /* The field's text: whatever has been typed, else the saved
                   limit, and an empty string for zero - a category with no
                   limit shows the placeholder rather than "0", because 0 is
                   not a limit anyone set. */
                const localStr = localBudgets[cat.id]
                const saved    = cat.budget ?? 0
                const text     = localStr !== undefined
                  ? (localStr === '0' ? '' : localStr)
                  : (saved > 0 ? numToMoneyStr(saved) : '')
                const isDirty  = localStr !== undefined && (parseMoney(localStr) || 0) !== saved

                return (
                  /* A <label>, so the whole row is the field's target: tapping
                     anywhere on it - the glyph, the name, the empty space -
                     puts the caret in the amount, which is how a row like this
                     behaves on this platform. */
                  <label
                    key={cat.id}
                    className={[
                      'flex items-center gap-3 px-4 h-[58px] cursor-text',
                      i > 0 ? 'border-t border-slate-100 dark:border-white/[0.06]' : '',
                      isDirty ? 'bg-primary/[0.04] dark:bg-primary/[0.07]' : '',
                    ].join(' ')}
                  >
                    <span
                      className="cat-tile w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ '--cat-color': cat.color ?? '#64748b' }}
                    >
                      <CategoryGlyph cat={cat} size={19} />
                    </span>

                    <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 dark:text-white truncate">
                      {cat.name}
                    </span>

                    {/* Sign and number are one unit with a hair of space, not
                        two items in the row's 12px rhythm. The sign appears
                        only once there is a number for it to belong to; in
                        front of the placeholder it reads as a value of
                        nothing. */}
                    <span className="flex items-baseline gap-1 shrink-0">
                      {text !== '' && (
                        <span className="text-sm font-medium text-slate-400 dark:text-slate-500">₱</span>
                      )}
                    {/* Sized in `ch` from its own contents, so the field is
                        exactly as wide as the number and the peso sign sits
                        against it. A fixed width right-aligns the digits but
                        strands the sign at the far end of the box. `ch` is
                        exact here because the figures are tabular. */}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={text}
                      onChange={moneyChangeHandler(str => handleLocalChange(cat.id, str))}
                      placeholder="No limit"
                      aria-label={`${cat.name} monthly limit`}
                      style={{ width: text ? `${text.length + 0.5}ch` : '7.5ch' }}
                      className="shrink-0 bg-transparent text-right outline-none
                        text-sm font-semibold tabular-nums
                        text-slate-800 dark:text-white
                        placeholder:font-normal placeholder:text-slate-400 dark:placeholder:text-slate-600"
                      />
                    </span>
                  </label>
                )
              })}
            </div>
    </>
  )

  const saveButton = (
            <Button block onClick={saveAll} disabled={!hasPendingChanges || saving}>
              {saving
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                : 'Save changes'}
            </Button>
  )

  /* No line under the title. "Tap a category to set its monthly limit"
     described the old flow - tap a card, it becomes an editor - and the rows
     are fields now: you tap one and type. */
  if (asPage) {
    return (
      <SubPage title="Monthly limits" onBack={close}>
        <div className="pt-4">{listBody}</div>
        <div className="px-5 -mt-3">{saveButton}</div>
      </SubPage>
    )
  }

  return (
    /* The same z and the same 45% scrim the hand-rolled overlay drew, and the
       recessed slate surface it had: these rows are white cards, and on
       Sheet's default white panel they would be white on white.

       88vh goes through `maxHeight`, never a style object. An inline height
       outranks `html.web .sheet-panel`, which is the rule that makes this a
       centred modal on desktop - setting it by hand pins the desktop dialog
       to the bottom of the window. Asking for a height also docks the panel,
       which is what it did before: it was flush with the bottom edge. */
    <Sheet
      open={open}
      onClose={close}
      z={100}
      scrim={45}
      maxHeight="88vh"
      surface="bg-slate-50 dark:bg-[#0d1117]"
      title="Monthly budgets"
      titleAction={(
        <button onClick={close} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
          {hasPendingChanges ? 'Discard' : 'Done'}
        </button>
      )}
      footer={saveButton}
    >
      {/* -mx-5 cancels Sheet's gutter, and has to: `listBody` is the page's
          body as well, and its card carries its own mx-4.

          The line under the heading moves into the body rather than staying
          beside it - Sheet's title slot holds text only, so a second
          paragraph there would leak into the dialog's accessible name. */}
      <div className="-mx-5">
        <p className="px-5 text-xs text-slate-400 dark:text-slate-500">
          Tap a category to set its monthly limit
        </p>
        <div className="pt-4">{listBody}</div>
      </div>
    </Sheet>
  )
}

/** The desktop modal. Imported by src/web/pages/WebSettings.jsx. */
export function BudgetManagerSheet(props) {
  return <BudgetManager {...props} variant="sheet" />
}

/**
 * The mobile route at /settings/budgets - the limit editor.
 *
 * Reached from "Edit limits" on the Budget page, so back normally means back
 * to that page. The fallback is /budget rather than / for the case where this
 * URL was opened directly: this screen is part of the Budget page, and landing
 * on it from a deep link should leave you inside that, not on the dashboard.
 */
export function BudgetsPage() {
  const back = useBack('/budget')
  return <BudgetManager open onClose={back} variant="page" />
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
        /* The mapped icon, not the stored emoji. This list is for scanning,
           and every other list in the app shows the icon; the emoji is still
           what you EDIT, in the form sheet, which is where it belongs. */
        className="cat-tile w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
        style={{ '--cat-color': cat.color ?? '#64748b' }}
      >
        <CategoryGlyph cat={cat} size={20} emoji="🏷️" />
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
  /* No `closing` flag, no scroll lock and no local close(): Sheet owns the
     overlay, the panel, the grab handle, the scroll lock, Escape, the focus
     trap and the exit animation, and `open` is the only thing that decides
     any of it. */
  const [adding,  setAdding]  = useState(null)

  const presets      = activeTab === 'expense' ? EXPENSE_PRESETS : INFLOW_PRESETS
  const existingNames = new Set(
    (existingCategories ?? []).filter(c => c.type === activeTab).map(c => c.name)
  )

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

  return (
    /* z 120, because this opens from the category manager at 100 and has to
       sit above it, and the same 45% scrim it drew by hand. Sheet's default
       white / [#111820] panel is exactly the surface it already had, so no
       `surface` here.

       75vh through `maxHeight` rather than a max-h utility or a style
       object: that prop is what sets --sheet-max, and it docks the panel the
       way this one was docked. The subtitle moves into the body, since
       Sheet's title slot holds text only. */
    <Sheet
      open={open}
      onClose={onClose}
      z={120}
      scrim={45}
      maxHeight="75vh"
      title="Add from Presets"
      titleAction={(
        <button onClick={onClose} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
          Done
        </button>
      )}
    >
      <div className="pt-0.5">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {activeTab === 'expense' ? 'Expense' : 'Inflow'} suggestions — tap to add
        </p>

        <div className="flex flex-wrap gap-2 pt-4">
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
                {exists && <span className="ml-0.5"><IconTick size={11} /></span>}
                {isAdding && (
                  <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin ml-0.5" />
                )}
              </button>
            )
          })}
        </div>
        <div className="h-8" />
      </div>
    </Sheet>
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

/**
 * Category management: one implementation, two presentations.
 *
 * `variant="page"` is the mobile route at /settings/categories, with the
 * app's standard sub-page header. `variant="sheet"` is the modal the DESKTOP
 * settings uses - src/web/pages/WebSettings.jsx imports CategoryManagerSheet
 * and presents it over a two-pane layout, where a route would be wrong.
 *
 * A variant rather than two components, because what matters here is the
 * drag-to-reorder state and the local ordering held per tab while a drag is in
 * flight - duplicating that to get two shells would duplicate the only part
 * with any behaviour in it.
 *
 * The form and the presets browser stay SHEETS in both. On the page that is
 * the point: editing is the only thing that should interrupt you, so a sheet
 * over a page rather than a sheet over a sheet.
 */
function CategoryManager({ open, onClose, variant = 'sheet' }) {
  const asPage = variant === 'page'
  /* No `closing` flag and no scroll lock: the sheet variant is a <Sheet>,
     which owns the overlay, the panel, the grab handle, the scroll lock,
     Escape, the focus trap and the 240ms exit. The page never locked scroll
     anyway. */
  const [activeTab,      setActiveTab]      = useState('expense')
  const [formOpen,       setFormOpen]       = useState(false)
  const [editingCat,     setEditingCat]     = useState(null)
  const [formStartDelete, setFormStartDelete] = useState(false)
  const [browseOpen,     setBrowseOpen]     = useState(false)
  const isDraggingRef = useRef(false)
  // Local ordered list used during and after drag (separate per tab)
  const [localExpense,   setLocalExpense]   = useState([])
  const [localInflow,    setLocalInflow]    = useState([])

  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  /* No transactions query any more. This screen read EVERY transaction in the
     database - a live query that re-ran on each new expense - to draw the
     budget bar that used to sit at the top. The bar has gone to the pages
     that own it, and the read went with it. */

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

  /* No local close() any more. It existed to run the exit animation before
     telling the parent; the Done button and the scrim both call `onClose`
     directly now, and Sheet plays the exit off `open`. */

  function openAdd() { setEditingCat(null); setFormStartDelete(false); setTimeout(() => setFormOpen(true), 0) }
  function openEdit(cat) { setEditingCat(cat); setFormStartDelete(false); setTimeout(() => setFormOpen(true), 0) }
  function openDelete(cat) { setEditingCat(cat); setFormStartDelete(true); setTimeout(() => setFormOpen(true), 0) }


  /* Only the page may bail out on !open. The sheet has to keep rendering
     while it slides away, and Sheet stops itself once the exit is over -
     returning null here would unmount it mid-slide. */
  if (asPage && !open) return null

  /* The tab switcher and the list are shared; only the shell differs. The
     page lets the document scroll, the sheet scrolls inside its panel. */
  /* The app's segmented control, not a pair of filled pills.
 
     It was two buttons with the active one solid bg-primary, plus arrow
     glyphs - which is a third segmented-control idiom in one app, after the
     trackless pill on Insights/Bills/Debts and the slate trough this replaced
     elsewhere. Same control everywhere now.
 
     The counts move into SegTabs' own count slot, and the arrows go: "Expense"
     and "Inflow" already say which direction the money moves. */
  const tabBar = (
    <SegTabs
      tabs={[
        { value: 'expense', label: 'Expense', count: expenseCats.length },
        { value: 'inflow',  label: 'Inflow',  count: inflowCats.length  },
      ]}
      value={activeTab}
      onChange={setActiveTab}
    />
  )

  const listBody = (
    <>
              {/* No budget summary here. This screen is for naming, ordering
                  and colouring categories; the month's budget total belongs
                  to the Budget page and to Monthly budgets, which both show
                  it already. Three copies of one figure is two too many. */}

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
                {/* Solid, like the other ten primary buttons in the app.

                    This was a tinted outline - accent text on a 7% accent
                    wash inside an accent border - which existed nowhere else:
                    the count is ten solid to two tinted, and the other tinted
                    one is the template button below, fixed at the same time.
                    It also measured 2.85:1 in light mode, because accent text
                    on a near-white wash is the same problem .accent-ink
                    exists for.

                    "Add category", not "Add expense Category". The tab
                    directly above says Expense or Inflow, and a button that
                    repeats the thing sitting above it is the house style of
                    forms, not of iOS. */}
                <Button block onClick={openAdd}>
                  <IconPlus size={15} strokeWidth="2.5" />
                  Add category
                </Button>
                <button
                  onClick={() => setBrowseOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-full text-sm font-semibold
                    text-slate-500 dark:text-slate-400
                    bg-slate-100 dark:bg-white/[0.05]
                    border border-slate-200 dark:border-white/[0.07]
                    active:scale-[0.98] transition-transform duration-100"
                >
                  Browse Presets
                </button>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mt-1">
                  Hold a category to quickly delete it
                </p>
              </div>
    </>
  )

  const nestedSheets = (
    <>
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

  if (asPage) {
    return (
      <>
        <SubPage
          title="Categories"
          action={(
            <IconButton label="New category" onClick={openAdd}>
              <IconPlus />
            </IconButton>
          )}
        >
          <div className="px-5 pb-1">{tabBar}</div>
          <div className="pt-4">{listBody}</div>
        </SubPage>
        {nestedSheets}
      </>
    )
  }

  return (
    <>
      {/* The same z and the same 45% scrim the hand-rolled overlay drew, and
          the recessed slate surface it had: the list is a white card, and on
          Sheet's default white panel it would be white on white.

          92vh through `maxHeight` rather than the old max-h utility - that
          prop is what sets --sheet-max, and an inline height would outrank
          `html.web .sheet-panel` and strand the desktop modal at the bottom
          of the window. It also docks the panel, which is where this one
          already sat. */}
      <Sheet
        open={open}
        onClose={onClose}
        z={100}
        scrim={45}
        maxHeight="92vh"
        surface="bg-slate-50 dark:bg-[#0d1117]"
        title="Manage categories"
        titleAction={(
          <button onClick={onClose} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
            Done
          </button>
        )}
      >
        {/* -mx-5 cancels Sheet's gutter, and has to: `listBody` is the page's
            body as well, SubPage draws no gutter of its own, and every block
            inside carries its own mx-5 or px-5. The tabs come with it and
            get the gutter back, since they sat at the panel's edges too.

            They scroll with the list now rather than sitting in a sticky
            header: the header belongs to Sheet, and the body is a
            FadeScroller whose mask would fade a sticky child as you scrolled
            past it. */}
        <div className="-mx-5">
          <div className="px-5 pb-7">{tabBar}</div>
          {listBody}
        </div>
      </Sheet>
      {nestedSheets}
    </>
  )
}

/** The desktop modal. Imported by src/web/pages/WebSettings.jsx. */
export function CategoryManagerSheet(props) {
  return <CategoryManager {...props} variant="sheet" />
}

/** The mobile route at /settings/categories. */
export function CategoriesPage() {
  const navigate = useNavigate()
  return <CategoryManager open onClose={() => navigate(-1)} variant="page" />
}

// ── Category form sheet ────────────────────────────────────────────────────────

function CategoryFormSheet({ open, onClose, category, defaultType, allCategories, startAtDelete, zIndex = 100 }) {
  const { showToast } = useToast()
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
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // Hydrates the form when the sheet opens. Listing every field would
    // re-run the effect that SETS them and clobber edits in progress;
    // `open` plus the record id is what actually means "something else is
    // being edited now".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category?.id, startAtDelete])

  async function runDeleteCheck() {
    const count = await db.transactions.where('category').equals(category.name).count()
    setTxCount(count)
    setMode(count > 0 ? 'reassign' : 'confirm-delete')
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
      // Without this the next pull re-adds the category from Supabase.
      await deleteCategoryRemote(category.name, category.type)
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
      await deleteCategoryRemote(category.name, category.type)
      close()
    } catch (e) {
      console.error('[CategoryForm] reassign+delete failed:', e)
      showToast('Failed to delete category', 'error')
      setSaving(false)
    }
  }

  const sheetTitle = {
    form:             isEdit ? 'Edit Category' : 'New Category',
    'confirm-delete': 'Delete category',
    reassign:         'Reassign transactions',
  }[mode]

  /* One action row per mode, pinned by Sheet under the scrolling body.

     They used to be the last thing inside each mode's block, so on a short
     screen you scrolled past the icon grid to reach Save. And the header was
     a sticky opaque bar with a border under it, which clipped the rows
     passing beneath it on a hard straight line - the thing FadeScroller
     exists to avoid, and which every sheet on the primitive now gets. */
  const footer = {
    form: (
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button className="flex-[2]" onClick={handleSave} loading={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add category'}
        </Button>
      </div>
    ),
    'confirm-delete': (
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => setMode('form')} disabled={saving}>
          Keep it
        </Button>
        <Button variant="danger" className="flex-[2]" onClick={handleDeleteDirect} loading={saving}>
          {saving ? 'Deleting…' : 'Delete category'}
        </Button>
      </div>
    ),
    reassign: (
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => setMode('form')} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="danger"
          className="flex-[2]"
          onClick={handleReassignAndDelete}
          loading={saving}
          disabled={!reassignTarget || reassignOptions.length === 0}
        >
          {saving ? 'Moving…' : 'Reassign & delete'}
        </Button>
      </div>
    ),
  }[mode]

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={zIndex}
      dismissible={!saving}
      title={sheetTitle}
      titleAction={mode === 'form' && isEdit ? (
        <Button variant="dangerTint" size="sm" className="px-4" onClick={runDeleteCheck}>
          Delete
        </Button>
      ) : null}
      footer={footer}
    >
      <div>

        {/* Form mode */}
        {mode === 'form' && (
          <div className="pt-5 pb-2 flex flex-col gap-5">
            <Field
              label="Category name"
              value={name}
              onChange={e => { setName(e.target.value); setNameError(false) }}
              placeholder="e.g. Groceries"
              maxLength={30}
              error={nameError ? 'Name is required' : null}
            />

            <div>
              <SectionLabel>Type</SectionLabel>
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
                        'py-3 rounded-full text-sm font-semibold transition-all duration-75 active:scale-[0.97]',
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
              <SectionLabel>Icon</SectionLabel>
              {/* Worth saying out loud, because the preview below now shows
                  the real thing and the two will disagree: a preset name has
                  a drawn icon, and the emoji is what a custom name gets. */}
              {CATEGORY_ICON_BY_NAME({ name: name.trim() }) && (
                <p className="-mt-1 mb-2 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                  “{name.trim()}” has its own icon, so it keeps that whichever
                  you pick here.
                </p>
              )}
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
              {/* The same rail the card designer uses. This was eight rounded
                  rectangles stretched to fill the row and ticked with a white
                  check - the same job as the card's colour row, drawn as a
                  different object two screens away. */}
              <SectionLabel>Color</SectionLabel>
              <SwatchRail
                colors={CAT_COLORS}
                value={color}
                onChange={setColor}
                ariaLabel="Category colour"
              />
            </div>

            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl
              bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]">
              {/* The glyph this category will really have.

                  CategoryGlyph reads the NAME: a preset name resolves to an
                  SVG and anything else keeps the emoji. Printing the emoji
                  here made the preview disagree with every other screen -
                  type "Food" and the preview showed a box while the
                  transaction list showed a fork and knife. Passing the draft
                  as a category gets both cases right, including the one where
                  the emoji is the answer. */}
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: color + '22' }}>
                <CategoryGlyph cat={{ name: name.trim(), color, icon }} size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">{name || 'Category Name'}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {type === 'expense' ? 'Expense' : 'Inflow'}
                  {parseMoney(budget) > 0 && ` · ${fmt(parseMoney(budget))} / mo`}
                </p>
              </div>
            </div>

            <Field
              label="Monthly budget"
              type="text"
              inputMode="decimal"
              value={budget === '0' ? '' : budget}
              onChange={moneyChangeHandler(setBudget)}
              placeholder="Optional — 0 means no budget"
              hint={parseMoney(budget) > 0
                ? `Spending alerts when you approach ${fmt(parseMoney(budget))} this month`
                : null}
            />

          </div>
        )}

        {/* Confirm delete */}
        {mode === 'confirm-delete' && (
          <div className="pt-6 pb-2">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: (category?.color ?? '#2D9DFF') + '22' }}>
                <CategoryGlyph cat={category} size={24} />
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
          </div>
        )}

        {/* Reassign mode */}
        {mode === 'reassign' && (
          <div className="pt-5 pb-2">
            <div className="flex items-start gap-3 px-4 py-3.5 mb-5 rounded-2xl
              bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
              <span className="shrink-0 mt-0.5 text-amber-500 dark:text-amber-400"><IconWarning size={20} /></span>
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
                <span className="shrink-0"><CategoryGlyph cat={category} size={16} /></span>
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

            <SectionLabel>Reassign to</SectionLabel>
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
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: (cat.color ?? '#2D9DFF') + '22' }}>
                      <CategoryGlyph cat={cat} size={18} />
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

          </div>
        )}
      </div>
    </Sheet>
  )
}

// ── Template row ───────────────────────────────────────────────────────────────

const TMPL_TYPE_STYLE = {
  expense:  { bg: 'bg-red-50 dark:bg-red-500/10',      text: 'text-red-500 dark:text-red-400',      label: 'Expense'  },
  inflow:   { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', label: 'Inflow' },
  transfer: { bg: 'bg-blue-50 dark:bg-blue-500/10',    text: 'text-blue-600 dark:text-blue-400',    label: 'Transfer' },
}

const _tFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const tfmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _tFmt.format(Math.abs(n))
}

function TemplateRow({ tpl, cat, onTap, onLongPressDelete }) {
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
        {tpl.type === 'transfer'
                        ? <IconTransferUI size={16} />
                        : <CategoryGlyph cat={cat} size={16} emoji="⚡" />}
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
  /* No `closing` flag and no scroll lock: this is a <Sheet>, which owns the
     overlay, the panel, the grab handle, the scroll lock, Escape, the focus
     trap and the 240ms exit, and `open` is the only thing that decides any
     of it. */
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
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // Hydrates the form when the sheet opens. Listing every field would
    // re-run the effect that SETS them and clobber edits in progress;
    // `open` plus the record id is what actually means "something else is
    // being edited now".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id])

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
      onClose()
    } catch (e) {
      console.error('[TemplateForm] save failed:', e)
      showToast('Failed to save template', 'error')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!isEdit) return
    setSaving(true)
    try {
      await db.templates.delete(template.id)
      await deleteTemplateRemote(template.id, template.name)
      onClose()
    }
    catch (e) {
      console.error('[TemplateForm] delete failed:', e)
      showToast('Failed to delete template', 'error')
      setSaving(false)
    }
  }

  return (
    <>
      {/* The same z 120 it drew by hand - it opens from the template manager
          at 110 and has to sit above it - and the same 45% scrim. Sheet's
          default white / [#111820] panel is exactly the surface this had, so
          no `surface` here.

          92vh goes through `maxHeight` rather than the old max-h utility:
          that prop is what sets --sheet-max, and an inline height would
          outrank `html.web .sheet-panel`, which is the rule that makes this a
          centred modal on desktop. Asking for a height also docks the panel,
          which is where this one already sat.

          The action row moves out of the scrolling body into Sheet's pinned
          footer, so a form long enough to scroll cannot push Save out of
          reach. */}
      <Sheet
        open={open}
        onClose={onClose}
        z={120}
        scrim={45}
        maxHeight="92vh"
        /* The `if (saving) return` the old local close() opened with: a sheet
           that is writing a template must not be dismissed out from under the
           write. */
        dismissible={!saving}
        title={isEdit ? 'Edit Template' : 'New Template'}
        titleAction={(
          <div className="flex items-center gap-3">
            {isEdit && (
              <button onClick={handleDelete} disabled={saving}
                className="text-xs font-semibold text-red-500 dark:text-red-400 px-3 py-1.5 rounded-xl
                  bg-red-50 dark:bg-red-500/10 active:bg-red-100 transition-colors">
                Delete
              </button>
            )}
            <button onClick={onClose} disabled={saving}
              className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
              Cancel
            </button>
          </div>
        )}
        footer={(
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={onClose} disabled={saving}
            >
              Cancel
            </Button>
            <Button className="flex-[2]" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add Template'}
            </Button>
          </div>
        )}
      >
          <div className="pt-5 pb-2 flex flex-col gap-4">
            {/* Name */}
            <div>
              <SectionLabel>Template name</SectionLabel>
              <input value={name} onChange={e => { setName(e.target.value); setNameError(false) }}
                placeholder="e.g. Jeep fare" maxLength={40}
                className={inputClass(nameError)} />
              {nameError && <p className="text-xs text-red-500 mt-1.5 px-1">Name is required</p>}
            </div>

            {/* Type */}
            <div>
              <SectionLabel>Type</SectionLabel>
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
              <SectionLabel>Default amount</SectionLabel>
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
              <SectionLabel>Default note <span className="font-normal text-slate-400 normal-case">(optional)</span></SectionLabel>
              <input value={desc} onChange={e => setDesc(e.target.value)}
                placeholder="e.g. Morning commute" maxLength={100}
                className={inputClass()} />
            </div>

            {/* Category (expense/inflow only) */}
            {type !== 'transfer' && (
              <div>
                <SectionLabel>Category</SectionLabel>
                <button onClick={() => setShowCat(true)}
                  className="w-full flex items-center gap-3 px-4 h-[48px] rounded-2xl text-left
                    bg-white dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/[0.09]
                    active:bg-slate-50 dark:active:bg-white/[0.10] transition-colors">
                  <span className="leading-none"><CategoryGlyph cat={category} size={20} emoji="🏷️" /></span>
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
                <SectionLabel>Account</SectionLabel>
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
                  <SectionLabel>From account</SectionLabel>
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
                  <SectionLabel>To account</SectionLabel>
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

          </div>
      </Sheet>

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

/**
 * Quick templates.
 *
 * `variant="page"` is the mobile route at /settings/templates, with the
 * app's back disc; `variant="sheet"` is the desktop modal that
 * src/web/pages/WebSettings.jsx still uses. Same split as Categories and
 * Monthly budgets, and for the same reason: editing a template opens a form
 * sheet, and a sheet on top of a sheet is a stack the phone has no way to
 * explain. On a page the form is the only sheet on screen.
 */
function TemplateManager({ open, onClose, variant = 'sheet' }) {
  const asPage = variant === 'page'
  const { showToast } = useToast()
  /* No `closing` flag and no scroll lock: the sheet variant is a <Sheet>,
     which owns the overlay, the panel, the grab handle, the scroll lock,
     Escape, the focus trap and the 240ms exit. The page never locked scroll
     anyway. */
  const [formOpen,   setFormOpen]   = useState(false)
  const [editingTpl, setEditingTpl] = useState(null)

  const templates  = useLiveQuery(() => db.templates.toArray(), [], [])
  const accounts   = useLiveQuery(() => db.accounts.toArray(),  [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])

  const catMap = useMemo(() =>
    Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])

  function openAdd()       { setEditingTpl(null); setTimeout(() => setFormOpen(true), 0) }
  function openEdit(tpl)   { setEditingTpl(tpl);  setTimeout(() => setFormOpen(true), 0) }
  async function deleteTpl(tpl) {
    try {
      await db.templates.delete(tpl.id)
      await deleteTemplateRemote(tpl.id, tpl.name)
    } catch (e) {
      console.error('[TemplateManager] delete failed:', e)
      showToast('Failed to delete template', 'error')
    }
  }

  /* The list and the add button are shared; only the shell differs. The page
     lets the document scroll, the sheet scrolls inside its panel. */
  const listBody = (
    <>
      {(templates ?? []).length === 0 ? (
        <div className="py-14 text-center px-8">
          <p className="mb-3 flex justify-center text-slate-400 dark:text-slate-500"><IconTemplate size={30} /></p>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No templates yet</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Add one below, or toggle &ldquo;Save as template&rdquo; when confirming any transaction
          </p>
        </div>
      ) : (
        <div className="mx-5 rounded-2xl overflow-hidden bg-white border border-slate-100
          dark:bg-white/[0.04] dark:border-white/[0.07] shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none mb-3">
          {(templates ?? []).map((tpl, i) => (
            <div key={tpl.id}>
              <TemplateRow
                tpl={tpl}
                cat={catMap[tpl.category]}
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
        <Button block onClick={openAdd}>
          <IconPlus size={15} strokeWidth="2.5" />
          Add Template
        </Button>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mt-2.5">
          Hold a template to quickly delete it
        </p>
      </div>
      <div className="h-8 shrink-0" />
    </>
  )

  const formSheet = (
    <TemplateFormSheet
      open={formOpen}
      onClose={() => setFormOpen(false)}
      template={editingTpl}
      allAccounts={accounts ?? []}
      allCategories={categories ?? []}
    />
  )

  if (asPage) {
    return (
      <>
        <SubPage
          title="Quick templates"
          action={(
            <IconButton label="New template" onClick={openAdd}>
              <IconPlus />
            </IconButton>
          )}
        >
          <div className="pt-4">{listBody}</div>
        </SubPage>
        {formSheet}
      </>
    )
  }

  return (
    <>
      {/* The same z 110 and the same 45% scrim the hand-rolled overlay drew,
          and the recessed slate surface it had: the list is a white card, and
          on Sheet's default white panel it would be white on white.

          92vh through `maxHeight` rather than the old max-h utility - that
          prop is what sets --sheet-max, and an inline height would outrank
          `html.web .sheet-panel` and strand the desktop modal at the bottom
          of the window. It also docks the panel, which is where this one
          already sat, and the docked bottom pad is Sheet's now rather than
          the max(24px, safe-area) this set by hand. */}
      <Sheet
        open={open}
        onClose={onClose}
        z={110}
        scrim={45}
        maxHeight="92vh"
        surface="bg-slate-50 dark:bg-[#0d1117]"
        title="Quick templates"
        titleAction={(
          <button onClick={onClose} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
            Done
          </button>
        )}
      >
        {/* -mx-5 cancels Sheet's gutter, and has to: `listBody` is the page's
            body as well, SubPage draws no gutter of its own, and every block
            inside carries its own mx-5 or px-5. */}
        <div className="-mx-5 pt-4">{listBody}</div>
      </Sheet>
      {formSheet}
    </>
  )
}

/** The desktop modal. Imported by src/web/pages/WebSettings.jsx. */
export function TemplateManagerSheet(props) {
  return <TemplateManager {...props} variant="sheet" />
}

/** The mobile route at /settings/templates. */
export function TemplatesPage() {
  const navigate = useNavigate()
  return <TemplateManager open onClose={() => navigate(-1)} variant="page" />
}


// ── Accent color sheet ────────────────────────────────────────────────────────

export function AccentColorSheet({ open, onClose, accentColor, setAccentColor }) {
  /* No `closing` flag and no scroll lock: Sheet owns the overlay, the panel,
     the grab handle, the scroll lock, Escape, the focus trap and the 240ms
     exit. */
  return (
    /* The same z 100 and the same 45% scrim it drew by hand, and Sheet's
       default white / [#111820] panel is exactly the surface it already had.

       No maxHeight: this panel never asked for a height, so it keeps floating
       while the eight swatches fit and lets Sheet dock it when they do not.
       Its hand-set max(32px, safe-area) bottom pad goes with the docking
       decision - that padding is Sheet's now. */
    <Sheet
      open={open}
      onClose={onClose}
      z={100}
      scrim={45}
      title="Accent colour"
      titleAction={(
        <button onClick={onClose} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
          Done
        </button>
      )}
    >
        <div className="pt-1">
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
    </Sheet>
  )
}

// ── Policy sheet ──────────────────────────────────────────────────────────────

const PRIVACY_SECTIONS = [
  { h: null,                  b: 'Last updated: May 2026' },
  { h: 'What We Store',       b: 'Your financial data — transactions, accounts, categories, and budgets — is stored locally on your device using IndexedDB. Nothing leaves your device unless you explicitly enable cloud sync.' },
  { h: 'Cloud sync',          b: 'If you sign in with Google and enable Supabase sync, your data is stored in Supabase under your own credentials. The developer has no access to your cloud data.' },
  { h: 'What We Don\'t Collect', b: 'We collect no analytics, usage telemetry, advertising identifiers, or personal information beyond what you voluntarily enter in the app.' },
  { h: 'How Data Is Used',    b: 'All data exists solely to provide the app\'s budgeting and tracking functionality. Your data is never sold, shared, or transmitted to any third party.' },
  { h: 'Data Deletion',       b: 'You can permanently delete all local data at any time via Settings → Reset app. To remove cloud-synced data, contact us at jamesandgen111@gmail.com and we will delete your data from our servers.' },
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

export function PolicySheet({ open, type, onClose }) {
  /* No `closing` flag and no scroll lock: Sheet owns the overlay, the panel,
     the grab handle, the scroll lock, Escape, the focus trap and the 240ms
     exit.

     Nothing here guards on `type` either, even though the caller nulls it in
     the same breath as `open` - Sheet freezes the title and the body it was
     showing for the length of the exit, so the sheet slides away still
     reading "Privacy policy" rather than flipping to the terms on the way
     out. */
  const title    = type === 'privacy' ? 'Privacy policy' : 'Terms of use'
  const badge    = type === 'privacy' ? 'Privacy' : 'Legal'
  const sections = type === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS
  const intro    = sections.find(s => s.h === null)
  const body     = sections.filter(s => s.h !== null)

  return (
    /* The same z 100 and the same 45% scrim the hand-rolled overlay drew, and
       Sheet's default white / [#111820] panel is the surface it already had.

       88vh through `maxHeight` rather than the old max-h utility: that prop is
       what sets --sheet-max, and an inline height would outrank
       `html.web .sheet-panel`, the rule that makes this a centred modal on
       desktop. It docks the panel too, which is where this one already sat,
       and the docked bottom pad replaces the max(32px, safe-area) it set by
       hand.

       The heading drops from 22px bold to Sheet's title, which is what makes
       it the dialog's accessible name via aria-labelledby - and the Privacy /
       Legal pill moves down into the body with it, because Sheet's title slot
       holds text only: a pill inside the h3 becomes part of that name. */
    <Sheet
      open={open}
      onClose={onClose}
      z={100}
      scrim={45}
      maxHeight="88vh"
      title={title}
      titleAction={(
        <button
          onClick={onClose}
          className="shrink-0 text-xs font-semibold
            text-slate-600 dark:text-slate-300
            px-3 py-1.5 rounded-xl
            bg-slate-100 dark:bg-white/[0.08]
            active:bg-slate-200 dark:active:bg-white/[0.14] transition-colors"
        >
          Done
        </button>
      )}
    >
        <div className="pt-2">
          <span className="inline-block text-xs font-bold
            px-2 py-0.5 rounded-full mb-4
            bg-primary/10 dark:bg-primary/20 text-primary">
            {badge}
          </span>

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
    </Sheet>
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
  const { theme, toggleTheme, accentColor } = useTheme()
  const { showToast }          = useToast()
  const [restoreOpen, setRestoreOpen] = useState(false)
  const { user, signOut }      = useAuth()
  const { status: syncStatus, runSync } = useSyncManager()

  const [profileOpen,  setProfileOpen]  = useState(false)
  const [resetOpen,    setResetOpen]    = useState(false)
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
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 accent-ink">
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
            label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            sublabel={`Currently ${theme}`}
            right={<ToggleSwitch on={theme === 'dark'} />}
            onTap={toggleTheme}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="violet"><IconPalette /></RowIcon>}
            label="Accent colour"
            sublabel={ACCENT_COLORS.find(c => c.hex === accentColor)?.name ?? 'Custom'}
            right={
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
                <IconChevronRight size={14} strokeWidth="2" />
              </div>
            }
            onTap={() => navigate('/settings/accent')}
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
            label="Skip confirmation"
            sublabel="Save instantly, no review step"
            right={<ToggleSwitch on={skipConfirm} />}
            onTap={() => db.meta.put({ key: 'skipConfirm', value: !skipConfirm })}
          />
          <RowDivider />
          {/* Without this, choosing "switch to mobile" in the desktop sidebar
              was a one-way door: the preference is stored per-device in
              localStorage, and nothing in this UI could clear it. */}
          <SettingsRow
            iconEl={
              <RowIcon color="blue">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="13" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </RowIcon>
            }
            label="Desktop layout"
            sublabel={
              getViewPreference() === 'mobile'
                ? 'Forced to mobile on this device — tap to allow desktop'
                : 'Wide screens use the desktop layout automatically'
            }
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => setViewMode(getViewPreference() === 'mobile' ? 'auto' : 'desktop')}
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
            /* No sublabel: "Categories" is the whole of it. */
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => navigate('/settings/categories')}
          />
          <RowDivider />
          {/* Straight to the Budget page, which is where the month's budget
              lives. This row used to open a SECOND screen about budgets - the
              limit editor - so the app had two budget destinations that did
              not know about each other: one with the gauge, reached from the
              dashboard card, and one with the limits, reached from here.

              Now there is one destination and the editor hangs off it, behind
              "Edit limits". /settings/budgets is still a route - that is where
              the button goes, and the desktop settings still opens the same
              manager as a modal. */}
          <SettingsRow
            iconEl={<RowIcon color="green"><IconTarget /></RowIcon>}
            label="Budget"
            sublabel="This month, and the limits behind it"
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => navigate('/budget')}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="amber"><IconTemplate size={16} /></RowIcon>}
            label="Quick templates"
            sublabel="One-tap repeat transactions"
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => navigate('/settings/templates')}
          />
        </SectionCard>
      </div>

      {/* ══ 5. DATA & REPORTS ══ */}
      <div className="mb-8">
        <SectionHeader>Data & Reports</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="green"><IconDownload /></RowIcon>}
            label="Export transactions (CSV)"
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
            label="Full backup (JSON)"
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
          <SettingsRow
            iconEl={<RowIcon color="amber"><IconUpload /></RowIcon>}
            label="Restore backup (JSON)"
            sublabel="Replace this device's data with a backup file"
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => setRestoreOpen(true)}
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
              <IconButton
                label="Download monthly report"
                variant="primary"
                size="lg"
                onClick={handleGenerateReport} disabled={generatingReport}
              >
                {generatingReport
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <IconDownload />}
              </IconButton>
            </div>
          </div>
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
                <p className="text-sm font-semibold text-slate-800 dark:text-white">Cloud sync</p>
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
              label="Enable cloud sync"
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
      {/* Was a hand-rolled centred card. It stays centred on desktop - that is
          what `html.web .sheet-panel` does to every sheet - so the geometry is
          the primitive's now, and only the z-index, the scrim depth and the
          not-while-signing-out guard carry across by hand.

          Rendered unconditionally rather than behind `showSignOutConfirm &&`:
          the flag going false is what starts the exit, and a parent that
          unmounts on that same render never lets the animation play. */}
      <Sheet
        open={showSignOutConfirm}
        onClose={() => setShowSignOutConfirm(false)}
        z={300}
        scrim={60}
        /* It had no grab handle as a centred card, and gains none here. */
        handle={false}
        /* The scrim already refused taps while the sign-out was in flight, the
           same way both buttons are disabled; Escape now refuses too. */
        dismissible={!loggingOut}
        /* The heading stays in the body, centred under the icon, so the dialog
           is named here rather than through Sheet's title slot. */
        ariaLabel="Sign out"
        footer={(
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => setShowSignOutConfirm(false)} disabled={loggingOut}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={async () => { await handleLogout(); setShowSignOutConfirm(false) }} disabled={loggingOut}
            >
              {loggingOut ? 'Signing out…' : 'Continue'}
            </Button>
          </div>
        )}
      >
        {/* pt-6 for the old card's p-6 top edge: with no handle and no title
            there is nothing above the icon to hold it off the panel edge. */}
        <div className="pt-6 space-y-4">
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
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Sign out?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Your data stays on this device. You can sign back in anytime to sync again.
            </p>
          </div>
        </div>
      </Sheet>

      {/* Export CSV confirm

          Rendered unconditionally, like the sign-out confirm above: the flag
          going false is what starts the exit, and a parent that unmounts on
          that same render never lets the animation play. */}
      <Sheet
        open={showExportConfirm}
        onClose={() => setShowExportConfirm(false)}
        z={300}
        scrim={60}
        /* It had no grab handle as a centred card, and gains none here. */
        handle={false}
        /* The heading stays in the body, centred under the icon, so the
           dialog is named here rather than through Sheet's title slot. */
        ariaLabel="Export transactions"
        footer={(
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => setShowExportConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => { setShowExportConfirm(false); handleExport() }}
            >
              Download
            </Button>
          </div>
        )}
      >
        {/* pt-6 for the old card's p-6 top edge: with no handle and no title
            there is nothing above the icon to hold it off the panel edge. */}
        <div className="pt-6 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-500/15
            flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
            <IconDownload />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Export transactions?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This will download all {txCount ?? 0} transactions as a CSV file.
            </p>
          </div>
        </div>
      </Sheet>

      {/* Full Backup confirm

          Rendered unconditionally, like the sign-out confirm above: the flag
          going false is what starts the exit, and a parent that unmounts on
          that same render never lets the animation play. */}
      <Sheet
        open={showBackupConfirm}
        onClose={() => setShowBackupConfirm(false)}
        z={300}
        scrim={60}
        /* It had no grab handle as a centred card, and gains none here. */
        handle={false}
        /* The heading stays in the body, centred under the icon, so the
           dialog is named here rather than through Sheet's title slot. */
        ariaLabel="Download full backup"
        footer={(
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => setShowBackupConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => { setShowBackupConfirm(false); handleFullBackup() }}
            >
              Download
            </Button>
          </div>
        )}
      >
        {/* pt-6 for the old card's p-6 top edge: with no handle and no title
            there is nothing above the icon to hold it off the panel edge. */}
        <div className="pt-6 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-100 dark:bg-teal-500/15
            flex items-center justify-center mx-auto text-teal-600 dark:text-teal-400">
            <IconDownload />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Download full backup?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Exports all accounts, categories, transactions, templates, recurring, and debts as a JSON file.
            </p>
          </div>
        </div>
      </Sheet>

      {/* ══ 8. DANGER ZONE ══ */}
      <div className="mb-8">
        <SectionHeader>Danger zone</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="red"><IconTrash /></RowIcon>}
            label="Reset app"
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
            sublabel="Privacy policy & terms of use"
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => setLegalOpen(true)}
          />
        </SectionCard>
      </div>

      {/* Legal picker sheet.

          ariaLabel rather than title: this panel's heading is a small caption,
          not Sheet's 17px title, and promoting it would make the quietest
          sheet in the app shout. */}
      <Sheet
        open={legalOpen}
        onClose={() => setLegalOpen(false)}
        z={100}
        scrim={45}
        ariaLabel="Legal"
      >
        <div className="pb-1">
          <SectionLabel inset="none" gap="loose">Legal</SectionLabel>
          <div className="flex flex-col gap-2">
                <button
                  onClick={() => { setLegalOpen(false); setTimeout(() => setPolicyOpen('privacy'), 60) }}
                  className="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left
                    bg-slate-50 dark:bg-white/[0.04]
                    active:bg-slate-100 dark:active:bg-white/[0.08] transition-colors"
                >
                  <RowIcon color="slate"><IconFileText /></RowIcon>
                  <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-white">Privacy policy</span>
                  <span className="text-slate-300 dark:text-slate-600"><IconChevronRight size={14} strokeWidth="2" /></span>
                </button>
                <button
                  onClick={() => { setLegalOpen(false); setTimeout(() => setPolicyOpen('terms'), 60) }}
                  className="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left
                    bg-slate-50 dark:bg-white/[0.04]
                    active:bg-slate-100 dark:active:bg-white/[0.08] transition-colors"
                >
                  <RowIcon color="slate"><IconInfo /></RowIcon>
            <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-white">Terms of use</span>
            <span className="text-slate-300 dark:text-slate-600"><IconChevronRight size={14} strokeWidth="2" /></span>
          </button>
          </div>
        </div>
      </Sheet>

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
      <RestoreBackupSheet open={restoreOpen} onClose={() => setRestoreOpen(false)} />
      <ResetConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
      />
      <PolicySheet
        open={!!policyOpen}
        type={policyOpen}
        onClose={() => setPolicyOpen(null)}
      />

    </div>
  )
}
