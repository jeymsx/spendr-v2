import { Fragment, useState, useMemo, useEffect, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { parseMoney, numToMoneyStr, moneyChangeHandler } from '../utils/moneyInput'
import {
  allocateGoals, isFundable, GOAL_ICONS, nextRank, reRank, pace,
} from '../lib/goals'
import Button from '../components/ui/Button'
import IconButton from '../components/ui/IconButton'
import Sheet from '../components/ui/Sheet'
import StatTrio from '../components/ui/StatTrio'
import SectionLabel from '../components/ui/SectionLabel'
import InfoButton from '../components/ui/InfoButton'
import Card from '../components/ui/Card'
import Divider from '../components/ui/Divider'
import EmptyState from '../components/ui/EmptyState'
import { SkeletonHero, SkeletonStatTrio, SkeletonList } from '../components/ui/Skeleton'
import ProgressBar from '../components/ui/ProgressBar'
import { AccountChip } from '../components/AccountPickerSheet'

/**
 * Savings goals.
 *
 * Nothing on this page is typed in except the target. Progress is worked out
 * from what is actually sitting in the accounts a goal draws on - see
 * lib/goals.js for the waterfall that splits a shared balance between several
 * goals without counting the same peso twice.
 *
 * The order of the list is not decoration: it IS the funding order. The goal
 * at the top fills first. So dragging a goal up genuinely changes the numbers,
 * which is why the drag lives on the list itself rather than behind a "sort"
 * screen, and why the unassigned money is shown at the bottom - the split is
 * only trustworthy if you can see the whole of it add up.
 */

const _php = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _php.format(Math.abs(n))
}
function fmtCompact(v) {
  const abs = Math.abs(v ?? 0)
  const sign = (v ?? 0) < 0 ? '−₱' : '₱'
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000) return sign + (abs / 1_000).toFixed(1) + 'K'
  return sign + _php.format(abs)
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtTargetDate(iso) {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

// ── Icons ────────────────────────────────────────────────────────────────────

function IconChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function IconGrip() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

// ── Bits ─────────────────────────────────────────────────────────────────────

/* The section heading and the card were declared here; they are
   ui/SectionLabel and ui/Card now. The heading's `hint` went with it - both
   sections passed one, so every heading on the page came with a sentence
   explaining the section under it, and the closing paragraph already says how
   the split works for anyone who wants it. */

/**
 * A goal's progress bar.
 *
 * Complete is deliberately a different hue from in-progress rather than a
 * fuller bar of the same colour: at a glance down a list, "done" needs to be
 * legible without reading the number beside it.
 */
function GoalBar({ pct, complete }) {
  return (
    <ProgressBar
      value={pct}
      fillClass={complete ? 'bg-emerald-500' : 'bg-primary'}
    />
  )
}

// ── One goal ─────────────────────────────────────────────────────────────────

function GoalRow({ goal, onEdit, today }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: goal.id })

  const p = pace(goal, today)
  const dateLabel = fmtTargetDate(goal.targetDate)

  /* The right-hand half of that line. Null when there is no date, so an
     undated goal says nothing there rather than padding the row. */
  const note =
    p && !p.done && p.overdue ? { text: `${fmtCompact(goal.remaining)} short · ${dateLabel} passed`, tone: 'text-red-500 dark:text-red-400' }
    : p && !p.done            ? { text: `${fmtCompact(p.perMonth)}/mo · ${dateLabel}`,               tone: 'text-slate-400 dark:text-slate-500' }
    : p?.done && dateLabel    ? { text: `Ahead of ${dateLabel}`,                                     tone: 'text-emerald-600 dark:text-emerald-400' }
    : null

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative ${isDragging ? 'z-10' : ''}`}
    >
      <div
        className={`flex items-start gap-3 px-4 py-3.5 ${
          isDragging
            ? 'rounded-2xl bg-white dark:bg-[#1a2130] ring-1 ring-primary/30 shadow-2xl'
            : ''
        }`}
      >
        {/* The drag handle carries the listeners, not the row, so tapping
            anywhere else still opens the goal. touch-action:none is safe on a
            target this small - nobody starts a scroll from a grip. */}
        <button
          {...attributes}
          {...listeners}
          style={{ touchAction: 'none' }}
          className="mt-1.5 -ml-1 p-1 text-slate-300 dark:text-slate-600 shrink-0
            active:text-slate-500 dark:active:text-slate-400 cursor-grab"
          aria-label={`Reorder ${goal.name}`}
        >
          <IconGrip />
        </button>

        <button onClick={() => onEdit(goal)} className="flex-1 min-w-0 text-left active:opacity-70 transition-opacity">
          <div className="flex items-start justify-between gap-3">
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-[17px] leading-none shrink-0" aria-hidden="true">{goal.icon ?? '🎯'}</span>
              <span className="text-[14px] font-semibold text-slate-800 dark:text-white truncate">
                {goal.name}
              </span>
              {goal.complete && (
                <span className="shrink-0 w-4 h-4 rounded-full bg-emerald-500 text-white
                  flex items-center justify-center" aria-label="Funded">
                  <IconCheck />
                </span>
              )}
            </span>
            <span className="text-[12px] tabular-nums shrink-0 text-slate-500 dark:text-slate-400">
              <span className={`font-semibold ${goal.complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-white'}`}>
                {fmtCompact(goal.saved)}
              </span>
              {' / '}{fmtCompact(goal.target)}
            </span>
          </div>

          <div className="mt-2.5">
            <GoalBar pct={goal.pct} complete={goal.complete} />
          </div>

          {/* One line under the bar. It was four.

              The percentage went first - the bar draws it and the two figures
              above it state it, so a third copy in words was the row telling
              you one ratio three ways. "Attach an account and this starts
              tracking itself" went next: it sat directly under "No account
              attached", which is the same sentence twice, so the warning
              became the COLOUR of that line instead of a line of its own.
              And the pace note moved up beside it, because a rate and a
              deadline are two numbers rather than a sentence - "₱1.8K a month
              to reach it by Jun 2027" is how a report reads, "₱1.8K/mo · Jun
              2027" is how an app does. */}
          <div className="flex items-baseline justify-between gap-2 mt-2">
            <span className={`text-[11px] truncate min-w-0 ${
              goal.linkedCount === 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}>
              {goal.linkedCount === 0
                ? 'No account attached'
                : (goal.accounts ?? []).join(' · ')}
            </span>
            {note && (
              <span className={`text-[11px] tabular-nums shrink-0 ${note.tone}`}>
                {note.text}
              </span>
            )}
          </div>
        </button>
      </div>
    </div>
  )
}

// ── Where the money actually sits ────────────────────────────────────────────

/**
 * The reconciliation. Each account's real balance, and how much of it is
 * spoken for.
 *
 * This exists because the waterfall is only believable if it visibly adds up.
 * Without it, a goal at 50% is just an assertion; with it you can see which
 * account the money is in and how much of that account is still free.
 */
function AccountSplitRow({ name, split, acct, isLast }) {
  const pct = split.balance > 0 ? (split.assigned / split.balance) * 100 : 0
  return (
    <>
    <div className="flex items-center gap-3 px-4 py-3">
      {/* The card, as everywhere else. This row named an account and never
          showed it. */}
      {acct
        ? <AccountChip acct={acct} size="sm" />
        : (
          <span
            className="w-[40px] h-[28px] rounded-[8px] shrink-0 border border-dashed
              border-slate-300 dark:border-white/20"
            aria-hidden="true"
          />
        )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-semibold text-slate-800 dark:text-white truncate">{name}</span>
          <span className="text-[12px] tabular-nums shrink-0 text-slate-500 dark:text-slate-400">
            {fmtCompact(split.balance)}
          </span>
        </div>
        <ProgressBar className="mt-2" value={pct} fillClass="bg-primary" />
        <div className="flex items-baseline justify-between gap-3 mt-1.5">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate min-w-0">
            {split.goals.map(g => g.name).join(', ')}
          </span>
          <span className="text-[11px] tabular-nums shrink-0 text-slate-400 dark:text-slate-500">
            {split.unassigned > 0 ? `${fmtCompact(split.unassigned)} free` : 'fully assigned'}
          </span>
        </div>
      </div>
    </div>

    {/* Was a border-b on the row's own box, so the line ran the full width of
        the card. It starts where the row's text starts now. Same gaps get a
        line: the last row still gets none. */}
    {!isLast && <Divider inset="row" />}
    </>
  )
}

// ── Create / edit ────────────────────────────────────────────────────────────

function GoalFormSheet({ open, goal, accounts, allGoals, onClose }) {
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🎯')
  const [target, setTarget] = useState('0')
  const [picked, setPicked] = useState([])
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  /* SectionLabel renders a real <label> when there is a control to point at,
     which is what these three fields have - so they name their inputs by id
     rather than by wrapping them. */
  const uid = useId()

  const isEdit = !!goal

  useEffect(() => {
    if (!open) return
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirmDelete(false)
    setSaving(false)
    if (goal) {
      setName(goal.name ?? '')
      setIcon(goal.icon ?? '🎯')
      setTarget(numToMoneyStr(goal.target ?? 0))
      setPicked(goal.accounts ?? [])
      setTargetDate(goal.targetDate ?? '')
    } else {
      setName('')
      setIcon('🎯')
      setTarget('0')
      setPicked([])
      setTargetDate('')
    }
  }, [open, goal])

  /* Sheet owns the overlay, the panel, the handle, the scroll lock, Escape,
     the focus trap and the exit animation. Closing is just onClose now - the
     parent sets open to false and Sheet animates out. */

  const fundable = useMemo(() => (accounts ?? []).filter(isFundable), [accounts])

  const targetNum = parseMoney(target)
  const canSave = name.trim().length > 0 && targetNum > 0 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const row = {
        name: name.trim(),
        icon,
        target: targetNum,
        // Only names that still exist get stored, so a stale pick from a
        // deleted account cannot linger in the array.
        accounts: picked.filter(n => fundable.some(a => a.name === n)),
        targetDate: targetDate || null,
        updatedAt: now,
        synced: 0,
      }
      if (isEdit) {
        await db.goals.update(goal.id, row)
      } else {
        await db.goals.add({
          ...row,
          priority: nextRank(allGoals ?? []),
          createdAt: now,
          archivedAt: null,
        })
      }
      showToast(isEdit ? 'Goal updated' : 'Goal created')
      onClose()
    } catch (e) {
      console.error('[Goals] save failed:', e)
      showToast('Failed to save goal', 'error')
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await db.goals.delete(goal.id)
      showToast('Goal deleted')
      onClose()
    } catch (e) {
      console.error('[Goals] delete failed:', e)
      showToast('Failed to delete goal', 'error')
      setSaving(false)
    }
  }

  async function handleArchive() {
    setSaving(true)
    try {
      const on = !goal.archivedAt
      await db.goals.update(goal.id, {
        archivedAt: on ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
        synced: 0,
      })
      // Archiving frees the money it was holding, which is the whole point -
      // say so, because the other goals' numbers are about to move.
      showToast(on ? 'Archived — its funding is freed up' : 'Goal restored')
      onClose()
    } catch (e) {
      console.error('[Goals] archive failed:', e)
      showToast('Failed to archive goal', 'error')
      setSaving(false)
    }
  }

  /* The actions are Sheet's `footer`, which pins them under the scrolling
     body. They used to be the last thing inside a panel that scrolled as one
     piece: on a short screen "Create goal" sat below the fold of a form long
     enough to need scrolling in the first place.

     Which set shows is the mode. The delete confirmation REPLACES the form's
     actions rather than adding to them - while it is asking, the only two
     answers are its own. */
  const actions = confirmDelete ? (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" className="flex-1"
        onClick={() => setConfirmDelete(false)}>
        Keep it
      </Button>
      <Button
        variant="danger"
        size="sm"
        className="flex-1"
        onClick={handleDelete} disabled={saving}
      >
        Delete
      </Button>
    </div>
  ) : (
    <div className="flex flex-col gap-2.5">
      <Button block onClick={handleSave} disabled={!canSave}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create goal'}
      </Button>

      {isEdit && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1"
            onClick={handleArchive} disabled={saving}>
            {goal.archivedAt ? 'Restore' : 'Archive'}
          </Button>
          <Button variant="dangerTint" size="sm" className="flex-1"
            onClick={() => setConfirmDelete(true)} disabled={saving}>
            Delete
          </Button>
        </div>
      )}
    </div>
  )

  return (
    /* 88vh as it was, in dvh - the form is long enough that the difference is
       a whole field on a phone with the URL bar showing. A height also docks
       the panel, which is what a sheet that means to scroll wants.

       The header's "Cancel" is gone with the rest of the chrome: the scrim,
       Escape and the handle all dismiss this now, and the footer's own
       buttons are the ones that decide anything. */
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Goal' : 'New Goal'}
      maxHeight="88dvh"
      footer={actions}
    >
      <div className="py-4">

        {confirmDelete ? (
          <div className="py-2">
            <p className="text-[15px] font-semibold text-slate-800 dark:text-white">
              Delete “{goal?.name}”?
            </p>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              The goal goes; your money does not move. Nothing was ever taken
              out of the account — a goal only ever described the balance.
            </p>
          </div>
        ) : (
          <>
            {/* Name */}
            <div>
              <SectionLabel htmlFor={`${uid}-name`}>What are you saving for</SectionLabel>
              <input
                id={`${uid}-name`}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Emergency fund"
                maxLength={40}
                className="w-full px-3.5 py-3 rounded-2xl text-[15px]
                  bg-white dark:bg-white/[0.05] text-slate-800 dark:text-white
                  border border-slate-200 dark:border-white/[0.08]
                  placeholder:text-slate-400 dark:placeholder:text-slate-600
                  focus:outline-none focus:border-primary"
              />
            </div>

            {/* Icon */}
            <div className="mt-4">
              {/* A grid of buttons is not one control, so this stays a <p>. */}
              <SectionLabel>Icon</SectionLabel>
              <div className="grid grid-cols-8 gap-1.5">
                {GOAL_ICONS.map(g => (
                  <button
                    key={g}
                    onClick={() => setIcon(g)}
                    className={`aspect-square rounded-xl flex items-center justify-center text-[18px]
                      active:scale-90 transition-transform duration-75 ${
                        icon === g
                          ? 'bg-primary/15 ring-2 ring-primary'
                          : 'bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08]'
                      }`}
                    aria-label={g}
                    aria-pressed={icon === g}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Target */}
            <div className="mt-4">
              <SectionLabel htmlFor={`${uid}-target`}>Target amount</SectionLabel>
              <div className="flex items-center gap-2 px-3.5 py-3 rounded-2xl
                bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08]
                focus-within:border-primary">
                <span className="text-[15px] font-semibold text-slate-400 dark:text-slate-500">₱</span>
                <input
                  id={`${uid}-target`}
                  value={target}
                  onChange={moneyChangeHandler(setTarget)}
                  inputMode="decimal"
                  className="flex-1 min-w-0 bg-transparent text-[15px] tabular-nums
                    text-slate-800 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Funding accounts */}
            <div className="mt-4">
              <SectionLabel>Funded by</SectionLabel>
              {/* Kept, both sentences. The first is the one mechanic of this
                  whole screen; the second explains an absence, and an absence
                  is the one thing the list itself cannot show you. */}
              <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-snug px-1">
                Progress is read from these balances. Credit cards are not
                listed — a card holds debt, not savings.
              </p>
              {fundable.length === 0 ? (
                <p className="text-[13px] text-amber-600 dark:text-amber-400 mt-2">
                  You have no cash, e-wallet, bank or savings account yet.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {fundable.map(a => {
                    const on = picked.includes(a.name)
                    return (
                      <button
                        key={a.name}
                        onClick={() => setPicked(p =>
                          on ? p.filter(n => n !== a.name) : [...p, a.name])}
                        aria-pressed={on}
                        className={`px-3 py-2 rounded-xl text-[13px] font-medium
                          active:scale-[0.96] transition-transform duration-75 ${
                            on
                              ? 'bg-primary text-white'
                              : 'bg-white dark:bg-white/[0.05] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/[0.08]'
                          }`}
                      >
                        {a.name}
                        <span className={`ml-1.5 tabular-nums ${on ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>
                          {fmtCompact(a.balance ?? 0)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Target date */}
            <div className="mt-4">
              <SectionLabel htmlFor={`${uid}-date`}>
                Target date <span className="font-normal text-slate-400 dark:text-slate-500">— optional</span>
              </SectionLabel>
              <input
                id={`${uid}-date`}
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                className="w-full px-3.5 py-3 rounded-2xl text-[15px]
                  bg-white dark:bg-white/[0.05] text-slate-800 dark:text-white
                  border border-slate-200 dark:border-white/[0.08]
                  focus:outline-none focus:border-primary"
              />
              {/* Kept: it is what the date actually does, which the field
                  cannot show. */}
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1.5 px-1">
                Adds a monthly figure to hit it on time.
              </p>
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Goals() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  const goalRows = useLiveQuery(() => db.goals.toArray(), [], undefined)
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], undefined)

  // One date for the whole render, so two rows can never disagree about what
  // "this month" is if the clock ticks over mid-paint.
  //
  // Deps are empty, not [goalRows]. Keying it on goalRows re-read the clock
  // whenever the goals changed, which is the exact thing the comment says it
  // is here to prevent.
  const today = useMemo(() => new Date(), [])

  const alloc = useMemo(
    () => allocateGoals({ goals: goalRows ?? [], accounts: accounts ?? [] }),
    [goalRows, accounts],
  )

  const archived = useMemo(() => alloc.goals.filter(g => g.archived), [alloc])

  // Local copy so a drag reads back instantly instead of waiting for Dexie to
  // round-trip through liveQuery, which would make the row snap back first.
  const [order, setOrder] = useState(null)
  const active = useMemo(() => {
    if (!order) return alloc.active
    const byId = new Map(alloc.active.map(g => [g.id, g]))
    const sorted = order.map(id => byId.get(id)).filter(Boolean)
    // Anything created or unarchived since the drag is appended rather than
    // dropped, so the list can never silently lose a goal.
    for (const g of alloc.active) if (!order.includes(g.id)) sorted.push(g)
    return sorted
  }, [alloc, order])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  async function handleDragEnd({ active: a, over }) {
    if (!over || a.id === over.id) return
    const oldIdx = active.findIndex(g => g.id === a.id)
    const newIdx = active.findIndex(g => g.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const moved = arrayMove(active, oldIdx, newIdx)
    setOrder(moved.map(g => g.id))
    try {
      const now = new Date().toISOString()
      const changes = reRank(moved.map(g => g.id), moved)
      await Promise.all(changes.map(c =>
        db.goals.update(c.id, { priority: c.priority, updatedAt: now, synced: 0 })))
    } catch (e) {
      console.error('[Goals] reorder failed:', e)
      showToast('Could not save the new order', 'error')
      setOrder(null)
    }
  }

  const loading = goalRows === undefined || accounts === undefined
  const fundable = (accounts ?? []).filter(isFundable)
  const acctMap = Object.fromEntries((accounts ?? []).map(a => [a.name, a]))

  /* Two lists, not one.
  
     Every account with a balance used to get three lines here, and most of
     them were saying the same thing: "Not funding any goal", with a bar at
     zero and its whole balance free. Eight accounts made a 600px wall whose
     interesting half was the four rows that actually fund something.
  
     The accounts doing no work are not noise individually - their total IS
     the "money no goal has claimed" the heading promises - so they collapse
     to the one line that says it. */
  const splitEntries = Object.entries(alloc.byAccount)
    .filter(([, s]) => s.balance > 0 || s.goals.length > 0)
  const fundingSplits = splitEntries.filter(([, s]) => s.goals.length > 0)
  const idleSplits    = splitEntries.filter(([, s]) => s.goals.length === 0)
  const idleFree      = idleSplits.reduce((n, [, s]) => n + (s.unassigned ?? 0), 0)

  return (
    <div className="pb-10">
      {/* ── Header ── */}
      <header className="flex items-center gap-2 px-5 pt-safe-header pb-3">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <IconChevronLeft />
        </IconButton>
        <h1 className="flex-1 text-center text-base font-semibold text-slate-800 dark:text-white truncate px-1">
          Goals
        </h1>
        <IconButton
          label="New goal"
          variant="primary"
          onClick={() => { setEditing(null); setFormOpen(true) }}
        >
          <IconPlus />
        </IconButton>
      </header>

      {/* The loading state is the page's own shape, not three grey
          rectangles: the hero, the stat row and the list, at the sizes
          they arrive at, so nothing below them moves when they do. */}
      {loading ? (
        <div className="px-5 mt-2 flex flex-col gap-7">
          <SkeletonHero />
          <SkeletonStatTrio />
          <SkeletonList rows={3} />
        </div>
      ) : alloc.active.length === 0 && archived.length === 0 ? (
        <div>
          <EmptyState
            title="No goals yet"
            body="Name what you are saving for, set the amount, and point it at the account holding the money."
            action={(
              <Button
                className="px-4"
                onClick={() => { setEditing(null); setFormOpen(true) }}
              >
                Add your first goal
              </Button>
            )}
          />
          {/* Kept: a constraint, and one you cannot act on from this screen. */}
          {fundable.length === 0 && (
            <p className="-mt-8 px-8 text-center text-[12px] text-amber-600 dark:text-amber-400">
              You will need a cash, e-wallet, bank or savings account first.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* ── The whole plan, in one figure ── */}
          <section className="px-5">
            <SectionLabel className="text-center">Saved toward goals</SectionLabel>
            <p className="text-center text-[38px] leading-none font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
              {fmt(alloc.totals.saved)}
            </p>
            <p className="mt-2 text-center text-[13px] text-slate-500 dark:text-slate-400 tabular-nums">
              of {fmt(alloc.totals.target)} across {alloc.totals.count} goal{alloc.totals.count === 1 ? '' : 's'}
            </p>

            <div className="mt-5">
              <GoalBar pct={alloc.totals.pct} complete={alloc.totals.pct >= 100} />
            </div>

            {/* "Unassigned" is money in fundable accounts that no goal has
                claimed. Not "spare" - it is simply unspoken-for, which is a
                different and more useful thing to know. */}
            <StatTrio
              className="mt-5"
              items={[
                {
                  label: 'Funded',
                  value: `${alloc.totals.complete} / ${alloc.totals.count}`,
                  tone: 'text-emerald-600 dark:text-emerald-400',
                },
                {
                  label: 'Still to save',
                  value: fmtCompact(Math.max(0, alloc.totals.target - alloc.totals.saved)),
                },
                { label: 'Unassigned', value: fmtCompact(alloc.totals.unassigned) },
              ]}
            />
          </section>

          {/* ── The goals, in funding order ── */}
          {active.length > 0 && (
            <section className="mt-7">
              <SectionLabel
                inset="gutter"
                gap="loose"
                hint="Top of the list is funded first."
                action={
                  <InfoButton title="How goals are funded">
                    Goals read your real balances. When several goals share an
                    account, the one highest in the list fills first and the
                    rest take what is left, so the totals always match the
                    money you actually have.
                  </InfoButton>
                }
              >
                In funding order
              </SectionLabel>
              <div className="px-5">
                <Card clip>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={active.map(g => g.id)} strategy={verticalListSortingStrategy}>
                      {active.map((g, i) => (
                        <div key={g.id}>
                          <GoalRow
                            goal={g}
                            today={today}
                            onEdit={goal => { setEditing(goal); setFormOpen(true) }}
                          />
                          {i < active.length - 1 && <Divider inset="row" />}
                        </div>
                      ))}
                    </SortableContext>
                  </DndContext>
                </Card>
              </div>
            </section>
          )}

          {/* ── Reconciliation ── */}
          {splitEntries.length > 0 && (
            <section className="mt-7">
              {/* No hint. It used to read "Every peso counted once. What is
                  left over is money no goal has claimed." - which is now the
                  last row of this card, as a figure, with the accounts it
                  belongs to counted. A sentence promising what the next card
                  shows is a sentence the card makes redundant. */}
              <SectionLabel inset="gutter" gap="loose">
                Where it comes from
              </SectionLabel>
              <div className="px-5">
                <Card clip>
                  {fundingSplits.map(([name, split], i) => (
                    <AccountSplitRow
                      key={name}
                      acct={acctMap[name]}
                      name={name}
                      split={split}
                      isLast={i === fundingSplits.length - 1 && idleSplits.length === 0}
                    />
                  ))}

                  {/* The rest, as the one number they add up to. Naming each
                      account that funds nothing spends three lines saying
                      "nothing" - the total is the thing the heading above
                      actually promises. */}
                  {idleSplits.length > 0 && (
                    <>
                      {fundingSplits.length > 0 && <Divider inset="row" />}
                      <div className="flex items-baseline justify-between gap-3 px-4 py-3">
                        <span className="text-[13px] text-slate-500 dark:text-slate-400 truncate">
                          {idleSplits.length} account{idleSplits.length === 1 ? '' : 's'} not funding a goal
                        </span>
                        <span className="text-[13px] font-semibold tabular-nums shrink-0 text-slate-700 dark:text-slate-200">
                          {fmtCompact(idleFree)} free
                        </span>
                      </div>
                    </>
                  )}
                </Card>
              </div>
            </section>
          )}

          {/* ── Archived ── */}
          {archived.length > 0 && (
            <section className="mt-7">
              <div className="px-5">
                <button
                  onClick={() => setShowArchived(v => !v)}
                  className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 active:opacity-60"
                >
                  {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
                </button>
              </div>
              {showArchived && (
                <div className="px-5 mt-2.5">
                  <Card clip>
                    {archived.map((g, i) => (
                      <Fragment key={g.id}>
                        <button
                          onClick={() => { setEditing(g); setFormOpen(true) }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:opacity-70"
                        >
                          <span className="text-[16px] leading-none opacity-50" aria-hidden="true">{g.icon ?? '🎯'}</span>
                          <span className="flex-1 min-w-0 text-[13px] font-medium text-slate-500 dark:text-slate-400 truncate">
                            {g.name}
                          </span>
                          <span className="text-[12px] tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
                            {fmtCompact(g.target)}
                          </span>
                        </button>
                        {i < archived.length - 1 && <Divider inset="row" />}
                      </Fragment>
                    ))}
                  </Card>
                </div>
              )}
            </section>
          )}

          {/* The four-line explainer that used to sit here is now behind the
              (i) beside "In funding order" - next to the concept it explains,
              instead of four lines of prose below everything on every visit. */}
        </>
      )}

      <GoalFormSheet
        open={formOpen}
        goal={editing}
        accounts={accounts}
        allGoals={goalRows}
        /* `editing` is deliberately left alone here. The sheet's old close()
           deferred onClose by 240ms, so clearing it landed AFTER the exit
           animation; Sheet calls onClose the moment you dismiss, and clearing
           it now would flip the title to "New goal" and drop the
           Archive/Delete row halfway through the slide down. Every path that
           opens the sheet sets it - null for a new goal, the row for an edit -
           so a stale value can never be read. */
        onClose={() => setFormOpen(false)}
      />
    </div>
  )
}
