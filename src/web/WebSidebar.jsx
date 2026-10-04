import { useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useLiveQuery } from '../hooks/useLiveQuery'
import db from '../db/db'
import { setViewMode } from './useViewMode'
import WebAddMenu from './WebAddMenu'
import WebSyncStatus from './WebSyncStatus'
import { WebIconHome, WebIconList, WebIconWallet, WebIconChart, WebIconImport, WebIconPhone, WebIconSidebar } from './WebIcons'
import {
  IconBell, IconTarget, IconTrophy, IconDebt, IconBillHistory, IconSettings, IconCalc, IconNotes,
} from '../components/icons'
import { quickActionCounts } from '../pages/dashboard/shared'
import { useBaseCurrency } from '../context/CurrencyContext'
import useRates from '../hooks/useRates'

/**
 * The desktop's navigation: every place the phone can reach, in one column.
 *
 * On the phone, four are tabs and the rest hang off Home - its quick actions
 * (Goals, Debts, Recurring) and the discs in its header (the bell, Settings).
 * A landscape screen has the room to list them all, so nothing is two taps
 * away. The badges are the phone's own: Home's quick-action counts (the same
 * rule - only what you can act on, and acting clears it) and the bell's
 * unread count.
 */

/**
 * @typedef {{to: string, label: string, Icon: import('react').ComponentType<any>, badge?: number,
 *   also?: string}} NavEntry  `also`: another address that is this section too
 */

/** Where the sidebar's folded or open state is kept, per browser. */
const COLLAPSE_KEY = 'spendr-sidebar'

/**
 * Folded to its icons, or open: what was last chosen, and before anything
 * was, folded on a window too narrow to give a list and its page room.
 */
function initiallyCollapsed() {
  try {
    const saved = localStorage.getItem(COLLAPSE_KEY)
    if (saved) return saved === 'collapsed'
  } catch { /* storage off */ }
  return typeof window !== 'undefined' && window.innerWidth < 1280
}

/** @param {NavEntry & {end?: boolean}} props */
function NavItem({ to, label, Icon, badge = 0, end = false, also }) {
  const { pathname } = useLocation()
  const alsoHere = !!also && pathname.startsWith(also)
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `web-nav-item${isActive || alsoHere ? ' is-active' : ''}`}
      // The name, for the narrow sidebar that shows only the icons.
      title={label}
    >
      <span className="web-nav-icon" aria-hidden="true"><Icon size={19} /></span>
      <span className="flex-1 truncate">{label}</span>
      {badge > 0 && (
        <span className="web-nav-badge" aria-label={`${badge} to see to`}>{badge > 9 ? '9+' : badge}</span>
      )}
    </NavLink>
  )
}

export default function WebSidebar() {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed)
  const toggle = () => setCollapsed(c => {
    const next = !c
    try { localStorage.setItem(COLLAPSE_KEY, next ? 'collapsed' : 'open') } catch { /* storage off */ }
    return next
  })
  const nameMeta = useLiveQuery(() => db.meta.get('displayName'), [], null)
  /* Only a name you gave. Home can fall back to "Good morning, there!", but
     under the logo "there" reads as a label for nothing. */
  const name = nameMeta?.value?.trim() || ''
  const unread = useLiveQuery(() => db.notifications.where('read').equals(0).count(), [], 0)

  // The phone's quick-action badges, read the same way (dashboard/shared.js).
  const recurring = useLiveQuery(() => db.recurring.toArray(), [], [])
  const debts = useLiveQuery(() => db.debts.toArray(), [], [])
  const goals = useLiveQuery(() => db.goals.toArray(), [], [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])
  const base = useBaseCurrency()
  const { table: rates } = useRates()
  const counts = useMemo(
    () => quickActionCounts({ recurring, debts, goals, accounts, base, rates }),
    [recurring, debts, goals, accounts, base, rates],
  )

  /** @type {NavEntry[]} */
  const money = [
    { to: '/', label: 'Home', Icon: WebIconHome },
    { to: '/transactions', label: 'Transactions', Icon: WebIconList },
    { to: '/accounts', label: 'Accounts', Icon: WebIconWallet },
    { to: '/insights', label: 'Insights', Icon: WebIconChart },
  ]
  /** @type {NavEntry[]} */
  const plans = [
    // A category's page opens beside the budget (WebSections).
    { to: '/budget', label: 'Budget', Icon: IconCalc, also: '/categories/' },
    { to: '/goals', label: 'Goals', Icon: IconTarget, badge: counts.goals },
    { to: '/recurring', label: 'Recurring', Icon: IconBillHistory, badge: counts.bills },
    { to: '/debts', label: 'Debts', Icon: IconDebt, badge: counts.debts },
    { to: '/notes', label: 'Notes', Icon: IconNotes },
  ]
  /** @type {NavEntry[]} */
  const you = [
    { to: '/notifications', label: 'Notifications', Icon: IconBell, badge: unread },
    { to: '/achievements', label: 'Achievements', Icon: IconTrophy },
    { to: '/import', label: 'Import', Icon: WebIconImport },
    { to: '/settings', label: 'Settings', Icon: IconSettings },
  ]

  return (
    <aside className={`web-sidebar shrink-0 h-full flex flex-col${collapsed ? ' is-collapsed' : ''}`}>
      {/* The mark, as the sign-in screen, the lock screen and Settings show
          it - not a letter in a tile. Folded, the mark is the way to unfold:
          under the pointer it turns into the sidebar's icon. Open, the
          sidebar's icon beside the name folds it. */}
      <div className="web-brand-row flex items-center gap-2.5">
        {collapsed ? (
          <button type="button" className="web-brand-toggle" onClick={toggle} aria-label="Open the sidebar" title="Open the sidebar">
            <img src="/icons/icon-192.png" alt="" width={36} height={36} className="web-brand" />
            <span className="web-brand-swap" aria-hidden="true"><WebIconSidebar /></span>
          </button>
        ) : (
          <>
            <img src="/icons/icon-192.png" alt="" width={36} height={36} className="web-brand" />
            <div className="web-brand-text flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-white leading-tight">Spendr</p>
              {name && <p className="text-11 text-slate-500 dark:text-slate-400 truncate">{name}</p>}
            </div>
            <button type="button" className="web-sidebar-fold" onClick={toggle} aria-label="Close the sidebar" title="Close the sidebar">
              <WebIconSidebar />
            </button>
          </>
        )}
      </div>

      <div className="px-4 pb-4">
        <WebAddMenu />
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 pb-3 flex flex-col" aria-label="Spendr">
        {money.map(i => <NavItem key={i.to} {...i} end={i.to === '/'} />)}
        <p className="web-nav-heading">Plans</p>
        {plans.map(i => <NavItem key={i.to} {...i} />)}
        <p className="web-nav-heading">You</p>
        {you.map(i => <NavItem key={i.to} {...i} />)}
      </nav>

      <div className="web-sidebar-foot px-3 py-3 flex flex-col gap-1">
        <WebSyncStatus />
        <button type="button" onClick={() => setViewMode('mobile')} className="web-nav-item web-nav-item-quiet" title="Switch to mobile view">
          <span className="web-nav-icon" aria-hidden="true"><WebIconPhone /></span>
          <span className="flex-1 truncate text-left">Switch to mobile view</span>
        </button>
      </div>
    </aside>
  )
}
