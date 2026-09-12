import { useState, useRef, useEffect } from 'react'
import { IconBank, IconCard, IconPhone, IconWallet, IconWarning, IconBell } from '../../components/icons'
import CategoryGlyph from '../../components/CategoryGlyph'

// ── Formatters ─────────────────────────────────────────────────────────────────

export function fmtDate(dateStr) {
  if (!dateStr) return ''
  const d    = new Date(dateStr)
  const now  = new Date()
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (d.toDateString() === now.toDateString())  return 'Today'
  if (d.toDateString() === yest.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

export function getGreeting() {
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
export function getContextHint(txAll, budgetCategories, upcomingRecurring) {
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

export function ContextHint({ hint }) {
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

export function useCountUp(target, duration = 950) {
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

export const ACCOUNT_ICON = {
  cash:    { icon: <IconWallet />,  label: 'Cash'     },
  savings: { icon: <IconBank />,    label: 'Savings'  },
  credit:  { icon: <IconCard />,    label: 'Credit'   },
  ewallet: { icon: <IconPhone />,   label: 'E-wallet' },
  bank:    { icon: <IconBank />,    label: 'Bank'     },
}

// ── Date helpers ───────────────────────────────────────────────────────────────

export function monthPrefix() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}
