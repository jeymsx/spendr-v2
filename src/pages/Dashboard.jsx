import { useMemo, useRef, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { getCycleRange } from '../utils/creditCycle'
import { applyBalanceEffect } from '../db/txHelpers'
import { advanceNextDate } from '../utils/recurring'
import { useToast } from '../context/ToastContext'
import TemplateConfirmSheet from '../components/TemplateConfirmSheet'

// ── Formatters ─────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt     = (v) => '₱' + _phpFmt.format(v ?? 0)

function fmtCompact(v) {
  const abs = Math.abs(v ?? 0)
  if (abs >= 1_000_000) return '₱' + ((v ?? 0) / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return '₱' + ((v ?? 0) / 1_000).toFixed(1) + 'K'
  return fmt(v)
}

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const d    = new Date(dateStr)
  const now  = new Date()
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (d.toDateString() === now.toDateString())  return 'Today'
  if (d.toDateString() === yest.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function getContextHint(txAll, budgetCategories, upcomingRecurring) {
  const _d    = new Date()
  const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`
  const dow   = new Date().getDay() // 0=Sun, 6=Sat

  // Budget warnings take top priority
  const overBudget = (budgetCategories ?? []).find(c => c.spent > c.budget)
  if (overBudget) return `${overBudget.icon ?? '⚠️'} Over budget on ${overBudget.name.toLowerCase()}`

  const nearBudget = (budgetCategories ?? []).find(c => c.budget > 0 && (c.spent / c.budget) >= 0.85)
  if (nearBudget) return `${nearBudget.icon ?? '📊'} ${nearBudget.name.toLowerCase()} budget almost full`

  // Bill due today or tomorrow
  const urgentBill = (upcomingRecurring ?? []).find(r => {
    if (!r.nextDate) return false
    const diff = (new Date(r.nextDate) - new Date()) / 864e5
    return diff <= 1
  })
  if (urgentBill) return `🔔 ${urgentBill.name} due today`

  // Today's spending
  const todayTotal = (txAll ?? [])
    .filter(t => t.type === 'expense' && (t.date ?? '').startsWith(today))
    .reduce((s, t) => s + (t.amount ?? 0), 0)
  if (todayTotal > 0) {
    const compact = todayTotal >= 1000
      ? '₱' + (todayTotal / 1000).toFixed(1) + 'K'
      : '₱' + todayTotal.toFixed(0)
    return `${compact} spent today`
  }

  // Day-of-week fallbacks
  if (dow === 1) return 'New week, fresh start'
  if (dow === 5) return 'Almost the weekend'
  if (dow === 0 || dow === 6) return 'Enjoy your day off'
  return 'No spending yet today'
}

// ── Animated counter ───────────────────────────────────────────────────────────

function useCountUp(target, duration = 950) {
  const [value, setValue] = useState(0)
  const ranRef = useRef(false)
  const rafRef = useRef(null)

  useEffect(() => {
    if (target === undefined || target === null) return
    if (ranRef.current) { setValue(target); return }
    ranRef.current = true

    const start = performance.now()
    const step  = (now) => {
      const p = Math.min((now - start) / duration, 1)
      const e = 1 - Math.pow(1 - p, 3)          // easeOutCubic
      setValue(target * e)
      if (p < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => rafRef.current && cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return value
}

// ── Account type meta ──────────────────────────────────────────────────────────

const ACCOUNT_ICON = {
  cash:    { icon: <IconWallet />,  label: 'Cash'     },
  savings: { icon: <IconBank />,    label: 'Savings'  },
  credit:  { icon: <IconCard />,    label: 'Credit'   },
  ewallet: { icon: <IconPhone />,   label: 'E-Wallet' },
  bank:    { icon: <IconBank />,    label: 'Bank'     },
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function monthPrefix() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

function inNext7Days(dateStr) {
  if (!dateStr) return false
  const d    = new Date(dateStr)
  const now  = new Date(); now.setHours(0, 0, 0, 0)
  const end  = new Date(now.getTime() + 7 * 864e5)
  return d >= now && d <= end
}

// ── Main component ─────────────────────────────────────────────────────────────

function cardGradient(accentColor, theme) {
  const isBlue = accentColor === '#2D9DFF'
  const isDark = theme === 'dark'
  if (isBlue  && isDark)  return 'linear-gradient(135deg, #0d47a1 0%, #1565c0 35%, #2196f3 70%, #42a5f5 100%)'
  if (isBlue  && !isDark) return 'linear-gradient(135deg, #1565c0 0%, #1e88e5 45%, #64b5f6 100%)'
  if (!isBlue && isDark)  return 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 28%, black) 0%, color-mix(in srgb, var(--color-primary) 48%, black) 40%, color-mix(in srgb, var(--color-primary) 75%, black) 100%)'
  return 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 52%, black) 0%, color-mix(in srgb, var(--color-primary) 80%, black) 50%, var(--color-primary) 100%)'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { accentColor, theme } = useTheme()
  const { showToast } = useToast()
  const [balanceHidden,    setBalanceHidden]    = useState(true)
  const [accountsHidden,   setAccountsHidden]   = useState(false)
  const [peek,             setPeek]             = useState(false)
  const [quickTemplate,    setQuickTemplate]    = useState(null)
  const [quickConfirmOpen, setQuickConfirmOpen] = useState(false)
  const [postTarget,       setPostTarget]       = useState(null)
  const [postSheetOpen,    setPostSheetOpen]    = useState(false)
  const [posting,          setPosting]          = useState(false)

  // ── Live queries ─────────────────────────────────────────────────────────────
  const accounts   = useLiveQuery(() => db.accounts.toArray())
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const debts      = useLiveQuery(() => db.debts.toArray(),      [], [])
  const recurring  = useLiveQuery(() => db.recurring.toArray(),  [], [])
  const txAll      = useLiveQuery(() => db.transactions.toArray())
  const userMeta   = useLiveQuery(() => db.meta.get('displayName'))
  const templates  = useLiveQuery(() => db.templates.toArray(),  [], [])

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

  const recentTx = useMemo(() =>
    [...(txAll || [])].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 10),
    [txAll],
  )

  const monthExpenses = useMemo(() => {
    const pfx = monthPrefix()
    return (txAll || []).filter(t => t.type === 'expense' && (t.date ?? '').startsWith(pfx))
  }, [txAll])

  const budgetCategories = useMemo(() => {
    const catMap = Object.fromEntries((categories || []).map(c => [c.name, c]))
    const spentMap = {}
    monthExpenses.forEach(t => {
      spentMap[t.category] = (spentMap[t.category] ?? 0) + (t.amount ?? 0)
    })
    return (categories || [])
      .filter(c => c.budget > 0)
      .map(c => ({ ...c, spent: spentMap[c.name] ?? 0 }))
  }, [categories, monthExpenses])

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
      const { cycleStart, cycleEnd } = getCycleRange(acct.cutoffDate)
      const chargeTxs = (txAll || []).filter(tx => tx.account === acct.name && tx.type === 'expense')
      const thisTotal = chargeTxs
        .filter(tx => { const d = new Date(tx.date); return d >= cycleStart && d <= cycleEnd })
        .reduce((s, tx) => s + (tx.amount ?? 0), 0)
      const nextTotal = chargeTxs
        .filter(tx => new Date(tx.date) > cycleEnd)
        .reduce((s, tx) => s + (tx.amount ?? 0), 0)
      const totalPayments = (txAll || [])
        .filter(tx =>
          (tx.type === 'inflow'   && tx.account   === acct.name) ||
          (tx.type === 'transfer' && tx.toAccount === acct.name)
        )
        .reduce((s, tx) => s + (tx.amount ?? 0), 0)
      const stmtPaid       = totalPayments >= thisTotal
      const currentBalance = stmtPaid
        ? nextTotal
        : Math.max(0, thisTotal + nextTotal - totalPayments)
      map[acct.name] = { thisTotal, nextTotal, totalPayments, currentBalance }
    })
    return map
  }, [accounts, txAll])

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

  async function handlePostRecurring(rec) {
    setPosting(true)
    try {
      const now         = new Date().toISOString().slice(0, 10)
      const newNextDate = advanceNextDate(rec.nextDate, rec.frequency)
      await db.transaction('rw', [db.transactions, db.accounts, db.recurring], async () => {
        await db.transactions.add({
          txId:             crypto.randomUUID(),
          type:             'expense',
          amount:           rec.amount,
          description:      rec.name,
          category:         rec.category,
          account:          rec.account,
          date:             now,
          synced:           false,
          updatedAt:        new Date().toISOString(),
          recurringId:      rec.id,
          recurringPrevDate: rec.nextDate,
        })
        await applyBalanceEffect({ type: 'expense', amount: rec.amount, account: rec.account })
        await db.recurring.update(rec.id, { nextDate: newNextDate })
      })
      showToast(`${rec.name} posted!`)
      setPostSheetOpen(false)
    } catch (e) {
      console.error('[Dashboard] post recurring failed:', e)
      showToast('Failed to post', 'error')
    } finally {
      setPosting(false)
    }
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  if (accounts === undefined || txAll === undefined) {
    return <DashboardSkeleton />
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full pb-4">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 pt-safe-header pb-2">
        <div>
          <h1 className="text-xl tracking-tight text-slate-500 dark:text-slate-400">
            {getGreeting()},{' '}
            <span className={`font-semibold text-slate-900 dark:text-white transition-opacity duration-150 ${userMetaLoaded ? 'opacity-100' : 'opacity-0'}`}>
              {userName}
            </span>!
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {getContextHint(txAll, budgetCategories, upcomingRecurring)}
          </p>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="w-9 h-9 rounded-2xl flex items-center justify-center bg-white dark:bg-primary/[0.10] border border-slate-200 dark:border-primary/[0.20] text-slate-500 dark:text-slate-300 active:scale-95 transition-transform shadow-sm dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.12)]"
          aria-label="Settings"
        >
          <IconSettings />
        </button>
      </header>

      {/* ── Net Worth Card ───────────────────────────────────────────────────── */}
      <section className="px-5 mt-4">
        {(() => {
          const revealed = !balanceHidden || peek
          return (
            <div
              className="rounded-3xl p-6 relative overflow-hidden select-none"
              style={{ background: cardGradient(accentColor, theme) }}
              onPointerDown={() => setPeek(true)}
              onPointerUp={() => setPeek(false)}
              onPointerLeave={() => setPeek(false)}
              onPointerCancel={() => setPeek(false)}
            >
              {/* subtle glare overlay */}
              <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse 80% 60% at 20% 10%, rgba(255,255,255,0.5) 0%, transparent 60%)' }}
              />
              {/* dot grid texture */}
              <div
                className="absolute inset-0 opacity-[0.06] pointer-events-none"
                style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '18px 18px' }}
              />

              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold uppercase tracking-widest text-white/60">Net Worth</span>
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => setBalanceHidden(h => !h)}
                    className="text-white/60 hover:text-white/90 transition-colors active:scale-95"
                    aria-label={balanceHidden ? 'Show balance' : 'Hide balance'}
                  >
                    {balanceHidden ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>

                <div className="mt-2 mb-5">
                  {revealed ? (
                    <span className="text-4xl font-semibold tracking-tight text-white tabular-nums">
                      {fmt(animatedNetWorth)}
                    </span>
                  ) : (
                    <span className="text-4xl font-semibold tracking-tight text-white/80">₱ ••••••</span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/15">
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
        <div
          className="flex gap-3 overflow-x-auto mt-3 px-5 pt-1 -mt-1 pb-4 -mb-4 no-scrollbar"
        >
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
                  onClick={() => navigate('/accounts?open=' + encodeURIComponent(acct.name))}
                  stmt={creditStmtMap[acct.name]}
                />
              )
            })
          })()}
          {/* spacer so last card doesn't clip under scroll fade */}
          <div className="shrink-0 w-1" />
        </div>
      </section>

{/* ── Quick Templates ─────────────────────────────────────────────────── */}
      {(templates ?? []).length > 0 && (
        <section className="mt-3">
          <div
            className="flex gap-2 overflow-x-auto px-5 pb-1 no-scrollbar"
          >
            {(templates ?? [])
              .slice()
              .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
              .map(tpl => {
                const cat = (categories ?? []).find(c => c.name === tpl.category)
                const icon = tpl.type === 'transfer' ? '🔄' : (cat?.icon ?? '⚡')
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
                    <span className="text-sm leading-none">{icon}</span>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{tpl.name}</span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{compact}</span>
                  </button>
                )
              })
            }
            <div className="shrink-0 w-1" />
          </div>
        </section>
      )}

      {/* ── Debts ────────────────────────────────────────────────────────────── */}
      <DebtsSection debts={debts} />

      {/* ── Budget Progress ───────────────────────────────────────────────────── */}
      {budgetCategories.length > 0 && (
        <section className="px-5 mt-8">
          <SectionHeader title="Budget" subtitle="This month" />
          <div className="grid grid-cols-2 gap-2.5 mt-3">
            {budgetCategories.map(cat => (
              <BudgetRow key={cat.id} cat={cat} />
            ))}
          </div>
        </section>
      )}

      {/* ── Upcoming Recurring ───────────────────────────────────────────────── */}
      <section className="px-5 mt-8">
        <SectionHeader title="Upcoming" subtitle="Next 7 days" actionLabel="See all" actionTo="/recurring" />
        <div className="flex flex-col gap-2 mt-3">
          {upcomingRecurring.length === 0 ? (
            <EmptyCard label="No upcoming payments" />
          ) : (
            upcomingRecurring.map(r => (
              <RecurringRow key={r.id} item={r} onClick={() => { setPostTarget(r); setPostSheetOpen(true) }} />
            ))
          )}
        </div>
      </section>

      {/* ── Recent Transactions ──────────────────────────────────────────────── */}
      <TemplateConfirmSheet
        open={quickConfirmOpen}
        onClose={() => setQuickConfirmOpen(false)}
        template={quickTemplate}
      />
      <RecurringPostSheet
        open={postSheetOpen}
        item={postTarget}
        posting={posting}
        onClose={() => setPostSheetOpen(false)}
        onPost={handlePostRecurring}
      />

      <section className="px-5 mt-8 pb-nav">
        <SectionHeader title="Recent" actionLabel="See all" actionTo="/transactions" />
        <div
          className="card mt-3 rounded-3xl overflow-hidden"
        >
          {recentTx.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-400 dark:text-slate-500">No transactions yet</p>
              <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">
                Tap <span className="font-semibold">+</span> to add your first entry
              </p>
            </div>
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
        </div>
      </section>

    </div>
  )
}

// ── Skeleton loader ────────────────────────────────────────────────────────────

function Skel({ className }) {
  return <div className={`rounded-xl bg-slate-200 dark:bg-white/[0.06] animate-pulse ${className}`} />
}

function DashboardSkeleton() {
  return (
    <div className="min-h-full pb-4">
      {/* header */}
      <div className="flex items-center justify-between px-5 pt-safe-header pb-2">
        <div className="flex flex-col gap-2">
          <Skel className="h-6 w-20" />
          <Skel className="h-4 w-36" />
        </div>
        <Skel className="h-9 w-9 rounded-2xl" />
      </div>

      {/* net worth card */}
      <div className="px-5 mt-4">
        <div className="rounded-3xl p-6 bg-slate-200 dark:bg-white/[0.06] animate-pulse h-40" />
      </div>

      {/* account cards */}
      <div className="mt-6 px-5 flex gap-3 overflow-hidden">
        {[1, 2, 3].map(i => (
          <Skel key={i} className="shrink-0 w-40 h-24 rounded-2xl" />
        ))}
      </div>

      {/* quick add */}
      <div className="px-5 mt-6 flex gap-2">
        {[1, 2, 3].map(i => <Skel key={i} className="flex-1 h-9 rounded-2xl" />)}
      </div>

      {/* recent list */}
      <div className="px-5 mt-8">
        <Skel className="h-5 w-24 mb-3" />
        <div className="rounded-3xl overflow-hidden bg-white dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-50 dark:border-white/[0.05]">
              <Skel className="w-10 h-10 rounded-2xl shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <Skel className="h-3.5 w-32" />
                <Skel className="h-3 w-20" />
              </div>
              <div className="flex flex-col items-end gap-2">
                <Skel className="h-3.5 w-16" />
                <Skel className="h-3 w-10" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, actionLabel, actionTo, px = false }) {
  return (
    <div className={`flex items-baseline justify-between ${px ? 'px-5' : ''}`}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold text-slate-800 dark:text-white">{title}</h2>
        {subtitle && (
          <span className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</span>
        )}
      </div>
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="text-xs font-medium text-primary dark:text-primary active:opacity-70"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

// ── Account card ───────────────────────────────────────────────────────────────

function AccountCard({ acct, hidden, onClick, stmt }) {
  const isCredit  = acct.type === 'credit'
  const thisTotal = stmt?.thisTotal ?? 0
  const nextTotal = stmt?.nextTotal ?? 0
  const available = isCredit
    ? (acct.creditLimit ?? 0) - thisTotal - nextTotal
    : null

  const meta = ACCOUNT_ICON[acct.type] ?? ACCOUNT_ICON.bank

  return (
    <button
      onClick={onClick}
      className="card shrink-0 w-40 h-[116px] rounded-2xl p-4 text-left flex flex-col
        active:scale-[0.97] transition-transform duration-100"
    >
      {/* icon + label row */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm shrink-0"
          style={{ backgroundColor: acct.color ?? '#2D9DFF' }}
        >
          {meta.icon}
        </span>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium truncate">
          {meta.label}
        </p>
      </div>

      <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate mb-1">{acct.name}</p>

      <div className="mt-auto">
        {isCredit ? (
          <div className="flex items-baseline gap-1.5">
            <p className="text-sm font-bold text-slate-800 dark:text-white tabular-nums">
              {hidden ? '₱ ••••' : fmt(available)}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">avail.</p>
          </div>
        ) : (
          <p className="text-sm font-bold text-slate-800 dark:text-white tabular-nums">
            {hidden ? '₱ ••••' : fmt(acct.balance)}
          </p>
        )}
      </div>
    </button>
  )
}

// ── Quick add button ───────────────────────────────────────────────────────────

function QuickAddBtn({ label, to, className }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(to)}
      className={`flex-1 py-2.5 rounded-2xl text-xs font-semibold text-center active:scale-[0.96] transition-transform duration-100 ${className}`}
    >
      {label}
    </button>
  )
}

// ── Budget chip (compact 2-col grid) ──────────────────────────────────────────

function BudgetRow({ cat }) {
  const pct    = cat.budget > 0 ? Math.min((cat.spent / cat.budget) * 100, 100) : 0
  const over   = cat.spent > cat.budget
  const warn   = pct >= 75 && !over
  const accent = over ? '#ef4444' : warn ? '#f59e0b' : '#22c55e'

  return (
    <div
      className="card relative rounded-2xl overflow-hidden flex flex-col gap-1.5 px-3 pt-2.5 pb-0"
    >
      {/* icon + name */}
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] leading-none shrink-0">{cat.icon}</span>
        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-200 truncate">
          {cat.name}
        </span>
      </div>

      {/* spent vs budget */}
      <div className="flex items-baseline justify-between gap-1 mb-2">
        <span className="text-[13px] font-bold tabular-nums" style={{ color: accent }}>
          {fmtCompact(cat.spent)}
        </span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
          /{fmtCompact(cat.budget)}
        </span>
      </div>

      {/* progress track flush to bottom — no padding-bottom on card so this hugs the edge */}
      <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/[0.06] dark:bg-white/[0.08]">
        <div
          className="h-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: accent }}
        />
      </div>
    </div>
  )
}

// ── Recurring row ──────────────────────────────────────────────────────────────

function RecurringRow({ item, onClick }) {
  const daysUntil = item.nextDate
    ? Math.ceil((new Date(item.nextDate) - new Date()) / 864e5)
    : null

  return (
    <button onClick={onClick} className="card flex items-center gap-3 px-4 py-3 rounded-2xl w-full text-left active:scale-[0.98] transition-transform duration-100">
      <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/15 flex items-center justify-center shrink-0">
        <span className="text-base">🔄</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{item.name}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{item.account}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-white tabular-nums">{fmt(item.amount)}</p>
        <p className={`text-[11px] ${daysUntil === 0 ? 'text-red-500 dark:text-red-400' : daysUntil <= 2 ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
          {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `in ${daysUntil}d`}
        </p>
      </div>
    </button>
  )
}

// ── Transaction row ────────────────────────────────────────────────────────────

function TxRow({ tx, cat, isLast }) {
  const isExpense  = tx.type === 'expense'
  const isInflow   = tx.type === 'inflow'
  const amountCls  = isExpense  ? 'text-red-500 dark:text-red-400'
    : isInflow  ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-primary'
  const amountSign = isExpense ? '-' : isInflow ? '+' : ''

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 ${
        !isLast ? 'border-b border-slate-50 dark:border-white/[0.05]' : ''
      }`}
    >
      {/* category icon */}
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-base"
        style={{
          backgroundColor: cat?.color ? cat.color + '22' : '#2D9DFF22',
        }}
      >
        {cat?.icon ?? '💸'}
      </div>

      {/* description + account */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
          {tx.description || (tx.type === 'transfer' ? `Transfer to ${tx.toAccount ?? ''}` : tx.category) || '—'}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
          {tx.type === 'transfer'
            ? `${tx.fromAccount ?? ''} → ${tx.toAccount ?? ''}`
            : tx.account ?? ''}
        </p>
      </div>

      {/* amount + date */}
      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold tabular-nums ${amountCls}`}>
          {amountSign}{fmt(tx.amount)}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
          {fmtDate(tx.date)}
        </p>
      </div>
    </div>
  )
}

// ── Empty states ───────────────────────────────────────────────────────────────

function EmptyCard({ label }) {
  return (
    <div className="card py-6 rounded-2xl text-center text-sm text-slate-400 dark:text-slate-500">
      {label}
    </div>
  )
}

function EmptyPill({ label }) {
  return (
    <div className="card shrink-0 h-24 w-36 rounded-2xl flex items-center justify-center border-dashed">
      <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
    </div>
  )
}

// ── Debts section ──────────────────────────────────────────────────────────────

function DebtsSection({ debts }) {
  const now = new Date(); now.setHours(0, 0, 0, 0)

  const iOwe = (debts ?? []).filter(d => d.type === 'i_owe')
  const owedToMe = (debts ?? []).filter(d => d.type === 'owed_to_me')

  const outstanding = (list) =>
    list.filter(d => (d.amountPaid ?? 0) < (d.amount ?? 0))
        .reduce((s, d) => s + Math.max(0, (d.amount ?? 0) - (d.amountPaid ?? 0)), 0)

  const overdueCount = owedToMe.filter(d => {
    if ((d.amountPaid ?? 0) >= (d.amount ?? 0)) return false
    if (!d.dueDate) return false
    const due = new Date(d.dueDate); due.setHours(0, 0, 0, 0)
    return due < now
  }).length

  const iOweTotal    = outstanding(iOwe)
  const owedTotal    = outstanding(owedToMe)
  const hasAny       = iOweTotal > 0 || owedTotal > 0

  return (
    <section className="px-5 mt-8">
      <SectionHeader title="Debts" actionLabel="See all" actionTo="/debts" />
      <div className="card mt-3 flex rounded-2xl overflow-hidden">
        {/* I Owe */}
        <Link
          to="/debts?tab=i_owe"
          className="flex-1 px-4 py-3.5 border-r border-slate-100 dark:border-white/[0.12] active:opacity-70 transition-opacity"
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">I Owe</p>
          <p className={`text-base font-bold tabular-nums ${iOweTotal > 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-300 dark:text-slate-600'}`}>
            {fmt(iOweTotal)}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            {iOwe.filter(d => (d.amountPaid ?? 0) < (d.amount ?? 0)).length} active
          </p>
        </Link>

        {/* Owed to Me */}
        <Link
          to="/debts?tab=owed_to_me"
          className="flex-1 px-4 py-3.5 active:opacity-70 transition-opacity"
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Owed to Me</p>
          <p className={`text-base font-bold tabular-nums ${owedTotal > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-600'}`}>
            {fmt(owedTotal)}
          </p>
          {overdueCount > 0 ? (
            <p className="text-[11px] font-semibold text-red-500 dark:text-red-400 mt-0.5">{overdueCount} overdue</p>
          ) : (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              {owedToMe.filter(d => (d.amountPaid ?? 0) < (d.amount ?? 0)).length} active
            </p>
          )}
        </Link>
      </div>
    </section>
  )
}

// ── Recurring Post Sheet ───────────────────────────────────────────────────────

function RecurringPostSheet({ open, item, posting, onClose, onPost }) {
  const [closing, setClosing] = useState(false)

  function close() {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="sheet-overlay absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-white dark:bg-[#111820] border-t border-slate-100 dark:border-white/[0.07]',
        ].join(' ')}
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
      >
        <div className="pt-4 px-5 pb-2">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-5" />

          {/* Item info */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 dark:bg-primary/15 flex items-center justify-center shrink-0">
              <span className="text-xl">🔄</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 dark:text-white truncate">{item?.name}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{item?.account} · {item?.frequency}</p>
            </div>
            <p className="text-lg font-bold text-slate-800 dark:text-white tabular-nums">{fmt(item?.amount ?? 0)}</p>
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500 text-center mb-5">
            Posts as an expense today and advances the next due date.
          </p>

          <div className="flex gap-3">
            <button
              onClick={close}
              className="flex-1 py-3.5 rounded-2xl text-sm font-semibold text-slate-600 dark:text-slate-300
                bg-slate-100 dark:bg-white/[0.07] active:opacity-70 transition-opacity"
            >
              Cancel
            </button>
            <button
              onClick={() => onPost(item)}
              disabled={posting}
              className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
                bg-primary shadow-[0_4px_16px_rgba(var(--color-primary-rgb),0.35)]
                active:scale-[0.98] transition-all disabled:opacity-40"
            >
              {posting ? 'Posting…' : 'Post Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── SVG icons ──────────────────────────────────────────────────────────────────

function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

function IconEye({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconEyeOff({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function IconWallet() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
      <path d="M16 13a1 1 0 100 2 1 1 0 000-2z" fill="currentColor" />
      <path d="M20 7V5a2 2 0 00-2-2H6a2 2 0 00-2 2v2" />
    </svg>
  )
}

function IconBank() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 20 7 4 7" fill="currentColor" fillOpacity="0.3" />
    </svg>
  )
}

function IconCard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="3" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}

function IconPhone() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="3" />
      <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" />
    </svg>
  )
}
