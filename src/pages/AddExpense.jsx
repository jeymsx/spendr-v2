import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import db, { UNSYNCED } from '../db/db'
import { applyBalanceEffect, checkOverdraw } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import { advanceNextDate } from '../utils/recurring'
import { useCreditAvailMap } from '../hooks/useCreditAvailMap'
import CategoryPickerSheet from '../components/CategoryPickerSheet'
import AccountPickerSheet from '../components/AccountPickerSheet'
import TxConfirmSheet from '../components/TxConfirmSheet'
import TemplatePickerSheet from '../components/TemplatePickerSheet'
import DupWarningSheet from '../components/DupWarningSheet'
import OverdrawWarningSheet from '../components/OverdrawWarningSheet'
import { IconCalendar, IconChevronLeft, IconChevronRight } from '../components/icons'

// ── Helpers ────────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

// Shortcuts only. Issuers vary and change their offers, so any term from
// MIN_TERM to MAX_TERM can be typed in rather than picked from this list.
const INSTALLMENT_TERMS = [3, 6, 9, 12, 18, 24, 36]
const MIN_TERM = 2
const MAX_TERM = 60

/** Advance a YYYY-MM-DD string by n months, clamping short months. */
function addMonths(dateStr, n) {
  let d = dateStr
  for (let i = 0; i < n; i++) d = advanceNextDate(d, 'monthly')
  return d
}

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

// ── Field button ───────────────────────────────────────────────────────────────

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
export default function AddExpense({ onCancel, onSaved } = {}) {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [amountStr,    setAmountStr]    = useState('0')
  const [description,  setDescription]  = useState('')
  const [date,         setDate]         = useState(() => localDateStr(new Date()))
  const [category,     setCategory]     = useState(null)
  const [account,      setAccount]      = useState(null)
  const [catError,     setCatError]     = useState(false)
  const [acctError,    setAcctError]    = useState(false)
  const [showCatSheet, setShowCatSheet] = useState(false)
  const [showAcctSheet, setShowAcctSheet] = useState(false)
  const [showConfirm,    setShowConfirm]    = useState(false)
  const [showTemplates,  setShowTemplates]  = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [dupWarning,     setDupWarning]     = useState(false)
  const [installMonths,  setInstallMonths]  = useState(0) // 0 = not an installment
  const [overdraw,       setOverdraw]       = useState(null)
  const [customTerm,     setCustomTerm]     = useState(false)

  const accounts       = useLiveQuery(() => db.accounts.toArray(), [], [])
  const creditAvailMap = useCreditAvailMap(accounts)
  const categories = useLiveQuery(
    () => db.categories.where('type').equals('expense').toArray()
      .then(cs => cs.sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name))),
    [], [],
  )
  const skipConfirmMeta = useLiveQuery(() => db.meta.get('skipConfirm'), [], null)
  const skipConfirm = skipConfirmMeta?.value ?? false

  const amountInputRef = useRef(null)
  const amount = parseMoney(amountStr)

  // Installments only exist on credit accounts. `amount` is the monthly figure
  // the card or BNPL app quotes -- interest already baked in -- so a 0% term and
  // an interest-bearing term are entered exactly the same way, and the total is
  // always what they actually bill rather than a number we derived.
  const isCredit      = account?.type === 'credit'
  const isInstallment = isCredit && installMonths > 1
  const installTotal  = Math.round(amount * installMonths * 100) / 100
  const installLast   = isInstallment ? addMonths(date, installMonths - 1) : null
  const termIsCustom  = customTerm
    || (installMonths > 1 && !INSTALLMENT_TERMS.includes(installMonths))

  // Picking a non-credit account cancels any term already chosen.
  useEffect(() => {
    if (!isCredit && installMonths !== 0) { setInstallMonths(0); setCustomTerm(false) }
  }, [isCredit, installMonths])

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

    // checkOverdraw exempts credit accounts, so installments — which only
    // exist on credit — pass straight through.
    const over = await checkOverdraw(account.name, amount)
    if (over) {
      setOverdraw({ accountName: over.name, balance: over.balance ?? 0, amount })
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
      tx.type === 'expense' && tx.amount === amount && tx.account === account.name
    )
    if (isDup) { setDupWarning(true); return }
    if (skipConfirm) { handleSave(null); return }
    setShowConfirm(true)
  }

  async function handleSave(templateData) {
    setSaving(true)
    try {
      const now    = new Date()
      const updISO = now.toISOString()
      const count  = isInstallment ? installMonths : 1
      const note   = description.trim()

      // One charge per month, each dated a month after the last. Future dating
      // is the point: getCreditStatus treats everything past the cutoff as
      // outstanding, so the whole plan reduces available credit immediately
      // while only the current month's charge lands on this statement.
      // Shared across the plan's rows so deleting one can remove them all
      // without relying on the "(n/N)" label. Plain property, no index needed.
      const installmentId = count > 1 ? crypto.randomUUID() : null

      const rows  = []
      let   dueOn = date
      for (let i = 0; i < count; i++) {
        const [y, m, d] = dueOn.split('-').map(Number)
        const txDate = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds())
        rows.push({
          txId:        crypto.randomUUID(),
          type:        'expense',
          amount,
          description: count > 1
            ? `${note || category.name} (${i + 1}/${count})`
            : note,
          category:    category.name,
          account:     account.name,
          date:        txDate.toISOString(),
          synced:      UNSYNCED,
          updatedAt:   updISO,
          ...(installmentId ? { installmentId } : {}),
        })
        dueOn = advanceNextDate(dueOn, 'monthly')
      }

      await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
        await db.transactions.bulkAdd(rows)
        // One adjustment for the whole plan -- same net effect as applying each
        // row, without re-reading the account once per month.
        await applyBalanceEffect({
          type:    'expense',
          amount:  Math.round(amount * count * 100) / 100,
          account: account.name,
        })
      })
      if (templateData) {
        await db.templates.add({ ...templateData, createdAt: new Date().toISOString() })
      }
      showToast(count > 1 ? `${count} payments scheduled` : 'Expense saved')
      if (onSaved) onSaved(); else navigate('/')
    } catch (e) {
      console.error('[AddExpense] save failed:', e)
      showToast('Failed to save expense', 'error')
      setSaving(false)
    }
  }

  function applyTemplate(tpl) {
    if (tpl.amount) setAmountStr(numToMoneyStr(tpl.amount))
    if (tpl.description) setDescription(tpl.description)
    const cat = (categories ?? []).find(c => c.name === tpl.category)
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
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 tracking-wide">
          {isInstallment ? 'Amount per month' : 'Amount'}
        </p>
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
              account ? (
                <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                  {account.type === 'credit'
                    ? fmt(creditAvailMap?.[account.name] ?? 0) + ' avail.'
                    : fmt(account.balance)}
                </span>
              ) : <IconChevronRight />
            }
          />
        </div>

        {/* Installment — credit accounts only */}
        {isCredit && (
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 px-1">
              Installment
            </p>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[0, ...INSTALLMENT_TERMS].map(n => (
                <button
                  key={n}
                  onClick={() => { setCustomTerm(false); setInstallMonths(n) }}
                  className={[
                    'shrink-0 px-3.5 h-[38px] rounded-xl text-xs font-semibold',
                    'border transition-colors duration-150 active:scale-95',
                    !termIsCustom && installMonths === n
                      ? 'bg-primary border-primary text-white'
                      : 'bg-white dark:bg-primary/[0.07] text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-primary/[0.14]',
                  ].join(' ')}
                >
                  {n === 0 ? 'Off' : `${n} mo`}
                </button>
              ))}
              <button
                onClick={() => setCustomTerm(true)}
                className={[
                  'shrink-0 px-3.5 h-[38px] rounded-xl text-xs font-semibold',
                  'border transition-colors duration-150 active:scale-95',
                  termIsCustom
                    ? 'bg-primary border-primary text-white'
                    : 'bg-white dark:bg-primary/[0.07] text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-primary/[0.14]',
                ].join(' ')}
              >
                Custom
              </button>

              {/* Sits inside the same scrolling row so the control stays one line. */}
              {termIsCustom && (
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  placeholder="24"
                  title={`${MIN_TERM}–${MAX_TERM} months`}
                  aria-label={`Custom term in months, ${MIN_TERM} to ${MAX_TERM}`}
                  value={installMonths > 1 ? String(installMonths) : ''}
                  onChange={e => {
                    const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
                    setInstallMonths(digits ? Math.min(Number(digits), MAX_TERM) : 0)
                  }}
                  className="shrink-0 w-[72px] px-2 h-[38px] rounded-xl text-xs font-semibold tabular-nums text-center
                    bg-white dark:bg-primary/[0.07] text-slate-800 dark:text-white outline-none
                    border border-primary/60 dark:border-primary/60
                    placeholder-slate-300 dark:placeholder-slate-600"
                />
              )}
            </div>
            {isInstallment && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 px-1 tabular-nums">
                {installMonths} × {fmt(amount)} ={' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">{fmt(installTotal)}</span> total
                {' · '}{fmtDateLabel(date)} → {fmtDateLabel(installLast)}
              </p>
            )}
          </div>
        )}

        {/* Date — last */}
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 px-1">
            {isInstallment ? 'First payment' : 'Date'}
          </p>
          <div className="flex items-center gap-3 px-4 h-[52px] rounded-2xl
            bg-white dark:bg-primary/[0.07]
            border border-slate-200/80 dark:border-primary/[0.14]
            shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.08)]">
            <span className="text-slate-400 dark:text-slate-500 shrink-0"><IconCalendar /></span>
            <input
              type="date"
              value={date}
              /* An installment's first payment is normally next month, so the
                 future is allowed here and nowhere else. */
              max={isInstallment ? undefined : localDateStr(new Date())}
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
          {isInstallment ? 'Review Installment' : 'Review Expense'}
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
        type="expense"
        amount={amount}
        description={description}
        category={category}
        account={account}
        onSaveTemplate={() => {}}
        installment={isInstallment ? {
          months:     installMonths,
          monthly:    amount,
          total:      installTotal,
          firstLabel: fmtDateLabel(date),
          lastLabel:  fmtDateLabel(installLast),
        } : null}
      />
      <TemplatePickerSheet
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        type="expense"
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
        onSaveAnyway={() => { if (skipConfirm) { handleSave(null) } else { setShowConfirm(true) } }}
        amount={amount}
        type="expense"
      />
    </div>
  )
}
