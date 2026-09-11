import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import db, { UNSYNCED } from '../db/db'
import { applyBalanceEffect, checkOverdraw, saveTemplate } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import { advanceNextDate } from '../utils/recurring'
import { useCreditAvailMap } from '../hooks/useCreditAvailMap'
import CategoryRail from '../components/CategoryRail'
import AccountPickerSheet from '../components/AccountPickerSheet'
import AccountSelectRow from '../components/AccountSelectRow'
import TxConfirmSheet from '../components/TxConfirmSheet'
import TemplatePickerSheet from '../components/TemplatePickerSheet'
import DupWarningSheet from '../components/DupWarningSheet'
import OverdrawWarningSheet from '../components/OverdrawWarningSheet'
import { IconCalendar, IconChevronLeft, IconTemplate} from '../components/icons'
import { useQuickPrefill } from '../hooks/useQuickPrefill'
import Button from '../components/ui/Button'
import IconButton from '../components/ui/IconButton'

// ── Helpers ────────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _phpFmt.format(Math.abs(n))
}

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
  /* Quick log hands its parse over as router state; this fills the form once
     the categories and accounts have loaded, so the names it matched can be
     resolved to the objects the pickers expect. */
  useQuickPrefill({
    categories,
    accounts,
    /* REPLACES the form rather than merging into it, because a quick log is
       a new transaction and not an edit of whatever was on screen. Merging
       leaves the previous entry's category and account in place whenever the
       new line does not name them - and quietly keeps installMonths, so a
       second log onto a credit account would inherit a payment plan nobody
       asked for. */
    apply: (p) => {
      setAmountStr(p.amount != null ? numToMoneyStr(p.amount) : '0')
      setDescription(p.description || '')
      setCategory(p.category ?? null)
      setAccount(p.account ?? null)
      if (p.date) setDate(p.date)
      setInstallMonths(0)
      setCustomTerm(false)
      setCatError(false)
      setAcctError(false)
    },
  })

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

  /* Picking a non-credit account cancels any term already chosen.

     Done in the one handler every account change goes through, rather than
     in an effect watching `isCredit`. The effect cleared the term a render
     LATE, so for one pass the form still held a payment plan for an account
     that cannot carry one - and because it had to list `installMonths` as a
     dependency it also re-ran on every term the user picked, only to decide
     it had nothing to do. */
  function chooseAccount(acct) {
    setAccount(acct)
    setAcctError(false)
    if (acct?.type !== 'credit') { setInstallMonths(0); setCustomTerm(false) }
  }

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
      if (templateData) await saveTemplate(templateData)
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
    if (acct) chooseAccount(acct)
  }

  return (
    <div className="flex flex-col bg-transparent pb-6">
      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 pt-safe-header pb-2 shrink-0">
        <IconButton label="Back" onClick={() => (onCancel ? onCancel() : navigate(-1))}>
          <IconChevronLeft />
        </IconButton>
        <h1 className="text-base font-semibold text-slate-800 dark:text-white flex-1">Add Expense</h1>
        <button
          onClick={() => setShowTemplates(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold
            text-primary bg-primary/[0.08] dark:bg-primary/[0.12]
            border border-primary/20 active:scale-95 transition-transform duration-75"
        >
          <IconTemplate size={14} /> Templates
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

        {/* ── Category ──
            A row you swipe, not a field that opens a sheet. The sheet was
            three interactions for one choice - tap the field, tap the
            category, watch it dismiss - and it covered the amount you had
            just typed while you made it. See components/CategoryRail.jsx.

            The error moved up beside the label: the rail has no empty box to
            put "Required" inside, and next to the heading is where it is
            legible without shifting the tiles. */}
        <div>
          <div className="flex items-baseline gap-2 mb-1.5 px-1">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Category</p>
            {catError && !category && (
              <p className="text-xs font-medium text-red-500 dark:text-red-400">Pick one</p>
            )}
          </div>
          <CategoryRail
            categories={categories ?? []}
            selected={category}
            onSelect={cat => { setCategory(cat); setCatError(false) }}
          />
        </div>

        {/* Account */}
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 px-1">Account</p>
          <AccountSelectRow
            account={account}
            creditAvailable={account ? creditAvailMap?.[account.name] : null}
            error={acctError}
            onClick={() => { setAcctError(false); setShowAcctSheet(true) }}
          />
        </div>

        {/* Installment — credit accounts only */}
        {isCredit && (
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 px-1">
              Installment
            </p>
            {/* -mx-4 px-4 to cancel the form's own px-4.

                Without it the scrollport stopped where the form's padding
                did, so a chip scrolling out was cut off 16px short of the
                screen with a strip of empty page beyond it - the row read as
                clipped rather than as continuing past the edge. Widening the
                port to the full screen and putting the 16px back as padding
                keeps the resting row aligned with every other field while
                letting the chips run off both sides. */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 scroll-px-4">
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
        <Button size="lg" block onClick={onConfirmPress} disabled={saving || amount <= 0}>
          {isInstallment ? 'Review Installment' : 'Review Expense'}
        </Button>
      </div>

      {/* ── Sheets ── */}
      <AccountPickerSheet
        open={showAcctSheet}
        onClose={() => setShowAcctSheet(false)}
        accounts={accounts ?? []}
        selected={account}
        onSelect={chooseAccount}
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
