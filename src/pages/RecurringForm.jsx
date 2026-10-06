import { useState, useEffect, useMemo, useRef } from 'react'
import DateInput from '../components/ui/DateInput'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useBack } from '../hooks/useBack'
import { useBackGuard, useLeaveGuard } from '../hooks/useBackGuard'
import DiscardSheet from '../components/DiscardSheet'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { useCreditAvailMap } from '../hooks/useCreditAvailMap'
import { deleteRecurringRemote } from '../lib/sync'
import { moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import { validateRecurring, saveRecurring } from '../lib/recurringWrite'
import { FREQ_OPTIONS, snapToCutoff } from '../utils/recurring'
import { isEverydayAccount } from '../lib/accountMeta'
import Segmented from '../components/ui/Segmented'
import { IconChevronRight } from '../components/icons'
import CategoryRail from '../components/CategoryRail'
import AccountSelectRow from '../components/AccountSelectRow'
import AccountPickerSheet from '../components/AccountPickerSheet'
import FadeScroller from '../components/FadeScroller'
import BillMark from '../components/BillMark'
import Button from '../components/ui/Button'
import PageHeader from '../components/PageHeader'
import SectionLabel from '../components/ui/SectionLabel'
import Card from '../components/ui/Card'
import { parseMoney } from '../utils/moneyInput'
import { fmt, baseSymbol, baseDecimals, zeroAmount } from '../lib/money'
import { fieldFrame } from '../components/ui/Field'
import PeopleSplit, { EMPTY_SPLIT, resolveSplitValue } from '../components/PeopleSplit'
import SubPage from '../components/SubPage'
import { toDateInput } from '../utils/txDate'

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


export default function RecurringForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { showToast } = useToast()

  const isEdit = id != null
  const recs = useLiveQuery(() => db.recurring.toArray(), [], null)
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  // Bills and income land on everyday accounts, not on investments or loans.
  const accounts = useLiveQuery(async () => (await db.accounts.toArray()).filter(isEverydayAccount), [], [])
  const creditAvailMap = useCreditAvailMap(accounts)

  const editRec = useMemo(
    () => (isEdit && recs ? recs.find(r => String(r.id) === String(id)) ?? null : null),
    [isEdit, recs, id],
  )

  /* A bill, or income that arrives on a schedule - a salary. One form for
     both, because they are the same record facing opposite ways; the
     forecast needs both to say what is coming. */
  /* ?type=income opens it as income - the forecast's "Add your payday" -
     and on the payroll cut-offs, since that is how pay lands here. */
  const [searchParams] = useSearchParams()
  const askedIncome = !isEdit && searchParams.get('type') === 'income'
  /* Filled in from a bill found in your history (lib/billSpots.js): the
     Recurring page's "Add" opens this with what the ledger already says -
     the name, a typical amount, the day it lands, where it is paid from. */
  const [pre] = useState(() => {
    if (isEdit) return null
    const amount = Number(searchParams.get('amount'))
    const freq = searchParams.get('frequency')
    const next = searchParams.get('next')
    return {
      name: searchParams.get('name')?.slice(0, 60) ?? null,
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      frequency: FREQ_OPTIONS.some(o => o.value === freq) ? freq : null,
      next: next && /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null,
      category: searchParams.get('category'),
      account: searchParams.get('account'),
    }
  })
  const [kind, setKind] = useState(/** @type {'expense'|'inflow'} */ (askedIncome ? 'inflow' : 'expense'))
  const isIncome = kind === 'inflow'
  const [name, setName] = useState(pre?.name ?? DRAFT_DEFAULTS.name)
  const [amountStr, setAmountStr] = useState(pre?.amount ? numToMoneyStr(pre.amount) : DRAFT_DEFAULTS.amountStr)
  const [category, setCategory] = useState(null)
  const [account, setAccount] = useState(null)
  const [frequency, setFrequency] = useState(askedIncome ? 'semimonthly' : (pre?.frequency ?? DRAFT_DEFAULTS.frequency))
  const [nextDate, setNextDate] = useState(() => (askedIncome ? snapToCutoff(toDateInput()) : (pre?.next ?? toDateInput())))
  const [active, setActive] = useState(DRAFT_DEFAULTS.active)
  const [split, setSplit] = useState(/** @type {any} */ (null))
  const [dividing, setDividing] = useState(false)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const amount = parseMoney(amountStr)
  const shared = useMemo(() => resolveSplitValue(split, amount), [split, amount])
  const shareSummary = shared?.owed.length
    ? `${shared.owed.length} ${shared.owed.length === 1 ? 'person' : 'people'}`
      + ` · ${fmt(shared.owed.reduce((s, p) => s + p.amount, 0))} back`
    : null
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
    setKind(editRec.type === 'inflow' ? 'inflow' : 'expense')
    setName(editRec.name ?? '')
    setAmountStr(editRec.amount != null ? numToMoneyStr(editRec.amount) : '')
    setFrequency(editRec.frequency ?? 'monthly')
    setNextDate(editRec.nextDate ? editRec.nextDate.slice(0, 10) : toDateInput())
    setActive(editRec.active !== false)
    setSplit(editRec.split ?? null)
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

  // The same, for a form filled in from a spotted bill: once the tables are in.
  const prefilled = useRef(false)
  useEffect(() => {
    if (isEdit || prefilled.current || !pre || (!pre.category && !pre.account)) return
    if (!categories?.length || !accounts?.length) return
    prefilled.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pre.category) setCategory(categories.find(c => c.name === pre.category && c.type === 'expense') ?? null)
    if (pre.account) setAccount(accounts.find(a => a.name === pre.account) ?? null)
  }, [isEdit, pre, categories, accounts])

  const kindCategories = useMemo(
    () => (categories ?? [])
      .filter(c => c.type === kind)
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name)),
    [categories, kind],
  )

  /* Switching sides drops a category from the other side - Salary is not a
     bill - and a division, which income never has. */
  const switchKind = (/** @type {string} */ k) => {
    const next = k === 'inflow' ? 'inflow' : 'expense'
    setKind(next)
    if (category && category.type !== next) setCategory(null)
    if (next === 'inflow') setSplit(null)
  }

  const noun = isIncome ? 'Income' : 'Bill'

  /* Twice a month lands on the 15th and the month's last day, so the date
     field only ever holds one of those - picking the 20th shows the 30th,
     the day it will actually post, rather than saving something else. */
  const pickFrequency = (/** @type {string} */ f) => {
    setFrequency(f)
    if (f === 'semimonthly') setNextDate(d => (d ? snapToCutoff(d) : d))
  }

  /* The chosen frequency, scrolled into view. Twice a month is the fifth
     chip, past the right edge on a phone, and it is what income opens on -
     a selection you cannot see reads as no selection. Instant the first
     time, so the form does not open with the row sliding. */
  const freqRail = useRef(/** @type {HTMLElement|null} */ (null))
  const freqSeen = useRef(false)
  useEffect(() => {
    const rail = freqRail.current
    const chip = rail?.querySelector('[aria-pressed="true"]')
    if (!rail || !chip) return
    const r = rail.getBoundingClientRect()
    const c = chip.getBoundingClientRect()
    const gutter = 20
    const delta = c.right > r.right - gutter ? c.right - r.right + gutter
      : c.left < r.left + gutter ? c.left - r.left - gutter
      : 0
    if (delta) rail.scrollBy({ left: delta, behavior: freqSeen.current ? 'smooth' : 'auto' })
    freqSeen.current = true
  }, [frequency, editRec])
  const back = useBack()

  /* Whether leaving would lose something (hooks/useBackGuard.js). A new bill:
     anything typed, including what a spotted bill filled in for you. One
     being edited: anything changed from it. */
  const dirty = isEdit
    ? !!editRec && (
      name.trim() !== String(editRec.name ?? '').trim()
      || parseMoney(amountStr) !== (editRec.amount ?? 0)
      || frequency !== (editRec.frequency ?? 'monthly')
      || nextDate !== String(editRec.nextDate ?? '').slice(0, 10)
      || active !== (editRec.active !== false)
      || (!!category && category.name !== editRec.category)
      || (!!account && account.name !== editRec.account))
    : name.trim() !== '' || parseMoney(amountStr) > 0
  const leaveGuard = useLeaveGuard(dirty && !saving && !deleting, back)
  // The people screen answers Back itself: back to the bill.
  useBackGuard(dividing, () => { setDividing(false) })

  async function handleSave() {
    const draft = { name, amountStr, category, account, frequency, nextDate, active, split, type: kind }
    const errs = validateRecurring(draft)
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    try {
      const what = await saveRecurring(draft, editRec)
      showToast(`${noun} ${what === 'created' ? 'added' : 'updated'}`)
      leaveGuard.leave(back)
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
      await deleteRecurringRemote(editRec.id, editRec.name, editRec.syncId)
      showToast(`${noun} deleted`)
      /* Back twice: the detail page for a bill that no longer exists is
         behind this one, and returning to it would land on an empty record. */
      leaveGuard.leave(() => navigate('/recurring', { replace: true }))
    } catch (e) {
      console.error('[RecurringForm] delete failed:', e)
      showToast('Failed to delete', 'error')
      setDeleting(false)
    }
  }

  /* Still loading the record we are supposed to be editing. The header is
     drawn anyway so Back works while the row arrives. */
  const waiting = isEdit && recs !== null && !editRec

  /* Rendered INSTEAD of the form, not over it - the same reason the expense
     form does it. A full-screen overlay has to paint its own background, and
     in dark mode the app's is a gradient on <html> with a transparent body,
     so a slab of flat colour reads as the wrong background rather than as a
     new screen. Swapping the tree keeps every draft field alive in this
     component's state. */
  if (dividing) {
    return (
      <SubPage title="Shared with" onBack={() => setDividing(false)}>
        <div className="px-4">
          <p className="text-12 text-slate-400 dark:text-slate-500 mb-3">
            Entered once. Every time this bill posts, their shares become debts
            they owe you.
          </p>
          <PeopleSplit
            total={amount}
            value={split ?? EMPTY_SPLIT}
            onChange={setSplit}
          />
        </div>
      </SubPage>
    )
  }

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
      <PageHeader
        title={isEdit ? `Edit ${noun.toLowerCase()}` : `New ${noun.toLowerCase()}`}
        onBack={leaveGuard.tryLeave}
        action={isEdit && editRec ? (
          <Button
            variant={confirmDel ? 'danger' : 'dangerTint'}
            size="xs"
            className="px-3 shrink-0"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : confirmDel ? 'Confirm delete' : 'Delete'}
          </Button>
        ) : null}
      />

      {waiting ? (
        <p className="px-5 pt-12 text-center text-sm text-slate-400 dark:text-slate-500">
          That no longer exists.
        </p>
      ) : (
        <>
          {/* Which way it goes. The same segmented track the account form
              uses for "Counts as" - one question, one control. */}
          <div className="px-5 pt-3 shrink-0">
            <Segmented
              options={[{ value: 'expense', label: 'Bill' }, { value: 'inflow', label: 'Income' }]}
              value={kind}
              onChange={switchKind}
            />
          </div>

          {/* ── The amount, leading ── */}
          <div className="flex flex-col items-center px-6 pt-8 pb-10 shrink-0">
            <input
              type="text"
              inputMode="decimal"
              placeholder={`${baseSymbol(account?.currency)}${zeroAmount(account?.currency)}`}
              value={amountStr === '0' ? '' : amountStr}
              onChange={e => {
                moneyChangeHandler(setAmountStr, baseDecimals(account?.currency))(e)
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
                  placeholder={isIncome ? 'Salary, allowance' : 'Netflix, rent, gym'}
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
                categories={kindCategories}
                selected={category}
                onSelect={cat => { setCategory(cat); setErrors(p => ({ ...p, category: null })) }}
              />
            </div>

            {/* One row, and only once there is an amount to divide.
 
                A subscription split between friends is the case this exists
                for: the division is entered once and re-resolved every time
                the bill posts, so a price rise needs nothing re-entered. */}
            {/* A link, not a field. The expense form's version is the same
                thing and looks like this: most bills are not shared, and a
                bordered field with a label above it makes an exception look
                like one more thing to fill in. */}
            {amount > 0 && !isIncome && (
              <button
                type="button"
                onClick={() => setDividing(true)}
                className="-mt-2 w-full flex items-center gap-2 py-2 px-1 rounded-2xl text-left
                  active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
              >
                <span className="flex-1 min-w-0 text-xs font-semibold text-primary truncate">
                  {shareSummary ?? 'Share it with someone'}
                </span>
                <span className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true">
                  <IconChevronRight />
                </span>
              </button>
            )}

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
              <FadeScroller ref={freqRail} axis="x" className="-mx-5 px-5 flex items-center gap-2 pb-0.5">
                {FREQ_OPTIONS.map(opt => {
                  const on = frequency === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => pickFrequency(opt.value)}
                      aria-pressed={on}
                      className={[
                        'shrink-0 h-9 px-4 rounded-full text-13 font-semibold',
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
                <SectionLabel>{isIncome ? 'Next payday' : 'Next due date'}</SectionLabel>
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
                <DateInput overlay
                  value={nextDate}
                  onChange={e => {
                    const v = e.target.value
                    setNextDate(frequency === 'semimonthly' && v ? snapToCutoff(v) : v)
                    setErrors(p => ({ ...p, nextDate: null }))
                  }}
                  onClick={e => { try { e.currentTarget.showPicker?.() } catch { /* older engine */ } }}
                  aria-label={isIncome ? 'Next payday' : 'Next due date'}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer
                    [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
              {frequency === 'semimonthly' && (
                <p className="mt-2 px-1 text-12 text-slate-500 dark:text-slate-400">
                  On the 15th and the last day of each month.
                </p>
              )}
            </div>

            {/* ── Active ── */}
            <Card padding="sm" className="flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-800 dark:text-white">
                  Active
                </span>
                <span className="block text-12 text-slate-500 dark:text-slate-400">
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
              {saving ? 'Saving…' : isEdit ? 'Save changes' : `Add ${noun.toLowerCase()}`}
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
      {/* Before what you typed is thrown away (hooks/useBackGuard.js). */}
      <DiscardSheet open={leaveGuard.asking} onKeep={leaveGuard.keep} onDiscard={leaveGuard.discard} />
    </div>
  )
}
