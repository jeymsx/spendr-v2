import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import WhatsNewModal, { CURRENT_VERSION } from '../components/WhatsNewModal'
import WebSidebar from './WebSidebar'
import WebTopBar from './WebTopBar'
import { CommandProvider } from './CommandPalette'
import ErrorBoundary from '../components/ErrorBoundary'
import { AddFlowProvider } from './AddFlow'
import { AchievementProvider } from '../context/AchievementContext'
import Moments from '../components/achievements/Moments'
import { keepStorage } from '../lib/keepStorage'
import { PageSkeleton } from './ui/Skeletons'

/* A page's code arriving: the outline of a page - a title, figures, two
   panels - rather than a spinner in the middle of the window. */
function PageFallback() {
  return <PageSkeleton />
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
  // What's New, once per version, as the phone's AppLayout shows it.
  const whatsNewMeta = useLiveQuery(async () => (await db.meta.get('whatsNewSeen')) ?? null, [], undefined)
  const [whatsNewDismissed, setWhatsNewDismissed] = useState(false)
  const showWhatsNew = whatsNewMeta !== undefined && whatsNewMeta?.value !== CURRENT_VERSION && !whatsNewDismissed

  return (
    <div className="d-shell web-shell h-[100dvh] flex overflow-hidden">
      <WebSidebar />

      <div className="flex-1 min-w-0 h-full flex flex-col">
        <WebTopBar />
        <main className="web-main flex-1 min-h-0 overflow-hidden relative">
          <div key={section} className="page-enter h-full">
            <ErrorBoundary compact resetKeys={[location.pathname]}>
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {showWhatsNew && <WhatsNewModal onClose={() => setWhatsNewDismissed(true)} />}

      {/* Renders nothing until something is actually earned. */}
      <Moments />
    </div>
  )
}

export default function WebLayout() {
  // As on the phone (layouts/AppLayout.jsx): keep the ledger from being cleared.
  useEffect(() => { keepStorage() }, [])
  // The providers wrap the chrome so both the sidebar and any page can open
  // the add overlay through useAddFlow(), and so the one achievement
  // evaluation - the same as the phone's, in AppLayout - is shared by every
  // page and still celebrates something earned on the way to another.
  return (
    <AchievementProvider>
      <AddFlowProvider>
        <CommandProvider>
          <Chrome />
        </CommandProvider>
      </AddFlowProvider>
    </AchievementProvider>
  )
}
