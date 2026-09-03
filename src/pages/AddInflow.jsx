import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import db, { UNSYNCED } from '../db/db'
import { applyBalanceEffect } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import { useCreditAvailMap } from '../hooks/useCreditAvailMap'
import CategoryPickerSheet from '../components/CategoryPickerSheet'
import AccountPickerSheet from '../components/AccountPickerSheet'
import TxConfirmSheet from '../components/TxConfirmSheet'
import TemplatePickerSheet from '../components/TemplatePickerSheet'
import DupWarningSheet from '../components/DupWarningSheet'
import { IconCalendar, IconChevronLeft, IconChevronRight } from '../components/icons'

// ── Helpers ────────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function fmtDateLabel(dateStr) {
  const today = new Date()
  const yest  = new Date(today); yest.setDate(today.getDate() - 1)
  const todayKey = localDateStr(today)
  const yesterKey = localDateStr(yest)
  if (dateStr === todayKey)   return 'Today'
  if (dateStr === yesterKey)  return 'Yesterday'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
}

function FieldButton({ onClick, error, left, center, right }) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-full flex items-center gap-3 px-4 h-[52px] rounded-2xl text-left',
        'active:bg-slate-50 dark:active:bg-primary/[0.12] transition-colors',
        'bg-white dark:bg-primary/[0.07]',
        error
          ? 'border border-red-300 dark:border-red-500/40'
          : 'border border-slate-200/80 dark:border-primary/[0.14]',
        'shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.08)]',
      ].join(' ')}
    >
      <span className="shrink-0">{left}</span>
      <span className="flex-1 min-w-0">{center}</span>
      {right && <span className="shrink-0 text-slate-300 dark:text-slate-600">{right}</span>}
    </button>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

/**
 * onCancel / onSaved let a host close this form instead of navigating.
 *
 * As a route the form IS the page, so back means navigate(-1) and saving means
 * going to the dashboard. The desktop layout renders the same component as an
 * overlay on top of whatever page you were on, where both are wrong:
 * navigate(-1) pops the history entry of the page BEHIND the modal, so
 * dismissing an expense opened over Settings landed you on whatever you had
 * visited before Settings. Saving likewise threw you to the dashboard instead
 * of leaving you where you were.
 *
 * Neither prop is passed by the mobile routes, so the phone behaviour is
 * unchanged by construction.
 */
export default function AddInflow({ onCancel, onSaved } = {}) {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [amountStr,     setAmountStr]     = useState('0')
  const [description,   setDescription]   = useState('')
  const [date,          setDate]          = useState(() => localDateStr(new Date()))
  const [category,      setCategory]      = useState(null)
  const [account,       setAccount]       = useState(null)
  const [catError,      setCatError]      = useState(false)
  const [acctError,     setAcctError]     = useState(false)
  const [showCatSheet,  setShowCatSheet]  = useState(false)
  const [showAcctSheet, setShowAcctSheet] = useState(false)
  const [showConfirm,    setShowConfirm]    = useState(false)
  const [showTemplates,  setShowTemplates]  = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [dupWarning,     setDupWarning]     = useState(false)

  const accounts       = useLiveQuery(() => db.accounts.toArray(), [], [])
  const creditAvailMap = useCreditAvailMap(accounts)
  const categories = useLiveQuery(
    () => db.categories.where('type').equals('inflow').toArray()
      .then(cs => cs.sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name))),
    [], [],
  )

  const skipConfirmMeta = useLiveQuery(() => db.meta.get('skipConfirm'), [], null)
  const skipConfirm = skipConfirmMeta?.value ?? false

  const amountInputRef = useRef(null)
  const amount = parseMoney(amountStr)

  useEffect(() => {
    const t = setTimeout(() => amountInputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  const handleAmountChange = moneyChangeHandler(setAmountStr)

  async function onConfirmPress() {
    let err = false
    if (!category) { setCatError(true);  err = true }
    if (!account)  { setAcctError(true); err = true }
    if (err) return
    const [y, m, d] = date.split('-').map(Number)
    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0)
    const dayEnd   = new Date(y, m - 1, d, 23, 59, 59, 999)
    const sameDayTxs = await db.transactions
      .where('date').between(dayStart.toISOString(), dayEnd.toISOString(), true, true)
      .toArray()
    const isDup = sameDayTxs.some(tx =>
      tx.type === 'inflow' && tx.amount === amount && tx.account === account.name
    )
    if (isDup) { setDupWarning(true); return }
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
          type:        'inflow',
          amount,
          description: description.trim(),
          category:    category.name,
          account:     account.name,
          date:        dateISO,
          synced:      UNSYNCED,
          updatedAt:   updISO,
        })
        await applyBalanceEffect({ type: 'inflow', amount, account: account.name })
      })
      if (templateData) {
        await db.templates.add({ ...templateData, createdAt: new Date().toISOString() })
      }
      showToast('Inflow saved')
      if (onSaved) onSaved(); else navigate('/')
    } catch (e) {
      console.error('[AddInflow] save failed:', e)
      showToast('Failed to save inflow', 'error')
      setSaving(false)
    }
  }

  function applyTemplate(tpl) {
    if (tpl.amount) setAmountStr(numToMoneyStr(tpl.amount))
    if (tpl.description) setDescription(tpl.description)
    const cat  = (categories ?? []).find(c => c.name === tpl.category)
    const acct = (accounts ?? []).find(a => a.name === tpl.account)
    if (cat)  { setCategory(cat);  setCatError(false) }
    if (acct) { setAccount(acct);  setAcctError(false) }
  }

  return (
    <div className="flex flex-col bg-transparent pb-6">

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 pt-safe-header pb-2 shrink-0">
        <button
          onClick={() => (onCancel ? onCancel() : navigate(-1))}
          className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0
            bg-white dark:bg-white/[0.07] border border-slate-200/80 dark:border-white/[0.09]
            text-slate-600 dark:text-slate-300 shadow-sm
            active:scale-90 transition-transform duration-75"
        >
          <IconChevronLeft />
        </button>
        <h1 className="text-base font-semibold text-slate-800 dark:text-white flex-1">Add Inflow</h1>
        <button
          onClick={() => setShowTemplates(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold
            text-primary bg-primary/[0.08] dark:bg-primary/[0.12]
            border border-primary/20 active:scale-95 transition-transform duration-75"
        >
          <span>⚡</span> Templates
        </button>
      </header>

      {/* ── Amount ── */}
      <div className="flex flex-col items-center px-6 pt-12 pb-12 shrink-0">
        <input
          ref={amountInputRef}
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={amountStr === '0' ? '' : amountStr}
          onChange={handleAmountChange}
          className="amount-input font-semibold tabular-nums bg-transparent text-center w-full
            text-slate-900 dark:text-white outline-none
            placeholder-slate-200 dark:placeholder-slate-800"
        />
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 tracking-wide">Amount</p>
      </div>

      {/* ── Form fields ── */}
      <div className="px-4 flex flex-col gap-4">

        {/* Description */}
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 px-1">Description</p>
          <div className="flex items-center gap-3 px-4 h-[52px] rounded-2xl
            bg-white dark:bg-primary/[0.07]
            border border-slate-200/80 dark:border-primary/[0.14]
            shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.08)]"
          >
            <input
              type="text"
              placeholder="Optional"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="flex-1 bg-transparent text-sm text-slate-800 dark:text-white
                placeholder-slate-400 dark:placeholder-slate-500 outline-none min-w-0"
              maxLength={100}
            />
          </div>
        </div>

        {/* Category */}
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 px-1">Category</p>
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
        </div>

        {/* Account */}
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 px-1">Account</p>
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
              account
                ? <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                    {account.type === 'credit'
                      ? fmt(creditAvailMap?.[account.name] ?? 0) + ' avail.'
                      : fmt(account.balance)}
                  </span>
                : <IconChevronRight />
            }
          />
        </div>

        {/* Date — last */}
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 px-1">Date</p>
          <div className="flex items-center gap-3 px-4 h-[52px] rounded-2xl
            bg-white dark:bg-primary/[0.07]
            border border-slate-200/80 dark:border-primary/[0.14]
            shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.08)]">
            <span className="text-slate-400 dark:text-slate-500 shrink-0"><IconCalendar /></span>
            <input
              type="date"
              value={date}
              max={localDateStr(new Date())}
              onChange={e => e.target.value && setDate(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-sm font-medium text-slate-800 dark:text-white outline-none"
            />
          </div>
        </div>

      </div>

      <div className="px-4 pt-5">
        <button
          onClick={onConfirmPress}
          disabled={saving || amount <= 0}
          className="w-full py-4 rounded-2xl text-sm font-semibold text-white
            bg-primary
            disabled:opacity-40 disabled:shadow-none
            active:scale-[0.98] transition-all duration-100"
        >
          Review Inflow
        </button>
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
        type="inflow"
        amount={amount}
        description={description}
        category={category}
        account={account}
        onSaveTemplate={() => {}}
      />
      <TemplatePickerSheet
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        type="inflow"
        onSelect={applyTemplate}
      />
      <DupWarningSheet
        open={dupWarning}
        onClose={() => setDupWarning(false)}
        onSaveAnyway={() => { if (skipConfirm) { handleSave(null) } else { setShowConfirm(true) } }}
        amount={amount}
        type="inflow"
      />
    </div>
  )
}
