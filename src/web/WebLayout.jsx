import { useState, useRef, useLayoutEffect, Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import WebSidebar from './WebSidebar'
import AddActionSheet from '../components/AddActionSheet'
import ErrorBoundary from '../components/ErrorBoundary'

function PageFallback() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '60dvh' }}>
      <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

/**
 * Desktop shell: persistent sidebar, scrolling content column.
 *
 * Deliberately mirrors AppLayout's structure — same ErrorBoundary and Suspense
 * placement, so a page that throws or is still loading keeps the sidebar
 * mounted and navigable, and the boundary resets on navigation.
 */
export default function WebLayout() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const location = useLocation()
  const mainRef = useRef(null)

  // Scroll the content column, not the window — the sidebar must stay put.
  useLayoutEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [location.key])

  return (
    <div className="h-[100dvh] flex overflow-hidden">
      <WebSidebar onAddClick={() => setSheetOpen(true)} />

      <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1400px] px-8 py-8">
          <div key={location.pathname} className="page-enter">
            <ErrorBoundary compact resetKeys={[location.pathname]}>
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      </main>

      {/* Reused as-is. It's a bottom sheet, which is the one visibly phone-ish
          thing in the desktop shell until the add flows get their own modals. */}
      <AddActionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  )
}
