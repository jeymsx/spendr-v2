import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import db, { UNSYNCED } from '../db/db'
import { applyBalanceEffect, checkOverdraw, saveTemplate } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import { getCreditStatus } from '../utils/creditCycle'
import AccountPickerSheet from '../components/AccountPickerSheet'
import AccountSelectRow from '../components/AccountSelectRow'
import TxConfirmSheet from '../components/TxConfirmSheet'
import { fieldFrame } from '../components/ui/Field'
import TemplatePickerSheet from '../components/TemplatePickerSheet'
import DupWarningSheet from '../components/DupWarningSheet'
import OverdrawWarningSheet from '../components/OverdrawWarningSheet'
import { IconCalendar, IconChevronLeft, IconTemplate, IconWarning, IconArrowDown } from '../components/icons'
import { useQuickPrefill } from '../hooks/useQuickPrefill'
import Button from '../components/ui/Button'
import IconButton from '../components/ui/IconButton'
import SectionLabel from '../components/ui/SectionLabel'
import Divider from '../components/ui/Divider'
import { fmt } from '../lib/money'

// ── Helpers ────────────────────────────────────────────────────────────────────

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── Icons ──────────────────────────────────────────────────────────────────────



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
export default function Transfer({ onCancel, onSaved } = {}) {
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
  /* Quick log hands its parse over as router state; this fills the form once
     the accounts have loaded, so the names it matched can be resolved. */
  useQuickPrefill({
    accounts,
    categories: [],
    /* REPLACES the form rather than merging into it - see AddExpense. It
       matters most here: a stale `from` account inherited from the previous
       transfer moves real money out of the wrong place. */
    apply: (p) => {
      setAmountStr(p.amount != null ? numToMoneyStr(p.amount) : '0')
      setFromAccount(p.fromAccount ?? null)
      setToAccount(p.toAccount ?? null)
      if (p.date) setDate(p.date)
      // "500 from gcash to maya, 18 tf" - the fee is the second half of how
      // people actually say a transfer, so it should not need a second visit.
      // Back to zero when this line does not mention one, or the last
      // transfer's fee rides along on a transfer that had none.
      setFeeStr(p.fee != null ? numToMoneyStr(p.fee) : '0')
      setFromError(false)
      setToError(false)
    },
  })

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

  /* templateData, which this used to ignore: the confirmation sheet offered
     "Save as template" on every transfer while handleSave took no argument,
     so the toggle wrote nothing at all. Both skipConfirm paths call this with
     no argument, which is the same as declining. */
  async function handleSave(templateData) {
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
      if (templateData) await saveTemplate(templateData)
      showToast('Transfer saved')
      if (onSaved) onSaved(); else navigate('/')
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
      <header className="flex items-center gap-3 px-5 pt-safe-header pb-2 shrink-0">
        <IconButton label="Back" onClick={() => (onCancel ? onCancel() : navigate(-1))}>
          <IconChevronLeft />
        </IconButton>
        <h1 className="text-base font-semibold text-slate-800 dark:text-white flex-1">Transfer</h1>
        <Button
          variant="tint"
          size="xs"
          className="shrink-0 px-3.5 gap-1.5"
          onClick={() => setShowTemplates(true)}
        >
          <IconTemplate size={14} /> Templates
        </Button>
      </header>

      {/* ── Amount ── */}
      <div className="flex flex-col items-center px-6 pt-12 pb-12 shrink-0">
        <input
          ref={amountInputRef}
          type="text"
          inputMode="decimal"
          placeholder="₱0.00"
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

        {/* No From and To headings.

            The rows say "Select source" and "Select destination" until they
            are filled, and after that the arrow between them says which way
            the money goes - a label above each one was the third time the
            screen made the same point. Dropping them also lets the arrow sit
            CENTRED between the two rows: the heading above To was 25px of
            one-sided weight, so the divider was never in the middle of the
            gap it divided.

            aria-label carries the role for anyone who cannot see the arrow. */}
        <AccountSelectRow
          account={fromAccount}
          error={fromError}
          emptyText="Select source"
          ariaLabel="Transfer from"
          onClick={() => { setFromError(false); setShowFromSheet(true) }}
        />

        {/* Arrow connector. No negative margin now - the parent's gap-4 is
            the same above and below, which is the whole point. */}
        <div className="flex items-center gap-3 px-1">
          <Divider className="flex-1" />
          <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center text-slate-400 dark:text-slate-500">
            <IconArrowDown />
          </div>
          <Divider className="flex-1" />
        </div>

        <AccountSelectRow
          account={toAccount}
          error={toError}
          emptyText="Select destination"
          ariaLabel="Transfer to"
          onClick={() => { setToError(false); setShowToSheet(true) }}
        />

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
              <IconWarning size={13} className="inline-block mr-1 -mt-px" /> Payment exceeds outstanding balance
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
              {fmt(creditOutstanding)} is currently owed on {toAccount.name}.
              {' '}Paying {fmt(amount)} will overpay by {fmt(amount - creditOutstanding)} — excess won't increase available credit beyond the card limit.
            </p>
          </div>
        )}

        {/* Transfer Fee */}
        <div>
          <SectionLabel>
            Transfer fee <span className="font-normal text-slate-400 dark:text-slate-600">(optional)</span>
          </SectionLabel>
          <div className={fieldFrame()}>
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
          <SectionLabel>Date</SectionLabel>
          <div className={fieldFrame()}>
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
        <Button
          size="lg"
          block
          onClick={onConfirmPress} disabled={saving || amount <= 0 || !fromAccount || !toAccount || fromAccount?.id === toAccount?.id}
        >
          Review transfer
        </Button>
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
