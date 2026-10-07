import { useEffect, useLayoutEffect } from 'react'
import { matchPath, useLocation } from 'react-router-dom'

/**
 * The browser tab's title, per page: "Budget · Spendr" rather than "Spendr"
 * on every tab, so tabs, history and bookmarks say where they go.
 *
 * Two layers. Every address has a name here (`titleFor`), set as the page
 * opens (PageTitle, in Shell, for both the phone and the desktop). A page
 * about one thing - an account, a goal, a bill - then names it with
 * `usePageTitle`, which runs after and so wins: "BPI · Spendr".
 *
 * First match wins, so the longer paths come before the shorter.
 */
const NAMES = /** @type {Array<[string, string]>} */ ([
  ['/', 'Home'],
  ['/login', 'Sign in'],
  ['/onboarding', 'Welcome'],
  ['/transactions/deleted', 'Recently deleted'],
  ['/transactions/:id/edit', 'Edit transaction'],
  ['/transactions', 'Transactions'],
  ['/expense', 'Add expense'],
  ['/inflow', 'Add inflow'],
  ['/transfer', 'Transfer'],
  ['/accounts/new', 'New account'],
  ['/accounts/:id/edit', 'Edit account'],
  ['/accounts/:id/statements', 'Statement history'],
  ['/accounts/:id', 'Account'],
  ['/accounts', 'Accounts'],
  ['/insights/forecast/settings', 'Forecast settings'],
  ['/insights/trend/settings', 'Trend settings'],
  ['/insights/spending', 'Spending'],
  ['/insights/expenses', 'Expenses'],
  ['/insights/accounts', 'By account'],
  ['/insights/trend', 'Trend'],
  ['/insights/net-worth', 'Net worth'],
  ['/insights/forecast', 'Forecast'],
  ['/insights', 'Insights'],
  ['/budget', 'Budget'],
  ['/goals/:id', 'Goal'],
  ['/goals', 'Goals'],
  ['/recurring/new', 'New recurring'],
  ['/recurring/:id/edit', 'Edit recurring'],
  ['/recurring/:id', 'Recurring'],
  ['/recurring', 'Recurring'],
  ['/debts/person/:key', 'Debts'],
  ['/debts', 'Debts'],
  ['/notes/*', 'Notes'],
  ['/notes', 'Notes'],
  ['/achievements', 'Achievements'],
  ['/badges', 'Achievements'],
  ['/notifications', 'Notifications'],
  ['/recap/*', 'Wrapped'],
  ['/recap', 'Wrapped'],
  ['/import', 'Import'],
  ['/settings/profile', 'Profile'],
  ['/settings/preferences', 'Preferences'],
  ['/settings/sync', 'Cloud sync'],
  ['/settings/reports', 'Reports & exports'],
  ['/settings/backup', 'Backup & restore'],
  ['/settings/changelog', 'What’s new'],
  ['/settings/app-lock', 'App lock'],
  ['/settings/accent', 'Accent colour'],
  ['/settings/categories', 'Categories'],
  ['/settings/budgets', 'Budget limits'],
  ['/settings/rates', 'Exchange rates'],
  ['/settings/templates', 'Quick templates'],
  ['/settings/deleted', 'Recently deleted'],
  ['/settings/privacy', 'Privacy policy'],
  ['/settings/terms', 'Terms of use'],
  ['/settings/*', 'Settings'],
  ['/settings', 'Settings'],
])

/** The name of the page at `pathname`, or null. @param {string} pathname */
export function titleFor(pathname) {
  const cat = matchPath('/categories/:name', pathname)
  if (cat) return safeDecode(cat.params.name ?? '') || 'Category'
  return NAMES.find(([p]) => matchPath(p, pathname))?.[1] ?? null
}

/** @param {string} s */
function safeDecode(s) {
  try { return decodeURIComponent(s) } catch { return s }
}

/** "Budget · Spendr", or "Spendr" with no name. @param {string|null|undefined} name */
export function setPageTitle(name) {
  if (typeof document === 'undefined') return
  document.title = name ? `${name} · Spendr` : 'Spendr'
}

/** Keeps the tab's title in step with the address. Rendered once, in Shell. @returns {null} */
export function PageTitle() {
  const { pathname } = useLocation()
  useLayoutEffect(() => { setPageTitle(titleFor(pathname)) }, [pathname])
  return null
}

/**
 * A page about one thing names it in the tab, once its name is known - an
 * account's, a goal's. Nothing while it is still loading: the address's own
 * name stays until then.
 *
 * @param {string|null|undefined} name
 */
export function usePageTitle(name) {
  useEffect(() => { if (name) setPageTitle(name) }, [name])
}
