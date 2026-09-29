import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBack } from '../hooks/useBack'
import { useLeaveGuard } from '../hooks/useBackGuard'
import { homeAfterSave } from '../lib/navTrail'
import DiscardSheet from '../components/DiscardSheet'
import { useCategoryGuess } from '../hooks/useCategoryGuess'
import db, { UNSYNCED } from '../db/db'
import { applyBalanceEffect, saveTemplate, updateTransaction } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import { isoToDateInput, dateInputToIso } from '../utils/txDate'
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
import PinnedTop from '../components/ui/PinnedTop'
import SectionLabel from '../components/ui/SectionLabel'
import AmountInput from '../components/ui/AmountInput'
import ConversionChip from '../components/ConversionChip'
import { isEverydayAccount } from '../lib/accountMeta'
import { baseDecimals, zeroAmount } from '../lib/money'

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
export default function AddInflow({ onCancel, onSaved, editTx = null } = {}) {
  const isEdit = !!editTx
  const navigate = useNavigate()
  const back = useBack()
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

  // Not investments or loans: money reaches those by a transfer, not as income.
  const accounts       = useLiveQuery(async () => (await db.accounts.toArray()).filter(isEverydayAccount), [], [])
  const creditAvailMap = useCreditAvailMap(accounts)
  const categories = useLiveQuery(
    () => db.categories.where('type').equals('inflow').toArray()
      .then(cs => cs.sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name))),
    [], [],
  )

  /* Filling the form from the row being edited. Waits for the lookups,
     guarded by a ref - see AddExpense for why both. */
  const hydrated = useRef(false)
  useEffect(() => {
    if (!isEdit || hydrated.current) return
    if (!categories.length || !accounts.length) return
    hydrated.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAmountStr(numToMoneyStr(Math.abs(editTx.amount ?? 0)))
    setDescription(editTx.description ?? '')
    if (editTx.date) setDate(isoToDateInput(editTx.date))
    setCategory(categories.find(c => c.name === editTx.category) ?? null)
    setAccount(accounts.find(a => a.name === editTx.account) ?? null)
  }, [isEdit, editTx, categories, accounts])

  /* The category this description has meant before (hooks/useCategoryGuess):
     "Jollibee" is Food because that is what it has always been. Only while
     the category is still the app's to choose - one you picked, or one a
     template, a quick log or the row being edited brought, is never replaced
     by a guess. */
  const guess = useCategoryGuess(description, 'inflow', categories)
  const [catChosen, setCatChosen] = useState(false)
  /* The id the app itself picked, so a guess that stops fitting - "Grab"
     changed to "Office supplies" - is let go of rather than passing for your
     own choice. */
  const [guessedId, setGuessedId] = useState(/** @type {any} */ (null))
  const guessed = !isEdit && !catChosen && category != null && category.id === guessedId

  // Whether leaving would lose something - see AddExpense.
  const dirty = isEdit
    ? !!account && (
      parseMoney(amountStr) !== Math.abs(editTx.amount ?? 0)
      || description.trim() !== String(editTx.description ?? '').trim()
      || (!!category && category.name !== editTx.category)
      || account.name !== editTx.account
      || date !== isoToDateInput(editTx.date))
    : parseMoney(amountStr) > 0 || description.trim() !== '' || catChosen
  const leaveGuard = useLeaveGuard(dirty, onCancel ?? back)
  useEffect(() => {
    if (catChosen || isEdit) return
    if (guess) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategory(prev => (prev?.id === guess.id ? prev : guess))
      setGuessedId(guess.id)
      setCatError(false)
    } else if (guessedId != null) {
      setCategory(prev => (prev?.id === guessedId ? null : prev))
      setGuessedId(null)
    }
  }, [guess, guessedId, catChosen, isEdit])

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
      setCatChosen(!!p.category)
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

  const handleAmountChange = moneyChangeHandler(setAmountStr, baseDecimals(account?.currency))

  async function onConfirmPress() {
    let err = false
    if (!category) { setCatError(true);  err = true }
    if (!account)  { setAcctError(true); err = true }
    /* A date after today. The field's max stops the picker, not a date
       typed into it on a computer - and a future row moved the balance at
       once while the lists, which hide what has not happened yet, never
       showed it. A row being edited that was already ahead keeps its date. */
    if (date > localDateStr(new Date()) && !(isEdit && String(editTx?.date ?? '').slice(0, 10) > localDateStr(new Date()))) {
      showToast('Pick today or an earlier date', 'error')
      err = true
    }
    if (err) return
    /* No duplicate check and no confirm on an edit: the row it would flag is
       itself, and the form IS the review of a change. */
    if (isEdit) { handleSave(null); return }
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
      /* An edit changes this row and adds nothing, so it returns before the
         insert below. txId is untouched - other rows point at it. */
      if (isEdit) {
        await updateTransaction(editTx, {
          amount,
          description: description.trim(),
          category: category.name,
          account: account.name,
          date: dateInputToIso(date, editTx.date),
        })
        showToast('Inflow updated')
        leaveGuard.leave(() => { if (onSaved) onSaved(); else back() })
        return
      }

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
      // Home in place of the form, so back does not reopen it (AddExpense).
      leaveGuard.leave(() => { if (onSaved) onSaved(); else homeAfterSave(navigate) })
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
    if (cat)  { setCategory(cat); setCatChosen(true); setCatError(false) }
    if (acct) { setAccount(acct);  setAcctError(false) }
  }

  return (
    <div className="flex flex-col bg-transparent pb-6">

      {/* ── Header ── */}
      {/* Three columns, the outer two the same width, so the title sits in
          the true centre whatever is either side of it - a 36px back button
          on one, the wider Templates pill (or nothing) on the other - the way
          every SubPage title does. */}
      {/* Pinned while the form scrolls under it, the way every page's
          header is (ui/PinnedTop.jsx). */}
      <PinnedTop className="shrink-0">
        <header className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-5 pt-safe-header pb-2 shrink-0">
          <IconButton label="Back" className="justify-self-start" onClick={leaveGuard.tryLeave}>
            <IconChevronLeft />
          </IconButton>
          <h1 className="text-base font-semibold text-slate-800 dark:text-white text-center truncate">
            {isEdit ? 'Edit inflow' : 'Add inflow'}
          </h1>
          {/* Templates start a new entry from a saved one, which is the
              opposite of editing a particular row. */}
          {!isEdit && (
            /* An icon, as the Back beside it is. "Templates" in words sat hard
               against the centred title on a narrow phone. */
            <IconButton label="Templates" className="justify-self-end" onClick={() => setShowTemplates(true)}>
              <IconTemplate size={17} />
            </IconButton>
          )}
        </header>
      </PinnedTop>

      {/* ── Amount ── */}
      <div className="flex flex-col items-center px-6 pt-12 pb-12 shrink-0">
        {/* The primitive, not a raw input, and the reason is the mark: it is
            glued to the first digit rather than sitting beside it, so a
            dollar expense reads "$40" while you type instead of a bare "40".
            See components/ui/AmountInput.jsx - this is the `page` size. */}
        <AmountInput
          ref={amountInputRef}
          size="page"
          value={amountStr === '0' ? '' : amountStr}
          onChange={handleAmountChange}
          currency={account?.currency}
          placeholder={zeroAmount(account?.currency)}
          label="Amount"
        />
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 tracking-wide">Amount</p>
        {/* What that is in the ledger's currency, and the rate it used.
            Renders nothing at all unless this account is held in another
            currency, which is every account for most people. */}
        <ConversionChip
          amount={parseMoney(amountStr)}
          currency={account?.currency}
          className="mt-3"
        />
      </div>

      {/* ── Form fields ── */}
      <div className="px-4 flex flex-col gap-4">

        {/* Description */}
        <div>
          <SectionLabel>Description</SectionLabel>
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
          <div className="flex items-baseline gap-2">
            <SectionLabel>Category</SectionLabel>
            {catError && !category && (
              <p className="text-xs font-medium text-red-500 dark:text-red-400 mb-1.5">Pick one</p>
            )}
            {guessed && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-1.5">From your history</p>
            )}
          </div>
          <CategoryRail
            categories={categories ?? []}
            selected={category}
            onSelect={cat => { setCategory(cat); setCatChosen(true); setCatError(false) }}
          />
        </div>

        {/* Account */}
        <div>
          <SectionLabel>Account</SectionLabel>
          <AccountSelectRow
            account={account}
            creditAvailable={account ? creditAvailMap?.[account.name] : null}
            error={acctError}
            onClick={() => { setAcctError(false); setShowAcctSheet(true) }}
          />
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
        <Button size="lg" block onClick={onConfirmPress} disabled={saving || amount <= 0}>
          {isEdit ? (saving ? 'Saving…' : 'Save changes') : 'Review inflow'}
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
        account={account}
        type="inflow"
      />
      {/* Before what you typed is thrown away (hooks/useBackGuard.js). */}
      <DiscardSheet open={leaveGuard.asking} onKeep={leaveGuard.keep} onDiscard={leaveGuard.discard} />
    </div>
  )
}
