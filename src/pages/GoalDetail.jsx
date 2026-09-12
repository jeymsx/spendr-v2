import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { allocateGoals, isFundable, pace, monthsUntil } from '../lib/goals'
import SubPage from '../components/SubPage'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Divider from '../components/ui/Divider'
import DetailRow from '../components/ui/DetailRow'
import SectionLabel from '../components/ui/SectionLabel'
import EmptyState from '../components/ui/EmptyState'
import Skeleton, { SkeletonList } from '../components/ui/Skeleton'
import { AccountChip } from '../components/AccountPickerSheet'
import GoalFormSheet from './goals/GoalFormSheet'
import { GoalRing, fmtTargetDate, fmtDateFull } from './goals/shared'
import { fmt, fmtCompact } from '../lib/money'

/**
 * One goal.
 *
 * ── What this page is for ──
 *
 * The grid it comes from can hold a ring, a name and one line. Everything a
 * goal knows that does not fit in one line is here, and the most important
 * of it is the part the old list could never show at all: WHERE the money is.
 *
 * A goal's progress is a claim on real balances, split between goals by rank
 * (lib/goals.js has the waterfall). So "84%" is the end of a sentence whose
 * beginning is "₱64,906 of it is in BPI and ₱18,794 in Maya Savings" - and
 * when a goal is stuck at zero with two accounts attached, the only useful
 * thing the app can say is which goals took the money first. That is the
 * "Funded by" card, and it is why this page exists rather than a bigger row.
 */
export default function GoalDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)

  const goalRows = useLiveQuery(() => db.goals.toArray(), [], undefined)
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], undefined)

  const today = useMemo(() => new Date(), [])

  /* The whole allocation, not just this goal. The split is the point: what
     this goal has depends on every goal ranked above it, so there is no way
     to compute one in isolation. */
  const alloc = useMemo(
    () => allocateGoals({ goals: goalRows ?? [], accounts: accounts ?? [] }),
    [goalRows, accounts],
  )

  const goalId = Number(id)
  // alloc.goals, not alloc.active - an archived goal still has a page.
  const goal = alloc.goals.find(g => g.id === goalId)

  const loading = goalRows === undefined || accounts === undefined

  /* Every account this goal draws on, INCLUDING the ones that gave it
     nothing. `sources` only lists the accounts money actually came from, so
     on its own it makes an unfunded goal look like it has no accounts
     attached - when the truth is that a goal above it emptied them. */
  const funding = useMemo(() => {
    if (!goal) return []
    const byName = new Map((accounts ?? []).filter(isFundable).map(a => [a.name, a]))
    return (goal.accounts ?? [])
      .map(name => {
        const acct = byName.get(name)
        if (!acct) return null
        const amount = (goal.sources ?? []).find(s => s.account === name)?.amount ?? 0
        const split = alloc.byAccount[name]
        // The goals ranked above this one that took from the same account.
        const ahead = (split?.goals ?? [])
          .filter(g => g.goalId !== goal.id)
          .map(g => g.name)
        return { acct, amount, split, ahead }
      })
      .filter(Boolean)
  }, [goal, accounts, alloc])

  if (loading) {
    return (
      <SubPage title="Goal">
        <div className="px-5">
          <Skeleton className="w-[168px] h-[168px] rounded-full mx-auto mt-4" />
          <Skeleton className="h-9 w-48 rounded mx-auto mt-6" />
          <Skeleton className="h-4 w-32 rounded mx-auto mt-3" />
          <SkeletonList rows={3} className="mt-8" />
        </div>
      </SubPage>
    )
  }

  if (!goal) {
    return (
      <SubPage title="Goal" onBack={() => navigate('/goals')}>
        <EmptyState
          className="mt-8"
          title="Goal not found"
          body="It may have been deleted."
          action={
            <Button variant="tint" className="px-5" onClick={() => navigate('/goals')}>
              Back to goals
            </Button>
          }
        />
      </SubPage>
    )
  }

  const p = pace(goal, today)
  const overdue = !!p && !p.done && p.overdue
  const dateLabel = fmtTargetDate(goal.targetDate)
  const months = goal.targetDate ? monthsUntil(goal.targetDate, today) : null

  return (
    <SubPage
      title={goal.name}
      onBack={() => navigate('/goals')}
      action={
        <Button variant="tint" size="xs" className="shrink-0 px-4" onClick={() => setEditOpen(true)}>
          Edit
        </Button>
      }
    >
      {/* ── The ring, large ── */}
      <div className="flex flex-col items-center px-5 mt-2">
        <GoalRing pct={goal.pct} complete={goal.complete} muted={goal.archived} size={168} stroke={11}>
          <span className="text-[46px] leading-none" aria-hidden="true">{goal.icon ?? '🎯'}</span>
          <span className={`mt-2.5 text-[14px] font-bold tabular-nums ${
            goal.complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
          }`}>
            {Math.round(goal.pct)}%
          </span>
        </GoalRing>

        <p className="mt-6 text-[34px] leading-none font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
          {fmt(goal.saved)}
        </p>
        <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400 tabular-nums">
          of {fmt(goal.target)}
        </p>

        {/* The one sentence the numbers cannot say: whether this is on
            course. It is the whole reason a goal takes a date. */}
        {goal.archived ? (
          <p className="mt-3 text-[12.5px] font-medium text-slate-400 dark:text-slate-500">
            Archived — it is holding no money
          </p>
        ) : goal.linkedCount === 0 ? (
          <p className="mt-3 text-[12.5px] font-medium text-amber-600 dark:text-amber-400">
            No account attached, so this cannot move
          </p>
        ) : goal.complete ? (
          <p className="mt-3 text-[12.5px] font-medium text-emerald-600 dark:text-emerald-400">
            Fully funded{dateLabel ? ` — ahead of ${dateLabel}` : ''}
          </p>
        ) : overdue ? (
          <p className="mt-3 text-[12.5px] font-medium text-red-500 dark:text-red-400">
            {fmtCompact(goal.remaining)} short — {dateLabel} has passed
          </p>
        ) : p ? (
          <p className="mt-3 text-[12.5px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
            {fmtCompact(p.perMonth)} a month to reach it by {dateLabel}
          </p>
        ) : null}
      </div>

      {/* ── The figures the hero does not carry ── */}
      <section className="px-5 mt-7">
        <Card clip>
          <DetailRow
            label="Still to save"
            value={fmt(goal.remaining)}
            tone={goal.complete ? 'text-emerald-600 dark:text-emerald-400' : ''}
          />
          <Divider inset="row" />
          <DetailRow
            label="Target date"
            value={goal.targetDate ? fmtDateFull(goal.targetDate) : 'Not set'}
            sub={
              goal.targetDate && months !== null && !overdue
                ? `${months} month${months === 1 ? '' : 's'} away`
                : null
            }
            tone={
              overdue ? 'text-red-500 dark:text-red-400'
              : goal.targetDate ? ''
              : 'text-slate-400 dark:text-slate-500'
            }
            isLast={!p || p.done || overdue}
          />
          {/* Only when there is somewhere to pace TO, and something left to
              pace. A monthly figure on a funded goal is arithmetic about a
              question nobody has. */}
          {p && !p.done && !overdue && (
            <>
              <Divider inset="row" />
              <DetailRow label="Monthly pace" value={fmt(p.perMonth)} isLast />
            </>
          )}
        </Card>
      </section>

      {/* ── Where the money is ── */}
      <section className="mt-7">
        <SectionLabel inset="gutter" gap="loose">
          Funded by
        </SectionLabel>
        <div className="px-5">
          {funding.length === 0 ? (
            <Card padding="md">
              <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                This goal is not attached to an account, so its progress can
                never move. Attach one and it starts tracking itself.
              </p>
              <Button variant="tint" size="sm" className="mt-3 px-4" onClick={() => setEditOpen(true)}>
                Attach an account
              </Button>
            </Card>
          ) : (
            <Card clip>
              {funding.map(({ acct, amount, split, ahead }, i) => (
                <div key={acct.name}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <AccountChip acct={acct} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[13px] font-semibold text-slate-800 dark:text-white truncate">
                          {acct.name}
                        </span>
                        <span className={`text-[13px] font-semibold tabular-nums shrink-0 ${
                          amount > 0
                            ? 'text-slate-800 dark:text-white'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}>
                          {fmt(amount)}
                        </span>
                      </div>
                      {/* The explanation, when there is one to give. A zero
                          here is never "the account is empty" without saying
                          so, and it is usually "a goal above took it" - which
                          is the single most confusing thing about a waterfall
                          if the app stays quiet about it. */}
                      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 truncate tabular-nums">
                        {amount === 0 && ahead.length > 0
                          ? `Claimed by ${ahead.join(', ')}`
                          : amount === 0 && (split?.balance ?? 0) === 0
                            ? 'Nothing in this account'
                            : `${fmtCompact(split?.balance ?? 0)} balance · ${fmtCompact(split?.unassigned ?? 0)} free`}
                      </p>
                    </div>
                  </div>
                  {i < funding.length - 1 && <Divider inset="row" />}
                </div>
              ))}
            </Card>
          )}
        </div>
      </section>

      <GoalFormSheet
        open={editOpen}
        goal={goal}
        accounts={accounts}
        allGoals={goalRows}
        onClose={() => setEditOpen(false)}
        /* Deleting the subject of a page has to leave it, or the next paint
           is "Goal not found" on a screen you were just editing. `replace`
           so Back does not walk into the same dead route. */
        onDeleted={() => navigate('/goals', { replace: true })}
      />
    </SubPage>
  )
}
