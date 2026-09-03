import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { OnboardingGuard } from '../App'
import SyncManager from '../components/SyncManager'
import WebLayout from './WebLayout'
import WebFormPage from './WebFormPage'

// Public routes are full-screen flows in both UIs, so the mobile components are
// used unchanged and outside the shell.
const Login      = lazy(() => import('../pages/Login'))
const Onboarding = lazy(() => import('../pages/Onboarding'))

// Desktop pages. Every route has one now.
const WebDashboard    = lazy(() => import('./pages/WebDashboard'))
const WebTransactions = lazy(() => import('./pages/WebTransactions'))
const WebInsights     = lazy(() => import('./pages/WebInsights'))
const WebAccounts     = lazy(() => import('./pages/WebAccounts'))
const WebRecurring    = lazy(() => import('./pages/WebRecurring'))
const WebDebts        = lazy(() => import('./pages/WebDebts'))
const WebSettings     = lazy(() => import('./pages/WebSettings'))
const WebImport       = lazy(() => import('./pages/WebImport'))

// Single-column forms, reused whole inside desktop chrome (see WebFormPage).
const AddExpense   = lazy(() => import('../pages/AddExpense'))
const AddInflow    = lazy(() => import('../pages/AddInflow'))
const Transfer     = lazy(() => import('../pages/Transfer'))

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
              <Route path="/debts"        element={<WebDebts />} />
              <Route path="/recurring"    element={<WebRecurring />} />
              <Route path="/settings"     element={<WebSettings />} />
              {/* No outer title: each of these forms renders its own header with
                  a back button, so adding one above it reads as a duplicate. */}
              <Route path="/expense"  element={<WebFormPage><AddExpense /></WebFormPage>} />
              <Route path="/inflow"   element={<WebFormPage><AddInflow /></WebFormPage>} />
              <Route path="/transfer" element={<WebFormPage><Transfer /></WebFormPage>} />
              <Route path="/import"   element={<WebImport />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
