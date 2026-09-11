import { useState, useMemo, useEffect } from 'react'
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
import { useScrollLock } from '../hooks/useScrollLock'
import { parseMoney, numToMoneyStr, moneyChangeHandler } from '../utils/moneyInput'
import {
  allocateGoals, isFundable, GOAL_ICONS, nextRank, reRank, pace,
} from '../lib/goals'
import Button from '../components/ui/Button'
import IconButton from '../components/ui/IconButton'

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

function SectionLabel({ children, hint }) {
  return (
    <div className="px-5 mb-2.5">
      <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{children}</p>
      {hint && (
        <p className="text-[12px] leading-snug text-slate-500 dark:text-slate-400 mt-0.5">{hint}</p>
      )}
    </div>
  )
}

function Card({ children, className = '' }) {
  return <div className={`card rounded-2xl overflow-hidden ${className}`}>{children}</div>
}

/**
 * A goal's progress bar.
 *
 * Complete is deliberately a different hue from in-progress rather than a
 * fuller bar of the same colour: at a glance down a list, "done" needs to be
 * legible without reading the number beside it.
 */
function GoalBar({ pct, complete }) {
  return (
    <div className="h-2 rounded-full bg-slate-200 dark:bg-white/[0.10] overflow-hidden">
      <div
        className={`h-full rounded-full transition-[width] duration-700 ${
          complete ? 'bg-emerald-500' : 'bg-primary'
        }`}
        style={{ width: `${Math.max(pct > 0 ? 2 : 0, Math.min(100, pct))}%` }}
      />
    </div>
  )
}

// ── One goal ─────────────────────────────────────────────────────────────────

function GoalRow({ goal, onEdit, today }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: goal.id })

  const p = pace(goal, today)
  const dateLabel = fmtTargetDate(goal.targetDate)

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

          <div className="flex items-baseline justify-between gap-3 mt-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate min-w-0">
              {goal.linkedCount === 0
                ? 'No account attached'
                : (goal.accounts ?? []).join(' · ')}
            </span>
            <span className="text-[11px] tabular-nums shrink-0 text-slate-400 dark:text-slate-500">
              {Math.round(goal.pct)}%
            </span>
          </div>

          {/* The line that changes behaviour: what it costs per month to
              actually land on the date. Only shown when there is a date and
              something still to save. */}
          {p && !p.done && (
            <p className={`text-[11px] mt-1.5 tabular-nums ${
              p.overdue ? 'text-red-500 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
            }`}>
              {p.overdue
                ? `${fmtCompact(goal.remaining)} short, and ${dateLabel} has passed`
                : `${fmtCompact(p.perMonth)} a month to reach it by ${dateLabel}`}
            </p>
          )}
          {p?.done && dateLabel && (
            <p className="text-[11px] mt-1.5 text-emerald-600 dark:text-emerald-400">
              Funded, ahead of {dateLabel}
            </p>
          )}
          {goal.linkedCount === 0 && (
            <p className="text-[11px] mt-1.5 text-amber-600 dark:text-amber-400">
              Attach an account and this starts tracking itself
            </p>
          )}
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
function AccountSplitRow({ name, split, isLast }) {
  const pct = split.balance > 0 ? (split.assigned / split.balance) * 100 : 0
  return (
    <div className={`px-4 py-3 ${isLast ? '' : 'border-b border-slate-100 dark:border-white/[0.06]'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-slate-800 dark:text-white truncate">{name}</span>
        <span className="text-[12px] tabular-nums shrink-0 text-slate-500 dark:text-slate-400">
          {fmtCompact(split.balance)}
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-200 dark:bg-white/[0.10] overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-[width] duration-700"
          style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="flex items-baseline justify-between gap-3 mt-1.5">
        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate min-w-0">
          {split.goals.length === 0
            ? 'Not funding any goal'
            : split.goals.map(g => g.name).join(', ')}
        </span>
        <span className="text-[11px] tabular-nums shrink-0 text-slate-400 dark:text-slate-500">
          {split.unassigned > 0 ? `${fmtCompact(split.unassigned)} free` : 'fully assigned'}
        </span>
      </div>
    </div>
  )
}

// ── Create / edit ────────────────────────────────────────────────────────────

function GoalFormSheet({ open, goal, accounts, allGoals, onClose }) {
  const { showToast } = useToast()
  const [closing, setClosing] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🎯')
  const [target, setTarget] = useState('0')
  const [picked, setPicked] = useState([])
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useScrollLock(open)

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

  function close() {
    if (closing) return
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

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
      close()
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
      close()
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
      close()
    } catch (e) {
      console.error('[Goals] archive failed:', e)
      showToast('Failed to archive goal', 'error')
      setSaving(false)
    }
  }

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-slate-50 dark:bg-[#0d1117]',
          'border-t border-slate-100 dark:border-white/[0.07]',
          'max-h-[88vh] flex flex-col',
        ].join(' ')}
      >
        <div className="pt-5 px-5 pb-3 border-b border-slate-100 dark:border-white/[0.04] shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800 dark:text-white">
              {isEdit ? 'Edit goal' : 'New goal'}
            </h3>
            <button onClick={close} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
              Cancel
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4"
          style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>

          {confirmDelete ? (
            <div className="py-2">
              <p className="text-[15px] font-semibold text-slate-800 dark:text-white">
                Delete “{goal?.name}”?
              </p>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                The goal goes; your money does not move. Nothing was ever taken
                out of the account — a goal only ever described the balance.
              </p>
              <div className="flex gap-2 mt-5">
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
            </div>
          ) : (
            <>
              {/* Name */}
              <label className="block">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  What are you saving for
                </span>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Emergency fund"
                  maxLength={40}
                  className="mt-1.5 w-full px-3.5 py-3 rounded-2xl text-[15px]
                    bg-white dark:bg-white/[0.05] text-slate-800 dark:text-white
                    border border-slate-200 dark:border-white/[0.08]
                    placeholder:text-slate-400 dark:placeholder:text-slate-600
                    focus:outline-none focus:border-primary"
                />
              </label>

              {/* Icon */}
              <div className="mt-4">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Icon
                </span>
                <div className="mt-1.5 grid grid-cols-8 gap-1.5">
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
              <label className="block mt-4">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Target amount
                </span>
                <div className="mt-1.5 flex items-center gap-2 px-3.5 py-3 rounded-2xl
                  bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08]
                  focus-within:border-primary">
                  <span className="text-[15px] font-semibold text-slate-400 dark:text-slate-500">₱</span>
                  <input
                    value={target}
                    onChange={moneyChangeHandler(setTarget)}
                    inputMode="decimal"
                    className="flex-1 min-w-0 bg-transparent text-[15px] tabular-nums
                      text-slate-800 dark:text-white focus:outline-none"
                  />
                </div>
              </label>

              {/* Funding accounts */}
              <div className="mt-4">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Funded by
                </span>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
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
              <label className="block mt-4">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Target date <span className="normal-case font-normal text-slate-400 dark:text-slate-500">— optional</span>
                </span>
                <input
                  type="date"
                  value={targetDate}
                  onChange={e => setTargetDate(e.target.value)}
                  className="mt-1.5 w-full px-3.5 py-3 rounded-2xl text-[15px]
                    bg-white dark:bg-white/[0.05] text-slate-800 dark:text-white
                    border border-slate-200 dark:border-white/[0.08]
                    focus:outline-none focus:border-primary"
                />
                <span className="block text-[12px] text-slate-500 dark:text-slate-400 mt-1.5">
                  Adds a monthly figure to hit it on time.
                </span>
              </label>

              <Button block className="mt-6" onClick={handleSave} disabled={!canSave}>
                {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create goal'}
              </Button>

              {isEdit && (
                <div className="flex gap-2 mt-2.5 mb-2">
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
            </>
          )}
        </div>
      </div>
    </div>
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
  const splitEntries = Object.entries(alloc.byAccount)
    .filter(([, s]) => s.balance > 0 || s.goals.length > 0)

  return (
    <div className="pb-10">
      {/* ── Header ── */}
      <header className="flex items-center gap-2 px-4 pt-safe-header pb-3">
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

      {loading ? (
        <div className="px-5 mt-6 flex flex-col gap-3">
          <div className="h-28 rounded-2xl bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
          <div className="h-20 rounded-2xl bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
        </div>
      ) : alloc.active.length === 0 && archived.length === 0 ? (
        <div className="px-5 mt-8 text-center">
          <p className="text-[15px] font-semibold text-slate-800 dark:text-white">No goals yet</p>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            Name what you are saving for, set the amount, and point it at the
            account holding the money. Progress comes from the real balance —
            there is nothing to keep updating.
          </p>
          <button
            onClick={() => { setEditing(null); setFormOpen(true) }}
            className="inline-block mt-5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary
              active:scale-[0.97] transition-transform duration-75"
          >
            Add your first goal
          </button>
          {fundable.length === 0 && (
            <p className="text-[12px] text-amber-600 dark:text-amber-400 mt-4">
              You will need a cash, e-wallet, bank or savings account first.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* ── The whole plan, in one figure ── */}
          <section className="px-5">
            <p className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
              Saved toward goals
            </p>
            <p className="mt-2 text-center text-[38px] leading-none font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
              {fmt(alloc.totals.saved)}
            </p>
            <p className="mt-2 text-center text-[13px] text-slate-500 dark:text-slate-400 tabular-nums">
              of {fmt(alloc.totals.target)} across {alloc.totals.count} goal{alloc.totals.count === 1 ? '' : 's'}
            </p>

            <div className="mt-5">
              <GoalBar pct={alloc.totals.pct} complete={alloc.totals.pct >= 100} />
            </div>

            <div className="grid grid-cols-3 gap-3 mt-5">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Funded
                </p>
                <p className="text-[15px] font-bold tabular-nums mt-0.5 text-emerald-600 dark:text-emerald-400">
                  {alloc.totals.complete} / {alloc.totals.count}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Still to save
                </p>
                <p className="text-[15px] font-bold tabular-nums mt-0.5 text-slate-800 dark:text-slate-100">
                  {fmtCompact(Math.max(0, alloc.totals.target - alloc.totals.saved))}
                </p>
              </div>
              <div>
                {/* Money in fundable accounts that no goal has claimed. Not
                    "spare" - it is simply unspoken-for, which is a different
                    and more useful thing to know. */}
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Unassigned
                </p>
                <p className="text-[15px] font-bold tabular-nums mt-0.5 text-slate-800 dark:text-slate-100">
                  {fmtCompact(alloc.totals.unassigned)}
                </p>
              </div>
            </div>
          </section>

          {/* ── The goals, in funding order ── */}
          {active.length > 0 && (
            <section className="mt-7">
              <SectionLabel hint="Top of the list is funded first. Drag the handle to change who gets the money.">
                In funding order
              </SectionLabel>
              <div className="px-5">
                <Card>
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
                          {i < active.length - 1 && (
                            <div className="h-px bg-slate-100 dark:bg-white/[0.06] mx-4" />
                          )}
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
              <SectionLabel hint="Every peso counted once. What is left over is money no goal has claimed.">
                Where it comes from
              </SectionLabel>
              <div className="px-5">
                <Card>
                  {splitEntries.map(([name, split], i) => (
                    <AccountSplitRow
                      key={name}
                      name={name}
                      split={split}
                      isLast={i === splitEntries.length - 1}
                    />
                  ))}
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
                  <Card>
                    {archived.map((g, i) => (
                      <button
                        key={g.id}
                        onClick={() => { setEditing(g); setFormOpen(true) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left active:opacity-70 ${
                          i === archived.length - 1 ? '' : 'border-b border-slate-100 dark:border-white/[0.06]'
                        }`}
                      >
                        <span className="text-[16px] leading-none opacity-50" aria-hidden="true">{g.icon ?? '🎯'}</span>
                        <span className="flex-1 min-w-0 text-[13px] font-medium text-slate-500 dark:text-slate-400 truncate">
                          {g.name}
                        </span>
                        <span className="text-[12px] tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
                          {fmtCompact(g.target)}
                        </span>
                      </button>
                    ))}
                  </Card>
                </div>
              )}
            </section>
          )}

          {/* How the split works, said once, at the bottom - where someone
              who has just been surprised by a number will look for it. */}
          <p className="px-5 mt-7 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
            Goals read your real balances. When several goals share an account,
            the one highest in the list fills first and the rest take what is
            left, so the totals always match the money you actually have.
          </p>
        </>
      )}

      <GoalFormSheet
        open={formOpen}
        goal={editing}
        accounts={accounts}
        allGoals={goalRows}
        onClose={() => { setFormOpen(false); setEditing(null) }}
      />
    </div>
  )
}
