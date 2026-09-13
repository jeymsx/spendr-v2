import { Fragment, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { allocateGoals, isFundable, pace } from '../lib/goals'
import Button from '../components/ui/Button'
import IconButton from '../components/ui/IconButton'
import SubPage from '../components/SubPage'
import StatTrio from '../components/ui/StatTrio'
import SectionLabel from '../components/ui/SectionLabel'
import InfoButton from '../components/ui/InfoButton'
import Card from '../components/ui/Card'
import Divider from '../components/ui/Divider'
import EmptyState from '../components/ui/EmptyState'
import { IconNoGoals } from '../components/icons'
import Skeleton, { SkeletonHero, SkeletonStatTrio } from '../components/ui/Skeleton'
import ProgressBar from '../components/ui/ProgressBar'
import { AccountChip } from '../components/AccountPickerSheet'
import LimitMeter from '../components/LimitMeter'
import GoalFormSheet from './goals/GoalFormSheet'
import GoalSortSheet from './goals/GoalSortSheet'
import {
  GoalRing, IconPlus, IconReorder, fmtTargetDate,
} from './goals/shared'
import { fmt, fmtCompact } from '../lib/money'

/**
 * Savings goals.
 *
 * Nothing on this page is typed in except the target. Progress is worked out
 * from what is actually sitting in the accounts a goal draws on - see
 * lib/goals.js for the waterfall that splits a shared balance between several
 * goals without counting the same peso twice.
 *
 * ── A grid of rings, not a list of bars ──
 *
 * The goals were rows: a grip, an icon, a name, two figures, a bar and a note
 * under it, stacked in a card. Four of those filled a phone screen, and every
 * one of them said the same thing six ways - the two figures ARE the bar, and
 * the percentage was in there too until it was cut.
 *
 * A ring says it once. It also lets a goal be an object rather than a line
 * item: an icon inside its own progress, two across, which is a shape you can
 * take in without reading. What the row said and the tile does not - the pace,
 * the accounts behind it, the date - moved to the goal's own page, where there
 * is room to say it properly instead of in eleven-pixel fragments.
 *
 * The order is still the funding order, and it still matters: the goal read
 * first fills first. It is dragged in a sheet now rather than on the page, for
 * reasons GoalSortSheet gives.
 */

// ── One goal, as a tile ──────────────────────────────────────────────────────

/* Named because the skeleton has to be the same grid, exactly - a loading
   state one gap-value out from the real one is a page that shifts as it
   arrives, which is the single thing a skeleton exists to prevent. */
const GRID = 'px-5 grid grid-cols-2 gap-3 items-stretch'

/**
 * ── One card per goal ──
 *
 * The first version was bare: rings on the page's own ground, on the theory
 * that a ring already has an edge and a rounded rectangle behind it is a
 * second frame around the first. That reasoning is fine and the result was
 * not - a circle encloses its own middle but leaves its corners empty, so
 * four of them on an open page read as a section that had not finished
 * loading. The card gives the grid a body, and it is what the badges page
 * settled on for the same reason.
 *
 * Still a grid rather than a rail. A carousel is right on the home page,
 * where the goals are a glance on the way to something else; this page IS
 * the goals, and the order they are in is load-bearing - scrolling half of
 * a ranked list off the side of the screen hides the half you most need to
 * see to judge the ranking.
 *
 * ── One line for the name, one for the money ──
 *
 * Both truncate rather than wrap. In a grid, a name that takes two lines
 * pushes its own figures down and the tile beside it does not follow, so one
 * long goal knocks a whole row out of alignment. The full name is on the
 * page this taps through to.
 */
function GoalTile({ goal, onOpen, today }) {
  const p = pace(goal, today)
  const overdue = !!p && !p.done && p.overdue

  /* One line under the name, and it answers the most useful question that
     tile-sized space can hold. An unfunded goal is a broken goal - it can
     never move - so that warning outranks the figures. Everything else is the
     two numbers the ring is drawn from. */
  const sub =
    goal.linkedCount === 0
      ? { text: 'No account attached', tone: 'text-amber-600 dark:text-amber-400' }
      : {
        text: `${fmtCompact(goal.saved)} of ${fmtCompact(goal.target)}`,
        tone: overdue
          ? 'text-red-500 dark:text-red-400'
          : 'text-slate-400 dark:text-slate-500',
      }

  return (
    <Card
      as="button"
      interactive
      padding="md"
      onClick={() => onOpen(goal)}
      className="flex flex-col items-center min-w-0"
    >
      {/* 104, down from the 116 it was bare. The card's own padding is the
          breathing room the ring used to have to find on an empty page. */}
      <GoalRing pct={goal.pct} complete={goal.complete} size={104} stroke={7}>
        <span className="text-[24px] leading-none" aria-hidden="true">{goal.icon ?? '🎯'}</span>
        <span className={`mt-1.5 text-11 font-bold tabular-nums ${
          goal.complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
        }`}>
          {Math.round(goal.pct)}%
        </span>
      </GoalRing>

      <span className="mt-3 w-full truncate text-center text-13 font-semibold text-slate-800 dark:text-white">
        {goal.name}
      </span>
      <span className={`mt-0.5 w-full truncate text-center text-11 tabular-nums ${sub.tone}`}>
        {sub.text}
      </span>
    </Card>
  )
}

/** The grid's own shape while it loads, so nothing moves when it arrives. */
function SkeletonGrid({ count = 4 }) {
  return (
    <div className={GRID}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} padding="md" className="flex flex-col items-center">
          {/* The two text heights are the real ones, measured: 13px and 11px
              at the browser's normal leading come out at 19.5 and 16.5, and
              a skeleton 7px short of its own card is a page that settles
              downward as it loads. */}
          <Skeleton className="w-[104px] h-[104px] rounded-full" />
          <Skeleton className="mt-3 h-[19.5px] w-24 rounded" />
          <Skeleton className="mt-0.5 h-[16.5px] w-16 rounded" />
        </Card>
      ))}
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
          <span className="text-13 font-semibold text-slate-800 dark:text-white truncate">{name}</span>
          <span className="text-12 tabular-nums shrink-0 text-slate-500 dark:text-slate-400">
            {fmtCompact(split.balance)}
          </span>
        </div>
        <ProgressBar className="mt-2" value={pct} fillClass="bg-primary" />
        <div className="flex items-baseline justify-between gap-3 mt-1.5">
          <span className="text-11 text-slate-500 dark:text-slate-400 truncate min-w-0">
            {split.goals.map(g => g.name).join(', ')}
          </span>
          <span className="text-11 tabular-nums shrink-0 text-slate-400 dark:text-slate-500">
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Goals() {
  const navigate = useNavigate()
  const [formOpen, setFormOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const goalRows = useLiveQuery(() => db.goals.toArray(), [], undefined)
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], undefined)

  // One date for the whole render, so two tiles can never disagree about what
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
  const active = alloc.active

  const loading = goalRows === undefined || accounts === undefined
  const fundable = (accounts ?? []).filter(isFundable)
  const acctMap = Object.fromEntries((accounts ?? []).map(a => [a.name, a]))

  /* The local `order` state that used to live here went with the drag.
     It existed so a dropped row read back instantly instead of waiting for
     Dexie to round-trip through liveQuery; the sort sheet holds its own copy
     for the same reason, which is the only place a reorder is now visible
     while it happens. */

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

  const openGoal = goal => navigate(`/goals/${goal.id}`)

  return (
    <SubPage
      title="Goals"
      action={
        <IconButton
          label="New goal"
          variant="primary"
          onClick={() => setFormOpen(true)}
        >
          <IconPlus />
        </IconButton>
      }
    >
      {/* The loading state is the page's own shape, not three grey
          rectangles: the hero, the stat row and the grid, at the sizes
          they arrive at, so nothing below them moves when they do. */}
      {loading ? (
        <div className="mt-2 flex flex-col gap-7">
          <div className="px-5 flex flex-col gap-7">
            <SkeletonHero />
            <SkeletonStatTrio />
          </div>
          <SkeletonGrid />
        </div>
      ) : alloc.active.length === 0 && archived.length === 0 ? (
        <div>
          <EmptyState
            icon={<IconNoGoals />}
            title="No goals yet"
            body="Name what you are saving for, set the amount, and point it at the account holding the money."
            action={(
              <Button className="px-4" onClick={() => setFormOpen(true)}>
                Add your first goal
              </Button>
            )}
          />
          {/* Kept: a constraint, and one you cannot act on from this screen. */}
          {fundable.length === 0 && (
            <p className="-mt-8 px-8 text-center text-12 text-amber-600 dark:text-amber-400">
              You will need a cash, e-wallet, bank or savings account first.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* ── The whole plan, in one figure ── */}
          <section className="px-5">
            <SectionLabel className="text-center">Saved toward goals</SectionLabel>
            <p className="text-center text-38 leading-none font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
              {fmt(alloc.totals.saved)}
            </p>
            <p className="mt-2 text-center text-13 text-slate-500 dark:text-slate-400 tabular-nums">
              of {fmt(alloc.totals.target)} across {alloc.totals.count} goal{alloc.totals.count === 1 ? '' : 's'}
            </p>

            {/* The one bar above the fold, and it earns the exception: this
                is the sum of every ring below it, and a ring of rings would
                be a fifth circle competing with the four it summarises.

                It is the credit card's meter, because it is the same object -
                a fill, and a striped run standing for what is still to come.
                The tone is passed rather than derived: limitTone() turns red
                past 90%, which is right for a credit line being used up and
                exactly wrong for a goal nearly reached. */}
            <div className="mt-5">
              <LimitMeter
                pct={alloc.totals.pct}
                tone={alloc.totals.pct >= 100 ? 'good' : 'accent'}
              />
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
            <section className="mt-8">
              <SectionLabel
                inset="gutter"
                gap="loose"
                /* No hint. "In funding order" is already the sentence, and a
                   line under it narrating how a grid is read tells you
                   something you have known since you learned to read. The
                   mechanic that is genuinely not obvious - that a shared
                   balance fills the first goal before the next - is behind
                   the (i), where someone who wants it can go and get it. */
                action={
                  <span className="flex items-center gap-1 shrink-0">
                    {active.length > 1 && (
                      /* variant="plain", to match the (i) beside it. A
                         surface IconButton draws a bordered white chip, which
                         next to a 12px caption reads as a toolbar control
                         parked in a heading - InfoButton's own note says so,
                         and it is right. */
                      <IconButton
                        label="Change funding order"
                        variant="plain"
                        size="sm"
                        onClick={() => setSortOpen(true)}
                      >
                        <IconReorder />
                      </IconButton>
                    )}
                    <InfoButton title="How goals are funded">
                      Goals read your real balances. When several goals share an
                      account, the one earliest in the order fills first and the
                      rest take what is left, so the totals always match the
                      money you actually have. Credit cards cannot fund a goal —
                      a card holds debt, not savings.
                    </InfoButton>
                  </span>
                }
              >
                In funding order
              </SectionLabel>

              <div className={GRID}>
                {active.map(g => (
                  <GoalTile key={g.id} goal={g} today={today} onOpen={openGoal} />
                ))}
              </div>
            </section>
          )}

          {/* ── Reconciliation ── */}
          {splitEntries.length > 0 && (
            <section className="mt-8">
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
                        <span className="text-13 text-slate-500 dark:text-slate-400 truncate">
                          {idleSplits.length} account{idleSplits.length === 1 ? '' : 's'} not funding a goal
                        </span>
                        <span className="text-13 font-semibold tabular-nums shrink-0 text-slate-700 dark:text-slate-200">
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
            <section className="mt-8">
              <div className="px-5">
                <button
                  onClick={() => setShowArchived(v => !v)}
                  className="text-13 font-semibold text-slate-500 dark:text-slate-400 active:opacity-60"
                >
                  {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
                </button>
              </div>
              {showArchived && (
                <div className="px-5 mt-2.5">
                  {/* Rows, not tiles. An archived goal is history: it holds no
                      money, its ring can only ever read what it read the day
                      it was archived, and giving it the same 116px circle as a
                      live goal would say it is still in the running. */}
                  <Card clip>
                    {archived.map((g, i) => (
                      <Fragment key={g.id}>
                        <button
                          onClick={() => openGoal(g)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:opacity-70"
                        >
                          <span className="text-[16px] leading-none opacity-50" aria-hidden="true">{g.icon ?? '🎯'}</span>
                          <span className="flex-1 min-w-0 text-13 font-medium text-slate-500 dark:text-slate-400 truncate">
                            {g.name}
                          </span>
                          <span className="text-12 tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
                            {g.targetDate ? `${fmtTargetDate(g.targetDate)} · ` : ''}{fmtCompact(g.target)}
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
        </>
      )}

      {/* Creating only. Editing happens on the goal's own page, which is
          where you land when you tap one - so this sheet no longer needs to
          be told which goal it is about, and cannot be showing a stale one. */}
      <GoalFormSheet
        open={formOpen}
        goal={null}
        accounts={accounts}
        allGoals={goalRows}
        onClose={() => setFormOpen(false)}
      />

      <GoalSortSheet
        open={sortOpen}
        goals={active}
        onClose={() => setSortOpen(false)}
      />
    </SubPage>
  )
}
