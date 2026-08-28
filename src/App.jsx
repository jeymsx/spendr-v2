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
const Debts        = lazy(() => import('./pages/Debts'))
const Recurring    = lazy(() => import('./pages/Recurring'))
const Settings     = lazy(() => import('./pages/Settings'))
const ImportWizard = lazy(() => import('./pages/ImportWizard'))
const Onboarding   = lazy(() => import('./pages/Onboarding'))
const Login        = lazy(() => import('./pages/Login'))

// ── Shared spinner ─────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0d1117]">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

// ── Onboarding guard ───────────────────────────────────────────────────────────
// Redirects to /onboarding until meta 'onboarded' is truthy.

function OnboardingGuard() {
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
              <Route path="/accounts"     element={<Accounts />} />
              <Route path="/debts"        element={<Debts />} />
              <Route path="/recurring"    element={<Recurring />} />
              <Route path="/settings"     element={<Settings />} />
              <Route path="/import"       element={<ImportWizard />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
