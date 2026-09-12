import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { getCreditStatus, nextDueDate } from '../utils/creditCycle'
import TemplateConfirmSheet from '../components/TemplateConfirmSheet'
import {
  IconCardUI,
  IconReceipt,
  IconTransferUI,
} from '../components/icons'
import CategoryGlyph from '../components/CategoryGlyph'
import { scheduledCutoff } from '../utils/scheduled'
import { cardGradient } from '../lib/accentTheme'
import IconButton from '../components/ui/IconButton'
import BadgeChip from '../components/BadgeChip'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import { fmt } from '../lib/money'
import {
  ContextHint, getContextHint, getGreeting, monthPrefix, useCountUp,
  quickActionCounts,
} from './dashboard/shared'
import { useWalletClip } from './dashboard/wallet'
import DashboardSkeleton from './dashboard/Skeleton'
import {
  AccountCard, BudgetSummaryTile, EmptyPill, IconEye, IconEyeOff, IconSettings,
  SectionHeader, TxRow,
} from './dashboard/Tiles'
import QuickActions from './dashboard/QuickActions'
import UpcomingSection from './dashboard/Upcoming'
import Rail from '../components/ui/Rail'

// ── Main component ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const { accentColor, theme } = useTheme()
  const [balanceHidden,    setBalanceHidden]    = useState(true)
  const [accountsHidden,   setAccountsHidden]   = useState(false)
  const [peek,             setPeek]             = useState(false)
  // The wallet's tab folds the breakdown away. Remembered, because it is a
  // preference about how much of your own finances you want on screen.
  const [breakdownOpen,    setBreakdownOpen]    = useState(() => {
    try { return localStorage.getItem('netWorthBreakdown') !== 'closed' }
    catch { return true }
  })
  const [walletRef, walletClip] = useWalletClip()
  const [quickTemplate,    setQuickTemplate]    = useState(null)
  const [quickConfirmOpen, setQuickConfirmOpen] = useState(false)

  // ── Live queries ─────────────────────────────────────────────────────────────
  const accounts   = useLiveQuery(() => db.accounts.toArray())
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const debts      = useLiveQuery(() => db.debts.toArray(),      [], [])
  const recurring  = useLiveQuery(() => db.recurring.toArray(),  [], [])
  const txAll      = useLiveQuery(() => db.transactions.toArray())
  const userMeta   = useLiveQuery(() => db.meta.get('displayName'))
  const templates  = useLiveQuery(() => db.templates.toArray(),  [], [])
  // Only the quick-action badge needs these. A goal's progress is derived from
  // real account balances, so "is it funded?" cannot be read off the row - it
  // has to go through the allocator, the same one the Goals page uses.
  const goalRows   = useLiveQuery(() => db.goals.toArray(),      [], [])

  // ── Derived values ────────────────────────────────────────────────────────────
  const { spendingBalance, savingsBalance } = useMemo(() => {
    const allAccts = accounts || []
    const roleOf = (a) => {
      if (a.type === 'credit') return 'credit'
      if (a.role) return a.role
      return ['cash', 'ewallet'].includes(a.type) ? 'spending' : 'savings'
    }
    // Parents have their own real balance; sum all accounts (no double-counting)
    const spendingBalance = allAccts.filter(a => roleOf(a) === 'spending').reduce((s, a) => s + (a.balance ?? 0), 0)
    const savingsBalance  = allAccts.filter(a => roleOf(a) === 'savings').reduce((s, a)  => s + (a.balance ?? 0), 0)
    return { spendingBalance, savingsBalance }
  }, [accounts])

  const parentCombinedBal = useMemo(() => {
    const allAccts = accounts || []
    const map = {}
    allAccts.filter(a => a.parentName).forEach(child => {
      map[child.parentName] = (map[child.parentName] ?? 0) + (child.balance ?? 0)
    })
    // Add the parent's own balance to the children sum
    allAccts.forEach(a => {
      if (map[a.name] !== undefined) map[a.name] += (a.balance ?? 0)
    })
    return map
  }, [accounts])

  // Scheduled installments are deliberately excluded here but NOT from
  // creditStmtMap below — what you owe includes them, what you've spent doesn't.
  // Without this they'd sort to the top of Recent and sit there for months.
  const recentTx = useMemo(() => {
    const cutoff = scheduledCutoff()
    return (txAll || [])
      .filter(t => (t.date ?? '') <= cutoff)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      // Five. Ten was half a screen of scrolling for a list whose whole job
      // is "does anything here look wrong", and "See all" is right there.
      .slice(0, 5)
  }, [txAll])

  const monthExpenses = useMemo(() => {
    const pfx = monthPrefix()
    const cutoff = scheduledCutoff()
    return (txAll || []).filter(t =>
      t.type === 'expense' && (t.date ?? '').startsWith(pfx) && (t.date ?? '') <= cutoff)
  }, [txAll])

  const budgetCategories = useMemo(() => {
    const spentMap = {}
    monthExpenses.forEach(t => {
      spentMap[t.category] = (spentMap[t.category] ?? 0) + (t.amount ?? 0)
    })
    return (categories || [])
      .filter(c => c.budget > 0)
      .map(c => ({ ...c, spent: spentMap[c.name] ?? 0 }))
  }, [categories, monthExpenses])

  // One figure for the whole month, for the home card. The per-category
  // detail lives on /budget now rather than as eight chips here.
  const budgetTotals = useMemo(() => {
    const budget = budgetCategories.reduce((sum, c) => sum + (c.budget ?? 0), 0)
    const spent  = budgetCategories.reduce((sum, c) => sum + (c.spent ?? 0), 0)
    return { budget, spent, pct: budget > 0 ? (spent / budget) * 100 : 0 }
  }, [budgetCategories])

  const upcomingRecurring = useMemo(() =>
    (recurring || [])
      .filter(r => r.active && r.nextDate)
      .sort((a, b) => (a.nextDate ?? '').localeCompare(b.nextDate ?? ''))
      .slice(0, 3),
    [recurring],
  )

  const catMap = useMemo(() =>
    Object.fromEntries((categories || []).map(c => [c.name, c])),
    [categories],
  )

  const creditStmtMap = useMemo(() => {
    const map = {}
    ;(accounts || []).filter(a => a.type === 'credit').forEach(acct => {
      map[acct.name] = getCreditStatus(acct, txAll || [])
    })
    return map
  }, [accounts, txAll])

  /**
   * What is about to leave the account, soonest first.
   *
   * Two sources, one list. A subscription renewing and a card statement
   * falling due are the same fact to whoever is looking - money committed but
   * not yet gone - so splitting them across two sections would make you check
   * twice to answer one question.
   *
   * Capped at two. This sits above Recent, and Recent is what the home screen
   * is for; a bill list long enough to scroll would bury it, which is the
   * mistake the old Upcoming section made.
   */
  const upcomingItems = useMemo(() => {
    const out = []

    for (const r of recurring ?? []) {
      if (!r.active || !r.nextDate) continue
      const d = new Date(`${r.nextDate}T00:00:00`)
      if (Number.isNaN(d.getTime())) continue
      const cat = catMap[r.category]
      out.push({
        key: `rec-${r.id}`, kind: 'recurring', date: d,
        name: r.name || r.category || 'Recurring',
        amount: r.amount ?? 0,
        meta: r.account ?? '',
        // A node, not a string. The three kinds of upcoming row want three
        // different glyphs and only the recurring one has a category to look
        // up, so resolving here keeps UpcomingRow from having to know.
        icon: <CategoryGlyph cat={cat} size={17} emoji="🔁" />,
        color: cat?.color ?? null,
        // Straight to the bill, not to the list. Tapping "Internet, overdue"
        // and landing on a page of every bill you own makes you find the one
        // you just pointed at - and the statement rows beside it already go
        // to their own account, so the list was the odd one out.
        to: `/recurring/${r.id}`,
      })
    }

    for (const a of accounts ?? []) {
      if (a.type !== 'credit') continue
      const st = creditStmtMap[a.name]
      if (!st) continue
      // What is actually billed and still unpaid. `currentBalance` would be
      // wrong here: it also carries charges from the cycle still open, which
      // are not on this statement and are not due on this date.
      const owed = Math.max(0, (st.thisTotal ?? 0) - (st.totalPayments ?? 0))
      if (owed <= 0) continue          // nothing billed, or already settled
      const d = nextDueDate(a.dueDate)
      if (!d) continue
      out.push({
        key: `card-${a.id}`, kind: 'statement', date: d,
        name: a.name,
        amount: owed,
        meta: 'Statement balance',
        icon: <IconCardUI size={17} />,
        color: a.color ?? null,
        to: `/accounts/${a.id}`,
      })
    }

    // Debts you owe, where a date was actually set. A dated debt is the same
    // object as a bill: money committed, to a deadline.
    //
    // Only `i_owe`. Money owed TO you is not "about to leave", and netting an
    // inflow into this section's total would make one figure answer two
    // questions. It stays on the Debts page, where the distinction is the
    // whole point.
    for (const d of debts ?? []) {
      const owed = Math.max(0, (d.amount ?? 0) - (d.amountPaid ?? 0))
      if (d.type !== 'i_owe' || owed <= 0 || !d.dueDate) continue
      const when = new Date(`${String(d.dueDate).slice(0, 10)}T00:00:00`)
      if (Number.isNaN(when.getTime())) continue
      out.push({
        key: `debt-${d.id}`, kind: 'debt', date: when,
        name: d.name || d.contact || 'Debt',
        amount: owed,
        meta: d.contact && d.name !== d.contact ? d.contact : 'You owe',
        icon: <IconReceipt size={17} />,
        color: null,
        to: '/debts?tab=i_owe',
      })
    }

    return out.sort((x, y) => x.date - y.date).slice(0, 2)
  }, [recurring, accounts, creditStmtMap, catMap, debts])

  /**
   * What is waiting for you behind Goals, Debts and Bills.
   *
   * One rule decides every one of these: a badge may only count things you
   * can DO something about, and doing it has to make the badge go away. A
   * count that cannot be cleared is not a notification, it is decoration -
   * and after a week of being ignored it trains you to ignore the real ones.
   *
   * So each is a definition that closes:
   *
   *   Bills  - a charge whose date has arrived and has not been posted.
   *            "Post now" clears it. Due TOMORROW is deliberately not
   *            counted: there is nothing to do about it yet, and a badge that
   *            lights up for something you cannot action is noise.
   *   Debts  - a settlement date that has passed with money still outstanding.
   *            Recording the payment clears it. Both directions count; being
   *            owed money past its date is equally something to chase.
   *   Goals  - a goal whose target the real balance has already reached.
   *            Archiving or spending it clears it, and until you do, money is
   *            sitting there having quietly finished its job.
   */
  const actionCounts = useMemo(
    () => quickActionCounts({
      recurring: recurring ?? [], debts: debts ?? [],
      goals: goalRows ?? [], accounts: accounts ?? [],
    }),
    [recurring, debts, goalRows, accounts],
  )

  const creditOutstanding = useMemo(() =>
    (accounts || [])
      .filter(a => a.type === 'credit')
      .reduce((s, a) => s + (creditStmtMap[a.name]?.currentBalance ?? 0), 0),
    [accounts, creditStmtMap],
  )

  const netWorth = spendingBalance + savingsBalance - creditOutstanding

  const userMetaLoaded = userMeta !== undefined
  const userName = userMeta?.value || 'there'

  // ── Animated net worth ────────────────────────────────────────────────────────
  const animatedNetWorth = useCountUp(netWorth)

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  if (accounts === undefined || txAll === undefined) {
    return <DashboardSkeleton />
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full pb-4">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      {/* items-start, not items-center: this is the one header whose left
          side is two lines, and centring the Settings chip against both of
          them dropped it ~8px below where the same chip sits on every other
          page. Aligned to the top, it lands on the same line as the back
          button on Budget, Goals and the rest. */}
      <header className="flex items-start justify-between px-5 pt-safe-header pb-2">
        <div>
          <h1 className="text-xl tracking-tight text-slate-500 dark:text-slate-400">
            {getGreeting()},{' '}
            <span className={`font-semibold text-slate-900 dark:text-white transition-opacity duration-150 ${userMetaLoaded ? 'opacity-100' : 'opacity-0'}`}>
              {userName}
            </span>!
          </h1>
          <ContextHint hint={getContextHint(txAll, budgetCategories, upcomingRecurring)} />
        </div>
        {/* Two controls, and only one of them is a disc. BadgeChip wears the
            same paint at the same 36px so the pair reads as one row, but its
            SHAPE is a shield - which is how you can tell at a glance that it
            does not open another list of switches. See BadgeChip. */}
        <div className="flex items-center gap-1.5 shrink-0">
          <BadgeChip />
          <IconButton label="Settings" onClick={() => navigate('/settings')}>
            <IconSettings />
          </IconButton>
        </div>
      </header>

      {/* ── Net worth Card ───────────────────────────────────────────────────── */}
      <section className="px-5 mt-4">
        {(() => {
          const revealed = !balanceHidden || peek
          return (
            <div className="wallet">
            <div
              ref={walletRef}
              className="wallet-card px-6 pt-6 select-none"
              style={{ background: cardGradient(accentColor, theme), clipPath: walletClip }}
              onPointerDown={() => setPeek(true)}
              onPointerUp={() => setPeek(false)}
              onPointerLeave={() => setPeek(false)}
              onPointerCancel={() => setPeek(false)}
            >
              {/* Perimeter stitching. Decorative, and drawn by CSS so it
                  follows the wallet's asymmetric radius for free. */}
              <span className="wallet-stitch" aria-hidden="true" />

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-white/60">Net worth</span>
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => setBalanceHidden(h => !h)}
                    className="text-white/60 hover:text-white/90 transition-colors active:scale-95"
                    aria-label={balanceHidden ? 'Show balance' : 'Hide balance'}
                  >
                    {balanceHidden ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>

                <div className="mt-2">
                  {revealed ? (
                    <span className="text-4xl font-semibold tracking-tight text-white tabular-nums">
                      {fmt(animatedNetWorth)}
                    </span>
                  ) : (
                    <span className="text-4xl font-semibold tracking-tight text-white/80">₱ ••••••</span>
                  )}
                </div>

                <div className="wallet-fold -mx-6" data-open={breakdownOpen}>
                  <div className="pt-5">
                    {/* pb-1.5, which looks wrong on its own and is not: the
                        card's own padding-bottom already reserves 18px below
                        the body's content, on top of the 22px the tab hangs
                        below it. At pb-6 the two stacked to 42px of empty
                        face under "Cash, wallets" - a band deeper than the
                        row of figures itself. 6px + 18px puts the content
                        14px clear of the stitching, which is exactly the
                        clearance px-6 gives it on the left and right. */}
                    <div id="net-worth-breakdown" className="wallet-pocket grid grid-cols-3 gap-3 px-6 pt-5 pb-1.5">
                  <div>
                    <p className="text-white/50 text-[11px] mb-1">Spending</p>
                    <p className="text-white font-semibold text-sm tabular-nums">
                      {revealed ? fmt(spendingBalance) : '••••'}
                    </p>
                    <p className="text-white/35 text-[10px] mt-0.5">Cash, wallets</p>
                  </div>
                  <div>
                    <p className="text-white/50 text-[11px] mb-1">Savings</p>
                    <p className="text-white font-semibold text-sm tabular-nums">
                      {revealed ? fmt(savingsBalance) : '••••'}
                    </p>
                    <p className="text-white/35 text-[10px] mt-0.5">Banks, deposits</p>
                  </div>
                  <div>
                    <p className="text-white/50 text-[11px] mb-1">Credit</p>
                    <p className="font-semibold text-sm tabular-nums text-white">
                      {revealed ? fmt(creditOutstanding) : '••••'}
                    </p>
                    <p className="text-white/35 text-[10px] mt-0.5">
                      {creditOutstanding > 0 ? 'Outstanding' : 'Paid off'}
                    </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* The tab. A chevron in a pull-tab reads as "there is more
                  here", so it does that rather than being decoration. */}
              <button
                type="button"
                className="wallet-tab"
                aria-expanded={breakdownOpen}
                aria-controls="net-worth-breakdown"
                aria-label={breakdownOpen ? 'Hide the breakdown' : 'Show the breakdown'}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => setBreakdownOpen(v => {
                  const next = !v
                  try { localStorage.setItem('netWorthBreakdown', next ? 'open' : 'closed') } catch { /* private mode */ }
                  return next
                })}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            </div>
          )
        })()}
      </section>

      {/* ── Account Cards ────────────────────────────────────────────────────── */}
      <section className="mt-6">
        <div className="flex items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-800 dark:text-white">Accounts</h2>
            <button
              onClick={() => setAccountsHidden(h => !h)}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors active:scale-95"
              aria-label={accountsHidden ? 'Show account balances' : 'Hide account balances'}
            >
              {accountsHidden ? <IconEyeOff size={15} /> : <IconEye size={15} />}
            </button>
          </div>
          <Link to="/accounts" className="text-xs font-medium text-primary dark:text-primary active:opacity-70">
            See all
          </Link>
        </div>
        <Rail className="gap-3 mt-3 px-5 pt-1 -mt-1 pb-4 -mb-4">
          {(accounts || []).length === 0 && (
            <EmptyPill label="No accounts yet" />
          )}
          {(() => {
            const allAccts    = accounts || []
            const parentNames = new Set(allAccts.filter(a => a.parentName).map(a => a.parentName))
            // Show parent accounts (combined balance) + flat accounts; exclude child accounts
            const cardAccts   = allAccts
              .filter(a => parentNames.has(a.name) || !a.parentName)
              .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
            return cardAccts.map(acct => {
              const isParent = parentNames.has(acct.name)
              const displayAcct = isParent
                ? { ...acct, balance: parentCombinedBal[acct.name] ?? acct.balance }
                : acct
              return (
                <AccountCard
                  key={acct.id}
                  acct={displayAcct}
                  hidden={accountsHidden}
                  onClick={() => navigate(`/accounts/${acct.id}`)}
                  stmt={creditStmtMap[acct.name]}
                />
              )
            })
          })()}
          {/* spacer so last card doesn't clip under scroll fade */}
          <div className="shrink-0 w-1" />
        </Rail>
      </section>

      <QuickActions counts={actionCounts} />

      {/* ── Budget ────────────────────────────────────────────────────────────
          One line and one meter, tapping through to the full breakdown. It
          was a grid of eight per-category chips, which is a lot of screen
          for a question you usually only want a yes-or-no answer to. ── */}
      <section className="px-5 mt-8">
        <SectionHeader title="Budget" subtitle="This month" />
        <div className="mt-3">
          <BudgetSummaryTile totals={budgetTotals} count={budgetCategories.length} />
        </div>
      </section>

{/* ── Quick templates ─────────────────────────────────────────────────── */}
      {(templates ?? []).length > 0 && (
        <section className="mt-3">
          <Rail className="gap-2 px-5 pb-1">
            {(templates ?? [])
              .slice()
              .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
              .map(tpl => {
                const cat = (categories ?? []).find(c => c.name === tpl.category)
                const icon = tpl.type === 'transfer'
            ? <IconTransferUI size={15} />
            : <CategoryGlyph cat={cat} size={15} emoji="⚡" />
                const compact = (tpl.amount ?? 0) >= 1000
                  ? '₱' + ((tpl.amount) / 1000).toFixed(1) + 'K'
                  : '₱' + (tpl.amount ?? 0).toFixed(0)
                return (
                  <button
                    key={tpl.id}
                    onClick={() => { setQuickTemplate(tpl); setTimeout(() => setQuickConfirmOpen(true), 0) }}
                    className="card shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-2xl
                      active:scale-[0.96] transition-transform duration-75"
                  >
                    <span className="leading-none">{icon}</span>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{tpl.name}</span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{compact}</span>
                  </button>
                )
              })
            }
            <div className="shrink-0 w-1" />
          </Rail>
        </section>
      )}

      {/* ── Recent Transactions ──────────────────────────────────────────────── */}
      <UpcomingSection items={upcomingItems} />

      <section className="px-5 mt-8 pb-nav">
        <SectionHeader title="Recent" actionLabel="See all" actionTo="/transactions" />
        <Card radius="3xl" clip className="mt-3">
          {recentTx.length === 0 ? (
            <EmptyState
              size="sm"
              title="No transactions yet"
              body={<>Tap <span className="font-semibold">+</span> to add your first entry</>}
            />
          ) : (
            recentTx.map((tx, i) => (
              <TxRow
                key={tx.id}
                tx={tx}
                cat={catMap[tx.category]}
                isLast={i === recentTx.length - 1}
              />
            ))
          )}
        </Card>
      </section>

      {/*
        The sheet the template chips open.

        It was imported at the top of this file and never rendered: the chip
        set quickTemplate and quickConfirmOpen, nothing read either, and
        tapping a template did nothing at all. ESLint had been saying so the
        whole time - 'TemplateConfirmSheet' is defined but never used, and
        'quickTemplate' is assigned a value but never used - in a warning
        stream long enough that nobody reads it.

        Left mounted rather than conditionally rendered so the sheet keeps
        its own exit animation; it returns null when closed.
      */}
      <TemplateConfirmSheet
        open={quickConfirmOpen}
        onClose={() => setQuickConfirmOpen(false)}
        template={quickTemplate}
      />
    </div>
  )
}

