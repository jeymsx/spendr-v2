import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { applyBalanceEffect } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import NumericKeypad from '../components/NumericKeypad'
import CategoryPickerSheet from '../components/CategoryPickerSheet'
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
  if (key === 'backspace') {
    return prev.length <= 1 ? '0' : prev.slice(0, -1)
  }
  if (key === '.') {
    return prev.includes('.') ? prev : prev + '.'
  }
  // digit
  if (prev === '0') return key
  const dotIdx = prev.indexOf('.')
  if (dotIdx !== -1 && prev.length - dotIdx > 2) return prev      // max 2 dp
  const intLen = dotIdx !== -1 ? dotIdx : prev.length
  if (intLen >= 10) return prev                                     // max 10 integer digits
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
function IconNote() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="17" y1="10" x2="3" y2="10" />
      <line x1="21" y1="6" x2="3" y2="6" />
      <line x1="21" y1="14" x2="3" y2="14" />
      <line x1="17" y1="18" x2="3" y2="18" />
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

// ── Field button ───────────────────────────────────────────────────────────────

function FieldButton({ onClick, error, left, center, right }) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-full flex items-center gap-3 px-4 h-[52px] rounded-2xl text-left',
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
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AddExpense() {
  const navigate = useNavigate()

  const [amountStr,    setAmountStr]    = useState('0')
  const [description,  setDescription]  = useState('')
  const [date,         setDate]         = useState(() => new Date().toISOString().slice(0, 10))
  const [category,     setCategory]     = useState(null)
  const [account,      setAccount]      = useState(null)
  const [catError,     setCatError]     = useState(false)
  const [acctError,    setAcctError]    = useState(false)
  const [showCatSheet, setShowCatSheet] = useState(false)
  const [showAcctSheet, setShowAcctSheet] = useState(false)
  const [showConfirm,    setShowConfirm]    = useState(false)
  const [showTemplates,  setShowTemplates]  = useState(false)
  const [saving,         setSaving]         = useState(false)
  const dateInputRef = useRef(null)

  const accounts   = useLiveQuery(() => db.accounts.toArray(), [], [])
  const categories = useLiveQuery(
    () => db.categories.where('type').equals('expense').toArray(), [], [],
  )
  const skipConfirmMeta = useLiveQuery(() => db.meta.get('skipConfirm'), [], null)
  const skipConfirm = skipConfirmMeta?.value ?? false

  const amount = parseFloat(amountStr) || 0

  function onKey(key) {
    setAmountStr(prev => handleAmountKey(prev, key))
  }

  function onConfirmPress() {
    let err = false
    if (!category) { setCatError(true);  err = true }
    if (!account)  { setAcctError(true); err = true }
    if (err) return
    if (skipConfirm) { handleSave(null); return }
    setShowConfirm(true)
  }

  async function handleSave(templateData) {
    setSaving(true)
    try {
      const now     = new Date()
      const [y,m,d] = date.split('-').map(Number)
      const txDate  = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds())
      const dateISO = txDate.toISOString()
      const updISO  = now.toISOString()
      await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
        await db.transactions.add({
          txId:        crypto.randomUUID(),
          type:        'expense',
          amount,
          description: description.trim(),
          category:    category.name,
          account:     account.name,
          date:        dateISO,
          synced:      false,
          updatedAt:   updISO,
        })
        await applyBalanceEffect({ type: 'expense', amount, account: account.name })
      })
      if (templateData) {
        await db.templates.add({ ...templateData, createdAt: new Date().toISOString() })
      }
      navigate('/')
    } catch (e) {
      console.error('[AddExpense] save failed:', e)
      setSaving(false)
    }
  }

  function applyTemplate(tpl) {
    if (tpl.amount) setAmountStr(String(tpl.amount))
    if (tpl.description) setDescription(tpl.description)
    const cat = (categories ?? []).find(c => c.name === tpl.category)
    const acct = (accounts ?? []).find(a => a.name === tpl.account)
    if (cat)  { setCategory(cat);  setCatError(false) }
    if (acct) { setAccount(acct);  setAcctError(false) }
  }

  const displayStr  = fmtDisplay(amountStr)
  const fontSize    = displayStr.length <= 9 ? '3rem' : displayStr.length <= 12 ? '2.375rem' : '1.875rem'

  return (
    <div
      className="flex flex-col bg-transparent"
      style={{ height: 'calc(100dvh - 80px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))' }}
    >
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
        <h1 className="text-base font-semibold text-slate-800 dark:text-white flex-1">Add Expense</h1>
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

      {/* ── Form fields (scrollable) ── */}
      <div className="px-4 flex flex-col gap-2.5 flex-1 overflow-y-auto py-1">
        {/* description */}
        <div className="flex items-center gap-3 px-4 h-[52px] rounded-2xl
          bg-white dark:bg-white/[0.05]
          border border-slate-200/80 dark:border-white/[0.08]
          shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-none"
        >
          <span className="text-slate-400 dark:text-slate-500 shrink-0"><IconNote /></span>
          <input
            type="text"
            placeholder="Description (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="flex-1 bg-transparent text-sm text-slate-800 dark:text-white
              placeholder-slate-400 dark:placeholder-slate-500 outline-none min-w-0"
            maxLength={100}
          />
        </div>

        {/* date */}
        <button
          type="button"
          onClick={() => dateInputRef.current?.showPicker()}
          className="w-full flex items-center gap-3 px-4 h-[52px] rounded-2xl text-left
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

        {/* category */}
        <FieldButton
          onClick={() => { setCatError(false); setShowCatSheet(true) }}
          error={catError}
          left={
            <span className="text-[22px] leading-none">
              {category?.icon ?? <span className="text-slate-300 dark:text-slate-600 text-base">🏷️</span>}
            </span>
          }
          center={
            <span className={`text-sm ${category ? 'font-medium text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
              {category?.name ?? 'Select category'}
              {catError && !category && (
                <span className="ml-2 text-xs font-normal text-red-500">Required</span>
              )}
            </span>
          }
          right={<IconChevronRight />}
        />

        {/* account */}
        <FieldButton
          onClick={() => { setAcctError(false); setShowAcctSheet(true) }}
          error={acctError}
          left={
            <span
              className="w-6 h-6 rounded-lg shrink-0"
              style={{ backgroundColor: account?.color ?? '#cbd5e1' }}
            />
          }
          center={
            <span className={`text-sm ${account ? 'font-medium text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
              {account?.name ?? 'Select account'}
              {acctError && !account && (
                <span className="ml-2 text-xs font-normal text-red-500">Required</span>
              )}
            </span>
          }
          right={
            account ? (
              <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                {account.type === 'credit'
                  ? fmt((account.creditLimit ?? 0) + (account.balance ?? 0)) + ' avail.'
                  : fmt(account.balance)}
              </span>
            ) : <IconChevronRight />
          }
        />
      </div>

      {/* ── Keypad (pinned to bottom) ── */}
      <div className="px-4 pt-3 pb-3 shrink-0 border-t border-slate-100 dark:border-white/[0.06] bg-white dark:bg-[#0d1117]">
        <NumericKeypad
          onKey={onKey}
          onConfirm={onConfirmPress}
          confirmLabel="Review Expense"
          confirmDisabled={amount <= 0}
        />
      </div>

      {/* ── Sheets ── */}
      <CategoryPickerSheet
        open={showCatSheet}
        onClose={() => setShowCatSheet(false)}
        categories={categories ?? []}
        selected={category}
        onSelect={cat => { setCategory(cat); setCatError(false) }}
      />
      <AccountPickerSheet
        open={showAcctSheet}
        onClose={() => setShowAcctSheet(false)}
        accounts={accounts ?? []}
        selected={account}
        onSelect={acct => { setAccount(acct); setAcctError(false) }}
      />
      <TxConfirmSheet
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleSave}
        saving={saving}
        type="expense"
        amount={amount}
        description={description}
        category={category}
        account={account}
        onSaveTemplate={() => {}}
      />
      <TemplatePickerSheet
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        type="expense"
        onSelect={applyTemplate}
      />
    </div>
  )
}
