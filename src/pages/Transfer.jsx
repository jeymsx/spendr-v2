import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { applyBalanceEffect } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import NumericKeypad from '../components/NumericKeypad'
import AccountPickerSheet from '../components/AccountPickerSheet'
import TxConfirmSheet from '../components/TxConfirmSheet'
import TemplatePickerSheet from '../components/TemplatePickerSheet'

// ── Helpers ────────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

function fmtDisplay(str) {
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

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}
function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
function IconArrowDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  )
}
function IconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function fmtDateLabel(dateStr) {
  const today = new Date()
  const yest  = new Date(today); yest.setDate(today.getDate() - 1)
  const todayKey = today.toISOString().slice(0, 10)
  const yesterKey = yest.toISOString().slice(0, 10)
  if (dateStr === todayKey)   return 'Today'
  if (dateStr === yesterKey)  return 'Yesterday'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
}

function FieldButton({ onClick, error, label, left, center, right }) {
  return (
    <div>
      {label && (
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 px-1">
          {label}
        </p>
      )}
      <button
        onClick={onClick}
        className={[
          'w-full flex items-center gap-3 px-4 h-[56px] rounded-2xl text-left',
          'active:bg-slate-50 dark:active:bg-white/[0.08] transition-colors',
          'bg-white dark:bg-white/[0.05]',
          error
            ? 'border border-red-300 dark:border-red-500/40'
            : 'border border-slate-200/80 dark:border-white/[0.08]',
          'shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-none',
        ].join(' ')}
      >
        <span className="shrink-0">{left}</span>
        <span className="flex-1 min-w-0">{center}</span>
        {right && <span className="shrink-0 text-slate-300 dark:text-slate-600">{right}</span>}
      </button>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Transfer() {
  const navigate = useNavigate()

  const [amountStr,      setAmountStr]      = useState('0')
  const [feeStr,         setFeeStr]         = useState('0')
  const [date,           setDate]           = useState(() => new Date().toISOString().slice(0, 10))
  const [fromAccount,    setFromAccount]    = useState(null)
  const [toAccount,      setToAccount]      = useState(null)
  const [fromError,      setFromError]      = useState(false)
  const [toError,        setToError]        = useState(false)
  const [showFromSheet,  setShowFromSheet]  = useState(false)
  const [showToSheet,    setShowToSheet]    = useState(false)
  const [showConfirm,    setShowConfirm]    = useState(false)
  const [showTemplates,  setShowTemplates]  = useState(false)
  const [saving,         setSaving]         = useState(false)
  const dateInputRef = useRef(null)

  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])
  const skipConfirmMeta = useLiveQuery(() => db.meta.get('skipConfirm'), [], null)
  const skipConfirm = skipConfirmMeta?.value ?? false

  const amount = parseFloat(amountStr) || 0
  const fee    = parseFloat(feeStr)    || 0

  function onKey(key) {
    setAmountStr(prev => handleAmountKey(prev, key))
  }

  function onConfirmPress() {
    let err = false
    if (!fromAccount) { setFromError(true); err = true }
    if (!toAccount)   { setToError(true);   err = true }
    if (err) return
    if (skipConfirm) { handleSave(); return }
    setShowConfirm(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const now     = new Date()
      const [y,m,d] = date.split('-').map(Number)
      const txDate  = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds())
      const dateISO = txDate.toISOString()
      const updISO  = now.toISOString()

      // Ensure 'Transfer Fee' category exists before opening the transaction
      if (fee > 0) {
        const existing = await db.categories.where('name').equals('Transfer Fee').first()
        if (!existing) {
          await db.categories.add({ name: 'Transfer Fee', icon: '💸', color: '#64748b', type: 'expense', budget: 0 })
        }
      }

      await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
        await db.transactions.add({
          txId:        crypto.randomUUID(),
          type:        'transfer',
          amount,
          fromAccount: fromAccount.name,
          toAccount:   toAccount.name,
          date:        dateISO,
          synced:      false,
          updatedAt:   updISO,
        })
        await applyBalanceEffect({ type: 'transfer', amount, fromAccount: fromAccount.name, toAccount: toAccount.name })

        if (fee > 0) {
          await db.transactions.add({
            txId:        crypto.randomUUID(),
            type:        'expense',
            amount:      fee,
            description: `Transfer fee — ${fromAccount.name} → ${toAccount.name}`,
            category:    'Transfer Fee',
            account:     fromAccount.name,
            date:        dateISO,
            synced:      false,
            updatedAt:   updISO,
          })
          await applyBalanceEffect({ type: 'expense', amount: fee, account: fromAccount.name })
        }
      })
      if (templateData) {
        await db.templates.add({ ...templateData, createdAt: new Date().toISOString() })
      }
      navigate('/')
    } catch (e) {
      console.error('[Transfer] save failed:', e)
      setSaving(false)
    }
  }

  function applyTemplate(tpl) {
    if (tpl.amount) setAmountStr(String(tpl.amount))
    const from = (accounts ?? []).find(a => a.name === tpl.fromAccount)
    const to   = (accounts ?? []).find(a => a.name === tpl.toAccount)
    if (from) { setFromAccount(from); setFromError(false) }
    if (to)   { setToAccount(to);     setToError(false) }
  }

  const displayStr = fmtDisplay(amountStr)
  const fontSize   = displayStr.length <= 9 ? '3rem' : displayStr.length <= 12 ? '2.375rem' : '1.875rem'

  return (
    <div className="flex flex-col bg-transparent" style={{ height: 'calc(100dvh - 80px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))' }}>

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 pt-5 pb-2 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0
            bg-white dark:bg-white/[0.07] border border-slate-200/80 dark:border-white/[0.09]
            text-slate-600 dark:text-slate-300 shadow-sm
            active:scale-90 transition-transform duration-75"
        >
          <IconChevronLeft />
        </button>
        <h1 className="text-base font-semibold text-slate-800 dark:text-white flex-1">Transfer</h1>
        <button
          onClick={() => setShowTemplates(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold
            text-primary bg-primary/[0.08] dark:bg-primary/[0.12]
            border border-primary/20 active:scale-95 transition-transform duration-75"
        >
          <span>⚡</span> Templates
        </button>
      </header>

      {/* ── Amount display ── */}
      <div className="flex items-end justify-center gap-1.5 px-6 py-5 shrink-0">
        <span className="text-2xl font-semibold text-slate-400 dark:text-slate-500 mb-[3px]">₱</span>
        <span
          className="font-bold text-slate-900 dark:text-white tabular-nums transition-[font-size] duration-100"
          style={{ fontSize }}
        >
          {displayStr}
        </span>
      </div>

      {/* ── Account selectors + fee (scrollable) ── */}
      <div className="px-4 flex flex-col gap-3 flex-1 overflow-y-auto py-1">
        {/* From */}
        <FieldButton
          label="From"
          onClick={() => { setFromError(false); setShowFromSheet(true) }}
          error={fromError}
          left={
            <span
              className="w-6 h-6 rounded-lg shrink-0"
              style={{ backgroundColor: fromAccount?.color ?? '#cbd5e1' }}
            />
          }
          center={
            <div>
              <span className={`text-sm ${fromAccount ? 'font-medium text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                {fromAccount?.name ?? 'Select account'}
              </span>
              {fromError && !fromAccount && (
                <span className="ml-2 text-xs text-red-500">Required</span>
              )}
            </div>
          }
          right={
            fromAccount
              ? <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">{fmt(fromAccount.balance)}</span>
              : <IconChevronRight />
          }
        />

        {/* Arrow connector */}
        <div className="flex items-center gap-3 px-1">
          <div className="flex-1 h-px bg-slate-200 dark:bg-white/[0.08]" />
          <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center text-slate-400 dark:text-slate-500">
            <IconArrowDown />
          </div>
          <div className="flex-1 h-px bg-slate-200 dark:bg-white/[0.08]" />
        </div>

        {/* To */}
        <FieldButton
          label="To"
          onClick={() => { setToError(false); setShowToSheet(true) }}
          error={toError}
          left={
            <span
              className="w-6 h-6 rounded-lg shrink-0"
              style={{ backgroundColor: toAccount?.color ?? '#cbd5e1' }}
            />
          }
          center={
            <div>
              <span className={`text-sm ${toAccount ? 'font-medium text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                {toAccount?.name ?? 'Select account'}
              </span>
              {toError && !toAccount && (
                <span className="ml-2 text-xs text-red-500">Required</span>
              )}
            </div>
          }
          right={
            toAccount
              ? <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">{fmt(toAccount.balance)}</span>
              : <IconChevronRight />
          }
        />

        {/* same-account warning */}
        {fromAccount && toAccount && fromAccount.id === toAccount.id && (
          <p className="text-xs text-amber-600 dark:text-amber-400 text-center px-2">
            From and To accounts must be different.
          </p>
        )}

        {/* Date */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 px-1">
            Date
          </p>
          <button
            type="button"
            onClick={() => dateInputRef.current?.showPicker()}
            className="w-full flex items-center gap-3 px-4 h-[56px] rounded-2xl text-left
              bg-white dark:bg-white/[0.05]
              border border-slate-200/80 dark:border-white/[0.08]
              shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-none
              active:bg-slate-50 dark:active:bg-white/[0.08] transition-colors"
          >
            <span className="text-slate-400 dark:text-slate-500 shrink-0"><IconCalendar /></span>
            <span className="flex-1 text-sm font-medium text-slate-800 dark:text-white">
              {fmtDateLabel(date)}
            </span>
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => e.target.value && setDate(e.target.value)}
            className="sr-only"
          />
        </div>

        {/* Transfer fee */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 px-1">
            Transfer Fee <span className="normal-case font-normal text-slate-400 dark:text-slate-600">(optional)</span>
          </p>
          <div className="flex items-center gap-3 px-4 h-[56px] rounded-2xl
            bg-white dark:bg-white/[0.05]
            border border-slate-200/80 dark:border-white/[0.08]
            shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-none">
            <span className="text-slate-400 dark:text-slate-500 text-sm shrink-0">₱</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="0.00"
              value={feeStr === '0' ? '' : feeStr}
              onChange={e => setFeeStr(e.target.value || '0')}
              className="flex-1 bg-transparent text-sm text-slate-800 dark:text-white
                placeholder-slate-400 dark:placeholder-slate-500 outline-none min-w-0 tabular-nums"
            />
            {fee > 0 && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400 shrink-0 font-medium">
                Charged as expense
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Keypad (pinned to bottom) ── */}
      <div className="px-4 pt-3 pb-3 shrink-0 border-t border-slate-100 dark:border-white/[0.06] bg-white dark:bg-[#0d1117]">
        <NumericKeypad
          onKey={onKey}
          onConfirm={onConfirmPress}
          confirmLabel="Review Transfer"
          confirmDisabled={
            amount <= 0 ||
            !fromAccount ||
            !toAccount ||
            fromAccount?.id === toAccount?.id
          }
        />
      </div>

      {/* ── Sheets ── */}
      <AccountPickerSheet
        open={showFromSheet}
        onClose={() => setShowFromSheet(false)}
        accounts={accounts ?? []}
        selected={fromAccount}
        onSelect={acct => { setFromAccount(acct); setFromError(false) }}
        exclude={toAccount ? [toAccount.id] : []}
      />
      <AccountPickerSheet
        open={showToSheet}
        onClose={() => setShowToSheet(false)}
        accounts={accounts ?? []}
        selected={toAccount}
        onSelect={acct => { setToAccount(acct); setToError(false) }}
        exclude={fromAccount ? [fromAccount.id] : []}
      />
      <TxConfirmSheet
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleSave}
        saving={saving}
        type="transfer"
        amount={amount}
        fee={fee}
        fromAccount={fromAccount}
        toAccount={toAccount}
        onSaveTemplate={() => {}}
      />
      <TemplatePickerSheet
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        type="transfer"
        onSelect={applyTemplate}
      />
    </div>
  )
}
