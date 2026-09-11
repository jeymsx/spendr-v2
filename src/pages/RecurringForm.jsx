import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useCreditAvailMap } from '../hooks/useCreditAvailMap'
import { deleteRecurringRemote } from '../lib/sync'
import { moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import { validateRecurring, saveRecurring } from '../lib/recurringWrite'
import { FREQ_OPTIONS } from '../utils/recurring'
import { IconChevronLeft } from '../components/icons'
import CategoryRail from '../components/CategoryRail'
import AccountSelectRow from '../components/AccountSelectRow'
import AccountPickerSheet from '../components/AccountPickerSheet'
import FadeScroller from '../components/FadeScroller'
import BillMark from '../components/BillMark'
import Button from '../components/ui/Button'
import IconButton from '../components/ui/IconButton'
import SectionLabel from '../components/ui/SectionLabel'
import Card from '../components/ui/Card'
import { fieldFrame } from '../components/ui/Field'

/**
 * Adding a bill, as a page rather than a sheet.
 *
 * ── Why it moved ──
 *
 * It was a 92dvh sheet holding eight stacked fields, which is a page wearing
 * a sheet's chrome: at that height the grab handle, the rounded top and the
 * sliver of list behind it are costing space and buying nothing, and the
 * thing they signal - "this is a small decision on top of what you were
 * doing" - is not true of a form with a name, an amount, a category, an
 * account, a frequency and a date in it.
 *
 * Expense, inflow and transfer are all pages for exactly this reason, and a
 * bill is the same act with a repeat on it. So this is their layout: back
 * button top left, the amount large and centred at the top, then the fields.
 *
 * ── The amount leads ──
 *
 * Same reason it leads on the other three. It is the one field you always
 * know the value of before you open the form, it is what you will scan the
 * list for afterwards, and putting it in the flow as the second of eight
 * identical rows makes the screen a questionnaire.
 *
 * ── Category is a rail ──
 *
 * It was a row that opened a picker sheet - a second surface to choose one of
 * ten things. The add forms show them as a scrollable rail of tiles you tap
 * once, and this now does too.
 */

const DRAFT_DEFAULTS = {
  name: '',
  amountStr: '',
  frequency: 'monthly',
  active: true,
}

/** Today, as a local calendar day rather than a UTC-shifted one. */
function todayStr() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function RecurringForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { showToast } = useToast()
  const { user } = useAuth()

  const isEdit = id != null
  const recs = useLiveQuery(() => db.recurring.toArray(), [], null)
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])
  const creditAvailMap = useCreditAvailMap(accounts)

  const editRec = useMemo(
    () => (isEdit && recs ? recs.find(r => String(r.id) === String(id)) ?? null : null),
    [isEdit, recs, id],
  )

  const [name, setName] = useState(DRAFT_DEFAULTS.name)
  const [amountStr, setAmountStr] = useState(DRAFT_DEFAULTS.amountStr)
  const [category, setCategory] = useState(null)
  const [account, setAccount] = useState(null)
  const [frequency, setFrequency] = useState(DRAFT_DEFAULTS.frequency)
  const [nextDate, setNextDate] = useState(todayStr)
  const [active, setActive] = useState(DRAFT_DEFAULTS.active)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [showAcctPick, setShowAcctPick] = useState(false)

  /* Hydrate once, when the record arrives. Guarded on a ref rather than on
     `editRec` alone: the live query re-emits on every write to the table, and
     re-seeding the fields from the stored row mid-edit would throw away what
     you had typed the moment anything else touched the database. */
  const hydrated = useRef(false)
  useEffect(() => {
    if (!isEdit || hydrated.current || !editRec) return
    hydrated.current = true
    setName(editRec.name ?? '')
    setAmountStr(editRec.amount != null ? numToMoneyStr(editRec.amount) : '')
    setFrequency(editRec.frequency ?? 'monthly')
    setNextDate(editRec.nextDate ? editRec.nextDate.slice(0, 10) : todayStr())
    setActive(editRec.active !== false)
  }, [isEdit, editRec])

  /* The category and account are objects, so they can only be resolved once
     their tables have loaded - which is usually after the record. Separate
     effect, and it stops as soon as it has matched. */
  const linked = useRef(false)
  useEffect(() => {
    if (!isEdit || linked.current || !editRec) return
    if (!categories?.length || !accounts?.length) return
    linked.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCategory(categories.find(c => c.name === editRec.category) ?? null)
    setAccount(accounts.find(a => a.name === editRec.account) ?? null)
  }, [isEdit, editRec, categories, accounts])

  const expenseCategories = useMemo(
    () => (categories ?? [])
      .filter(c => c.type === 'expense')
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name)),
    [categories],
  )

  const back = () => navigate(-1)

  async function handleSave() {
    const draft = { name, amountStr, category, account, frequency, nextDate, active }
    const errs = validateRecurring(draft)
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    try {
      const what = await saveRecurring(draft, editRec)
      showToast(what === 'created' ? 'Bill added' : 'Bill updated')
      back()
    } catch (e) {
      console.error('[RecurringForm] save failed:', e)
      showToast('Failed to save', 'error')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    try {
      await db.recurring.delete(editRec.id)
      await deleteRecurringRemote(user?.id, editRec.id)
      showToast('Bill deleted')
      /* Back twice: the detail page for a bill that no longer exists is
         behind this one, and returning to it would land on an empty record. */
      navigate('/recurring', { replace: true })
    } catch (e) {
      console.error('[RecurringForm] delete failed:', e)
      showToast('Failed to delete', 'error')
      setDeleting(false)
    }
  }

  /* Still loading the record we are supposed to be editing. The header is
     drawn anyway so Back works while the row arrives. */
  const waiting = isEdit && recs !== null && !editRec

  return (
    <div className="flex flex-col bg-transparent pb-6">
      {/* The sub-page header, not the add-forms' left-aligned one.

          Expense, inflow and transfer put their title hard left because they
          are reached from the FAB, which is not a place - there is nothing
          behind them to be "inside of". A bill is reached from the bills
          list and, when editing, from one bill's own page, both of which
          carry a centred title. So this is SubPage's header exactly: back
          disc, centred title, one action, and a 36px spacer when there is no
          action - without it "centred" lands half a button left of centre. */}
      <header className="flex items-center gap-2 px-5 pt-safe-header pb-3 shrink-0">
        <IconButton label="Back" onClick={back}>
          <IconChevronLeft />
        </IconButton>
        <h1 className="flex-1 text-center text-base font-semibold text-slate-800 dark:text-white truncate px-1">
          {isEdit ? 'Edit Bill' : 'New Bill'}
        </h1>
        {isEdit && editRec ? (
          <Button
            variant={confirmDel ? 'danger' : 'dangerTint'}
            size="xs"
            className="px-3 shrink-0"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : confirmDel ? 'Confirm delete' : 'Delete'}
          </Button>
        ) : (
          <span className="w-9 shrink-0" aria-hidden="true" />
        )}
      </header>

      {waiting ? (
        <p className="px-5 pt-12 text-center text-sm text-slate-400 dark:text-slate-500">
          That bill no longer exists.
        </p>
      ) : (
        <>
          {/* ── The amount, leading ── */}
          <div className="flex flex-col items-center px-6 pt-10 pb-10 shrink-0">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amountStr === '0' ? '' : amountStr}
              onChange={e => {
                moneyChangeHandler(setAmountStr)(e)
                setErrors(p => ({ ...p, amount: null }))
              }}
              className="amount-input font-semibold tabular-nums bg-transparent text-center w-full
                text-slate-900 dark:text-white outline-none
                placeholder-slate-200 dark:placeholder-slate-800"
            />
            <p className={`text-xs mt-2 tracking-wide ${
              errors.amount
                ? 'text-red-500 dark:text-red-400 font-medium'
                : 'text-slate-400 dark:text-slate-500'
            }`}>
              {errors.amount ?? 'Amount'}
            </p>
          </div>

          <div className="px-5 flex flex-col gap-5">
            {/* ── Name ── */}
            <div>
              <div className="flex items-baseline gap-2">
                <SectionLabel>Name</SectionLabel>
                {errors.name && (
                  <p className="text-xs font-medium text-red-500 dark:text-red-400 mb-1.5">
                    {errors.name}
                  </p>
                )}
              </div>
              <div className={fieldFrame(!!errors.name)}>
                {/* The brand's own mark as you type it, which is the fastest
                    confirmation that the app recognised what you meant -
                    "netflix ph" is Netflix. Falls through to the category
                    tile, and to nothing at all before a category is picked. */}
                {name.trim() && (
                  <BillMark
                    name={name}
                    cat={category}
                    size={17}
                    boxClass="w-7 h-7 rounded-lg"
                  />
                )}
                <input
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: null })) }}
                  placeholder="Netflix, rent, gym"
                  maxLength={60}
                  className="flex-1 min-w-0 bg-transparent outline-none
                    text-sm font-medium text-slate-800 dark:text-white
                    placeholder-slate-400 dark:placeholder-slate-500 placeholder:font-normal"
                />
              </div>
            </div>

            {/* ── Category, as a rail ── */}
            <div>
              <div className="flex items-baseline gap-2">
                <SectionLabel>Category</SectionLabel>
                {errors.category && !category && (
                  <p className="text-xs font-medium text-red-500 dark:text-red-400 mb-1.5">
                    Pick one
                  </p>
                )}
              </div>
              <CategoryRail
                categories={expenseCategories}
                selected={category}
                onSelect={cat => { setCategory(cat); setErrors(p => ({ ...p, category: null })) }}
              />
            </div>

            {/* ── Account ── */}
            <div>
              <SectionLabel>Account</SectionLabel>
              <AccountSelectRow
                account={account}
                creditAvailable={account ? creditAvailMap?.[account.name] : null}
                error={!!errors.account && !account}
                onClick={() => { setErrors(p => ({ ...p, account: null })); setShowAcctPick(true) }}
              />
            </div>

            {/* ── Frequency ──

                A scrolling row of chips, not a four-across grid. There are
                seven now - the grid was four wide because there were exactly
                four - and "Every 6 months" does not fit a quarter of a phone.
                Same chips as the transactions filter, each the width of what
                it says.

                -mx-5 px-5 cancels the column's gutter so a chip scrolling out
                runs to the screen edge rather than stopping 20px short. */}
            <div>
              <SectionLabel>Frequency</SectionLabel>
              <FadeScroller axis="x" className="-mx-5 px-5 flex items-center gap-2 pb-0.5">
                {FREQ_OPTIONS.map(opt => {
                  const on = frequency === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFrequency(opt.value)}
                      aria-pressed={on}
                      className={[
                        'shrink-0 h-9 px-4 rounded-full text-[13px] font-semibold',
                        'border transition-colors duration-150 active:scale-95',
                        on
                          /* seg-active, not text-primary: the accent as text
                             on its own 8% tint measures 2.63:1. The class
                             mixes it 65% into black for light mode and leaves
                             it in dark, giving 5.53:1 and 5.59:1. */
                          ? 'seg-active border-primary/40 bg-primary/[0.08] dark:bg-primary/[0.12]'
                          : 'border-slate-200/80 dark:border-primary/[0.14] text-slate-500 dark:text-slate-400 bg-white dark:bg-primary/[0.07]',
                      ].join(' ')}
                      style={on ? { '--seg-color': 'var(--color-primary)' } : undefined}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </FadeScroller>
            </div>

            {/* ── Next due date ── */}
            <div>
              <div className="flex items-baseline gap-2">
                <SectionLabel>Next due date</SectionLabel>
                {errors.nextDate && (
                  <p className="text-xs font-medium text-red-500 dark:text-red-400 mb-1.5">
                    {errors.nextDate}
                  </p>
                )}
              </div>
              {/* The value drawn, the real control invisible over the row -
                  the same arrangement the filter sheet and the edit forms
                  use, including showPicker() for desktop Chrome, which opens
                  its calendar only from the indicator icon otherwise. */}
              <div className={`relative ${fieldFrame(!!errors.nextDate)}`}>
                <span className={`flex-1 text-sm font-medium tabular-nums ${
                  nextDate ? 'text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'
                }`}>
                  {nextDate
                    ? new Date(`${nextDate}T00:00:00`).toLocaleDateString('en-PH', {
                      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                    })
                    : 'Pick a date'}
                </span>
                <input
                  type="date"
                  value={nextDate}
                  onChange={e => { setNextDate(e.target.value); setErrors(p => ({ ...p, nextDate: null })) }}
                  onClick={e => { try { e.currentTarget.showPicker?.() } catch { /* older engine */ } }}
                  aria-label="Next due date"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer
                    [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
            </div>

            {/* ── Active ── */}
            <Card padding="sm" className="flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-800 dark:text-white">
                  Active
                </span>
                <span className="block text-[12px] text-slate-500 dark:text-slate-400">
                  Shows in upcoming and can be posted
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={active}
                aria-label="Active"
                onClick={() => setActive(v => !v)}
                className={`inline-flex items-center shrink-0 w-11 h-6 rounded-full p-0.5
                  transition-colors duration-200 ${
                  active ? 'bg-primary' : 'bg-slate-200 dark:bg-white/25'
                }`}
              >
                <span className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  active ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </Card>

            <Button size="lg" block onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add bill'}
            </Button>
          </div>
        </>
      )}

      <AccountPickerSheet
        open={showAcctPick}
        onClose={() => setShowAcctPick(false)}
        accounts={accounts ?? []}
        selected={account}
        onSelect={a => { setAccount(a); setShowAcctPick(false) }}
      />
    </div>
  )
}
