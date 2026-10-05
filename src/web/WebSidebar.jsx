import { useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useLiveQuery } from '../hooks/useLiveQuery'
import db from '../db/db'
import { quickActionCounts } from '../pages/dashboard/shared'
import { useBaseCurrency } from '../context/CurrencyContext'
import useRates from '../hooks/useRates'
import {
  IHome, IList, IWallet, IChart, IGauge, ITarget, IRepeat, IUsers, INote, ITrophy, ISettings, ISidebar,
} from './ui/icons'

/**
 * The desktop's navigation: every section in one quiet column.
 *
 * Grouped as the app thinks of them - your money, your plans, the rest -
 * with Settings at the foot. The badges are the phone's own (Home's
 * quick-action counts: only what you can act on, and acting clears them).
 * Adding, searching, notifications and your account live in the top bar;
 * importing a CSV is on Transactions, beside exporting one.
 *
 * Folds to its icons (the button beside the name, or the logo when folded),
 * remembered per browser; folded by default on a window under 1280px.
 */

/**
 * @typedef {{to: string, label: string, Icon: import('react').ComponentType<{size?: number}>, badge?: number,
 *   also?: string}} NavEntry  `also`: another address that is this section too
 */

/** Where the sidebar's folded or open state is kept, per browser. */
const COLLAPSE_KEY = 'spendr-sidebar'

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
      className={({ isActive }) => `d-nav-item${isActive || alsoHere ? ' is-active' : ''}`}
      title={label}
    >
      <span className="d-nav-icon" aria-hidden="true"><Icon size={18} /></span>
      <span className="d-nav-label flex-1 truncate">{label}</span>
      {badge > 0 && (
        <>
          <span className="d-nav-count" aria-label={`${badge} to see to`}>{badge > 9 ? '9+' : badge}</span>
          <span className="d-nav-dot" aria-hidden="true" />
        </>
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
    { to: '/', label: 'Home', Icon: IHome },
    { to: '/transactions', label: 'Transactions', Icon: IList },
    { to: '/accounts', label: 'Accounts', Icon: IWallet },
    { to: '/insights', label: 'Insights', Icon: IChart },
  ]
  /** @type {NavEntry[]} */
  const plans = [
    // A category's page is part of the budget.
    { to: '/budget', label: 'Budget', Icon: IGauge, also: '/categories/' },
    { to: '/goals', label: 'Goals', Icon: ITarget, badge: counts.goals },
    { to: '/recurring', label: 'Recurring', Icon: IRepeat, badge: counts.bills },
    { to: '/debts', label: 'Debts', Icon: IUsers, badge: counts.debts },
  ]
  /** @type {NavEntry[]} */
  const more = [
    { to: '/notes', label: 'Notes', Icon: INote },
    { to: '/achievements', label: 'Achievements', Icon: ITrophy },
  ]

  return (
    <aside className={`d-sidebar shrink-0 h-full flex flex-col${collapsed ? ' is-collapsed' : ''}`}>
      <div className="d-brand">
        {collapsed ? (
          <button type="button" className="web-brand-toggle" onClick={toggle} aria-label="Open the sidebar" title="Open the sidebar">
            <img src="/icons/icon-192.png" alt="" width={32} height={32} className="d-brand-logo web-brand" />
            <span className="web-brand-swap" aria-hidden="true"><ISidebar size={18} /></span>
          </button>
        ) : (
          <>
            <img src="/icons/icon-192.png" alt="" width={32} height={32} className="d-brand-logo" />
            <span className="d-brand-name flex-1">Spendr</span>
            <button type="button" className="web-sidebar-fold" onClick={toggle} aria-label="Close the sidebar" title="Close the sidebar">
              <ISidebar size={16} />
            </button>
          </>
        )}
      </div>

      <nav className="d-nav flex-1 min-h-0 overflow-y-auto no-scrollbar" aria-label="Spendr">
        {money.map(i => <NavItem key={i.to} {...i} end={i.to === '/'} />)}
        <p className="d-nav-heading">Plan</p>
        {plans.map(i => <NavItem key={i.to} {...i} />)}
        <p className="d-nav-heading">More</p>
        {more.map(i => <NavItem key={i.to} {...i} />)}
      </nav>

      <div className="d-sidebar-foot">
        <NavItem to="/settings" label="Settings" Icon={ISettings} />
      </div>
    </aside>
  )
}
