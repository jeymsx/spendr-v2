import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { OnboardingGuard } from '../App'
import SyncManager from '../components/SyncManager'
import WebLayout from './WebLayout'
import WebToaster from './WebToaster'
import { WebScroll, DETAIL_WIDTH } from './components/WebPane'
import WebFormPage from './WebFormPage'
import PhonePage from './ui/PhonePage'
import {
  WebRecurringSection, RecurringIndex,
  WebDebtsSection, DebtsIndex, WebGoalsSection, GoalsIndex,
  WebSettingsSection, WebNotesSection, NotesIndex,
} from './pages/WebSections'
// The desktop's own styles: loaded with this bundle only, so a phone never
// downloads them.
import './web.css'
import './pro.css'

/**
 * The desktop app: every route the phone has, rendering the phone's page.
 *
 * What the desktop adds is where a page sits (WebLayout, components/WebPane,
 * pages/WebSections) - never a second version of what it does. A feature
 * added to a phone page is on the desktop the moment it lands, reading the
 * same tables and syncing through the same SyncManager.
 *
 * Addresses mirror App.jsx exactly, so a notification's link, a bookmark, or
 * switching layouts mid-page lands on the same thing in either.
 */

// Public routes are full-screen flows in both UIs, used unchanged.
const Login      = lazy(() => import('../pages/Login'))
const Onboarding = lazy(() => import('../pages/Onboarding'))

const WebHome      = lazy(() => import('./pages/WebHome'))
const WebImport    = lazy(() => import('./pages/WebImport'))

const WebTransactions = lazy(() => import('./pages/WebTransactions'))
const RecentlyDeleted = lazy(() => import('../pages/transactions/RecentlyDeleted'))
const EditTransaction = lazy(() => import('../pages/EditTransaction'))
const AddExpense   = lazy(() => import('../pages/AddExpense'))
const AddInflow    = lazy(() => import('../pages/AddInflow'))
const Transfer     = lazy(() => import('../pages/Transfer'))

const WebInsights = lazy(() => import('./pages/WebInsights'))
const ForecastSettings = lazy(() => import('../pages/insights/ForecastSettings'))

const WebAccounts = lazy(() => import('./pages/WebAccounts'))
const WebAccountDetail = lazy(() => import('./pages/WebAccountDetail'))
const AccountNew    = lazy(() => import('../pages/AccountNew'))
const AccountEdit   = lazy(() => import('../pages/AccountEdit'))
const StatementHistory = lazy(() => import('../pages/accounts/StatementHistory'))
const WebBudget = lazy(() => import('./pages/WebBudget'))
const WebCategory = lazy(() => import('./pages/WebCategory'))
const PersonDetail  = lazy(() => import('../pages/debts/PersonDetail'))
const GoalDetail    = lazy(() => import('../pages/GoalDetail'))
const RecurringDetail = lazy(() => import('../pages/RecurringDetail'))
const RecurringForm   = lazy(() => import('../pages/RecurringForm'))

const Notifications = lazy(() => import('../pages/Notifications'))
const NoteEditor    = lazy(() => import('../pages/notes/NoteEditor'))
const NotesDeleted  = lazy(() => import('../pages/notes/NotesDeleted'))
const WebAchievements = lazy(() => import('./pages/WebAchievements'))
const Recap         = lazy(() => import('../pages/recap/RecapPage'))

const SettingsAccent = lazy(() => import('../pages/SettingsAccent'))
const SettingsCategories = lazy(() => import('../pages/Settings').then(m => ({ default: m.CategoriesPage })))
const SettingsBudgets    = lazy(() => import('../pages/Settings').then(m => ({ default: m.BudgetsPage })))
const SettingsTemplates  = lazy(() => import('../pages/Settings').then(m => ({ default: m.TemplatesPage })))
const SettingsRates      = lazy(() => import('../pages/settings/Rates'))
const SettingsPreferences = lazy(() => import('../pages/settings/Preferences'))
const SettingsSync       = lazy(() => import('../pages/settings/Sync'))
const SettingsReports    = lazy(() => import('../pages/settings/Reports'))
const SettingsBackup     = lazy(() => import('../pages/settings/BackupRestore'))
const SettingsChangelog  = lazy(() => import('../pages/settings/Changelog'))
const SettingsAppLock    = lazy(() => import('../pages/settings/AppLock'))
const SettingsProfile    = lazy(() => import('../pages/settings/Profile').then(m => ({ default: m.ProfilePage })))

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

/**
 * A page of one column: from the left edge a split view's list starts at
 * (no padding of its own - the page brings its own, as a list does), as wide
 * as a split view's page, so moving from Accounts to Notifications nothing
 * jumps to the middle of the window.
 *
 * @param {{width?: number, top?: boolean, children: import('react').ReactNode}} props
 */
const Column = ({ width = DETAIL_WIDTH, top = false, children }) => <WebScroll width={width} top={top} start pad={false}>{children}</WebScroll>
/** A form in a card, centred (WebFormPage). @param {{width?: number, children: import('react').ReactNode}} props */
const Form = ({ width = 600, children }) => <WebScroll width={width + 64}><WebFormPage width={width}>{children}</WebFormPage></WebScroll>

export default function WebApp() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <WebToaster />
      <Routes>
        <Route path="/login"      element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />

        {/* Same guards as the mobile tree — sync and the onboarding redirect
            are shared, not reimplemented. */}
        <Route element={<SyncManager />}>
          <Route element={<OnboardingGuard />}>
            <Route element={<WebLayout />}>
              <Route path="/" element={<WebHome />} />

              {/* ── Money ── */}
              <Route path="/transactions" element={<WebTransactions />} />
              <Route path="/transactions/deleted" element={<PhonePage><RecentlyDeleted /></PhonePage>} />
              <Route path="/transactions/:id/edit" element={<Form><EditTransaction /></Form>} />
              <Route path="/expense"  element={<Form><AddExpense /></Form>} />
              <Route path="/inflow"   element={<Form><AddInflow /></Form>} />
              <Route path="/transfer" element={<Form><Transfer /></Form>} />

              <Route path="/accounts" element={<WebAccounts />} />
              <Route path="/accounts/new" element={<PhonePage><AccountNew /></PhonePage>} />
              <Route path="/accounts/:id" element={<WebAccountDetail />} />
              <Route path="/accounts/:id/edit" element={<PhonePage><AccountEdit /></PhonePage>} />
              <Route path="/accounts/:id/statements" element={<PhonePage><StatementHistory /></PhonePage>} />

              <Route path="/insights" element={<WebInsights />} />
              <Route path="/insights/forecast/settings" element={<PhonePage><ForecastSettings /></PhonePage>} />
              <Route path="/insights/:page" element={<WebInsights />} />

              {/* ── Plans ── */}
              <Route path="/budget" element={<WebBudget />} />
              <Route path="/categories/:name" element={<WebCategory />} />
              <Route path="/goals" element={<WebGoalsSection />}>
                <Route index element={<GoalsIndex />} />
                <Route path=":id" element={<GoalDetail />} />
              </Route>
              <Route path="/recurring" element={<WebRecurringSection />}>
                <Route index element={<RecurringIndex />} />
                <Route path="new" element={<RecurringForm />} />
                <Route path=":id" element={<RecurringDetail />} />
                <Route path=":id/edit" element={<RecurringForm />} />
              </Route>
              <Route path="/debts" element={<WebDebtsSection />}>
                <Route index element={<DebtsIndex />} />
                <Route path="person/:key" element={<PersonDetail />} />
              </Route>
              <Route path="/notes" element={<WebNotesSection />}>
                <Route index element={<NotesIndex />} />
                <Route path="deleted" element={<NotesDeleted />} />
                <Route path=":id" element={<NoteEditor />} />
              </Route>

              {/* ── You ── */}
              <Route path="/notifications" element={<Column top><Notifications /></Column>} />
              <Route path="/achievements" element={<WebAchievements />} />
              <Route path="/badges" element={<Navigate to="/achievements?tab=badges" replace />} />
              <Route path="/recap" element={<Column><Recap /></Column>} />
              <Route path="/recap/:month" element={<Column><Recap /></Column>} />
              <Route path="/import" element={<WebScroll width={1200}><WebImport /></WebScroll>} />

              <Route path="/settings" element={<WebSettingsSection />}>
                <Route index element={<Navigate to="/settings/preferences" replace />} />
                <Route path="profile" element={<SettingsProfile />} />
                <Route path="preferences" element={<SettingsPreferences />} />
                <Route path="sync" element={<SettingsSync />} />
                <Route path="reports" element={<SettingsReports />} />
                <Route path="backup" element={<SettingsBackup />} />
                <Route path="changelog" element={<SettingsChangelog />} />
                <Route path="app-lock" element={<SettingsAppLock />} />
                <Route path="accent" element={<SettingsAccent />} />
                <Route path="categories" element={<SettingsCategories />} />
                <Route path="budgets" element={<SettingsBudgets />} />
                <Route path="rates" element={<SettingsRates />} />
                <Route path="templates" element={<SettingsTemplates />} />
                <Route path="*" element={<Navigate to="/settings/preferences" replace />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
