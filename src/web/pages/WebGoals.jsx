import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import useRates from '../../hooks/useRates'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { allocateGoals, pace, isFundable } from '../../lib/goals'
import { fmt } from '../../lib/money'
import { GoalRing, fmtTargetDate } from '../../pages/goals/shared'
import GoalFormSheet from '../../pages/goals/GoalFormSheet'
import GoalSortSheet from '../../pages/goals/GoalSortSheet'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import { Stat, AccountTile, Progress, Empty, Money } from '../ui/display'
import { IPlus, ITarget, ISliders } from '../ui/icons'

/**
 * Goals on a computer: every goal as a card - its ring, what is saved of
 * what, when it is for and what that takes a month - in a grid, beside where
 * the money for them sits.
 *
 * The phone's allocation (lib/goals allocateGoals): balances fill goals in
 * rank order, so a goal's progress is the money in the accounts pointed at
 * it, after the goals ranked above it. Creating and reordering are the
 * phone's sheets; a goal's page is the phone's.
 */
export default function WebGoals() {
  const navigate = useNavigate()
  const goalRows = useLiveQuery(() => db.goals.toArray(), [], undefined)
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], undefined)
  const base = useBaseCurrency()
  const { table: rates } = useRates()
  const [formOpen, setFormOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const today = useMemo(() => new Date(), [])

  const alloc = useMemo(() => allocateGoals({ goals: goalRows ?? [], accounts: accounts ?? [], base, rates }), [goalRows, accounts, base, rates])
  const active = alloc.active
  const archived = alloc.goals.filter(g => g.archived)
  const acctMap = Object.fromEntries((accounts ?? []).map(a => [a.name, a]))
  const splits = Object.entries(alloc.byAccount).filter(([, s]) => s.balance > 0 || s.goals.length > 0)
  const funding = splits.filter(([, s]) => s.goals.length > 0)
  const idleFree = splits.filter(([, s]) => s.goals.length === 0).reduce((n, [, s]) => n + (s.unassigned ?? 0), 0)
  const loading = goalRows === undefined || accounts === undefined
  const t = alloc.totals
  const nextDue = active.filter(g => g.targetDate && !g.complete).sort((a, b) => String(a.targetDate).localeCompare(String(b.targetDate)))[0]

  return (
    <Page
      title="Goals"
      subtitle={loading ? ' ' : `${active.length} ${active.length === 1 ? 'goal' : 'goals'}${archived.length ? ` · ${archived.length} archived` : ''}`}
      actions={
        <>
          {active.length > 1 && <Btn icon={<ISliders size={14} />} onClick={() => setSortOpen(true)}>Reorder</Btn>}
          <Btn variant="primary" icon={<IPlus size={15} />} onClick={() => setFormOpen(true)}>New goal</Btn>
        </>
      }
    >
      {!loading && active.length === 0 && archived.length === 0 ? (
        <Panel>
          <Empty icon={<ITarget size={20} />} title="No goals yet" body="Name what you are saving for, set the amount, and point it at the account holding the money."
            action={<Btn variant="primary" onClick={() => setFormOpen(true)}>Add your first goal</Btn>} />
          {(accounts ?? []).filter(isFundable).length === 0 && <p className="-mt-6 pb-8 text-center text-13 d-warn">Add a savings or spending account first: a goal is funded by one.</p>}
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-5 mb-8">
            <Stat label="Saved toward goals" value={fmt(t.saved ?? 0)} note={`Of ${fmt(t.target ?? 0)}`}>
              <Progress className="mt-3" value={t.pct ?? 0} />
            </Stat>
            <Stat label="Reached" value={`${t.complete ?? 0} of ${t.count ?? active.length}`} tone={(t.complete ?? 0) > 0 ? 'pos' : null} note={(t.complete ?? 0) > 0 ? 'Ready to spend or archive' : 'None reached yet'} />
            <Stat label="Not on a goal" value={fmt(idleFree + funding.reduce((n, [, s]) => n + (s.unassigned ?? 0), 0))} note="In accounts that could fund one" />
            <Stat label="Next target date" value={nextDue ? fmtTargetDate(nextDue.targetDate) : '—'} note={nextDue ? nextDue.name : 'No dates set'} />
          </div>

          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-8 min-w-0">
              <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                {active.map(g => <GoalCard key={g.id} goal={g} today={today} onOpen={() => navigate(`/goals/${g.id}`)} />)}
              </div>
              {archived.length > 0 && (
                <div className="mt-8">
                  <Btn variant="ghost" onClick={() => setShowArchived(s => !s)}>{showArchived ? 'Hide' : 'Show'} {archived.length} archived</Btn>
                  {showArchived && (
                    <div className="grid gap-5 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                      {archived.map(g => <GoalCard key={g.id} goal={g} today={today} muted onOpen={() => navigate(`/goals/${g.id}`)} />)}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Panel className="col-span-4 self-start" title="Where the money sits" flush>
              <div className="pb-3">
                {funding.map(([name, s]) => (
                  <div key={name} className="px-6 py-3">
                    <div className="flex items-center gap-3 mb-2">
                      <AccountTile account={acctMap[name] ?? { name }} size="sm" />
                      <span className="flex-1 truncate text-14 font-medium">{name}</span>
                      <Money value={s.balance} className="text-14 font-semibold" />
                    </div>
                    <Progress value={s.balance > 0 ? (s.assigned / s.balance) * 100 : 0} />
                    <div className="mt-1.5 flex justify-between text-12 text-[var(--d-text-3)] d-num">
                      <span>{fmt(s.assigned)} to {s.goals.length} {s.goals.length === 1 ? 'goal' : 'goals'}</span>
                      <span>{fmt(s.unassigned)} free</span>
                    </div>
                  </div>
                ))}
                {idleFree > 0 && (
                  <div className="px-6 py-3 text-13 text-[var(--d-text-2)]">
                    <span className="font-semibold d-num text-[var(--d-text)]">{fmt(idleFree)}</span> more sits in accounts no goal draws on.
                  </div>
                )}
                {funding.length === 0 && idleFree === 0 && <div className="px-6 pb-3 text-14 text-[var(--d-text-2)]">No account funds a goal yet.</div>}
              </div>
            </Panel>
          </div>
        </>
      )}

      <GoalFormSheet open={formOpen} goal={null} accounts={accounts} allGoals={goalRows} onClose={() => setFormOpen(false)} />
      <GoalSortSheet open={sortOpen} goals={active} onClose={() => setSortOpen(false)} />
    </Page>
  )
}

/** One goal as a card. @param {{goal: any, today: Date, onOpen: () => void, muted?: boolean}} props */
function GoalCard({ goal, today, onOpen, muted = false }) {
  const p = pace(goal, today)
  const overdue = !!p && !p.done && p.overdue
  const line = goal.linkedCount === 0 ? { text: 'No account attached', cls: 'd-warn' }
    : goal.complete ? { text: 'Reached', cls: 'd-pos' }
    : overdue ? { text: 'Past its date', cls: 'd-neg' }
    : p && p.perMonth > 0 ? { text: `${fmt(p.perMonth)} a month to make it`, cls: 'text-[var(--d-text-3)]' }
    : { text: goal.targetDate ? `By ${fmtTargetDate(goal.targetDate)}` : 'No date set', cls: 'text-[var(--d-text-3)]' }
  return (
    <button type="button" onClick={onOpen} className="d-panel text-left px-6 py-5 flex items-center gap-5 hover:border-[rgba(var(--color-primary-rgb),0.35)] transition-colors">
      <GoalRing pct={goal.pct} complete={goal.complete} muted={muted} size={84} stroke={7}>
        <span className="text-[22px] leading-none" aria-hidden="true">{goal.icon ?? '🎯'}</span>
      </GoalRing>
      <span className="flex-1 min-w-0">
        <span className="block truncate text-16 font-semibold text-[var(--d-text)]">{goal.name}</span>
        <span className="block mt-1 text-14 d-num text-[var(--d-text-2)]">
          <span className="font-semibold text-[var(--d-text)]">{fmt(goal.saved)}</span> of {fmt(goal.target)}
        </span>
        <span className={`block mt-1 text-12 truncate ${line.cls}`}>{line.text}</span>
        <span className="block mt-2 text-12 font-semibold d-num text-[var(--d-ink)]">{Math.round(goal.pct)}%</span>
      </span>
    </button>
  )
}
