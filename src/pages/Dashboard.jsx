import { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { getCreditStatus, nextDueDate } from '../utils/creditCycle'
import { useToast } from '../context/ToastContext'
import TemplateConfirmSheet from '../components/TemplateConfirmSheet'
import { IconBank, IconCard, IconChevronRight, IconPhone, IconWallet, IconWarning, IconBell,
  IconCardUI, IconReceipt, IconTransferUI } from '../components/icons'
import CategoryGlyph from '../components/CategoryGlyph'
import { scheduledCutoff } from '../utils/scheduled'
import { accountBrand } from '../lib/accountBrands'
import { normalizeDesign } from '../lib/cardDesigns'
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

/**
 * The line under the greeting: {cat?, Icon?, text}.
 *
 * It used to return one string with the glyph interpolated into it, which is
 * why the home screen's first line of type carried a raw U+26A0 and U+1F514 -
 * OS-font emoji sitting directly under a drawn settings icon.
 *
 * A shape rather than a string, because a component cannot be interpolated
 * into a template literal. The budget cases pass the CATEGORY, so the line
 * renders whatever that category renders as everywhere else; the rest pass an
 * icon directly.
 */
function getContextHint(txAll, budgetCategories, upcomingRecurring) {
  const _d    = new Date()
  const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`
  const dow   = new Date().getDay() // 0=Sun, 6=Sat

  // Budget warnings take top priority
  const overBudget = (budgetCategories ?? []).find(c => c.spent > c.budget)
  if (overBudget) return { cat: overBudget, Icon: IconWarning, text: `Over budget on ${overBudget.name.toLowerCase()}` }

  const nearBudget = (budgetCategories ?? []).find(c => c.budget > 0 && (c.spent / c.budget) >= 0.85)
  if (nearBudget) return { cat: nearBudget, Icon: IconWarning, text: `${nearBudget.name.toLowerCase()} budget almost full` }

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
  if (overdue) return { Icon: IconWarning, text: `${overdue.name} is overdue` }
  const urgentBill = bills.find(r => daysAway(r) <= 1)
  if (urgentBill) return { Icon: IconBell, text: `${urgentBill.name} due ${daysAway(urgentBill) === 0 ? 'today' : 'tomorrow'}` }

  // Today's spending
  const todayTotal = (txAll ?? [])
    .filter(t => t.type === 'expense' && (t.date ?? '').startsWith(today))
    .reduce((s, t) => s + (t.amount ?? 0), 0)
  if (todayTotal > 0) {
    const compact = todayTotal >= 1000
      ? '₱' + (todayTotal / 1000).toFixed(1) + 'K'
      : '₱' + todayTotal.toFixed(0)
    return { text: `${compact} spent today` }
  }

  // Day-of-week fallbacks
  if (dow === 1) return { text: 'New week, fresh start' }
  if (dow === 5) return { text: 'Almost the weekend' }
  if (dow === 0 || dow === 6) return { text: 'Enjoy your day off' }
  return { text: 'No spending yet today' }
}

function ContextHint({ hint }) {
  const { cat, Icon, text } = hint ?? {}
  return (
    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
      {/* The budget cases carry the CATEGORY, so this line shows the same icon
          the Budget page and every transaction row show for it. It used to
          pass the raw emoji straight through, which left the first line of
          type on the home screen disagreeing with the rest of the app about
          what Food looks like. CategoryGlyph still falls back to the emoji for
          a category with no mapped icon. */}
      {cat
        ? <CategoryGlyph cat={cat} size={13} className="shrink-0" />
        : Icon ? <Icon size={12} className="shrink-0" /> : null}
      <span className="truncate">{text}</span>
    </p>
  )
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
  const actionCounts = useMemo(() => {
    // One boundary for all three, so two badges cannot disagree about what
    // "today" is if the clock ticks over mid-render.
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const onOrBefore = (iso) => {
      if (!iso) return false
      const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
      return !Number.isNaN(d.getTime()) && d <= today
    }

    const bills = (recurring ?? [])
      .filter(r => r.active && onOrBefore(r.nextDate)).length

    const debtCount = (debts ?? []).filter(d =>
      Math.max(0, (d.amount ?? 0) - (d.amountPaid ?? 0)) > 0 && onOrBefore(d.dueDate)).length

    const alloc = allocateGoals({ goals: goalRows ?? [], accounts: accounts ?? [] })
    const goals = alloc.active.filter(g => g.complete).length

    return { bills, debts: debtCount, goals }
  }, [recurring, debts, goalRows, accounts])

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
      <header className="flex items-center justify-between px-5 pt-safe-header pb-2">
        <div>
          <h1 className="text-xl tracking-tight text-slate-500 dark:text-slate-400">
            {getGreeting()},{' '}
            <span className={`font-semibold text-slate-900 dark:text-white transition-opacity duration-150 ${userMetaLoaded ? 'opacity-100' : 'opacity-0'}`}>
              {userName}
            </span>!
          </h1>
          <ContextHint hint={getContextHint(txAll, budgetCategories, upcomingRecurring)} />
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
          </div>
        </section>
      )}


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
      {/* Headed like Accounts, Budget and Recent, because it is the same kind
          of thing: a top-level block of this screen.
 
          It started as small uppercase caps, copied from the reference app -
          but there, "UPCOMING" is a group divider INSIDE one continuous
          transaction list, a peer of "THU, 20 JUL". Borrowing that
          typography for a standalone card borrowed the wrong hierarchy, and
          sitting directly under the Budget block it read as a sub-part of
          it rather than a section in its own right. */}
      <SectionHeader
        title="Upcoming"
        right={
          /* The total covers the rows on screen, not every future bill - a
             figure that disagreed with the two rows under it would be worse
             than no figure at all. */
          <span className="text-[13px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
            −{fmtCompact(total)}
          </span>
        }
      />
      <div className="card rounded-2xl overflow-hidden mt-3">
        {items.map((item, i) => (
          <UpcomingRow key={item.key} item={item} isLast={i === items.length - 1} />
        ))}
      </div>
    </section>
  )
}

// ── Quick actions ──────────────────────────────────────────────────────────────

/* Four glyphs, one set: 24x24, 2px stroke on integer coordinates so the edges
   land on pixel boundaries at 1x, round caps, no fill, currentColor. Drawn
   from primitives rather than freehand curves, which is what stops one of
   four looking hand-made next to its neighbours. */

function IconArrowOut() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  )
}

function IconArrowIn() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12l7 7 7-7" />
    </svg>
  )
}

function IconTarget() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Concentric at r=10/6/2. The outer ring overshoots an 18x18 square on
          purpose: a circle drawn to the same box reads smaller than one. */}
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

function IconBanknote() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  )
}

function IconRepeat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

function IconTransfer() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3L4 7l4 4" />
      <path d="M4 7h16" />
      <path d="M16 21l4-4-4-4" />
      <path d="M20 17H4" />
    </svg>
  )
}

/**
 * One circle and its label.
 *
 * The label is the accessible name and the glyph is decorative, so the icon
 * carries aria-hidden and the link needs no aria-label - a screen reader
 * reads "Goals, link" rather than "Goals Goals".
 */
function QuickAction({ to, icon, label, badge = 0 }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform duration-75"
      /* The count is part of the link's name, not a separate announcement:
         "Bills, 2 need attention, link". A bare "2" floating next to the
         label would be read out with no idea what it counted. */
      aria-label={badge > 0 ? `${label}, ${badge} need${badge === 1 ? 's' : ''} attention` : undefined}
    >
      {/* `card` rather than a bespoke fill: same glass as the budget and
          transaction panels, and it tracks that material if it ever changes.

          The glyph is the navbar's inactive icon weight - soft grey, not solid
          white - which took one utility rather than two because of how the
          numbers fall.

          The navbar itself uses `text-slate-400 dark:text-slate-500`, and
          copying that pair verbatim would have shipped a failing graphic:
          slate-400 on the white card is 2.56:1, under the 3:1 WCAG 1.4.11
          asks of an icon that means something. (It is one of the 235
          instances of that pair noted in plan.md - the shades are the wrong
          way round app-wide.)

          slate-500 works in BOTH themes, so there is no dark: variant here at
          all: 4.76:1 on the light card, 3.74:1 on the dark one, which is
          exactly the navbar's own dark weight. Same softness, no failure. */}
      <span className="relative">
        <span className="card w-11 h-11 rounded-full flex items-center justify-center
          text-slate-500">
          {icon}
        </span>
        {/* Straddling the disc's edge rather than tucked inside it. Inside, an
            18px disc on a 44px one eats a third of the glyph's room and reads
            as part of the icon; on the corner it reads as applied to it,
            which is what a notification is. -top/-right of 1.5 puts its
            centre almost exactly on the circle's 45 degree point.

            Capped at 9+. The disc has to stay a disc - a three-digit count
            would stretch it into a pill, and past nine the exact number stops
            being the point anyway. */}
        {badge > 0 && (
          <span
            className="qa-badge absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1
              rounded-full flex items-center justify-center
              text-[10px] font-bold tabular-nums leading-none"
            aria-hidden="true"
          >
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 text-center leading-tight">
        {label}
      </span>
    </Link>
  )
}

/**
 * Six doors, below the accounts.
 *
 * This replaced two rectangles, which replaced three, and the shape is the
 * point: the home screen was cards all the way down, so a row of discs reads
 * as "things you do" against everything above and below being "things you
 * have". No card behind the row - boxing it would put the rectangle straight
 * back - though each disc IS the card material, so the row still belongs to
 * the same surface family as the panels around it.
 *
 * Six rather than four because four left 16px of air either side of every
 * disc in an 81px column. Six columns are 58px, which is a disc and its
 * breathing room and nothing spare.
 *
 * Order is deliberate. Goals, Debts and Recurring come first because none of
 * them has another entry point anywhere in the app - and Recurring's only
 * other home, the Upcoming rows, renders nothing at all on a week when
 * nothing is due. Expense, Inflow and Transfer follow, in the order the add
 * sheet lists them, because the FAB already reaches all three; here they are
 * one tap instead of two.
 *
 * Only the first three can carry a count, and that is not an oversight:
 * Goals, Debts and Bills are PLACES, and a place can have a backlog. Expense,
 * Inflow and Transfer are verbs - there is nothing waiting for you behind
 * them, so a badge there would have nothing to count.
 *
 * Every glyph is the accent, not red for Expense and green for Inflow the way
 * the add sheet colours them. Three hues among six discs would read as a
 * legend that means something, when the only thing being encoded is "these go
 * to different pages" - the labels already say that, and the destination
 * pages carry the semantics.
 */
function QuickActions({ counts = {} }) {
  return (
    // mt-8, not mt-5. Measured: mt-5 left 20px between the account cards and
    // the discs while the Budget heading below sat 32px away, and the eye
    // reads that as the row belonging to the carousel. 32px is the gap every
    // other section on this screen uses, so matching it makes the row a peer
    // rather than an appendix - and makes the space above and below it equal.
    <section className="px-5 mt-8">
      <div className="grid grid-cols-6 gap-1">
        <QuickAction to="/goals"     icon={<IconTarget />}    label="Goals"    badge={counts.goals} />
        <QuickAction to="/debts"     icon={<IconBanknote />}  label="Debts"    badge={counts.debts} />
        <QuickAction to="/recurring" icon={<IconRepeat />}    label="Bills"    badge={counts.bills} />
        <QuickAction to="/expense"   icon={<IconArrowOut />}  label="Expense" />
        <QuickAction to="/inflow"    icon={<IconArrowIn />}   label="Inflow" />
        <QuickAction to="/transfer"  icon={<IconTransfer />}  label="Transfer" />
      </div>
    </section>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, actionLabel, actionTo, right = null, px = false }) {
  return (
    <div className={`flex items-baseline justify-between ${px ? 'px-5' : ''}`}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold text-slate-800 dark:text-white">{title}</h2>
        {subtitle && (
          <span className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</span>
        )}
      </div>
      {/* A value rather than a link. Upcoming puts its total here, where
          every other section on this screen puts its "See all". */}
      {right}
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
        '--card-from': brand.from,
        '--card-to': brand.to,
        // Slightly taller than a card's true 1.586 so the balance and its
        // label have room to breathe; the Accounts faces keep the exact ratio.
        aspectRatio: '1.45',
      }}
      data-brand={brand.key}
      data-design={normalizeDesign(acct.design)}
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
        <span className="leading-none shrink-0"><CategoryGlyph cat={cat} size={14} /></span>
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
        className="cat-tile w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
        style={{ '--cat-color': cat?.color ?? '#64748b' }}
      >
        <CategoryGlyph cat={cat} size={18} emoji="💸" />
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


