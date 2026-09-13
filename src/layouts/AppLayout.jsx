import { useState, useRef, useEffect, useLayoutEffect, Suspense } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ErrorBoundary from '../components/ErrorBoundary'
import AddActionSheet from '../components/AddActionSheet'
import QuickLogOverlay from '../components/QuickLogOverlay'
import { useSyncManager } from '../components/SyncManager'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { isSupabaseConfigured } from '../lib/supabase'
import WhatsNewModal, { CURRENT_VERSION } from '../components/WhatsNewModal'
import { BadgeProvider } from '../context/BadgeContext'
import BadgeUnlocked from '../components/BadgeUnlocked'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'

// Shown while a lazy route chunk loads. Sized to roughly a screen so the
// navbar and scroll position stay stable instead of collapsing to zero height.
function PageFallback() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '60dvh' }}>
      <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

export default function AppLayout() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const { runSync } = useSyncManager()
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  /**
   * Whether pulling can actually do anything.
   *
   * runSync returns immediately when there is no user, so signed out the
   * gesture did nothing at all - the affordance appeared, you pulled, and
   * nothing happened or was said. Hiding it was the other option and it is
   * worse: someone signed out would never learn that syncing exists.
   *
   * So the affordance stays and tells the truth instead.
   */
  const canSync = Boolean(user?.id) && isSupabaseConfigured

  const whatsNewMeta = useLiveQuery(async () => (await db.meta.get('whatsNewSeen')) ?? null, [], undefined)
  // undefined = still loading, null = key missing, object = key found
  const showWhatsNew = whatsNewMeta !== undefined && whatsNewMeta?.value !== CURRENT_VERSION
  const [whatsNewDismissed, setWhatsNewDismissed] = useState(false)
  const location = useLocation()
  const mainRef = useRef(null)
  const touchStartY = useRef(-1)
  const [pullState, setPullState] = useState('idle') // idle | pulling | ready
  const runSyncRef   = useRef(runSync)
  const canSyncRef   = useRef(canSync)
  const promptRef    = useRef(null)
  const pathnameRef  = useRef(location.pathname)
  useEffect(() => { runSyncRef.current  = runSync },          [runSync])
  useEffect(() => { canSyncRef.current  = canSync },          [canSync])
  // Refs, because the touch listeners are bound once with an empty dep array;
  // reading canSync directly would capture its first value forever.
  useEffect(() => {
    promptRef.current = () => showToast(
      isSupabaseConfigured ? 'Sign in to sync' : 'Cloud sync is not set up',
      'warning',
      isSupabaseConfigured
        ? { actionLabel: 'Settings', onAction: () => navigate('/settings') }
        : {},
    )
  }, [showToast, navigate])
  useEffect(() => { pathnameRef.current = location.pathname }, [location.pathname])

  // Disable browser scroll restoration so it can't override our manual reset
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])

  // Reset scroll to top on every navigation — useLayoutEffect fires before paint
  // so iOS Safari cannot restore the previous scroll position after the reset.
  useLayoutEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
    window.scrollTo(0, 0)
  }, [location.key])

  useEffect(() => {
    const el = mainRef.current
    if (!el) return

    const noPullRoutes = new Set(['/import'])

    const onTouchStart = (e) => {
      if (noPullRoutes.has(pathnameRef.current)) { touchStartY.current = -1; return }
      // Disable pull-to-refresh while any sheet/modal is open
      if (document.querySelector('.sheet-overlay')) { touchStartY.current = -1; return }
      touchStartY.current = el.scrollTop <= 0 ? e.touches[0].clientY : -1
    }
    const onTouchMove = (e) => {
      if (touchStartY.current < 0) return
      const dy = e.touches[0].clientY - touchStartY.current
      if (dy > 8 && el.scrollTop <= 0) setPullState(dy > 64 ? 'ready' : 'pulling')
      else setPullState('idle')
    }
    const onTouchEnd = (e) => {
      if (touchStartY.current < 0) return
      const dy = e.changedTouches[0].clientY - touchStartY.current
      touchStartY.current = -1
      setPullState('idle')
      if (dy > 64) {
        if (canSyncRef.current) runSyncRef.current()
        else promptRef.current?.()
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  return (
    /* BadgeProvider wraps the layout rather than the app: it is inside the
       router, because the unlock card links to /badges, and outside every
       page, so the one evaluation is shared by the dashboard chip and the
       badges screen instead of running twice - and so a badge earned on the
       way to another route still gets its card. */
    <BadgeProvider>
    <div className="h-[100dvh] flex flex-col overflow-hidden relative">
      {/*
        IMPORTANT: no z-index on <main>. Adding z-index creates a stacking context,
        which would make all fixed sheets/modals rendered inside pages lose against
        the Navbar's z-50 (which is in the parent context). Without z-index, fixed
        children participate in the root stacking context directly, so their z-[100+]
        values properly beat the Navbar's z-50.
      */}
      <main
        id="app-main"
        ref={mainRef}
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none min-h-0 relative no-scrollbar"
      >
        {/* Pull-to-refresh hint */}
        <div className={`flex items-center justify-center overflow-hidden transition-all duration-200 text-xs font-medium text-primary/70 ${
          pullState !== 'idle' ? 'h-9' : 'h-0'
        }`}>
          {!canSync
            ? (pullState === 'ready' ? '↑ Release to sign in and sync' : '↓ Sync needs an account')
            : (pullState === 'ready' ? '↑ Release to sync' : '↓ Pull to sync')}
        </div>

        {/* pb-nav ensures content isn't hidden under the fixed navbar */}
        <div key={location.pathname} className="page-enter pb-nav">
          {/*
            Inner Suspense boundary for the lazy route chunks. It sits inside the
            layout on purpose — suspending here keeps the Navbar mounted, so a
            route's first visit never flashes the whole shell away.
          */}
          {/*
            Page-level boundary, inside the layout: a page that throws keeps the
            Navbar so you can navigate away. resetKeys clears the error on
            navigation, so a bad page doesn't poison the next one.
          */}
          <ErrorBoundary compact resetKeys={[location.pathname]}>
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <Navbar onAddClick={() => setSheetOpen(true)} onQuickLog={() => setQuickOpen(true)} />
      <AddActionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />

      {/* Hold the + to get here. Rendered at the LAYOUT level, so it can blur
          the whole app including the navbar - the navbar is a sibling of
          <main>, so a page-level overlay could never cover it. */}
      {quickOpen && <QuickLogOverlay onClose={() => setQuickOpen(false)} />}
      {showWhatsNew && !whatsNewDismissed && (
        <WhatsNewModal onClose={() => setWhatsNewDismissed(true)} />
      )}

      {/* Renders nothing until a badge is actually earned. */}
      <BadgeUnlocked />
    </div>
    </BadgeProvider>
  )
}
