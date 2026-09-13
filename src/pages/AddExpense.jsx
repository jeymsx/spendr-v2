import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import db, { UNSYNCED } from '../db/db'
import { postSplitExpense, applyBalanceEffect, checkOverdraw, saveTemplate, updateTransaction } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import { advanceNextDate } from '../utils/recurring'
import { useCreditAvailMap } from '../hooks/useCreditAvailMap'
import CategoryRail from '../components/CategoryRail'
import AccountPickerSheet from '../components/AccountPickerSheet'
import AccountSelectRow from '../components/AccountSelectRow'
import TxConfirmSheet from '../components/TxConfirmSheet'
import { fieldFrame } from '../components/ui/Field'
import { IconChevronRight } from '../components/icons'
import TemplatePickerSheet from '../components/TemplatePickerSheet'
import DupWarningSheet from '../components/DupWarningSheet'
import OverdrawWarningSheet from '../components/OverdrawWarningSheet'
import { IconCalendar, IconChevronLeft, IconTemplate} from '../components/icons'
import { useQuickPrefill } from '../hooks/useQuickPrefill'
import Button from '../components/ui/Button'
import IconButton from '../components/ui/IconButton'
import SectionLabel from '../components/ui/SectionLabel'
import DivideScreen from '../components/DivideScreen'
import { fmt } from '../lib/money'
import Rail from '../components/ui/Rail'

// ── Helpers ────────────────────────────────────────────────────────────────────

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
export default function AddExpense({ onCancel, onSaved, editTx = null } = {}) {
  const isEdit = !!editTx
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
  const [divideOpen,     setDivideOpen]     = useState(false)
  const [splitLegs,      setSplitLegs]      = useState(/** @type {any[]|null} */ (null))
  /** [{ name, amount }] owed back to you on this expense. */
  const [people,         setPeople]         = useState(/** @type {any[]|null} */ (null))
  /** The division as it was ENTERED, so reopening the screen restores it. */
  const [peopleSplit,    setPeopleSplit]    = useState(/** @type {any} */ (null))

  /* What the one row says once something has been divided. */
  const divideSummary = useMemo(() => {
    const parts = []
    if (splitLegs?.length) parts.push(`Split ${splitLegs.length} ways`)
    if (people?.length) parts.push(`${people.length} owe you ${fmt(people.reduce((s, p) => s + p.amount, 0))}`)
    return parts.length ? parts.join(' · ') : null
  }, [splitLegs, people])

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

  /* Filling the form from the row being edited.
   
     Waits for categories and accounts, because the pickers want the OBJECTS
     and the row only stores names - the same reason useQuickPrefill above
     waits. Guarded by a ref rather than by "is the field still empty", so
     clearing the note or zeroing the amount is not undone on the next render
     by a hydration that thinks it has not run. */
  const hydrated = useRef(false)
  useEffect(() => {
    if (!isEdit || hydrated.current) return
    if (!categories.length || !accounts.length) return
    hydrated.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAmountStr(numToMoneyStr(Math.abs(editTx.amount ?? 0)))
    setDescription(editTx.description ?? '')
    if (editTx.date) setDate(String(editTx.date).slice(0, 10))
    setCategory(categories.find(c => c.name === editTx.category) ?? null)
    setAccount(accounts.find(a => a.name === editTx.account) ?? null)
  }, [isEdit, editTx, categories, accounts])

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
    if (!category && !splitLegs) { setCatError(true);  err = true }
    if (!account)  { setAcctError(true); err = true }
    if (err) return

    /* What this will actually take out of the account.
   
       On an edit the old charge is already in the balance, so checking the
       full new amount would report an overdraw that has been paid for once
       already - "you cannot afford 500" on a 500 expense you made last week.
       Moving it to a DIFFERENT account is the exception: that one is charged
       the whole thing. */
    const draw = !isEdit ? amount
      : (account.name === editTx.account ? amount - (editTx.amount ?? 0) : amount)

    // checkOverdraw exempts credit accounts, so installments — which only
    // exist on credit — pass straight through.
    const over = draw > 0 ? await checkOverdraw(account.name, draw) : null
    if (over) {
      setOverdraw({ accountName: over.name, balance: over.balance ?? 0, amount: draw })
      return
    }
    return continueAfterBalanceCheck()
  }

  async function continueAfterBalanceCheck() {
    /* No duplicate check and no confirm sheet on an edit. The row it would
       flag as a duplicate is itself, and the sheet is a review of something
       about to be created - the form in front of you IS the review of a
       change to something that already exists. */
    if (isEdit) { handleSave(null); return }
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
      /* Editing changes THIS row and nothing else. It never adds one, which
         is why it returns before any of the machinery below: that code posts
         plans, legs and receivables, all of which are new rows.

         txId is left alone on purpose - a refund and a receivable both point
         at it. */
      if (isEdit) {
        await updateTransaction(editTx, {
          amount,
          description: description.trim(),
          category: category.name,
          account: account.name,
          date: date + (String(editTx.date ?? '').slice(10) || 'T00:00:00.000Z'),
        })
        showToast('Expense updated')
        if (onSaved) onSaved(); else navigate(-1)
        return
      }

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

      /* One receivable per person, each pointing at this purchase so that
         settling it refunds the category rather than counting as income. */
      const shares = (count === 1 ? (people ?? []) : []).filter(p => p.name && p.amount > 0)

      /**
       * One receivable per person, each pointing at the leg its share is for.
       *
       * `byCategory` maps a category name to the leg written for it. A person
       * pinned to Groceries settles against the Groceries row, so repaying
       * refunds Groceries - not whichever leg happened to be written first,
       * which is what every share used to do regardless of what it was for.
       * Unpinned falls back to that first leg, which is both the old
       * behaviour and the right one when there is only one leg to point at.
       *
       * @param {string|null} txId  the fallback leg
       * @param {string} categoryName  the fallback category
       * @param {Record<string, {txId: string|null, category: string}>} [byCategory]
       */
      const openReceivables = async (txId, categoryName, byCategory = {}) => {
        for (const p of shares) {
          const pinned = p.category ? byCategory[p.category] : null
          await db.debts.add({
            name:           p.name,
            contact:        p.name,
            amount:         p.amount,
            amountPaid:     0,
            type:           'owed_to_me',
            dueDate:        null,
            notes:          note || pinned?.category || categoryName,
            createdAt:      updISO,
            sourceTxId:     pinned?.txId ?? txId,
            sourceCategory: pinned?.category ?? categoryName,
            synced:         UNSYNCED,
            updatedAt:      updISO,
          })
        }
      }

      /* A split is N rows and one balance move, so it does not go through the
         loop above - postSplitExpense owns both. */
      if (splitLegs && count === 1) {
        const { ids } = await postSplitExpense({
          account: account.name,
          date: rows[0].date,
          description: note || undefined,
          legs: splitLegs,
          allowOverdraw: true,
        })
        const legRows = await Promise.all(ids.map(id => db.transactions.get(id)))
        /** @type {Record<string, {txId: string|null, category: string}>} */
        const byCategory = {}
        legRows.forEach((row, i) => {
          const name = splitLegs[i]?.category
          if (name && !byCategory[name]) {
            byCategory[name] = { txId: row?.txId ?? null, category: name }
          }
        })
        await openReceivables(legRows[0]?.txId ?? null, splitLegs[0].category, byCategory)
        if (templateData) await saveTemplate(templateData)
        showToast(shares.length
          ? `Split ${splitLegs.length} ways · ${shares.length} owe you`
          : `Split across ${splitLegs.length} categories`)
        if (onSaved) onSaved(); else navigate('/')
        return
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
      /* Outside the transaction above, and deliberately: it writes to a table
         that block does not name, and widening the scope to include `debts`
         would make the expense itself fail if a receivable did. The expense is
         the fact; the receivable is a note to chase someone. */
      await openReceivables(rows[0].txId, category.name)

      if (templateData) await saveTemplate(templateData)
      showToast(shares.length ? `Expense saved · ${shares.length} owe you`
              : count > 1 ? `${count} payments scheduled`
              : 'Expense saved')
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

  /* Rendered INSTEAD of the form, not over it. A full-screen overlay has to
     paint its own background, and in dark mode the app's is a gradient on
     <html> with a transparent body - so any slab of flat colour reads as the
     wrong background rather than as a new screen. Swapping the tree keeps
     every draft field alive in this component's state while letting the real
     background show. */
  if (divideOpen) {
    return (
        <DivideScreen
        open={divideOpen}
        onClose={() => setDivideOpen(false)}
        total={amount}
        categories={categories ?? []}
        initialCategory={category}
        initialLegs={splitLegs
          ? splitLegs.slice(1).map(l => ({
              cat: (categories ?? []).find(c => c.name === l.category),
              amountStr: String(l.amount),
            }))
          : null}
        initialSplit={peopleSplit}
        onApply={({ legs, people: shares, split }) => {
          setSplitLegs(legs)
          setPeople(shares)
          setPeopleSplit(split)
          /* A split supplies its own categories; the rail's single pick no
             longer means anything, but the first leg is still what a
             non-split save would file under. */
          if (legs?.length) {
            const first = (categories ?? []).find(c => c.name === legs[0].category)
            if (first) setCategory(first)
          }
          setDivideOpen(false)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col bg-transparent pb-6">
      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-5 pt-safe-header pb-2 shrink-0">
        <IconButton label="Back" onClick={() => (onCancel ? onCancel() : navigate(-1))}>
          <IconChevronLeft />
        </IconButton>
        <h1 className="text-base font-semibold text-slate-800 dark:text-white flex-1">
          {isEdit ? 'Edit Expense' : 'Add Expense'}
        </h1>
        {/* Templates start a new entry from a saved one, which is the opposite
            of editing a particular row. */}
        {!isEdit && (
          <Button
            variant="tint"
            size="xs"
            className="shrink-0 px-3.5 gap-1.5"
            onClick={() => setShowTemplates(true)}
          >
            <IconTemplate size={14} /> Templates
          </Button>
        )}
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
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 tracking-wide">
          {isInstallment ? 'Amount per month' : 'Amount'}
        </p>
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
          </div>
          {splitLegs ? (
            /* Once it is split there is no single category to highlight, so
               the rail would be lying. The legs replace it. */
            <button
              type="button"
              onClick={() => setDivideOpen(true)}
              className={`${fieldFrame()} w-full text-left`}
            >
              <span className="flex-1 min-w-0">
                <span className="block text-11 text-slate-400 dark:text-slate-500">
                  Split {splitLegs.length} ways
                </span>
                <span className="block text-sm font-medium text-slate-800 dark:text-white truncate">
                  {splitLegs.map(l => l.category).join(' · ')}
                </span>
              </span>
              <span className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true">
                <IconChevronRight />
              </span>
            </button>
          ) : (
            <CategoryRail
              categories={categories ?? []}
              selected={category}
              onSelect={cat => { setCategory(cat); setCatError(false) }}
            />
          )}

          {/* ONE row, not five controls.
 
              Splitting across categories and owing part of it to somebody are
              both real, and both belong to a minority of expenses - so they
              get a door rather than a permanent residence on a form whose job
              is amount, category, account, done. */}
          {amount > 0 && !isInstallment && !isEdit && (
            <button
              type="button"
              onClick={() => setDivideOpen(true)}
              className="mt-2 w-full flex items-center gap-2 py-2 px-1 rounded-2xl text-left
                active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
            >
              <span className="flex-1 min-w-0 text-xs font-semibold text-primary">
                {divideSummary ?? 'Split it, or share it with someone'}
              </span>
              <span className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true">
                <IconChevronRight />
              </span>
            </button>
          )}
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

        {/* Installment — credit accounts only, and never on an edit.

            A term is not a property of this row, it is how many rows exist:
            picking 6 writes six charges dated a month apart. Offering it here
            would mean "change 6 into 3" has to delete three future charges
            and "3 into 6" has to invent three, which is a different operation
            from editing the one you opened. Delete the plan and re-enter it,
            which is what deleteTxGroup already handles as a unit. */}
        {isCredit && !isEdit && (
          <div>
            <SectionLabel>Installment</SectionLabel>
            {/* -mx-4 px-4 to cancel the form's own px-4.

                Without it the scrollport stopped where the form's padding
                did, so a chip scrolling out was cut off 16px short of the
                screen with a strip of empty page beyond it - the row read as
                clipped rather than as continuing past the edge. Widening the
                port to the full screen and putting the 16px back as padding
                keeps the resting row aligned with every other field while
                letting the chips run off both sides. */}
            <Rail className="items-center gap-1.5 -mx-4 px-4 scroll-px-4">
              {[0, ...INSTALLMENT_TERMS].map(n => (
                <button
                  key={n}
                  onClick={() => { setCustomTerm(false); setInstallMonths(n) }}
                  className={[
                    'shrink-0 px-3.5 h-[38px] rounded-full text-xs font-semibold',
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
                  'shrink-0 px-3.5 h-[38px] rounded-full text-xs font-semibold',
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
                  className="shrink-0 w-[72px] px-2 h-[38px] rounded-full text-xs font-semibold tabular-nums text-center
                    bg-white dark:bg-primary/[0.07] text-slate-800 dark:text-white outline-none
                    border border-primary/60 dark:border-primary/60
                    placeholder-slate-300 dark:placeholder-slate-600"
                />
              )}
            </Rail>
            {isInstallment && (
              <p className="text-11 text-slate-500 dark:text-slate-400 mt-2 px-1 tabular-nums">
                {installMonths} × {fmt(amount)} ={' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">{fmt(installTotal)}</span> total
                {' · '}{fmtDateLabel(date)} → {fmtDateLabel(installLast)}
              </p>
            )}
          </div>
        )}

        {/* Date — last */}
        <div>
          <SectionLabel>{isInstallment ? 'First payment' : 'Date'}</SectionLabel>
          <div className={fieldFrame()}>
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
          {isEdit ? (saving ? 'Saving…' : 'Save changes')
            : isInstallment ? 'Review installment' : 'Review expense'}
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
        splitLegs={splitLegs}
        people={people}
        catByName={Object.fromEntries((categories ?? []).map(c => [c.name, c]))}
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
