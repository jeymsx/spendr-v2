import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Routes, Route } from 'react-router-dom'
import { useLiveQuery } from './hooks/useLiveQuery'
import db from './db/db'
import AppLayout from './layouts/AppLayout'
import SyncManager from './components/SyncManager'

// Dashboard stays eager: it is the landing route, so lazy-loading it would add
// a chunk round-trip in front of first paint for the most common path.
import Dashboard from './pages/Dashboard'

// Everything else is split out. This keeps the heavy, rarely-mounted deps out of
// the initial bundle: recharts (Insights), papaparse (ImportWizard),
// dnd-kit + react-image-crop (Accounts, Settings).
const AddExpense   = lazy(() => import('./pages/AddExpense'))
const AddInflow    = lazy(() => import('./pages/AddInflow'))
const Transfer     = lazy(() => import('./pages/Transfer'))
const Transactions = lazy(() => import('./pages/Transactions'))
const Insights     = lazy(() => import('./pages/Insights'))
const Accounts     = lazy(() => import('./pages/Accounts'))
const AccountDetail = lazy(() => import('./pages/AccountDetail'))
const AccountNew    = lazy(() => import('./pages/AccountNew'))
const AccountEdit   = lazy(() => import('./pages/AccountEdit'))
const Budget        = lazy(() => import('./pages/Budget'))
const CategoryDetail = lazy(() => import('./pages/CategoryDetail'))
const Debts        = lazy(() => import('./pages/Debts'))
const Goals        = lazy(() => import('./pages/Goals'))
const GoalDetail   = lazy(() => import('./pages/GoalDetail'))
const Recurring    = lazy(() => import('./pages/Recurring'))
const RecurringDetail = lazy(() => import('./pages/RecurringDetail'))
const RecurringForm   = lazy(() => import('./pages/RecurringForm'))
const Badges       = lazy(() => import('./pages/Badges'))
const Settings     = lazy(() => import('./pages/Settings'))
const SettingsAccent = lazy(() => import('./pages/SettingsAccent'))
// Named exports, because both share their implementation with the desktop
// modal that lives in the same file - see CategoryManager / BudgetManager.
const SettingsCategories = lazy(() => import('./pages/Settings').then(m => ({ default: m.CategoriesPage })))
const SettingsBudgets    = lazy(() => import('./pages/Settings').then(m => ({ default: m.BudgetsPage })))
const SettingsTemplates  = lazy(() => import('./pages/Settings').then(m => ({ default: m.TemplatesPage })))
const ImportWizard = lazy(() => import('./pages/ImportWizard'))
const Onboarding   = lazy(() => import('./pages/Onboarding'))
const Login        = lazy(() => import('./pages/Login'))

// ── Shared spinner ─────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

// ── Onboarding guard ───────────────────────────────────────────────────────────
// Redirects to /onboarding until meta 'onboarded' is truthy.

export function OnboardingGuard() {
  // db.meta.get() returns `undefined` for missing keys AND useLiveQuery starts
  // with `undefined` while the query is in-flight — use null as the "not found"
  // sentinel so we can tell the two apart.
  const meta = useLiveQuery(async () => (await db.meta.get('onboarded')) ?? null, [], undefined)
  if (meta === undefined) return <LoadingScreen />
  if (!meta?.value) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    // Outer boundary covers the routes rendered outside AppLayout (/login,
    // /onboarding). Pages inside AppLayout suspend against its own inner
    // boundary instead, so the navbar never unmounts on navigation.
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* Public */}
        <Route path="/login"      element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />

        {/* App — offline-first; SyncManager activates only when signed in */}
        <Route element={<SyncManager />}>
          <Route element={<OnboardingGuard />}>
            <Route element={<AppLayout />}>
              <Route path="/"             element={<Dashboard />} />
              <Route path="/expense"      element={<AddExpense />} />
              <Route path="/inflow"       element={<AddInflow />} />
              <Route path="/transfer"     element={<Transfer />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/insights"     element={<Insights />} />
              <Route path="/budget"       element={<Budget />} />
              {/* The name, not an id. A transaction stores its category as a
                  string, so the name is the key the whole app already joins
                  on - and it means a deleted category's history is still
                  reachable by its own URL. Encoded at the call site, because
                  a category may be called "Food & Drink". */}
              <Route path="/categories/:name" element={<CategoryDetail />} />
              <Route path="/accounts"     element={<Accounts />} />
              <Route path="/accounts/new" element={<AccountNew />} />
              <Route path="/accounts/:id" element={<AccountDetail />} />
              <Route path="/accounts/:id/edit" element={<AccountEdit />} />
              <Route path="/debts"        element={<Debts />} />
              <Route path="/goals"        element={<Goals />} />
              <Route path="/goals/:id"    element={<GoalDetail />} />
              <Route path="/recurring"    element={<Recurring />} />
              {/* Before /recurring/:id, or "new" matches as an id. */}
              <Route path="/recurring/new" element={<RecurringForm />} />
              <Route path="/recurring/:id/edit" element={<RecurringForm />} />
              <Route path="/recurring/:id" element={<RecurringDetail />} />
              <Route path="/badges"       element={<Badges />} />
              <Route path="/settings"     element={<Settings />} />
              <Route path="/settings/accent" element={<SettingsAccent />} />
              <Route path="/settings/categories" element={<SettingsCategories />} />
              <Route path="/settings/budgets"    element={<SettingsBudgets />} />
              <Route path="/settings/templates"  element={<SettingsTemplates />} />
              <Route path="/import"       element={<ImportWizard />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
