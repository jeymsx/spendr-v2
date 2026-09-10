import { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { getCreditStatus, nextDueDate } from '../utils/creditCycle'
import { useToast } from '../context/ToastContext'
import TemplateConfirmSheet from '../components/TemplateConfirmSheet'
import { IconBank, IconCard, IconPhone, IconWallet } from '../components/icons'
import { scheduledCutoff } from '../utils/scheduled'
import { accountBrand } from '../lib/accountBrands'
import BrandMark from '../components/BrandMark'
import BrandWatermark from '../components/BrandWatermark'
import BudgetMeter, { budgetTone } from '../components/BudgetMeter'
import { allocateGoals } from '../lib/goals'

// ── Formatters ─────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _phpFmt.format(Math.abs(n))
}

function fmtCompact(v) {
  const abs = Math.abs(v ?? 0)
  const sign = (v ?? 0) < 0 ? '−₱' : '₱'
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return sign + (abs / 1_000).toFixed(1) + 'K'
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

  // Overdue bills first, then ones due today or tomorrow. The previous check
  // was `diff <= 1`, which is also true for anything long overdue — so a bill
  // three weeks late still read "due today".
  const bills = (upcomingRecurring ?? []).filter(r => r.nextDate)
  const daysAway = (r) => {
    const [y, mo, d] = String(r.nextDate).slice(0, 10).split('-').map(Number)
    const start = new Date(); start.setHours(0, 0, 0, 0)
    return Math.round((new Date(y, mo - 1, d) - start) / 864e5)
  }
  const overdue = bills.find(r => daysAway(r) < 0)
  if (overdue) return `⚠️ ${overdue.name} is overdue`
  const urgentBill = bills.find(r => daysAway(r) <= 1)
  if (urgentBill) return `🔔 ${urgentBill.name} due ${daysAway(urgentBill) === 0 ? 'today' : 'tomorrow'}`

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

/* ── The wallet silhouette ────────────────────────────────────────────────────
   Builds the clip path for the net-worth wallet: a rounded body with a tab
   hanging off the bottom edge, joined by concave fillets.

   This measures the element, which is a deliberate reversal. The first
   version used a percentage-sized SVG mask and needed no JS at all - but a
   percentage-sized mask STRETCHES, and this card's height comes from its
   content (~300px, near constant) while its width follows the viewport. Its
   aspect ratio therefore swings from about 1.14 on a phone to 1.8 on a wide
   screen, against the artwork's fixed 1.6, so the corner radii rendered up to
   40% taller than they were wide and the tab changed shape with the window.

   Real pixels fix that outright: every radius is exactly its stated radius at
   every width, and the tab is the same size on a phone as on a desktop. The
   cost is one ResizeObserver.

   `clip-path` clips box decorations too, so the lift lives on a drop-shadow
   on the .wallet wrapper - which follows the tab rather than squaring it off. */
const TAB_W = 96      // tab width, capped below for very narrow cards
const TAB_H = 22      // how far the tab hangs below the body
const TAB_R = 10      // the tab's own bottom corners
const FILLET = 8      // the concave curve where tab meets body
const R_TOP = 28
const R_BOT = 20

function walletPath(w, h) {
  const tabW = Math.min(TAB_W, w * 0.34)
  const base = h - TAB_H                 // the body's bottom edge
  const left = (w - tabW) / 2
  const right = left + tabW
  const n = (v) => Math.round(v * 100) / 100

  // Clockwise from the top-left corner. Fillets use sweep-flag 0 so they
  // curve INTO the corner; every other arc is a convex corner at sweep 1.
  return [
    `M${n(R_TOP)} 0`,
    `H${n(w - R_TOP)}`,
    `A${R_TOP} ${R_TOP} 0 0 1 ${n(w)} ${R_TOP}`,
    `V${n(base - R_BOT)}`,
    `A${R_BOT} ${R_BOT} 0 0 1 ${n(w - R_BOT)} ${n(base)}`,
    `H${n(right + FILLET)}`,
    `A${FILLET} ${FILLET} 0 0 0 ${n(right)} ${n(base + FILLET)}`,
    `V${n(h - TAB_R)}`,
    `A${TAB_R} ${TAB_R} 0 0 1 ${n(right - TAB_R)} ${n(h)}`,
    `H${n(left + TAB_R)}`,
    `A${TAB_R} ${TAB_R} 0 0 1 ${n(left)} ${n(h - TAB_R)}`,
    `V${n(base + FILLET)}`,
    `A${FILLET} ${FILLET} 0 0 0 ${n(left - FILLET)} ${n(base)}`,
    `H${R_BOT}`,
    `A${R_BOT} ${R_BOT} 0 0 1 0 ${n(base - R_BOT)}`,
    `V${R_TOP}`,
    `A${R_TOP} ${R_TOP} 0 0 1 ${R_TOP} 0`,
    'Z',
  ].join('')
}

/**
 * The clip path for the wallet, kept in step with its rendered size.
 * Returns undefined until measured, so the first paint is the plain rounded
 * rectangle border-radius already gives - never an unclipped square.
 *
 * The observer is attached by a CALLBACK ref, not by an effect reading a ref
 * object, and that distinction is the whole bug this had first time round.
 * This page returns <DashboardSkeleton/> until its queries resolve, so on the
 * first render the card is not in the tree at all: a mount effect ran against
 * a null ref, attached nothing, and - with empty deps - never ran again once
 * the real card appeared. A callback ref fires on every attach and detach, so
 * it cannot miss a node that arrives late.
 */
function useWalletClip() {
  const [box, setBox] = useState(null)
  const roRef = useRef(null)

  const ref = useCallback((el) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!el || typeof ResizeObserver === 'undefined') return

    const ro = new ResizeObserver(([entry]) => {
      // borderBoxSize, not contentRect: clip-path coordinates are relative to
      // the border box, while contentRect excludes this card's 24px of side
      // padding and 30px of tab reserve. Measuring the content box would put
      // the tab 30px too high and slice 48px off the width.
      const b = entry.borderBoxSize?.[0]
      const w = b ? b.inlineSize : el.offsetWidth
      const h = b ? b.blockSize : el.offsetHeight
      // The tab needs somewhere to hang; below that, skip the clip entirely
      // and let border-radius stand in.
      if (w > 80 && h > TAB_H + R_TOP + R_BOT) {
        setBox(prev => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
      }
    })
    ro.observe(el)
    roRef.current = ro
  }, [])

  useEffect(() => () => roRef.current?.disconnect(), [])

  const clipPath = useMemo(
    () => (box ? `path("${walletPath(box.w, box.h)}")` : undefined),
    [box],
  )
  return [ref, clipPath]
}

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
  const goals      = useLiveQuery(() => db.goals.toArray(),      [], [])

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
      .slice(0, 10)
  }, [txAll])

  const monthExpenses = useMemo(() => {
    const pfx = monthPrefix()
    const cutoff = scheduledCutoff()
    return (txAll || []).filter(t =>
      t.type === 'expense' && (t.date ?? '').startsWith(pfx) && (t.date ?? '') <= cutoff)
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
        icon: cat?.icon ?? '🔁',
        color: cat?.color ?? null,
        to: '/recurring',
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
        icon: '💳',
        color: a.color ?? null,
        to: `/accounts/${a.id}`,
      })
    }

    return out.sort((x, y) => x.date - y.date).slice(0, 2)
  }, [recurring, accounts, creditStmtMap, catMap])

  const creditOutstanding = useMemo(() =>
    (accounts || [])
      .filter(a => a.type === 'credit')
      .reduce((s, a) => s + (creditStmtMap[a.name]?.currentBalance ?? 0), 0),
    [accounts, creditStmtMap],
  )

  const netWorth = spendingBalance + savingsBalance - creditOutstanding

  // Goal progress is derived, never stored - see lib/goals.js. Recomputed
  // here rather than read from a column precisely so that spending from an
  // account moves its goals on this screen with no extra bookkeeping.
  const goalAlloc = useMemo(
    () => allocateGoals({ goals: goals ?? [], accounts: accounts ?? [] }),
    [goals, accounts],
  )

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
                    <div id="net-worth-breakdown" className="wallet-pocket grid grid-cols-3 gap-3 px-6 pt-5 pb-6">
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
                  onClick={() => navigate(`/accounts/${acct.id}`)}
                  stmt={creditStmtMap[acct.name]}
                />
              )
            })
          })()}
          {/* spacer so last card doesn't clip under scroll fade */}
          <div className="shrink-0 w-1" />
        </div>
      </section>

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

      {/* ── Planner: goals, debts, recurring ──────────────────────────────────

          Three tiles where a debts panel and a seven-day bill list used to be.
          Both were roughly a screen of vertical space spent restating figures
          that have their own pages, and they pushed Recent - the thing people
          actually come to the home screen for - below the fold.

          Bare icons were the ask; each tile carries one live figure as well,
          because "Debts" alone answers nothing and the figure is the reason
          you would tap through. Enough to decide, not enough to browse: that
          is what earns the space. ── */}
      <PlannerRow goalAlloc={goalAlloc} debts={debts} />

      {/* ── Recent Transactions ──────────────────────────────────────────────── */}
      <UpcomingSection items={upcomingItems} />

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

// ── Upcoming ───────────────────────────────────────────────────────────────────

/**
 * "Tomorrow", "Today", or a date. Relative wording only where it is genuinely
 * more useful than the date itself - past three days out, "in 5 days" is more
 * arithmetic than "Sep 15".
 */
function fmtUpcoming(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  const days = Math.round((d - today) / 864e5)
  if (days < 0)  return 'Overdue'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 6)  return d.toLocaleDateString('en-PH', { weekday: 'long' })
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

/** Circular arrows: this charge comes back every month. */
function IconRepeatBadge() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11a9 9 0 0 1 15-5l3 3M21 13a9 9 0 0 1-15 5l-3-3" />
      <path d="M21 3v6h-6M3 21v-6h6" />
    </svg>
  )
}

/** A calendar leaf: this one falls due on a date rather than repeating. */
function IconDueBadge() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

/**
 * One committed-but-not-yet-real charge.
 *
 * Same metrics as TxRow - 40px icon, same paddings, same type scale - so it
 * reads as the same kind of object. What differs is the weight: the name is
 * slate-600 where a real transaction is slate-800, and the amount is neutral
 * rather than red, because nothing has left the account yet. Colouring an
 * unspent peso red would be the same lie as counting it.
 *
 * The fade is done with muted COLOURS rather than a container opacity on
 * purpose. `opacity-60` over white drops slate-800 to about 4.3:1, under the
 * 4.5:1 floor; slate-600 and slate-500 are 7.6:1 and 4.8:1 and look just as
 * recessive next to full-strength rows.
 */
function UpcomingRow({ item, isLast }) {
  const navigate = useNavigate()
  const overdue = fmtUpcoming(item.date) === 'Overdue'
  return (
    <button
      onClick={() => navigate(item.to)}
      className={`w-full text-left flex items-center gap-3 px-4 py-3.5
        active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors ${
          !isLast ? 'border-b border-slate-50 dark:border-white/[0.05]' : ''
        }`}
    >
      <span className="relative shrink-0">
        <span
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-base opacity-70"
          style={{ backgroundColor: (item.color ?? '#2D9DFF') + '18' }}
          aria-hidden="true"
        >
          {item.icon}
        </span>
        {/* Bottom-right, overlapping the corner, ringed in the row's own
            background so it reads as punched out rather than stuck on. The
            ring colour lives in index.css next to the .card rules it is
            derived from - see .upcoming-badge. */}
        <span className="upcoming-badge absolute -bottom-0.5 -right-0.5 w-[15px] h-[15px]
          rounded-full flex items-center justify-center">
          {item.kind === 'recurring' ? <IconRepeatBadge /> : <IconDueBadge />}
        </span>
      </span>

      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-slate-600 dark:text-slate-300 truncate">
          {item.name}
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
          <span className={overdue ? 'text-red-500 dark:text-red-400 font-semibold' : ''}>
            {fmtUpcoming(item.date)}
          </span>
          {item.meta ? ` · ${item.meta}` : ''}
        </span>
      </span>

      <span className="text-sm font-semibold tabular-nums shrink-0 text-slate-500 dark:text-slate-400">
        −{fmt(item.amount)}
      </span>
    </button>
  )
}

/**
 * Renders nothing when there is nothing coming.
 *
 * A home screen carrying an empty "Upcoming — no upcoming payments" panel
 * spends a section's worth of space saying that a section is not needed.
 */
function UpcomingSection({ items }) {
  if (!items?.length) return null
  const total = items.reduce((sum, i) => sum + (i.amount ?? 0), 0)
  return (
    <section className="px-5 mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Upcoming
        </h2>
        {/* The total covers the rows on screen, not every future bill - a
            figure that disagreed with the two rows under it would be worse
            than no figure. */}
        <span className="text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
          −{fmtCompact(total)}
        </span>
      </div>
      <div className="card rounded-2xl overflow-hidden mt-2.5">
        {items.map((item, i) => (
          <UpcomingRow key={item.key} item={item} isLast={i === items.length - 1} />
        ))}
      </div>
    </section>
  )
}

// ── Planner row ────────────────────────────────────────────────────────────────

/**
 * One tile: an icon, what it is, and the single figure that would make you
 * open it.
 *
 * The figure carries the colour, not the icon. Three differently-tinted icons
 * read as a category legend - as if the hues meant something - when all they
 * would be encoding is "these are different pages". Keeping the chrome neutral
 * leaves red free to mean money owed and amber to mean a bill is late, which
 * is worth more than decoration.
 */
function PlannerTile({ to, icon, label, value, valueClass = '', border = false }) {
  return (
    <Link
      to={to}
      className={`flex-1 min-w-0 px-3 py-3.5 flex flex-col items-center gap-1.5
        active:opacity-70 transition-opacity ${
          border ? 'border-r border-slate-100 dark:border-white/[0.12]' : ''
        }`}
    >
      <span
        className="w-9 h-9 rounded-full flex items-center justify-center text-[17px] leading-none
          bg-slate-100 dark:bg-white/[0.07]"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      <span className={`text-[12px] font-bold tabular-nums truncate max-w-full ${
        valueClass || 'text-slate-800 dark:text-slate-100'
      }`}>
        {value}
      </span>
    </Link>
  )
}

function PlannerRow({ goalAlloc, debts }) {
  // Debts: what you owe is the actionable half, so it leads. Money owed TO you
  // only takes the slot when you owe nothing - otherwise the tile would read
  // green while you are in the red.
  const { debtValue, debtClass } = useMemo(() => {
    const outstanding = (list) => list
      .filter(d => (d.amountPaid ?? 0) < (d.amount ?? 0))
      .reduce((s, d) => s + Math.max(0, (d.amount ?? 0) - (d.amountPaid ?? 0)), 0)
    const iOwe = outstanding((debts ?? []).filter(d => d.type === 'i_owe'))
    const owed = outstanding((debts ?? []).filter(d => d.type === 'owed_to_me'))
    if (iOwe > 0) return { debtValue: fmtCompact(iOwe), debtClass: 'text-red-500 dark:text-red-400' }
    if (owed > 0) return { debtValue: fmtCompact(owed), debtClass: 'text-emerald-600 dark:text-emerald-400' }
    return { debtValue: 'Clear', debtClass: 'text-slate-400 dark:text-slate-500' }
  }, [debts])

  // Goals: percent funded across the whole plan. A goal with no target set
  // contributes nothing to either side of that fraction, so it cannot quietly
  // drag the figure down - see allocateGoals.
  const { goalValue, goalClass } = useMemo(() => {
    const t = goalAlloc?.totals
    if (!t || t.count === 0) return { goalValue: 'Set one', goalClass: 'text-slate-400 dark:text-slate-500' }
    if (t.complete === t.count) return { goalValue: 'All funded', goalClass: 'text-emerald-600 dark:text-emerald-400' }
    return { goalValue: `${Math.round(t.pct)}%`, goalClass: '' }
  }, [goalAlloc])

  return (
    <section className="px-5 mt-3">
      <div className="card rounded-2xl overflow-hidden flex">
        {/* Recurring used to be the third tile. It has a better home now:
            UpcomingSection shows the actual next charge as a row, which is
            the thing a tile could only ever point at. Goals and Debts are
            still tiles pending a decision on what they should become. */}
        <PlannerTile to="/goals" icon="🎯" label="Goals" value={goalValue} valueClass={goalClass} border />
        <PlannerTile to="/debts" icon="🧾" label="Debts" value={debtValue} valueClass={debtClass} />
      </div>
    </section>
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

/**
 * The home carousel card. Same brand face as the Accounts tab, at carousel
 * size, so an account looks like the same object in both places - which is
 * the point of giving them card identities at all.
 */
function AccountCard({ acct, hidden, onClick, stmt }) {
  const isCredit  = acct.type === 'credit'
  const available = isCredit
    ? (acct.creditLimit ?? 0) - (stmt?.currentBalance ?? 0)
    : null

  const meta  = ACCOUNT_ICON[acct.type] ?? ACCOUNT_ICON.bank
  const brand = accountBrand(acct)

  return (
    <button
      onClick={onClick}
      className="acct-card shrink-0 w-[188px] rounded-2xl px-4 pt-3.5 pb-4 text-left flex flex-col
        text-white"
      style={{
        background: `linear-gradient(135deg, ${brand.from} 0%, ${brand.to} 100%)`,
        // Slightly taller than a card's true 1.586 so the balance and its
        // label have room to breathe; the Accounts faces keep the exact ratio.
        aspectRatio: '1.45',
      }}
      data-brand={brand.key}
      data-compact=""
    >
      <BrandWatermark brand={brand} />

      <div className="flex items-center gap-2">
        <BrandMark mark={brand.mark} size={18} className="shrink-0" />
        <p className="text-[10px] font-medium text-white/65 truncate">{meta.label}</p>
      </div>

      <p className="text-[13px] font-semibold truncate mt-2">{acct.name}</p>

      <div className="mt-auto pt-1">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-white/60 mb-0.5">
          {isCredit ? 'Available' : 'Balance'}
        </p>
        <p className="text-[17px] font-bold tabular-nums leading-none">
          {hidden ? '₱ ••••' : fmt(isCredit ? available : acct.balance)}
        </p>
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

// ── Budget summary tile ───────────────────────────────────────────────────────

/**
 * The month's budget in one line.
 *
 * The headline is a percentage rather than an amount on purpose: "using 65%"
 * is a judgement you can act on without doing arithmetic, where "₱13,400 of
 * ₱20,600" is two numbers you have to divide first. The amounts are still
 * there underneath for anyone who wants them.
 *
 * With no budgets set this becomes the prompt to set one, because an empty
 * meter would imply everything is fine when nothing is being tracked at all.
 */
function BudgetSummaryTile({ totals, count }) {
  const hasBudget = totals.budget > 0
  const pct = Math.round(totals.pct)
  const { textClass } = budgetTone(totals.pct)

  if (!hasBudget) {
    return (
      <Link
        to="/settings"
        className="card block rounded-2xl px-4 py-4 active:scale-[0.99] transition-transform duration-100"
      >
        <p className="text-[15px] text-slate-800 dark:text-white">
          No <span className="font-bold">spending budget</span> set
        </p>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
          Set a monthly limit per category in <span className="font-semibold text-primary">Settings</span>
        </p>
        <BudgetMeter pct={0} className="mt-3.5" />
      </Link>
    )
  }

  return (
    <Link
      to="/budget"
      className="card block rounded-2xl px-4 py-4 active:scale-[0.99] transition-transform duration-100"
      aria-label={`Using ${pct}% of your spending budget. View the full breakdown.`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] text-slate-800 dark:text-white">
            Using <span className={`font-bold ${textClass}`}>{pct}%</span> of spending budget
          </p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {fmt(totals.spent)} of {fmt(totals.budget)} across {count} categor{count === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <span
          className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center
            bg-white dark:bg-white/[0.08] border border-slate-200/80 dark:border-white/[0.10]
            text-slate-500 dark:text-slate-300 shadow-sm"
          aria-hidden="true"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </span>
      </div>

      <BudgetMeter pct={totals.pct} className="mt-3.5" />
    </Link>
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


