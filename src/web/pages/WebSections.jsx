import { lazy } from 'react'
import { Navigate, matchPath, useLocation } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { WebSplit, WebPaneEmpty } from '../components/WebPane'

/**
 * The split views: each is a phone page as the list, and the phone's page
 * for the thing picked as the detail (the nested routes in WebApp.jsx).
 *
 * Nothing here draws a row or a figure. What each section adds is where the
 * halves sit, which list item to mark as open, whether the right half has
 * anything behind it to go back to, and what shows on the right before
 * anything is picked.
 */

const Accounts  = lazy(() => import('../../pages/Accounts'))
const Insights  = lazy(() => import('../../pages/Insights'))
const Recurring = lazy(() => import('../../pages/Recurring'))
const Debts     = lazy(() => import('../../pages/Debts'))
const Goals     = lazy(() => import('../../pages/Goals'))
const Budget    = lazy(() => import('../../pages/Budget'))
const Settings  = lazy(() => import('../../pages/Settings'))

/** The id in the address at `pattern`, or null. @param {string} pattern @param {string} pathname */
function paramOf(pattern, pathname, key = 'id') {
  const m = matchPath(pattern, pathname)
  return m?.params?.[key] ?? null
}

/** A `[data-web-id]` selector for the list item open on the right. @param {string|null} id */
const byId = (id) => (id == null ? null : `[data-web-id="${String(id).replace(/["\\]/g, '\\$&')}"]`)

/**
 * Whether the list on the left has anything in it to pick - undefined until
 * it is read.
 *
 * The right half says "pick one to see it here" only when there is one to
 * pick. With the list empty, the list's own empty state - its picture, its
 * line, its way out - is the whole message, and a second picture beside it,
 * often the same one, asked for a choice between none.
 *
 * @param {() => Promise<number>} count
 */
function useAnyToPick(count) {
  return useLiveQuery(async () => (await count()) > 0, [], undefined)
}

// ── Accounts ─────────────────────────────────────────────────────────────────

export function WebAccountsSection() {
  const { pathname } = useLocation()
  const id = paramOf('/accounts/:id/*', pathname)
  return (
    <WebSplit
      label="Accounts"
      list={<Accounts />}
      selected={id && id !== 'new' ? byId(id) : null}
      isRoot={(p) => !!matchPath('/accounts/:id', p) && !p.endsWith('/new')}
    />
  )
}

/** Opens the first account, as a mail app opens the first message. */
export function AccountsIndex() {
  const first = useLiveQuery(async () => {
    const all = await db.accounts.toArray()
    // None at all: the list says so itself (useAnyToPick).
    if (!all.length) return false
    const shown = all.filter(a => !a.archived && !a.parentName)
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
    return shown[0] ?? null
  }, [], undefined)
  if (first === undefined || first === false) return null
  if (first) return <Navigate to={`/accounts/${first.id}`} replace />
  return <WebPaneEmpty art="wallet" title="No accounts yet" body="Add your cash, a bank or an e-wallet, and it opens here." />
}

// ── Insights ─────────────────────────────────────────────────────────────────

export function WebInsightsSection() {
  const { pathname } = useLocation()
  const page = paramOf('/insights/:page', pathname, 'page')
  return (
    <WebSplit
      label="Insights"
      list={<Insights />}
      listWidth={440}
      detailWidth={820}
      selected={page ? `[data-zoom="${page}"]` : null}
    />
  )
}

// ── Recurring ────────────────────────────────────────────────────────────────

export function WebRecurringSection() {
  const { pathname } = useLocation()
  const id = paramOf('/recurring/:id/*', pathname)
  return (
    <WebSplit
      label="Recurring"
      list={<Recurring />}
      selected={id && id !== 'new' ? byId(`recurring-${id}`) : null}
      isRoot={(p) => !!matchPath('/recurring/:id', p) && !p.endsWith('/new')}
    />
  )
}

export function RecurringIndex() {
  const any = useAnyToPick(() => db.recurring.count())
  if (!any) return null
  return <WebPaneEmpty art="calendar" title="Pick one to see it here" body="Its history, what it costs a year, and when it comes next." />
}

// ── Debts ────────────────────────────────────────────────────────────────────

export function WebDebtsSection() {
  const { pathname } = useLocation()
  const key = paramOf('/debts/person/:key', pathname, 'key')
  return (
    <WebSplit
      label="Debts"
      list={<Debts />}
      selected={key ? byId(`person-${decodeURIComponent(key)}`) : null}
    />
  )
}

export function DebtsIndex() {
  const any = useAnyToPick(() => db.debts.count())
  if (!any) return null
  return <WebPaneEmpty art="scale" title="Pick someone to see it here" body="Everything between the two of you, and what is still open." />
}

// ── Goals ────────────────────────────────────────────────────────────────────

export function WebGoalsSection() {
  const { pathname } = useLocation()
  const id = paramOf('/goals/:id', pathname)
  return <WebSplit label="Goals" list={<Goals />} selected={byId(id ? `goal-${id}` : null)} />
}

export function GoalsIndex() {
  const any = useAnyToPick(() => db.goals.count())
  if (!any) return null
  return <WebPaneEmpty art="target" title="Pick a goal to see it here" body="What it is set to, how far along it is, and what is left." />
}

// ── Budget ───────────────────────────────────────────────────────────────────

export function WebBudgetSection() {
  const { pathname } = useLocation()
  const name = paramOf('/categories/:name', pathname, 'name')
  return (
    <WebSplit
      label="Budget"
      list={<Budget />}
      listWidth={460}
      selected={name ? byId(`category-${decodeURIComponent(name)}`) : null}
    />
  )
}

export function BudgetIndex() {
  // The Budget page lists the categories with a limit, and nothing without one.
  const any = useAnyToPick(() => db.categories.filter(c => (c.budget ?? 0) > 0).count())
  if (!any) return null
  return <WebPaneEmpty art="gauge" title="Pick a category to see it here" body="Where its money went, month by month." />
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function WebSettingsSection() {
  const { pathname } = useLocation()
  const page = paramOf('/settings/:page', pathname, 'page')
  return <WebSplit label="Settings" list={<Settings />} selected={page ? byId(`settings-${page}`) : null} detailWidth={680} />
}
