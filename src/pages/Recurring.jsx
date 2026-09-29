import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBack } from '../hooks/useBack'
import BillSpots from './recurring/BillSpots'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import CategoryPickerSheet from '../components/CategoryPickerSheet'
import AccountPickerSheet from '../components/AccountPickerSheet'
import { deleteRecurringRemote } from '../lib/sync'
import { IconChevronRight, IconPlus } from '../components/icons'
import SegTabs from '../components/SegTabs'
import { validateRecurring, saveRecurring, isIncomeRecurring } from '../lib/recurringWrite'
import {
  FREQ_OPTIONS, FREQ_ORDER, FREQ_LABEL, FREQ_SHORT,
  toMonthlyAmount, parseDateLocal, daysUntil, dueStatus, DUE_TONE,
} from '../utils/recurring'
import CategoryGlyph from '../components/CategoryGlyph'
import BillMark from '../components/BillMark'
import IconButton from '../components/ui/IconButton'
import PageHeader from '../components/PageHeader'
import Sheet from '../components/ui/Sheet'
import StatTrio from '../components/ui/StatTrio'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Divider from '../components/ui/Divider'
import EmptyState from '../components/ui/EmptyState'
import SectionLabel from '../components/ui/SectionLabel'
import { SkeletonHero, SkeletonStatTrio, SkeletonList } from '../components/ui/Skeleton'
import { fmt, fmtCompact, baseSymbol } from '../lib/money'
import { creditCardBills } from '../lib/creditBills'
import { accountBrand } from '../lib/accountBrands'
import { normalizeDesign } from '../lib/cardDesigns'
import BrandMark from '../components/BrandMark'
import { currencyOfAccountName } from '../lib/fxContext'
import { isEverydayAccount, isLoan } from '../lib/accountMeta'
import { loanStatus } from '../lib/loans'
import { payLoan } from '../db/accountWrites'
import LoanPaySheet from './accounts/LoanPaySheet'
import { BrandSquare } from './accounts/HoldingTile'
import { toDateInput } from '../utils/txDate'

// ── Formatters ─────────────────────────────────────────────────────────────────


// ── Pieces ─────────────────────────────────────────────────────────────────────

/**
 * A heading, and optionally a figure beside it.
 *
 * `hint` is gone. It held a sentence under the heading explaining what the
 * heading meant - "Active bills falling due in the next 30 days." under
 * "Coming up" - which is prose no native list view carries. A number on the
 * right is the iOS shape for the same slot: it adds information rather than
 * restating the label.
 *
 * The heading itself is <SectionLabel>; all this adds is the row that puts a
 * figure opposite it. The gutter is px-4 rather than px-5 because
 * SectionLabel carries 4px of its own, so the words still land on the page's
 * 20px line, and the 10px under the heading is split between SectionLabel's
 * own 6px and the 4px here rather than fighting it with an mb-0.
 */
/* SectionHeading was defined here and byte-identically in the other bills
   file: a SectionLabel with a figure beside it, which is what SectionLabel's
   own `action` slot is for. Both are gone; the call sites say it directly. */

/**
 * One bill, as a row.
 *
 * A row and nothing else. This used to be a card carrying an Edit link, a
 * "Post now" pill, an active toggle and a chevron - five targets for one bill,
 * which is what made a list of three of them read as a control panel rather
 * than a list. Every verb lives on the bill's own page now: pay, pause, edit,
 * delete.
 *
 * So the row's whole job is to get you there, and what it shows is what you
 * need in order to decide whether to go: what it is, when it lands, and how
 * much. The due date leads the meta line because it is the part that changes.
 * Same shape the home screen's Upcoming rows use ("Internet / Overdue ·
 * GCash"), so a bill looks like the same object in both places.
 */
function BillRow({ rec, onOpen, isLast }) {
  const income = isIncomeRecurring(rec)
  /* Income is not "due": a salary two days out is coming in, not owed, and
     its date carries no warning colour. */
  const due = rec.active ? dueStatus(rec.nextDate) : null
  const dim = !rec.active

  return (
    <>
      <button
        onClick={() => onOpen(rec)}
        data-web-id={`recurring-${rec.id}`}
        className="w-full flex items-center gap-3 px-4 py-4 text-left
          active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
      >
        {/* The brand's own mark when the name is one we know, the category
            tile when it is not. Both are the same 40px box, so the row does
            not reflow between a Netflix and a Meralco. */}
        <BillMark
          name={rec.name}
          cat={rec._cat}
          size={20}
          dim={dim}
          boxClass="w-10 h-10 rounded-2xl"
        />

        <span className="flex-1 min-w-0">
          <span className={`block text-14 font-semibold truncate ${
            dim ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-white'
          }`}>
            {rec.name}
          </span>
          <span className="block text-11 truncate">
            {/* Paused replaces the date rather than sitting beside it. A
                paused bill's "next" date is not going to happen, and showing
                one anyway is the kind of detail that quietly misleads. */}
            {dim ? (
              <span className="text-slate-500 dark:text-slate-400">{rec.account} · Paused</span>
            ) : (
              <>
                <span className={income ? 'text-slate-500 dark:text-slate-400' : (DUE_TONE[due?.tone] ?? 'text-slate-500 dark:text-slate-400')}>
                  {income && due?.tone === 'late' && due.days < 0 ? 'Not marked yet' : (due?.label ?? 'No date')}
                </span>
                {/* The account, and not the frequency. "Monthly" here
                    duplicated the /mo already sitting under the amount on
                    the right - measured, carrying both pushed this line to
                    165px in a 153px column and it rendered as "9d overdue ·
                    GCash · Mont...". Dropping the duplicate is free. */}
                <span className="text-slate-500 dark:text-slate-400">
                  {' · '}{rec.account}
                </span>
              </>
            )}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className={`block text-14 font-semibold tabular-nums ${
            dim ? 'text-slate-400 dark:text-slate-500'
              : income ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-white'
          }`}>
            {income ? '+' : ''}{fmt(rec.amount, currencyOfAccountName(rec.account))}
          </span>
          <span className="block text-11 text-slate-400 dark:text-slate-500 mt-0.5">
            /{FREQ_SHORT[rec.frequency] ?? rec.frequency}
          </span>
        </span>

        <span className="shrink-0 text-slate-300 dark:text-slate-600">
          <IconChevronRight size={15} strokeWidth="2" />
        </span>
      </button>
      {/* Inset to the tile, not to the card: the row is led by a 40px mark,
          so a full-width rule would cut the card rather than separate two
          bills inside it. */}
      {!isLast && <Divider inset="glyph" />}
    </>
  )
}

/**
 * A credit card's statement, sitting in the list beside the real bills.
 *
 * It looks like a BillRow on purpose - this is the screen you check to answer
 * "what do I owe this month", and for most people a card statement is the
 * biggest thing on that list. What it is NOT is a recurring record: nothing
 * is stored, and the row disappears the moment the statement is settled.
 *
 * The action is Pay rather than a tap-through, and it opens the transfer form
 * with the card and the amount already in it. A statement is paid by moving
 * money, not by posting an expense - lib/creditBills has why that distinction
 * is the whole reason this is not a real bill.
 */
function CardBillRow({ bill, onPay, onOpen, isLast }) {
  const brand = accountBrand(bill.account)
  const late  = bill.overdue
  const label = bill.daysUntil == null ? 'No due date'
    : late                             ? `${Math.abs(bill.daysUntil)}d overdue`
    : bill.daysUntil === 0             ? 'Due today'
    : bill.daysUntil === 1             ? 'Due tomorrow'
    : `Due in ${bill.daysUntil} days`

  return (
    <>
      {/* The row opens the card, the way every other row in the app opens the
          thing it names - a statement you cannot tap is a dead end on a page
          made of links. Pay stays its own button and stops the press
          bubbling, so the two do not fight over the same tap.

          A div with a button inside cannot itself be a button, so the row is
          a div and the tappable region is the part left of Pay. */}
      <div className="w-full flex items-center gap-3 pr-4">
        <button
          type="button"
          onClick={() => onOpen?.(bill)}
          aria-label={`Open ${bill.name}`}
          className="flex-1 min-w-0 flex items-center gap-3 px-4 py-4 text-left
            active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
        >
        {/* The card's own face, in the 40px box BillMark uses, so the row
            lines up with the bills either side of it. */}
        <span
          className="acct-card shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center text-white"
          style={{ '--card-from': brand.from, '--card-to': brand.to }}
          data-design={normalizeDesign(bill.account.design)}
          aria-hidden="true"
        >
          <BrandMark mark={brand.mark} size={16} className="opacity-95" />
        </span>

        <span className="flex-1 min-w-0">
          <span className="block text-14 font-semibold truncate text-slate-800 dark:text-white">
            {bill.name}
          </span>
          <span className="block text-11 truncate">
            <span className={late
              ? 'text-red-500 dark:text-red-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'}>
              {label}
            </span>
          </span>
        </span>

        {/* The minimum sits under the amount rather than beside the due date.
            Next to "8d overdue" it was the second half of a line that had to
            fit a Pay button too, and it truncated to "min ₱5…" - which is the
            one figure on this row you cannot half-read. */}
        <span className="shrink-0 text-right">
          <span className="block text-14 font-semibold tabular-nums text-slate-800 dark:text-white">
            {fmt(bill.amount, currencyOfAccountName(bill.account))}
          </span>
          <span className="block text-11 text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
            {bill.minimumDue > 0 ? `min ${fmtCompact(bill.minimumDue)}` : 'statement'}
          </span>
        </span>
        </button>

        <Button
          size="xs"
          variant="tint"
          className="shrink-0 px-3"
          onClick={(e) => { e.stopPropagation(); onPay(bill) }}
        >
          Pay
        </Button>
      </div>
      {!isLast && <Divider inset="glyph" />}
    </>
  )
}

/**
 * A loan's next payment, beside the card statements.
 *
 * Not a recurring bill, though it recurs: a bill posts its whole amount as
 * spending, and a loan payment is mostly your own money paying down what you
 * owe - only the interest is spending. So it is listed here the way a card
 * statement is, derived from the loan (lib/loans loanStatus) rather than
 * stored, and Pay opens the loan's own sheet, which splits it.
 *
 * The loan's logo square rather than a card face: a loan is not drawn as a
 * card anywhere (accounts/HoldingTile).
 */
function LoanDueRow({ due, onPay, onOpen, isLast }) {
  const { account, status } = due
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((new Date(status.nextDue).setHours(0, 0, 0, 0) - today.getTime()) / 864e5)
  const cur = account.currency || currencyOfAccountName(account.name)
  const next = status.nextDue.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  const tone = status.overdue ? 'text-red-500 dark:text-red-400 font-semibold'
    : status.paidThisCycle ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
    : 'text-slate-500 dark:text-slate-400'
  const label = status.overdue ? `${Math.abs(days)}d overdue`
    /* One word, because the column is narrow: "Paid · next Nov 20" truncated
       at 390px and "Paid · Nov 20" at 360. The next date is a tap away, and
       in the row's label for a screen reader. */
    : status.paidThisCycle ? 'Paid'
    : days === 0 ? 'Due today'
    : days === 1 ? 'Due tomorrow'
    : `Due in ${days} days`

  return (
    <>
      <div className="w-full flex items-center gap-3 pr-4">
        <button
          type="button"
          onClick={() => onOpen?.(account)}
          aria-label={`Open ${account.name}${status.paidThisCycle ? `, paid, next due ${next}` : ''}`}
          className="flex-1 min-w-0 flex items-center gap-3 px-4 py-4 text-left
            active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
        >
          <BrandSquare acct={account} size={40} className="rounded-2xl" />

          <span className="flex-1 min-w-0">
            <span className="block text-14 font-semibold truncate text-slate-800 dark:text-white">
              {account.name}
            </span>
            <span className={`block text-11 truncate ${tone}`}>{label}</span>
          </span>

          {/* The interest under the amount, where a card puts its minimum:
              the one part of the payment that is spending. */}
          <span className="shrink-0 text-right">
            <span className="block text-14 font-semibold tabular-nums text-slate-800 dark:text-white">
              {fmt(status.next.amount, cur)}
            </span>
            <span className="block text-11 text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
              {status.next.interest > 0.005 ? `${fmtCompact(status.next.interest, cur)} interest` : 'no interest'}
            </span>
          </span>
        </button>

        <Button
          size="xs"
          variant="tint"
          className="shrink-0 px-3"
          onClick={(e) => { e.stopPropagation(); onPay(due) }}
        >
          Pay
        </Button>
      </div>
      {!isLast && <Divider inset="glyph" />}
    </>
  )
}

// ── Recurring Form Sheet ───────────────────────────────────────────────────────

/**
 * The add/edit form.
 *
 * `showDelete` defaults to true because the web layer's table has no other
 * way to remove a bill - its comment says so, it reuses this delete flow
 * deliberately. The mobile detail page passes false: it owns deletion itself,
 * at the bottom of the page where a destructive action belongs, and two
 * delete buttons for one bill is one too many. Deleting from in here would
 * also strand you on a detail page for a bill that no longer exists.
 */
export function RecurringFormSheet({ open, onClose, editRec, categories, accounts, showDelete = true }) {
  const { showToast } = useToast()
  const [name,         setName]         = useState('')
  const [amountStr,    setAmountStr]    = useState('')
  const [category,     setCategory]     = useState(null)
  const [account,      setAccount]      = useState(null)
  const [frequency,    setFrequency]    = useState('monthly')
  const [nextDate,     setNextDate]     = useState('')
  const [active,       setActive]       = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [errors,       setErrors]       = useState({})
  const [confirmDel,   setConfirmDel]   = useState(false)
  const [deleting,     setDeleting]     = useState(false)
  const [showCatPick,  setShowCatPick]  = useState(false)
  const [showAcctPick, setShowAcctPick] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editRec) {
      // Hydrate-on-open. The sheet renders null when closed but stays
      // mounted through its own exit animation, so the parent can neither
      // unmount nor re-key it to reset these fields for the next record.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(editRec.name ?? '')
      setAmountStr(editRec.amount != null ? numToMoneyStr(editRec.amount) : '')
      setCategory(categories.find(c => c.name === editRec.category) ?? null)
      setAccount(accounts.find(a => a.name === editRec.account) ?? null)
      setFrequency(editRec.frequency ?? 'monthly')
      setNextDate(editRec.nextDate ? editRec.nextDate.slice(0, 10) : '')
      setActive(editRec.active !== false)
    } else {
      setName('')
      setAmountStr('')
      setCategory(null)
      setAccount(null)
      setFrequency('monthly')
      setNextDate(toDateInput())
      setActive(true)
    }
    setErrors({})
    setConfirmDel(false)
  }, [open, editRec, categories, accounts])

  /* Validation and the write itself come from lib/recurringWrite, which the
     mobile page also calls. They are two layouts of one record, and a second
     copy of "is this valid" is how one screen starts accepting a bill the
     other rejects. */
  async function handleSave() {
    const draft = { name, amountStr, category, account, frequency, nextDate, active }
    const errs = validateRecurring(draft)
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    try {
      const what = await saveRecurring(draft, editRec)
      showToast(what === 'created' ? 'Bill added' : `${noun} updated`)
      onClose()
    } catch (e) {
      console.error('[RecurringForm] save failed:', e)
      showToast('Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    try {
      await db.recurring.delete(editRec.id)
      await deleteRecurringRemote(editRec.id, editRec.name, editRec.syncId)
      onClose()
    } catch (e) {
      console.error('[RecurringForm] delete failed:', e)
      showToast('Failed to delete', 'error')
      setDeleting(false)
    }
  }

  /* The desktop table opens this for income too. It never CREATES income -
     the draft carries no type, so a new row is a bill and an edited salary
     stays a salary (toRecurringRow) - but editing one should say what it is
     and offer income categories, not bill ones. */
  const income = isIncomeRecurring(editRec)
  const noun = income ? 'Income' : 'Bill'
  const expenseCategories = useMemo(
    () => (categories ?? []).filter(c => c.type === (income ? 'inflow' : 'expense'))
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name)),
    [categories, income],
  )
  // Money you hold: a bill is not paid from an investment, nor pay received into a loan.
  const payAccounts = useMemo(() => (accounts ?? []).filter(isEverydayAccount), [accounts])

  /* Sheet owns the overlay, the panel, the grab handle, the 92dvh cap, the
     scroll lock, Escape, the focus trap and the exit animation. The Delete
     button rides on the title row as `titleAction`, and Save is the pinned
     `footer` - in the old panel it was the last thing in a column that
     scrolled, so on a short screen it sat below the fold. */
  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        // Typed into and dismissed by accident: asked first (ui/Sheet.jsx).
        unsaved="typed"
        scrim={40}
        maxHeight="92dvh"
        title={editRec ? `Edit ${noun.toLowerCase()}` : 'New bill'}
        titleAction={editRec && showDelete && (
          <Button
            variant={confirmDel ? 'danger' : 'dangerTint'}
            size="xs"
            className="px-3"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : confirmDel ? 'Confirm delete' : 'Delete'}
          </Button>
        )}
        footer={(
          <Button block size="lg" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editRec ? 'Save changes' : 'Add recurring'}
          </Button>
        )}
      >
        <div className="space-y-4">

          {/* Name */}
          <div>
            <SectionLabel>Name</SectionLabel>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: null })) }}
              placeholder="e.g. Netflix, Rent, Gym"
              className={[
                'w-full h-[52px] px-4 rounded-2xl text-sm text-slate-800 dark:text-white',
                'bg-white dark:bg-white/[0.05] outline-none',
                'placeholder:text-slate-300 dark:placeholder:text-slate-600',
                errors.name
                  ? 'border border-red-300 dark:border-red-500/40'
                  : 'border border-slate-200/80 dark:border-white/[0.08]',
              ].join(' ')}
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* Amount */}
          <div>
            <SectionLabel>Amount</SectionLabel>
            <div className={[
              'flex items-center h-[52px] px-4 rounded-2xl',
              'bg-white dark:bg-white/[0.05]',
              errors.amount
                ? 'border border-red-300 dark:border-red-500/40'
                : 'border border-slate-200/80 dark:border-white/[0.08]',
            ].join(' ')}>
              <span className="text-slate-400 dark:text-slate-500 mr-1.5 text-sm shrink-0">{baseSymbol()}</span>
              <input
                type="text" inputMode="decimal"
                value={amountStr}
                onChange={e => { moneyChangeHandler(setAmountStr)(e); setErrors(p => ({ ...p, amount: null })) }}
                placeholder="0.00"
                className="flex-1 bg-transparent outline-none text-sm font-semibold text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 tabular-nums w-0"
              />
            </div>
            {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount}</p>}
          </div>

          {/* Frequency */}
          <div>
            <SectionLabel>Frequency</SectionLabel>
            {/* Wrapping chips, not a four-across grid. The grid was four
                wide because there were exactly four; there are seven now, and
                "Every 6 months" does not fit a quarter of the sheet. */}
            <div className="flex flex-wrap gap-2">
              {FREQ_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFrequency(opt.value)}
                  className={[
                    // active:scale-95 - the shrink every other chip row has.
                    'h-9 px-4 rounded-full border text-13 font-semibold transition-all duration-150 active:scale-95',
                    frequency === opt.value
                      /* seg-active, not text-primary. Measured, the accent
                         as text is 2.63:1 on its own 8% tint - worse than
                         on bare white, and nowhere near the 4.5:1 that
                         14px semibold needs. The class mixes it 65% into
                         black for light mode and leaves it alone in dark,
                         giving 5.53:1 and 5.59:1. Same mechanism as the
                         Insights segmented control, for the same reason. */
                      ? 'seg-active border-primary/40 bg-primary/[0.08] dark:bg-primary/[0.12]'
                      : 'border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 bg-white dark:bg-white/[0.03]',
                  ].join(' ')}
                  style={frequency === opt.value ? { '--seg-color': 'var(--color-primary)' } : undefined}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div>
            <SectionLabel>Category</SectionLabel>
            <button
              onClick={() => setShowCatPick(true)}
              className={[
                'w-full h-[52px] px-4 rounded-2xl flex items-center gap-3 text-left',
                'bg-white dark:bg-white/[0.05]',
                'active:bg-slate-50 dark:active:bg-white/[0.08] transition-colors',
                errors.category
                  ? 'border border-red-300 dark:border-red-500/40'
                  : 'border border-slate-200/80 dark:border-white/[0.08]',
              ].join(' ')}
            >
              {category ? (
                <>
                  <span className="leading-none"><CategoryGlyph cat={category} size={20} /></span>
                  <span className="flex-1 text-sm font-medium text-slate-800 dark:text-white">{category.name}</span>
                </>
              ) : (
                <span className="flex-1 text-sm text-slate-400 dark:text-slate-500">Select category</span>
              )}
              <span className="text-slate-300 dark:text-slate-600"><IconChevronRight size={15} strokeWidth="2" /></span>
            </button>
            {errors.category && <p className="mt-1 text-xs text-red-500">{errors.category}</p>}
          </div>

          {/* Account */}
          <div>
            <SectionLabel>Account</SectionLabel>
            <button
              onClick={() => setShowAcctPick(true)}
              className={[
                'w-full h-[52px] px-4 rounded-2xl flex items-center gap-3 text-left',
                'bg-white dark:bg-white/[0.05]',
                'active:bg-slate-50 dark:active:bg-white/[0.08] transition-colors',
                errors.account
                  ? 'border border-red-300 dark:border-red-500/40'
                  : 'border border-slate-200/80 dark:border-white/[0.08]',
              ].join(' ')}
            >
              {account ? (
                <>
                  <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: account.color ?? '#2D9DFF' }} />
                  <span className="flex-1 text-sm font-medium text-slate-800 dark:text-white">{account.name}</span>
                </>
              ) : (
                <span className="flex-1 text-sm text-slate-400 dark:text-slate-500">Select account</span>
              )}
              <span className="text-slate-300 dark:text-slate-600"><IconChevronRight size={15} strokeWidth="2" /></span>
            </button>
            {errors.account && <p className="mt-1 text-xs text-red-500">{errors.account}</p>}
          </div>

          {/* Next date */}
          <div>
            <SectionLabel>Next due date</SectionLabel>
            <input
              type="date"
              value={nextDate}
              onChange={e => { setNextDate(e.target.value); setErrors(p => ({ ...p, nextDate: null })) }}
              className={[
                'block w-full h-[52px] px-4 rounded-2xl text-sm text-slate-800 dark:text-white',
                'bg-white dark:bg-white/[0.05] outline-none dark:[color-scheme:dark]',
                errors.nextDate
                  ? 'border border-red-300 dark:border-red-500/40'
                  : 'border border-slate-200/80 dark:border-white/[0.08]',
              ].join(' ')}
            />
            {errors.nextDate && <p className="mt-1 text-xs text-red-500">{errors.nextDate}</p>}
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between px-4 py-3.5 rounded-2xl
            bg-white dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08]">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-white">Active</p>
              <p className="text-11 text-slate-400 dark:text-slate-500 mt-0.5">
                {active ? 'Will appear in upcoming' : 'Paused, not shown in upcoming'}
              </p>
            </div>
            <button
              onClick={() => setActive(p => !p)}
              className={[
                'w-12 h-6.5 rounded-full relative transition-all duration-200 shrink-0',
                active ? 'bg-primary' : 'bg-slate-200 dark:bg-white/[0.1]',
              ].join(' ')}
              style={{ height: '26px', width: '46px' }}
            >
              <span className={[
                'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200',
                active ? 'left-[22px]' : 'left-0.5',
              ].join(' ')} />
            </button>
          </div>
          <div className="h-4" />
        </div>
      </Sheet>

      {/* Nested pickers at z-[110] */}
      <CategoryPickerSheet
        open={showCatPick}
        onClose={() => setShowCatPick(false)}
        categories={expenseCategories}
        selected={category}
        onSelect={cat => { setCategory(cat); setErrors(p => ({ ...p, category: null })) }}
      />
      <AccountPickerSheet
        open={showAcctPick}
        onClose={() => setShowAcctPick(false)}
        accounts={payAccounts}
        selected={account}
        onSelect={acct => { setAccount(acct); setErrors(p => ({ ...p, account: null })) }}
      />
    </>
  )
}


// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Recurring() {
  const navigate = useNavigate()
  const back = useBack()
  const [tab,      setTab]      = useState('upcoming')

  const allRec     = useLiveQuery(() => db.recurring.toArray(),  [], undefined)
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  /* For the card statements below. Unfiltered on purpose: the credit
     arithmetic has to see every future charge, which is the one thing
     scheduledCutoff hides from the spending screens. */
  const accounts     = useLiveQuery(() => db.accounts.toArray(),     [], [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [])

  // Enrich with the category's icon and colour, which is all the row needs
  // from it.
  const enriched = useMemo(() => {
    const catMap = Object.fromEntries((categories ?? []).map(c => [c.name, c]))
    return (allRec ?? []).map(r => ({
      ...r,
      // The category itself, not a pre-resolved glyph: CategoryGlyph needs the
      // name to look up an icon, and a bare emoji string has thrown that away.
      _cat:      catMap[r.category] ?? null,
      _catColor: catMap[r.category]?.color ?? '#64748b',
    }))
  }, [allRec, categories])

  const active = useMemo(() => enriched.filter(r => r.active), [enriched])
  /* Bills and income side by side in the lists, but never in one total: a
     salary is not a negative bill, and adding the two would answer neither
     "what do my bills cost" nor "what comes in". */
  const activeBills = useMemo(() => active.filter(r => !isIncomeRecurring(r)), [active])
  const monthlyIncome = useMemo(
    () => active.filter(isIncomeRecurring).reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0),
    [active],
  )

  /**
   * Credit card statements, as bills.
   *
   * Derived on read rather than stored - see lib/creditBills. They are kept
   * apart from `upcoming` rather than merged into it because everything below
   * that counts, totals or groups bills is about RECURRING records: a card
   * statement has no frequency to group by and no monthly figure to add to
   * the total, and folding it in would quietly corrupt all three.
   */
  const cardBills = useMemo(
    () => creditCardBills({ accounts: accounts ?? [], transactions: transactions ?? [] }),
    [accounts, transactions],
  )

  /* Paying a statement is a transfer, so this hands the form the card and the
     amount and lets the existing flow do the rest - including the overdraw
     check and the confirm sheet. */
  const payCard = useCallback((bill) => {
    navigate('/transfer', {
      state: { prefill: { amount: bill.amount, toAccount: bill.name } },
    })
  }, [navigate])

  /* Loans with a payment set and something still owed, soonest first - see
     LoanDueRow. Kept apart from `upcoming` for the reason card statements
     are: no frequency to group by, and no place in the bills total. */
  const loanDues = useMemo(
    () => (accounts ?? [])
      .filter(isLoan)
      .map(a => ({ account: a, status: loanStatus(a, transactions ?? []) }))
      .filter(l => l.status.owed > 0.005 && l.status.next && l.status.nextDue)
      .sort((x, y) => x.status.nextDue.getTime() - y.status.nextDue.getTime()),
    [accounts, transactions],
  )
  const { showToast } = useToast()
  /* Which loan the sheet is for outlives the sheet being open, so it still
     has its loan while it animates away. */
  const [payingLoanId, setPayingLoanId] = useState(/** @type {number|null} */ (null))
  const [loanPayOpen, setLoanPayOpen] = useState(false)
  const [loanSaving, setLoanSaving] = useState(false)
  const payingDue = loanDues.find(l => l.account.id === payingLoanId) ?? null
  const handleLoanPay = useCallback(async (/** @type {{amount: number, from: any}} */ { amount, from }) => {
    const loan = payingDue?.account
    if (!loan || !from || !(amount > 0)) return
    setLoanSaving(true)
    try {
      const { interest } = await payLoan({ loan, from: from.name, amount, dateIso: new Date().toISOString() })
      setLoanPayOpen(false)
      showToast(interest > 0.005
        ? `Paid ${fmt(amount, loan.currency)}, ${fmt(interest, loan.currency)} of it interest`
        : `Paid ${fmt(amount, loan.currency)} to ${loan.name}`)
    } catch (e) {
      console.error('[Recurring] loan payment failed:', e)
      showToast('Could not record the payment', 'error')
    } finally {
      setLoanSaving(false)
    }
  }, [payingDue, showToast])

  /** Active bills falling due in the next 30 days, soonest first. */
  const upcoming = useMemo(() => {
    const now   = new Date(); now.setHours(0, 0, 0, 0)
    const limit = new Date(now); limit.setDate(now.getDate() + 30)
    return active
      .filter(r => {
        const d = parseDateLocal(r.nextDate)
        return d != null && d <= limit
      })
      .sort((a, b) => (a.nextDate ?? '').localeCompare(b.nextDate ?? ''))
  }, [active])

  /**
   * The three figures under the total.
   *
   * "Due now" is the same definition the home screen's badge uses - date
   * arrived, not yet posted - because two screens disagreeing about what needs
   * attention is worse than either number being slightly off.
   */
  const stats = useMemo(() => {
    const dueNow  = activeBills.filter(r => (daysUntil(r.nextDate) ?? 99) <= 0).length
    const thisWeek = activeBills.filter(r => {
      const n = daysUntil(r.nextDate)
      return n != null && n > 0 && n <= 7
    }).length
    return { dueNow, thisWeek, paused: enriched.length - active.length }
  }, [activeBills, active, enriched])

  const totalMonthly = useMemo(
    () => activeBills.reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0),
    [activeBills],
  )

  /** The All tab, grouped by how often each bill repeats. */
  const groups = useMemo(() =>
    FREQ_ORDER
      .map(freq => ({
        freq,
        label: FREQ_LABEL[freq],
        items: enriched
          .filter(r => r.frequency === freq)
          // Paused sink to the bottom of their own group rather than being
          // hidden: they are still bills you own, just not running.
          .sort((a, b) =>
            (a.active === b.active ? 0 : a.active ? -1 : 1) ||
            (a.nextDate ?? '').localeCompare(b.nextDate ?? '')),
      }))
      .filter(g => g.items.length > 0),
    [enriched],
  )

  const openDetail = useCallback(rec => navigate(`/recurring/${rec.id}`), [navigate])

  const loading = allRec === undefined

  /* What you owe that is not a recurring record: card statements and loan
     payments. Its own piece because it shows with no bills at all too - a
     ledger with a card or a loan and nothing on Recurring still has these
     to pay, and the empty state used to hide them. */
  const dueSections = (
    <>
      {/* Statements first. A card bill is usually the largest single
          thing owed in a month, and it is the one with a late fee
          attached to missing it. */}
      {cardBills.length > 0 && (
        <div className="px-5 mb-5">
          <SectionLabel inset="none" gap="normal">Card statements</SectionLabel>
          <Card clip>
            {cardBills.map((b, i) => (
              <CardBillRow
                key={b.id}
                bill={b}
                onPay={payCard}
                onOpen={(x) => navigate(`/accounts/${x.account.id}`)}
                isLast={i === cardBills.length - 1}
              />
            ))}
          </Card>
        </div>
      )}

      {loanDues.length > 0 && (
        <div className="px-5 mb-5">
          <SectionLabel inset="none" gap="normal">Loan payments</SectionLabel>
          <Card clip>
            {loanDues.map((l, i) => (
              <LoanDueRow
                key={l.account.id}
                due={l}
                onPay={(d) => { setPayingLoanId(d.account.id); setLoanPayOpen(true) }}
                onOpen={(a) => navigate(`/accounts/${a.id}`)}
                isLast={i === loanDues.length - 1}
              />
            ))}
          </Card>
        </div>
      )}
    </>
  )

  return (
    <div className="pb-nav">
      {/* ── Header ──
          Back, centred title, accent +. Identical to Goals and AccountDetail,
          which is the point: all three are reached from a quick-action disc
          rather than the navbar, so all three need the same way out.

          Titled "Recurring" because that is what the disc you tapped says -
          a door labelled one thing opening onto a page labelled another is a
          small break you feel without being able to name. It was "Bills"
          while bills were all it held; your pay lives here too now. */}
      <PageHeader
        title="Recurring"
        onBack={back}
        action={(
          <IconButton label="Add recurring" variant="primary" onClick={() => navigate('/recurring/new')}>
            <IconPlus />
          </IconButton>
        )}
      />

      {/* The loading state is the page's own shape, not three grey
          rectangles: the hero, the stat row and the list, at the sizes
          they arrive at, so nothing below them moves when they do. */}
      {loading ? (
        <div className="px-5 mt-2 flex flex-col gap-7">
          <SkeletonHero />
          <SkeletonStatTrio />
          <SkeletonList rows={3} />
        </div>
      ) : enriched.length === 0 ? (
        <>
          <EmptyState
            art="repeat"
            title="Nothing recurring yet"
            body="Bills, subscriptions and your pay: anything that repeats."
            action={
              <Button onClick={() => navigate('/recurring/new')} className="px-5">
                Add the first one
              </Button>
            }
          />
          <BillSpots className="mt-2" transactions={transactions ?? []} recurring={allRec ?? []} categories={categories ?? []} />
          <div className="mt-2">{dueSections}</div>
        </>
      ) : (
        <>
          {/* ── The whole commitment, in one figure ──
              The same shape Goals and AccountDetail lead with: a small caps
              label, the number, and a line of context. It replaced a violet
              gradient panel with a white-on-violet frequency table in it -
              the only violet surface in the app, and a second accent nothing
              else answered to. */}
          <section className="px-5">
            <SectionLabel className="text-center">Bills a month</SectionLabel>
            <p className="mt-0.5 text-center text-38 leading-none font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
              {fmt(totalMonthly)}
            </p>
            <p className="mt-2 text-center text-13 text-slate-500 dark:text-slate-400 tabular-nums">
              {activeBills.length} active {activeBills.length === 1 ? 'bill' : 'bills'}
              {monthlyIncome > 0 && ` · ${fmtCompact(monthlyIncome)} income a month`}
            </p>

            {/* The tiles are gone. They were here because three small labels
                floated in open space and the top of the page read as
                unfinished - but the answer to that is the figure being large
                and first, which is what StatTrio does, and what every other
                page's stat row now does too. */}
            <StatTrio
              className="mt-5"
              items={[
                {
                  label: 'Due now',
                  value: stats.dueNow,
                  tone: stats.dueNow > 0 ? 'text-red-500 dark:text-red-400' : '',
                },
                { label: 'This week', value: stats.thisWeek },
                { label: 'Paused', value: stats.paused },
              ]}
            />
          </section>

          {/* Bills the ledger shows that are not on this list yet - nothing at all when there are none. */}
          <BillSpots className="mt-7" transactions={transactions ?? []} recurring={allRec ?? []} categories={categories ?? []} />

          {/* ── Which list ── */}
          <div className="px-5 mt-6">
            <SegTabs
              tabs={[
                { value: 'upcoming', label: 'Upcoming', count: upcoming.length },
                { value: 'all',      label: 'All',      count: 0 },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>

          {tab === 'upcoming' ? (
            <section className="mt-5">
              {dueSections}

              <SectionLabel inset="gutter" gap="tight"
                action={<span className="text-12 tabular-nums text-slate-500 dark:text-slate-400 shrink-0">Next 30 days</span>}
              >Coming up</SectionLabel>
              <div className="px-5">
                <Card clip>
                  {upcoming.length === 0 ? (
                    <EmptyState
                      size="sm"
                      tone="good"
                      art="allClear"
                      title="All clear"
                      body="Nothing due in the next 30 days."
                    />
                  ) : (
                    upcoming.map((r, i) => (
                      <BillRow
                        key={r.id}
                        rec={r}
                        onOpen={openDetail}
                        isLast={i === upcoming.length - 1}
                      />
                    ))
                  )}
                </Card>
              </div>
            </section>
          ) : (
            <div className="mt-5 flex flex-col gap-6">
              {groups.map(({ freq, label, items }) => (
                <section key={freq}>
                  <SectionLabel
                    inset="gutter"
                    gap="tight"
                    action={<span className="text-12 tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      {(() => {
                        /* The group's bills, or - for a group of nothing but
                           income, a payday on the cut-offs - what comes in. */
                        const live = items.filter(r => r.active)
                        const bills = live.filter(r => !isIncomeRecurring(r)).reduce((s, r) => s + (r.amount ?? 0), 0)
                        const inc = live.filter(isIncomeRecurring).reduce((s, r) => s + (r.amount ?? 0), 0)
                        return bills > 0 || inc <= 0 ? fmtCompact(bills) : `+${fmtCompact(inc)}`
                      })()}
                    </span>}
                  >
                    {label}
                  </SectionLabel>
                  <div className="px-5">
                    <Card clip>
                      {items.map((r, i) => (
                        <BillRow
                          key={r.id}
                          rec={r}
                          onOpen={openDetail}
                          isLast={i === items.length - 1}
                        />
                      ))}
                    </Card>
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add only. Editing an existing bill happens on its own page, which is
          also where posting, pausing and deleting live. */}

      {/* The loan's own pay sheet, the one its page opens: the interest split
          is its whole point, and a second way to pay without it would record
          the principal as spending. */}
      {payingDue && (
        <LoanPaySheet
          open={loanPayOpen}
          onClose={() => setLoanPayOpen(false)}
          loan={payingDue.account}
          accounts={accounts ?? []}
          status={payingDue.status}
          saving={loanSaving}
          onPay={handleLoanPay}
        />
      )}
    </div>
  )
}
