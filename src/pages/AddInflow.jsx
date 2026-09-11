import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import db, { UNSYNCED } from '../db/db'
import { applyBalanceEffect, saveTemplate } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import { useCreditAvailMap } from '../hooks/useCreditAvailMap'
import CategoryRail from '../components/CategoryRail'
import AccountPickerSheet from '../components/AccountPickerSheet'
import AccountSelectRow from '../components/AccountSelectRow'
import TxConfirmSheet from '../components/TxConfirmSheet'
import { fieldFrame } from '../components/ui/Field'
import TemplatePickerSheet from '../components/TemplatePickerSheet'
import DupWarningSheet from '../components/DupWarningSheet'
import { IconCalendar, IconChevronLeft, IconTemplate} from '../components/icons'
import { useQuickPrefill } from '../hooks/useQuickPrefill'
import Button from '../components/ui/Button'
import IconButton from '../components/ui/IconButton'

// ── Helpers ────────────────────────────────────────────────────────────────────

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
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

  /* Quick log hands its parse over as router state; this fills the form once
     the categories and accounts have loaded, so the names it matched can be
     resolved to the objects the pickers expect. */
  useQuickPrefill({
    categories,
    accounts,
    /* REPLACES the form rather than merging into it - see AddExpense. A
       quick log is a new transaction, so anything the line does not name
       goes back to empty instead of inheriting the last one's answer. */
    apply: (p) => {
      setAmountStr(p.amount != null ? numToMoneyStr(p.amount) : '0')
      setDescription(p.description || '')
      setCategory(p.category ?? null)
      setAccount(p.account ?? null)
      if (p.date) setDate(p.date)
      setCatError(false)
      setAcctError(false)
    },
  })

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
      if (templateData) await saveTemplate(templateData)
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
        <IconButton label="Back" onClick={() => (onCancel ? onCancel() : navigate(-1))}>
          <IconChevronLeft />
        </IconButton>
        <h1 className="text-base font-semibold text-slate-800 dark:text-white flex-1">Add Inflow</h1>
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
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 tracking-wide">Amount</p>
      </div>

      {/* ── Form fields ── */}
      <div className="px-4 flex flex-col gap-4">

        {/* Description */}
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 px-1">Description</p>
          <div className={fieldFrame()}>
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

        {/* Date — last */}
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 px-1">Date</p>
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
        <Button size="lg" block onClick={onConfirmPress} disabled={saving || amount <= 0}>
          Review Inflow
        </Button>
      </div>

      {/* ── Sheets ── */}
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
