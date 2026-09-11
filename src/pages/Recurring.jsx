import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import CategoryPickerSheet from '../components/CategoryPickerSheet'
import AccountPickerSheet from '../components/AccountPickerSheet'
import { useAuth } from '../context/AuthContext'
import { deleteRecurringRemote } from '../lib/sync'
import { IconChevronRight, IconChevronLeft, IconPlus } from '../components/icons'
import SegTabs from '../components/SegTabs'
import { validateRecurring, saveRecurring } from '../lib/recurringWrite'
import {
  FREQ_OPTIONS, FREQ_ORDER, FREQ_LABEL, FREQ_SHORT,
  toMonthlyAmount, parseDateLocal, daysUntil, dueStatus, DUE_TONE,
} from '../utils/recurring'
import CategoryGlyph from '../components/CategoryGlyph'
import BillMark from '../components/BillMark'
import IconButton from '../components/ui/IconButton'
import Sheet from '../components/ui/Sheet'
import StatTrio from '../components/ui/StatTrio'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Divider from '../components/ui/Divider'
import EmptyState from '../components/ui/EmptyState'
import SectionLabel from '../components/ui/SectionLabel'

// ── Formatters ─────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _phpFmt.format(Math.abs(n))
}

function fmtCompact(v) {
  const abs = Math.abs(v ?? 0)
  const sign = (v ?? 0) < 0 ? '−₱' : '₱'
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return sign + (abs / 1_000).toFixed(1) + 'K'
  return fmt(v)
}

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
function SectionHeading({ children, right = null }) {
  return (
    <div className="px-4 mb-1 flex items-baseline justify-between gap-3">
      <SectionLabel>{children}</SectionLabel>
      {right && (
        <p className="pr-1 text-[12px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">{right}</p>
      )}
    </div>
  )
}

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
  const due = rec.active ? dueStatus(rec.nextDate) : null
  const dim = !rec.active

  return (
    <>
      <button
        onClick={() => onOpen(rec)}
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
          <span className={`block text-[14px] font-semibold truncate ${
            dim ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-white'
          }`}>
            {rec.name}
          </span>
          <span className="block text-[11.5px] truncate">
            {/* Paused replaces the date rather than sitting beside it. A
                paused bill's "next" date is not going to happen, and showing
                one anyway is the kind of detail that quietly misleads. */}
            {dim ? (
              <span className="text-slate-500 dark:text-slate-400">{rec.account} · Paused</span>
            ) : (
              <>
                <span className={DUE_TONE[due?.tone] ?? 'text-slate-500 dark:text-slate-400'}>
                  {due?.label ?? 'No date'}
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
          <span className={`block text-[14px] font-semibold tabular-nums ${
            dim ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-white'
          }`}>
            {fmt(rec.amount)}
          </span>
          <span className="block text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
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

/** A flat calendar page with nothing on it. */
function IconNoBills() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8.5 15.5h7" />
    </svg>
  )
}

/** A tick, for a week with nothing due. */
function IconAllClear() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
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
  const { user } = useAuth()
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
      const today = new Date().toISOString().slice(0, 10)
      setNextDate(today)
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
      showToast(what === 'created' ? 'Bill added' : 'Bill updated')
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
      await deleteRecurringRemote(user?.id, editRec.id)
      onClose()
    } catch (e) {
      console.error('[RecurringForm] delete failed:', e)
      showToast('Failed to delete', 'error')
      setDeleting(false)
    }
  }

  const expenseCategories = useMemo(
    () => (categories ?? []).filter(c => c.type === 'expense')
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name)),
    [categories],
  )

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
        scrim={40}
        maxHeight="92dvh"
        title={editRec ? 'Edit Bill' : 'New Bill'}
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
              <span className="text-slate-400 dark:text-slate-500 mr-1.5 text-sm shrink-0">₱</span>
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
                    'h-9 px-4 rounded-full border text-[13px] font-semibold transition-all duration-150',
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
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                {active ? 'Will appear in upcoming' : 'Paused — not shown in upcoming'}
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
        accounts={accounts ?? []}
        selected={account}
        onSelect={acct => { setAccount(acct); setErrors(p => ({ ...p, account: null })) }}
      />
    </>
  )
}


// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Recurring() {
  const navigate = useNavigate()
  const [tab,      setTab]      = useState('upcoming')

  const allRec     = useLiveQuery(() => db.recurring.toArray(),  [], undefined)
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])

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
    const dueNow  = active.filter(r => (daysUntil(r.nextDate) ?? 99) <= 0).length
    const thisWeek = active.filter(r => {
      const n = daysUntil(r.nextDate)
      return n != null && n > 0 && n <= 7
    }).length
    return { dueNow, thisWeek, paused: enriched.length - active.length }
  }, [active, enriched])

  const totalMonthly = useMemo(
    () => active.reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0),
    [active],
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

  return (
    <div className="pb-nav">
      {/* ── Header ──
          Back, centred title, accent +. Identical to Goals and AccountDetail,
          which is the point: all three are reached from a quick-action disc
          rather than the navbar, so all three need the same way out.

          Titled "Bills" because that is what the disc you tapped says. It was
          "Recurring", and a door labelled one thing opening onto a page
          labelled another is a small break you feel without being able to
          name. */}
      <header className="flex items-center gap-2 px-5 pt-safe-header pb-3">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <IconChevronLeft />
        </IconButton>
        <h1 className="flex-1 text-center text-base font-semibold text-slate-800 dark:text-white truncate px-1">
          Bills
        </h1>
        <IconButton label="New bill" variant="primary" onClick={() => navigate('/recurring/new')}>
          <IconPlus />
        </IconButton>
      </header>

      {loading ? (
        <div className="px-5 mt-6 flex flex-col gap-3">
          <div className="h-24 rounded-2xl bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
          <div className="h-9 rounded-full bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
          <div className="h-40 rounded-2xl bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
        </div>
      ) : enriched.length === 0 ? (
        <EmptyState
          icon={<IconNoBills />}
          title="No bills yet"
          body="Subscriptions, rent, utilities — anything that repeats."
          action={
            <Button onClick={() => navigate('/recurring/new')} className="px-5">
              Add your first bill
            </Button>
          }
        />
      ) : (
        <>
          {/* ── The whole commitment, in one figure ──
              The same shape Goals and AccountDetail lead with: a small caps
              label, the number, and a line of context. It replaced a violet
              gradient panel with a white-on-violet frequency table in it -
              the only violet surface in the app, and a second accent nothing
              else answered to. */}
          <section className="px-5">
            <SectionLabel className="text-center">Monthly cost</SectionLabel>
            <p className="mt-0.5 text-center text-[38px] leading-none font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
              {fmt(totalMonthly)}
            </p>
            <p className="mt-2 text-center text-[13px] text-slate-500 dark:text-slate-400">
              {active.length} active {active.length === 1 ? 'bill' : 'bills'}
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
              <SectionHeading right="Next 30 days">Coming up</SectionHeading>
              <div className="px-5">
                <Card clip>
                  {upcoming.length === 0 ? (
                    <EmptyState
                      size="sm"
                      tone="good"
                      icon={<IconAllClear />}
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
                  <SectionHeading
                    right={fmtCompact(
                      items.filter(r => r.active).reduce((s, r) => s + (r.amount ?? 0), 0),
                    )}
                  >
                    {label}
                  </SectionHeading>
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

    </div>
  )
}
