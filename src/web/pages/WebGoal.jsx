import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import useRates from '../../hooks/useRates'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { useToast } from '../../context/ToastContext'
import { allocateGoals, isFundable, pace, monthsUntil } from '../../lib/goals'
import { fmt, fmtCompact } from '../../lib/money'
import { GoalRing, fmtTargetDate, fmtDateFull } from '../../pages/goals/shared'
import GoalFormSheet from '../../pages/goals/GoalFormSheet'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import Dialog from '../ui/Dialog'
import Popover, { MenuItem, MenuSep } from '../ui/Popover'
import { Stat, AccountTile, Progress, Empty, Money } from '../ui/display'
import { IChevronLeft, IEdit, IMore, ITrash, ITarget, IRefresh } from '../ui/icons'

/**
 * One goal on a computer: its name and where it stands at the top, its
 * figures in a row, the ring beside the accounts that fund it - the phone's
 * page (pages/GoalDetail) laid out across the width rather than down a
 * column.
 *
 * The same allocation as everywhere (lib/goals allocateGoals): what a goal
 * has depends on every goal ranked above it, so the page computes all of
 * them and explains a zero ("Claimed by Japan trip") rather than leaving it.
 * Editing is the phone's form (now a dialog here); archiving and deleting
 * are in the ⋯ menu, deleting behind a question.
 */
export default function WebGoal() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const goalRows = useLiveQuery(() => db.goals.toArray(), [], undefined)
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], undefined)
  const base = useBaseCurrency()
  const { table: rates } = useRates()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [working, setWorking] = useState(false)
  const today = useMemo(() => new Date(), [])

  const alloc = useMemo(() => allocateGoals({ goals: goalRows ?? [], accounts: accounts ?? [], base, rates }), [goalRows, accounts, base, rates])
  const goal = alloc.goals.find(g => g.id === Number(id))
  const loading = goalRows === undefined || accounts === undefined

  const funding = useMemo(() => {
    if (!goal) return []
    const byName = new Map((accounts ?? []).filter(isFundable).map(a => [a.name, a]))
    return (goal.accounts ?? []).map(name => {
      const acct = byName.get(name)
      if (!acct) return null
      const amount = (goal.sources ?? []).find(s => s.account === name)?.amount ?? 0
      const split = alloc.byAccount[name]
      const ahead = (split?.goals ?? []).filter(g => g.goalId !== goal.id).map(g => g.name)
      return { acct, amount, split, ahead }
    }).filter(Boolean)
  }, [goal, accounts, alloc])

  async function toggleArchive() {
    if (!goal) return
    setWorking(true)
    try {
      const on = !goal.archivedAt
      await db.goals.update(goal.id, { archivedAt: on ? new Date().toISOString() : null, updatedAt: new Date().toISOString(), synced: 0 })
      showToast(on ? 'Archived, its funding is freed up' : 'Goal restored')
    } catch (e) {
      console.error('[WebGoal] archive failed:', e)
      showToast('Could not archive that', 'error')
    } finally {
      setWorking(false)
    }
  }

  async function remove() {
    if (!goal) return
    setWorking(true)
    try {
      await db.goals.delete(goal.id)
      showToast('Goal deleted')
      navigate('/goals', { replace: true })
    } catch (e) {
      console.error('[WebGoal] delete failed:', e)
      showToast('Could not delete that', 'error')
      setWorking(false)
    }
  }
  const closeDel = useCallback(() => { if (!working) setConfirmDel(false) }, [working])

  const eyebrow = <Link to="/goals" className="inline-flex items-center gap-1 hover:text-[var(--d-text)]"><IChevronLeft size={13} />Goals</Link>

  if (loading) return <Page eyebrow={eyebrow} title=" "><div className="h-40" /></Page>
  if (!goal) {
    return (
      <Page eyebrow={eyebrow} title="Goal not found">
        <Panel><Empty icon={<ITarget size={20} />} title="This goal isn’t here" body="It may have been deleted." action={<Btn onClick={() => navigate('/goals')}>Back to goals</Btn>} /></Panel>
      </Page>
    )
  }

  const p = pace(goal, today)
  const overdue = !!p && !p.done && p.overdue
  const dateLabel = fmtTargetDate(goal.targetDate)
  const months = goal.targetDate ? monthsUntil(goal.targetDate, today) : null
  const status = goal.archived ? { text: 'Archived', cls: '' }
    : goal.linkedCount === 0 ? { text: 'No account attached', cls: 'd-badge-warn' }
      : goal.complete ? { text: 'Reached', cls: 'd-badge-pos' }
        : overdue ? { text: 'Past its date', cls: 'd-badge-neg' }
          : p ? { text: 'On its way', cls: 'd-badge-accent' } : { text: 'No date set', cls: '' }
  const line = goal.archived ? 'Archived, holding no money.'
    : goal.linkedCount === 0 ? 'No account attached, so this cannot move.'
      : goal.complete ? `Fully funded${dateLabel ? `, ahead of ${dateLabel}` : ''}.`
        : overdue ? `${fmtCompact(goal.remaining)} short. ${dateLabel} has passed.`
          : p ? `${fmtCompact(p.perMonth)} a month reaches it by ${dateLabel}.` : 'Set a date to see the monthly pace.'

  return (
    <Page
      eyebrow={eyebrow}
      media={<span className="d-tile d-tile-xl bg-[var(--d-sunken)] text-[30px]" aria-hidden="true">{goal.icon || '🎯'}</span>}
      title={goal.name}
      subtitle={(
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`d-badge d-badge-lg ${status.cls}`}>{status.text}</span>
          {goal.targetDate && <span className="d-badge d-badge-lg">By {fmtTargetDate(goal.targetDate)}</span>}
        </span>
      )}
      actions={(
        <>
          <Btn icon={<IEdit size={14} />} onClick={() => setEditOpen(true)}>Edit</Btn>
          <Popover role="menu" align="end" width={220} label="More" trigger={<Btn variant="ghost" icon={<IMore size={16} />} label="More" />}>
            <MenuItem icon={<IRefresh />} onSelect={toggleArchive}>{goal.archived ? 'Restore this goal' : 'Archive'}</MenuItem>
            <MenuSep />
            <MenuItem icon={<ITrash />} danger onSelect={() => setConfirmDel(true)}>Delete this goal</MenuItem>
          </Popover>
        </>
      )}
    >
      <div className="d-stats grid grid-cols-4 gap-5 mb-8">
        <Stat label="Saved" value={fmt(goal.saved)} note={`Of ${fmt(goal.target)}`}>
          <Progress className="mt-3" value={goal.pct} color={goal.complete ? 'var(--d-pos)' : undefined} />
        </Stat>
        <Stat label="Still to save" value={fmt(goal.remaining)} tone={goal.complete ? 'pos' : null} note={goal.complete ? 'Nothing left' : `${Math.round(goal.pct)}% of the way`} />
        <Stat label="Target date" value={goal.targetDate ? fmtDateFull(goal.targetDate) : 'Not set'} tone={overdue ? 'neg' : null}
          note={goal.targetDate && months !== null && !overdue ? `${months} month${months === 1 ? '' : 's'} away` : overdue ? 'Passed' : 'Add one to pace it'} />
        <Stat label="Monthly pace" value={p && !p.done && !overdue ? fmt(p.perMonth) : '—'} note={p && !p.done && !overdue ? 'To reach it on time' : goal.complete ? 'Reached' : 'No date to pace to'} />
      </div>

      <div className="grid grid-cols-12 gap-5">
        <Panel className="col-span-5 d-side" title="Progress">
          <div className="flex flex-col items-center text-center pb-2">
            <GoalRing pct={goal.pct} complete={goal.complete} muted={goal.archived} size={200} stroke={13}>
              <span className="text-[52px] leading-none" aria-hidden="true">{goal.icon || '🎯'}</span>
              <span className={`mt-2.5 text-15 font-bold d-num ${goal.complete ? 'd-pos' : 'text-[var(--d-text-3)]'}`}>{Math.round(goal.pct)}%</span>
            </GoalRing>
            <p className="mt-5 text-28 font-semibold tracking-tight d-num text-[var(--d-text)]">{fmt(goal.saved)}</p>
            <p className="mt-1 text-14 text-[var(--d-text-2)] d-num">of {fmt(goal.target)}</p>
            <p className={`mt-3 text-14 font-medium ${overdue ? 'd-neg' : goal.complete ? 'd-pos' : goal.linkedCount === 0 ? 'd-warn' : 'text-[var(--d-text-2)]'}`}>{line}</p>
          </div>
        </Panel>

        <Panel className="col-span-7 d-main self-start" title="Funded by" meta={funding.length ? `${funding.length} ${funding.length === 1 ? 'account' : 'accounts'}` : null} flush>
          {funding.length === 0 ? (
            <div className="px-6 pb-6">
              <p className="text-14 text-[var(--d-text-2)] leading-relaxed">This goal is not attached to an account, so its progress can never move. Attach one and it starts tracking itself.</p>
              <Btn variant="tint" size="sm" className="mt-3" onClick={() => setEditOpen(true)}>Attach an account</Btn>
            </div>
          ) : (
            <div className="pb-3">
              {funding.map(({ acct, amount, split, ahead }) => (
                <div key={acct.name} className="flex items-center gap-4 px-6 py-3.5 border-t border-[var(--d-border)] first:border-t-0">
                  <AccountTile account={acct} />
                  <div className="flex-1 min-w-0">
                    <div className="text-14 font-semibold text-[var(--d-text)] truncate">{acct.name}</div>
                    <div className="text-13 text-[var(--d-text-3)] truncate d-num">
                      {amount === 0 && ahead.length > 0 ? `Claimed by ${ahead.join(', ')}`
                        : amount === 0 && (split?.balance ?? 0) === 0 ? 'Nothing in this account'
                          : `${fmt(split?.balance ?? 0)} balance · ${fmt(split?.unassigned ?? 0)} free`}
                    </div>
                  </div>
                  <Money value={amount} className={`text-15 font-semibold ${amount > 0 ? '' : 'text-[var(--d-text-3)]'}`} />
                </div>
              ))}
            </div>
          )}
          <div className="px-6 py-4 border-t border-[var(--d-border)] text-13 text-[var(--d-text-3)]">
            {goal.archived ? 'Archived, so it is not claiming any of your balance.' : 'A goal only watches your balance; it never moves money. Archiving frees what it holds for the goals below it.'}
          </div>
        </Panel>
      </div>

      <Dialog
        open={confirmDel}
        onClose={closeDel}
        title={`Delete ${goal.name}?`}
        actions={(
          <>
            <Btn onClick={closeDel} disabled={working}>Cancel</Btn>
            <Btn variant="danger-solid" data-autofocus onClick={remove} disabled={working}>{working ? 'Deleting…' : 'Delete'}</Btn>
          </>
        )}
      >
        Your money stays exactly where it is. A goal only ever watches your balance, it never moves it.
      </Dialog>
      <GoalFormSheet open={editOpen} goal={goal} accounts={accounts} allGoals={goalRows} onClose={() => setEditOpen(false)} onDeleted={() => navigate('/goals', { replace: true })} />
    </Page>
  )
}
