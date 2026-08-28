import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import db, { UNSYNCED } from '../db/db'
import { applyBalanceEffect, checkOverdraw } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import { getCreditStatus } from '../utils/creditCycle'
import AccountPickerSheet from '../components/AccountPickerSheet'
import TxConfirmSheet from '../components/TxConfirmSheet'
import TemplatePickerSheet from '../components/TemplatePickerSheet'
import DupWarningSheet from '../components/DupWarningSheet'
import OverdrawWarningSheet from '../components/OverdrawWarningSheet'
import { IconCalendar, IconChevronLeft, IconChevronRight } from '../components/icons'

// ── Helpers ────────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── Icons ──────────────────────────────────────────────────────────────────────


function IconArrowDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  )
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
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Transfer() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [amountStr,      setAmountStr]      = useState('0')
  const [feeStr,         setFeeStr]         = useState('0')
  const [date,           setDate]           = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
  })
  const [fromAccount,    setFromAccount]    = useState(null)
  const [toAccount,      setToAccount]      = useState(null)
  const [fromError,      setFromError]      = useState(false)
  const [toError,        setToError]        = useState(false)
  const [showFromSheet,  setShowFromSheet]  = useState(false)
  const [showToSheet,    setShowToSheet]    = useState(false)
  const [showConfirm,    setShowConfirm]    = useState(false)
  const [showTemplates,  setShowTemplates]  = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [dupWarning,     setDupWarning]     = useState(false)
  const [overdraw,       setOverdraw]       = useState(null)

  const accounts     = useLiveQuery(() => db.accounts.toArray(),     [], [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [])
  const skipConfirmMeta = useLiveQuery(() => db.meta.get('skipConfirm'), [], null)
  const skipConfirm = skipConfirmMeta?.value ?? false

  const amountInputRef = useRef(null)
  const amount = parseMoney(amountStr)
  const fee    = parseMoney(feeStr)

  // Net outstanding on the destination credit card, matching what Accounts and
  // Dashboard show. This previously subtracted every payment ever made to the
  // card, so after a few months of use it always read zero and the overpay
  // warning fired on every payment.
  const creditOutstanding = useMemo(() => {
    if (!toAccount || toAccount.type !== 'credit') return null
    return getCreditStatus(toAccount, transactions ?? []).currentBalance
  }, [toAccount, transactions])

  const overpayWarning = toAccount?.type === 'credit'
    && creditOutstanding !== null
    && amount > 0
    && amount > creditOutstanding

  useEffect(() => {
    const t = setTimeout(() => amountInputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  const handleAmountChange = moneyChangeHandler(setAmountStr)
  const handleFeeChange    = moneyChangeHandler(setFeeStr)

  async function onConfirmPress() {
    let err = false
    if (!fromAccount) { setFromError(true); err = true }
    if (!toAccount)   { setToError(true);   err = true }
    if (err) return
    // The fee leaves the same account, so it counts toward the overdraw.
    const over = await checkOverdraw(fromAccount.name, amount + fee)
    if (over) {
      setOverdraw({ accountName: over.name, balance: over.balance ?? 0, amount: amount + fee })
      return
    }
    return continueAfterBalanceCheck()
  }

  async function continueAfterBalanceCheck() {
    const [y, m, d] = date.split('-').map(Number)
    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0)
    const dayEnd   = new Date(y, m - 1, d, 23, 59, 59, 999)
    const sameDayTxs = await db.transactions
      .where('date').between(dayStart.toISOString(), dayEnd.toISOString(), true, true)
      .toArray()
    const isDup = sameDayTxs.some(tx =>
      tx.type === 'transfer' &&
      tx.amount === amount &&
      tx.fromAccount === fromAccount.name &&
      tx.toAccount === toAccount.name
    )
    if (isDup) { setDupWarning(true); return }
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

      await db.transaction('rw', [db.transactions, db.accounts, db.balances, db.categories], async () => {
        // Ensure 'Transfer Fee' category exists atomically with the transfer
        if (fee > 0) {
          const existing = await db.categories.where('name').equals('Transfer Fee').first()
          if (!existing) {
            await db.categories.add({ name: 'Transfer Fee', icon: '💸', color: '#f59e0b', type: 'expense', budget: 0 })
          }
        }
        await db.transactions.add({
          txId:        crypto.randomUUID(),
          type:        'transfer',
          amount,
          fromAccount: fromAccount.name,
          toAccount:   toAccount.name,
          date:        dateISO,
          synced:      UNSYNCED,
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
            synced:      UNSYNCED,
            updatedAt:   updISO,
          })
          await applyBalanceEffect({ type: 'expense', amount: fee, account: fromAccount.name })
        }
      })
      showToast('Transfer saved')
      navigate('/')
    } catch (e) {
      console.error('[Transfer] save failed:', e)
      showToast('Failed to save transfer', 'error')
      setSaving(false)
    }
  }

  function applyTemplate(tpl) {
    if (tpl.amount) setAmountStr(numToMoneyStr(tpl.amount))
    const from = (accounts ?? []).find(a => a.name === tpl.fromAccount)
    const to   = (accounts ?? []).find(a => a.name === tpl.toAccount)
    if (from) { setFromAccount(from); setFromError(false) }
    if (to)   { setToAccount(to);     setToError(false) }
  }

  return (
    <div className="flex flex-col bg-transparent pb-6">

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 pt-safe-header pb-2 shrink-0">
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

        {/* From */}
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 px-1">From</p>
          <FieldButton
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
        </div>

        {/* Arrow connector */}
        <div className="flex items-center gap-3 px-1 -my-1">
          <div className="flex-1 h-px bg-slate-200 dark:bg-white/[0.08]" />
          <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center text-slate-400 dark:text-slate-500">
            <IconArrowDown />
          </div>
          <div className="flex-1 h-px bg-slate-200 dark:bg-white/[0.08]" />
        </div>

        {/* To */}
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 px-1">To</p>
          <FieldButton
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
        </div>

        {/* same-account warning */}
        {fromAccount && toAccount && fromAccount.id === toAccount.id && (
          <p className="text-xs text-amber-600 dark:text-amber-400 text-center px-2 -mt-2">
            From and To accounts must be different.
          </p>
        )}

        {/* credit card overpayment warning */}
        {overpayWarning && (
          <div className="px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-500/[0.08] border border-amber-200 dark:border-amber-500/20 -mt-1">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              ⚠️ Payment exceeds outstanding balance
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
              {fmt(creditOutstanding)} is currently owed on {toAccount.name}.
              {' '}Paying {fmt(amount)} will overpay by {fmt(amount - creditOutstanding)} — excess won't increase available credit beyond the card limit.
            </p>
          </div>
        )}

        {/* Transfer Fee */}
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 px-1">
            Transfer Fee <span className="font-normal text-slate-400 dark:text-slate-600">(optional)</span>
          </p>
          <div className="flex items-center gap-3 px-4 h-[52px] rounded-2xl
            bg-white dark:bg-primary/[0.07]
            border border-slate-200/80 dark:border-primary/[0.14]
            shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.08)]">
            <span className="text-slate-400 dark:text-slate-500 text-sm shrink-0">₱</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={feeStr === '0' ? '' : feeStr}
              onChange={handleFeeChange}
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
          disabled={saving || amount <= 0 || !fromAccount || !toAccount || fromAccount?.id === toAccount?.id}
          className="w-full py-4 rounded-2xl text-sm font-semibold text-white
            bg-primary
            disabled:opacity-40 disabled:shadow-none
            active:scale-[0.98] transition-all duration-100"
        >
          Review Transfer
        </button>
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
      <OverdrawWarningSheet
        open={!!overdraw}
        onClose={() => setOverdraw(null)}
        onSaveAnyway={() => { setOverdraw(null); continueAfterBalanceCheck() }}
        accountName={overdraw?.accountName}
        balance={overdraw?.balance}
        amount={overdraw?.amount}
      />
      <DupWarningSheet
        open={dupWarning}
        onClose={() => setDupWarning(false)}
        onSaveAnyway={() => { if (skipConfirm) { handleSave() } else { setShowConfirm(true) } }}
        amount={amount}
        type="transfer"
      />
    </div>
  )
}
