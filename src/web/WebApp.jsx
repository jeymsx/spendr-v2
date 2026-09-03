import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { OnboardingGuard } from '../App'
import SyncManager from '../components/SyncManager'
import WebLayout from './WebLayout'
import MobileFallback from './MobileFallback'

// Public routes are full-screen flows in both UIs, so the mobile components are
// used unchanged and outside the shell.
const Login      = lazy(() => import('../pages/Login'))
const Onboarding = lazy(() => import('../pages/Onboarding'))

// Desktop pages, added one per phase. Anything not yet converted renders the
// mobile page inside MobileFallback so every route works from day one.
const WebDashboard    = lazy(() => import('./pages/WebDashboard'))
const WebTransactions = lazy(() => import('./pages/WebTransactions'))
const WebInsights     = lazy(() => import('./pages/WebInsights'))
const WebAccounts     = lazy(() => import('./pages/WebAccounts'))

// Still on the mobile layout, in a compact column.
const Debts        = lazy(() => import('../pages/Debts'))
const Recurring    = lazy(() => import('../pages/Recurring'))
const Settings     = lazy(() => import('../pages/Settings'))
const ImportWizard = lazy(() => import('../pages/ImportWizard'))
const AddExpense   = lazy(() => import('../pages/AddExpense'))
const AddInflow    = lazy(() => import('../pages/AddInflow'))
const Transfer     = lazy(() => import('../pages/Transfer'))

function Compact({ title, children }) {
  return <MobileFallback title={title}>{children}</MobileFallback>
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0d1117]">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

export default function WebApp() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login"      element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />

        {/* Same guards as the mobile tree — sync and the onboarding redirect
            are shared, not reimplemented. */}
        <Route element={<SyncManager />}>
          <Route element={<OnboardingGuard />}>
            <Route element={<WebLayout />}>
              <Route path="/"             element={<WebDashboard />} />

              <Route path="/transactions" element={<WebTransactions />} />
              <Route path="/accounts"     element={<WebAccounts />} />
              <Route path="/insights"     element={<WebInsights />} />
              <Route path="/debts"        element={<Compact title="Debts"><Debts /></Compact>} />
              <Route path="/recurring"    element={<Compact title="Recurring"><Recurring /></Compact>} />
              <Route path="/settings"     element={<Compact title="Settings"><Settings /></Compact>} />
              <Route path="/import"       element={<Compact title="Import"><ImportWizard /></Compact>} />
              <Route path="/expense"      element={<Compact title="Add Expense"><AddExpense /></Compact>} />
              <Route path="/inflow"       element={<Compact title="Add Income"><AddInflow /></Compact>} />
              <Route path="/transfer"     element={<Compact title="Transfer"><Transfer /></Compact>} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
