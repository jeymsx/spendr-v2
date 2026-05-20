import { Navigate, Outlet, Routes, Route } from 'react-router-dom'
import { useLiveQuery } from './hooks/useLiveQuery'
import db from './db/db'
import AppLayout from './layouts/AppLayout'
import SyncManager from './components/SyncManager'
import Dashboard from './pages/Dashboard'
import AddExpense from './pages/AddExpense'
import AddInflow from './pages/AddInflow'
import Transfer from './pages/Transfer'
import Transactions from './pages/Transactions'
import Insights from './pages/Insights'
import Accounts from './pages/Accounts'
import Debts from './pages/Debts'
import Recurring from './pages/Recurring'
import Settings from './pages/Settings'
import ImportWizard from './pages/ImportWizard'
import Onboarding from './pages/Onboarding'
import Login from './pages/Login'

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
  )
}
