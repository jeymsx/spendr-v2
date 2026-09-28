import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import WebSidebar from './WebSidebar'
import ErrorBoundary from '../components/ErrorBoundary'
import { AddFlowProvider } from './AddFlow'
import { AchievementProvider } from '../context/AchievementContext'
import Moments from '../components/achievements/Moments'

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

/**
 * The part of the address that names a section: '/accounts/12/edit' is
 * Accounts. A split view keeps its list mounted as the right half changes,
 * so the page only enters afresh when the section does.
 *
 * @param {string} pathname
 */
const sectionOf = (pathname) => pathname.split('/')[1] || 'home'

/**
 * Desktop shell: the sidebar, and the page beside it, filling the window.
 *
 * Each page lays itself out (components/WebPane.jsx): one scrolling column,
 * or a list and its detail side by side, each scrolling on its own. So the
 * shell does not scroll - it only holds them.
 *
 * Same ErrorBoundary and Suspense placement as the phone's AppLayout, so a
 * page that throws or is still loading keeps the sidebar there to leave by.
 */
function Chrome() {
  const location = useLocation()
  const section = sectionOf(location.pathname)

  return (
    <div className="web-shell h-[100dvh] flex overflow-hidden">
      <WebSidebar />

      <main className="web-main flex-1 min-w-0 h-full overflow-hidden relative">
        <div key={section} className="page-enter h-full">
          <ErrorBoundary compact resetKeys={[location.pathname]}>
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      {/* Renders nothing until something is actually earned. */}
      <Moments />
    </div>
  )
}

export default function WebLayout() {
  // The providers wrap the chrome so both the sidebar and any page can open
  // the add overlay through useAddFlow(), and so the one achievement
  // evaluation - the same as the phone's, in AppLayout - is shared by every
  // page and still celebrates something earned on the way to another.
  return (
    <AchievementProvider>
      <AddFlowProvider>
        <Chrome />
      </AddFlowProvider>
    </AchievementProvider>
  )
}
