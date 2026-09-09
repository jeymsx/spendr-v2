import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Cell, Tooltip, ResponsiveContainer,
} from 'recharts'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { scheduledCutoff } from '../utils/scheduled'
import BudgetMeter, { budgetTone } from '../components/BudgetMeter'

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
  const { color } = budgetTone(pct)
  const left = cat.budget - cat.spent

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[17px]"
          style={{ backgroundColor: (cat.color ?? '#2D9DFF') + '22' }}
          aria-hidden="true"
        >
          {cat.icon ?? '💸'}
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
          <p className="text-[14px] font-bold tabular-nums" style={{ color }}>
            {Math.round(pct)}%
          </p>
          <p className="text-[10px] tabular-nums mt-0.5 text-slate-500 dark:text-slate-400">
            {left >= 0 ? `${fmtCompact(left)} left` : `${fmtCompact(-left)} over`}
          </p>
        </div>
      </div>

      <div className="mt-2.5 h-1.5 rounded-full bg-slate-150 dark:bg-white/[0.10] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Budget() {
  const navigate = useNavigate()
  const categories   = useLiveQuery(() => db.categories.toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])

  const now = new Date()
  const monthName = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`

  // Same rule as every other spend surface: this month, up to end of today.
  const monthExpenses = useMemo(() => {
    const pfx = monthPrefix(now)
    const cutoff = scheduledCutoff()
    return (transactions ?? []).filter(t =>
      t.type === 'expense' && (t.date ?? '').startsWith(pfx) && (t.date ?? '') <= cutoff)
  }, [transactions])

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
  }, [])

  const remaining = totals.budget - totals.spent
  const perDay = remaining > 0 ? remaining / daysLeft : 0
  const tone = budgetTone(totals.pct)
  const over = budgeted.filter(c => c.spent > c.budget)
  const near = budgeted.filter(c => c.spent <= c.budget && c.budget > 0 && (c.spent / c.budget) >= 0.75)

  const chartData = useMemo(() =>
    budgeted.slice(0, 8).map(c => ({
      name: c.name.length > 9 ? c.name.slice(0, 8) + '…' : c.name,
      spent: Math.round(c.spent),
      limit: Math.round(c.budget),
      color: budgetTone(c.budget > 0 ? (c.spent / c.budget) * 100 : 0).color,
    })),
    [budgeted],
  )

  const loading = !categories || !transactions

  return (
    <div className="pb-10">
      {/* ── Header ── */}
      <header className="flex items-center gap-2 px-4 pt-safe-header pb-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0
            bg-white dark:bg-white/[0.07] border border-slate-200/80 dark:border-white/[0.09]
            text-slate-600 dark:text-slate-300 shadow-sm
            active:scale-90 transition-transform duration-75"
          aria-label="Back"
        >
          <IconChevronLeft />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold text-slate-800 dark:text-white truncate px-1">
          Budget
        </h1>
        <span className="w-9 shrink-0" />
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
            <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {monthName}
            </p>
            <p className="mt-2 text-center text-[38px] leading-none font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
              {fmt(totals.spent)}
            </p>
            <p className="mt-2 text-center text-[13px] text-slate-500 dark:text-slate-400 tabular-nums">
              of {fmt(totals.budget)} budgeted
            </p>

            <BudgetMeter pct={totals.pct} className="mt-5" height={30} />

            <div className="grid grid-cols-3 gap-3 mt-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {remaining >= 0 ? 'Remaining' : 'Over by'}
                </p>
                <p className="text-[15px] font-bold tabular-nums mt-0.5" style={{ color: tone.color }}>
                  {fmtCompact(Math.abs(remaining))}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Days left
                </p>
                <p className="text-[15px] font-bold tabular-nums mt-0.5 text-slate-800 dark:text-slate-100">
                  {daysLeft}
                </p>
              </div>
              <div>
                {/* The number that actually changes behaviour: what today's
                    share of what is left looks like. */}
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  A day
                </p>
                <p className="text-[15px] font-bold tabular-nums mt-0.5 text-slate-800 dark:text-slate-100">
                  {remaining > 0 ? fmtCompact(perDay) : '—'}
                </p>
              </div>
            </div>
          </section>

          {/* ── What is breaking ── */}
          {(over.length > 0 || near.length > 0) && (
            <section className="px-5 mt-6">
              <div
                className={`rounded-2xl px-4 py-3 border ${
                  over.length > 0
                    ? 'bg-red-50 dark:bg-red-500/[0.08] border-red-100 dark:border-red-500/20'
                    : 'bg-amber-50 dark:bg-amber-500/[0.08] border-amber-100 dark:border-amber-500/20'
                }`}
              >
                <p className={`text-[13px] font-semibold ${
                  over.length > 0
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}>
                  {over.length > 0
                    ? `Over budget in ${over.length} categor${over.length === 1 ? 'y' : 'ies'}`
                    : `${near.length} categor${near.length === 1 ? 'y is' : 'ies are'} close to the limit`}
                </p>
                <p className="text-[12px] text-slate-600 dark:text-slate-300 mt-0.5">
                  {(over.length > 0 ? over : near).map(c => c.name).join(', ')}
                </p>
              </div>
            </section>
          )}

          {/* ── Spent against each limit ── */}
          <section className="mt-7">
            <SectionLabel hint="Closest to its limit first.">By category</SectionLabel>
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

          {/* ── Spend against limit, side by side ── */}
          {chartData.length > 1 && (
            <section className="mt-7">
              <SectionLabel hint="Each bar is what you spent; the track behind it is the limit.">
                Spend against limit
              </SectionLabel>
              <div className="px-5">
                <Card className="px-2 py-3">
                  <div className="[&_*]:outline-none [&_*]:focus:outline-none">
                    <ResponsiveContainer width="100%" height={Math.max(150, chartData.length * 34)}>
                      <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 4, right: 14, left: 4, bottom: 4 }}
                        barCategoryGap="26%"
                      >
                        <XAxis type="number" hide />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={68}
                          tick={{ fontSize: 11, fill: '#94a3b8' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0].payload
                            return (
                              <div className="bg-white dark:bg-[#1a2130] border border-slate-200 dark:border-white/10 rounded-2xl px-3 py-2 shadow-lg text-xs">
                                <p className="font-semibold text-slate-700 dark:text-white">{d.name}</p>
                                <p className="tabular-nums text-slate-600 dark:text-slate-300 mt-0.5">
                                  {fmt(d.spent)} of {fmt(d.limit)}
                                </p>
                              </div>
                            )
                          }}
                          cursor={{ fill: 'rgba(148,163,184,0.10)' }}
                        />
                        {/* The limit sits behind as a track, so a bar that
                            fills it is instantly readable as "at the limit"
                            without reading either number. */}
                        <Bar dataKey="limit" fill="rgba(148,163,184,0.22)" radius={[4, 4, 4, 4]} isAnimationActive={false} />
                        <Bar dataKey="spent" radius={[4, 4, 4, 4]} animationDuration={700}
                          // Overlaid on the track rather than beside it.
                          background={false} barSize={10}>
                          {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            </section>
          )}

          {/* ── Spending with no limit against it ── */}
          {unbudgeted.length > 0 && (
            <section className="mt-7">
              <SectionLabel hint="No limit set, so none of this counts toward the figures above.">
                Unbudgeted · {fmtCompact(totals.other)}
              </SectionLabel>
              <div className="px-5">
                <Card>
                  {unbudgeted.slice(0, 8).map((c, i) => (
                    <div key={c.name}>
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[17px]"
                          style={{ backgroundColor: (c.color ?? '#2D9DFF') + '22' }}
                          aria-hidden="true"
                        >
                          {c.icon ?? '💸'}
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
                <Link
                  to="/settings"
                  className="block text-center mt-3 text-[13px] font-semibold text-primary active:opacity-70"
                >
                  Set limits in Settings
                </Link>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
