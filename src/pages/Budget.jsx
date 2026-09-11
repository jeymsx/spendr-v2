import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useBack } from '../hooks/useBack'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useTheme } from '../context/ThemeContext'
import { scheduledCutoff } from '../utils/scheduled'
/* budgetTone only. The horizontal meter this page used to headline with is
   now an arc; Dashboard still renders BudgetMeter, so the component stays. */
import { budgetTone } from '../components/BudgetMeter'
import BudgetGauge from '../components/BudgetGauge'
import CategoryGlyph from '../components/CategoryGlyph'
import IconButton from '../components/ui/IconButton'
import Button from '../components/ui/Button'
import StatTrio from '../components/ui/StatTrio'

/**
 * The month's budget, in full.
 *
 * The home screen shows one line and one meter; this is where the detail
 * lives. It answers, in order: am I on track, what is about to break, where
 * is the money going, and what am I spending that I never budgeted for.
 *
 * "Spent" is always this month's expenses up to the end of today. Installment
 * plans write every future month's charge at purchase, and those rows are
 * real for available credit but are not money spent - counting them would
 * report a budget blown by a plan that has barely started. See
 * utils/scheduled.js; this is the same cutoff every other spend surface uses.
 */

const _php = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _php.format(Math.abs(n))
}
/* Whole pesos. A budget limit is a round number somebody typed - there are
   no centavos in "15,000" - and the two zeroes made the longest string on
   the line the least informative part of it. `fmt` stays for everything
   actually measured, where the centavos are real. */
const _phpWhole = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })
const fmtWhole = (v) => ((v ?? 0) < 0 ? '−₱' : '₱') + _phpWhole.format(Math.abs(Math.round(v ?? 0)))

function fmtCompact(v) {
  const abs = Math.abs(v ?? 0)
  const sign = (v ?? 0) < 0 ? '−₱' : '₱'
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return sign + (abs / 1_000).toFixed(1) + 'K'
  return fmt(v)
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function monthPrefix(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

// ── Bits ───────────────────────────────────────────────────────────────────────

/**
 * A section heading, and only that.
 *
 * It used to take a `hint` and every one of the three sections passed one, so
 * each heading came with a sentence explaining the section under it. Three of
 * those down one page reads as annotated design notes rather than an app -
 * normal UI states the section and lets the content speak.
 */
function SectionLabel({ children }) {
  return (
    <div className="px-5 mb-2.5">
      <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{children}</p>
    </div>
  )
}

function Card({ children, className = '' }) {
  return (
    <div className={`card rounded-2xl overflow-hidden ${className}`}>{children}</div>
  )
}

function Divider() {
  return <div className="h-px bg-slate-100 dark:bg-white/[0.06] mx-4" />
}

/** One budgeted category: how much of its limit is gone, and what is left. */
function CategoryRow({ cat }) {
  const pct = cat.budget > 0 ? (cat.spent / cat.budget) * 100 : 0
  const { color, textClass } = budgetTone(pct)
  const left = cat.budget - cat.spent

  /* Two states worth marking, and they are not the same news. Over means the
     limit is already gone; near means it will be if nothing changes. The
     percentage beside them says which by colour, but a percentage has to be
     read - a badge on the tile is caught while scanning. */
  const over = cat.spent > cat.budget
  const near = !over && cat.budget > 0 && pct >= 75

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        {/* relative, so the badge can hang off the tile's corner. The tile
            keeps aria-hidden; the badge carries its own label, because "!"
            on its own tells a screen reader nothing. */}
        <span className="relative shrink-0">
          <span
            className="cat-tile w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ '--cat-color': cat?.color ?? '#64748b' }}
            aria-hidden="true"
          >
            <CategoryGlyph cat={cat} size={20} emoji="💸" />
          </span>
          {(over || near) && (
            <span
              className={`absolute -top-1 -right-1 w-[17px] h-[17px] rounded-full
                flex items-center justify-center text-[11px] font-bold leading-none
                text-white ring-2 ring-white dark:ring-[#111820] ${
                  over ? 'bg-red-500' : 'bg-amber-500'
                }`}
              title={over ? 'Over budget' : 'Close to the limit'}
            >
              <span className="sr-only">{over ? 'Over budget' : 'Close to the limit'}</span>
              <span aria-hidden="true">!</span>
            </span>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-100 truncate">
            {cat.name}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
            {fmt(cat.spent)} of {fmt(cat.budget)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-[14px] font-bold tabular-nums ${textClass}`}>
            {Math.round(pct)}%
          </p>
          <p className="text-[10px] tabular-nums mt-0.5 text-slate-500 dark:text-slate-400">
            {left >= 0 ? `${fmtCompact(left)} left` : `${fmtCompact(-left)} over`}
          </p>
        </div>
      </div>

      <div className="mt-2.5 h-1.5 rounded-full bg-slate-200 dark:bg-white/[0.10] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

/**
 * One category's limit and spend, drawn on a scale shared with every other
 * row.
 *
 * This is the section's whole reason to exist next to "By category" above,
 * which normalises each category to its own limit and answers "which is
 * closest to breaking". Here the track length is the limit itself, so a
 * category with three times the budget gets three times the track - which
 * answers the different question of where the money is actually allocated,
 * and which is impossible to see once every bar is normalised to 100%.
 *
 * It replaced a Recharts grouped bar chart that never did what its own
 * caption claimed. Two <Bar> elements in one chart are laid out side by side
 * within each category band, not overlaid, so the spend bar sat BELOW its
 * limit track rather than on it. Two divs express it exactly, need no
 * library, and let the numbers sit inline instead of behind a hover.
 */
function AllocationRow({ cat, maxLimit }) {
  const pct = cat.budget > 0 ? (cat.spent / cat.budget) * 100 : 0
  const { color, textClass } = budgetTone(pct)
  const over = cat.spent > cat.budget

  const trackPct = maxLimit > 0 ? (cat.budget / maxLimit) * 100 : 0
  // Spend is measured on the SAME scale as the limit, so when it exceeds the
  // limit the bar simply runs past the end of its own track. That overshoot
  // is the point - a normalised bar can only ever fill up.
  const spentPct = maxLimit > 0 ? (cat.spent / maxLimit) * 100 : 0

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="leading-none shrink-0"><CategoryGlyph cat={cat} size={14} emoji="💸" /></span>
          <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 truncate">
            {cat.name}
          </span>
        </span>
        <span className="text-[11px] tabular-nums shrink-0 text-slate-500 dark:text-slate-400">
          <span className={`font-semibold ${textClass}`}>{fmtCompact(cat.spent)}</span>
          {' of '}{fmtCompact(cat.budget)}
        </span>
      </div>

      <div className="relative h-2.5">
        {/* The limit, to scale. */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-slate-200 dark:bg-white/[0.10]"
          style={{ width: `${trackPct}%` }}
        />
        {/* What was spent, on the same scale. */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{ width: `${spentPct}%`, backgroundColor: color }}
        />
        {/* Once the bar has covered its own track, the limit needs marking or
            the overshoot is invisible. */}
        {over && (
          <span
            className="absolute -top-1 -bottom-1 w-[2px] rounded-full bg-slate-900/45 dark:bg-white/70"
            style={{ left: `calc(${trackPct}% - 1px)` }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Budget() {
  const navigate = useNavigate()
  const back = useBack('/')
  const { accentColor } = useTheme()
  const categories   = useLiveQuery(() => db.categories.toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])

  /* One clock reading for the whole render.

     It was a bare `new Date()`, so it changed identity every render and had
     to be left out of the memos below to keep them from recomputing every
     time - which is how it ended up as two exhaustive-deps warnings. Stable
     now, so it can be listed honestly, and as a bonus the month heading and
     the filter cutoff can no longer straddle midnight. */
  const now = useMemo(() => new Date(), [])
  const monthName = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`

  // Same rule as every other spend surface: this month, up to end of today.
  const monthExpenses = useMemo(() => {
    const pfx = monthPrefix(now)
    const cutoff = scheduledCutoff()
    return (transactions ?? []).filter(t =>
      t.type === 'expense' && (t.date ?? '').startsWith(pfx) && (t.date ?? '') <= cutoff)
  }, [transactions, now])

  const spentByCat = useMemo(() => {
    const m = {}
    for (const t of monthExpenses) m[t.category] = (m[t.category] ?? 0) + (t.amount ?? 0)
    return m
  }, [monthExpenses])

  // Most at-risk first: what is about to break matters more than what is fine.
  const budgeted = useMemo(() =>
    (categories ?? [])
      .filter(c => (c.budget ?? 0) > 0)
      .map(c => ({ ...c, spent: spentByCat[c.name] ?? 0 }))
      .sort((a, b) => (b.spent / b.budget) - (a.spent / a.budget)),
    [categories, spentByCat],
  )

  // Money going somewhere no limit was ever set. Easy to miss, and it is
  // exactly what makes a budget look healthier than the month actually is.
  const unbudgeted = useMemo(() => {
    const limited = new Set((categories ?? []).filter(c => (c.budget ?? 0) > 0).map(c => c.name))
    const byName = Object.fromEntries((categories ?? []).map(c => [c.name, c]))
    return Object.entries(spentByCat)
      .filter(([name, amt]) => !limited.has(name) && amt > 0)
      .map(([name, amt]) => ({ name, spent: amt, icon: byName[name]?.icon, color: byName[name]?.color }))
      .sort((a, b) => b.spent - a.spent)
  }, [categories, spentByCat])

  const totals = useMemo(() => {
    const budget = budgeted.reduce((s, c) => s + c.budget, 0)
    const spent  = budgeted.reduce((s, c) => s + c.spent, 0)
    const other  = unbudgeted.reduce((s, c) => s + c.spent, 0)
    return { budget, spent, other, pct: budget > 0 ? (spent / budget) * 100 : 0 }
  }, [budgeted, unbudgeted])

  // Days left counts today, because today's money is still yours to spend.
  const daysLeft = useMemo(() => {
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    return Math.max(1, end - now.getDate() + 1)
  }, [now])

  const remaining = totals.budget - totals.spent
  const perDay = remaining > 0 ? remaining / daysLeft : 0
  const tone = budgetTone(totals.pct, accentColor)

  // The scale for every row: the largest limit OR spend, whichever is bigger.
  // Limits alone would clip the overshoot of whichever category set the
  // scale, which is exactly the category most worth seeing it on.
  const maxLimit = useMemo(
    () => budgeted.reduce((m, c) => Math.max(m, c.budget ?? 0, c.spent ?? 0), 0),
    [budgeted],
  )

  const loading = !categories || !transactions

  return (
    <div className="pb-10">
      {/* ── Header ── */}
      <header className="flex items-center gap-2 px-4 pt-safe-header pb-3">
        {/* Back to wherever you came from - the dashboard card or Settings -
            with a fallback for the case where this page IS the first entry.
            See the hook. */}
        <IconButton label="Back" onClick={back}>
          <IconChevronLeft />
        </IconButton>
        {/* The month is the title. "Budget" named the page you had just
            tapped to get to, and the month was a second line under it saying
            the thing the page is actually about. */}
        <h1 className="flex-1 text-center text-base font-semibold text-slate-800 dark:text-white truncate px-1">
          {monthName}
        </h1>
        {/* The way to the limits. This page reports the month; setting the
            numbers is a different job, and it used to be a second entry in
            Settings that opened a different screen about the same thing. */}
        <Button
          variant="tint"
          size="sm"
          className="shrink-0 px-4"
          onClick={() => navigate('/settings/budgets')}
        >
          Edit limits
        </Button>
      </header>

      {loading ? (
        <div className="px-5 mt-6">
          <div className="h-32 rounded-2xl bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
        </div>
      ) : totals.budget === 0 ? (
        <div className="px-5 mt-8 text-center">
          <p className="text-[15px] font-semibold text-slate-800 dark:text-white">No budgets set</p>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            Give a category a monthly limit and this page starts tracking it
            against what you actually spend.
          </p>
          <Link
            to="/settings"
            className="inline-block mt-5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary
              active:scale-[0.97] transition-transform duration-75"
          >
            Set a budget
          </Link>
          {unbudgeted.length > 0 && (
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-6">
              You have spent {fmt(totals.other)} this month across{' '}
              {unbudgeted.length} categor{unbudgeted.length === 1 ? 'y' : 'ies'}.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* ── The month at a glance ── */}
          <section className="px-5">
            {/* The amount, the share and the limit were three stacked lines
                above a horizontal meter - four rows saying one thing. The
                arc holds all of it: the figure sits inside the measurement,
                and the two notes under the ends are the only facts the
                geometry cannot carry.

                leftNote takes the UNCLAMPED percentage on purpose. The fan
                stops at full because there is no more arc to give, so 118%
                has to be said in words or it is not said at all. */}
            <BudgetGauge
              className="mt-1"
              accent={accentColor}
              pct={totals.pct}
              amount={fmt(totals.spent)}
              leftNote={`${Math.round(totals.pct)}% spent`}
              rightNote={`${fmtWhole(totals.budget)} limit`}
            />

            {/* Centred. Left-aligned they hung off the left edge of three
                invisible columns under a symmetrical arc, so the row read as
                three separate facts rather than one strip belonging to the
                gauge above it. */}
            {/* The shape every page's stat row now uses - see ui/StatTrio.
                "A day" is the number that actually changes behaviour: what
                today's share of what is left looks like. */}
            <StatTrio
              className="mt-5"
              items={[
                {
                  label: remaining >= 0 ? 'Remaining' : 'Over by',
                  value: fmtCompact(Math.abs(remaining)),
                  tone: tone.textClass,
                },
                { label: 'Days left', value: daysLeft },
                { label: 'A day', value: remaining > 0 ? fmtCompact(perDay) : '—' },
              ]}
            />
          </section>

          {/* The "what is breaking" card was here. It named the categories
              that were over or near, three rows above the list that names
              them again with their numbers - so the same news twice, and the
              card could only ever say one of the two states because it chose
              between over and near.

              The warning is on the row it is about now: a badge on the
              category's own tile. Nothing is lost, because the list is
              already sorted closest-to-limit first, so what is breaking is
              still what you see first. */}

          {/* ── Spent against each limit ── */}
          <section className="mt-7">
            <SectionLabel>By category</SectionLabel>
            <div className="px-5">
              <Card>
                {budgeted.map((cat, i) => (
                  <div key={cat.id ?? cat.name}>
                    <CategoryRow cat={cat} />
                    {i < budgeted.length - 1 && <Divider />}
                  </div>
                ))}
              </Card>
            </div>
          </section>

          {/* ── Every limit on one scale ── */}
          {budgeted.length > 1 && (
            <section className="mt-7">
              <SectionLabel>Where the budget goes</SectionLabel>
              <div className="px-5">
                <Card className="px-4 py-4">
                  <div className="flex flex-col gap-4">
                    {budgeted.map(cat => (
                      <AllocationRow key={cat.id ?? cat.name} cat={cat} maxLimit={maxLimit} />
                    ))}
                  </div>
                </Card>
              </div>
            </section>
          )}

          {/* ── Spending with no limit against it ── */}
          {unbudgeted.length > 0 && (
            <section className="mt-7">
              <SectionLabel>Unbudgeted · {fmtCompact(totals.other)}</SectionLabel>
              <div className="px-5">
                <Card>
                  {unbudgeted.slice(0, 8).map((c, i) => (
                    <div key={c.name}>
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span
                          className="cat-tile w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ '--cat-color': c?.color ?? '#64748b' }}
                          aria-hidden="true"
                        >
                          <CategoryGlyph cat={c} size={18} emoji="💸" />
                        </span>
                        <p className="flex-1 min-w-0 text-[14px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {c.name}
                        </p>
                        <p className="text-[14px] font-bold tabular-nums text-slate-700 dark:text-slate-200 shrink-0">
                          {fmt(c.spent)}
                        </p>
                      </div>
                      {i < Math.min(unbudgeted.length, 8) - 1 && <Divider />}
                    </div>
                  ))}
                </Card>
                {/* No "Set limits in Settings" link. It pointed at the settings
                    index, from a page that now carries "Edit limits" in its own
                    header - a second, vaguer route to the screen already one tap
                    away above. */}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
