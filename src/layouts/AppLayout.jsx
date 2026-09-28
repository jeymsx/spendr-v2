import { useState, useRef, useEffect, useLayoutEffect, Suspense } from 'react'
import { Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ErrorBoundary from '../components/ErrorBoundary'
import AddActionSheet from '../components/AddActionSheet'
import QuickLogOverlay from '../components/QuickLogOverlay'
import { useSyncManager } from '../components/SyncManager'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { isSupabaseConfigured } from '../lib/supabase'
import WhatsNewModal, { CURRENT_VERSION } from '../components/WhatsNewModal'
import { AchievementProvider } from '../context/AchievementContext'
import Moments from '../components/achievements/Moments'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { canPullToSync } from '../lib/pullToSync'

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
  const pullRef = useRef(/** @type {HTMLDivElement|null} */ (null))
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

  /* `?log=quick` opens the quick log: where the daily check-in's notification
     points (lib/nudge.js), so a tap on "Anything to log today?" lands on the
     one field that logs it. The parameter comes off at once, so Back or a
     reload does not open it again. */
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('log') !== 'quick') return
    params.delete('log')
    const rest = params.toString()
    navigate({ pathname: location.pathname, search: rest ? `?${rest}` : '' }, { replace: true })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuickOpen(true)
  }, [location.search, location.pathname, navigate])

  // Disable browser scroll restoration so it can't override our manual reset
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])

  /* ── Where each page was scrolled to ──
     Every entry in the history remembers how far down it was, so Back lands
     where you left it - scroll a long Transactions list, open one, come back,
     and you are still at the row you tapped, as in any native app. It used
     to reset to the top on every navigation, Back included. Kept per history
     entry (location.key), so the same page opened twice keeps two places. */
  const navType = useNavigationType()
  const positions = useRef(/** @type {Map<string, number>} */ (new Map()))
  const shownKey = useRef(location.key)
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => { frame = 0; positions.current.set(shownKey.current, el.scrollTop) })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame) }
  }, [])

  // Reset scroll to top on every navigation — useLayoutEffect fires before paint
  // so iOS Safari cannot restore the previous scroll position after the reset.
  useLayoutEffect(() => {
    const el = mainRef.current
    shownKey.current = location.key
    const saved = navType === 'POP' ? positions.current.get(location.key) : undefined
    if (el) el.scrollTop = 0
    window.scrollTo(0, 0)
    /* Back to a page you had scrolled: put it back as soon as there is enough
       page to put it back on - a lazy page and its live queries arrive a few
       frames after the route does. Insights keeps its own place, with its own
       zoom back into the card (pages/Insights.jsx). A touch or a wheel in the
       meantime wins: never fight the thumb. */
    if (!el || !saved || location.pathname === '/insights') return
    let gaveUp = false
    let raf = 0
    let tries = 0
    const stop = () => { gaveUp = true }
    el.addEventListener('touchstart', stop, { passive: true })
    el.addEventListener('wheel', stop, { passive: true })
    const place = () => {
      if (gaveUp) return
      if (el.scrollHeight - el.clientHeight >= saved - 1 || ++tries > 90) el.scrollTop = saved
      else raf = requestAnimationFrame(place)
    }
    place()
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('touchstart', stop)
      el.removeEventListener('wheel', stop)
    }
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = mainRef.current
    if (!el) return

    /* The hint follows the finger - its height, set here straight on the
       element so a pull never re-renders the page - and eases back when the
       finger lifts. Only crossing a threshold changes React state, which is
       what swaps the words. */
    const READY = 64
    let startX = 0
    /** @type {'x'|'y'|null} */
    let axis = null
    const setHint = (/** @type {number} */ h, /** @type {boolean} */ settle) => {
      const hint = pullRef.current
      if (!hint) return
      hint.style.transition = settle ? 'height 220ms cubic-bezier(0.2, 0.9, 0.25, 1)' : 'none'
      hint.style.height = `${h}px`
    }
    const cancel = () => {
      touchStartY.current = -1
      setHint(0, true)
      setPullState('idle')
    }

    const onTouchStart = (e) => {
      axis = null
      /* Not on a form, an editor or a settings page (lib/pullToSync.js), and
         not while anything modal is up - a sheet, the QR lightbox - whose own
         drags are not a pull on the page behind. */
      if (!canPullToSync(pathnameRef.current)
        || document.querySelector('.sheet-overlay, [aria-modal="true"]')) { touchStartY.current = -1; return }
      startX = e.touches[0].clientX
      touchStartY.current = el.scrollTop <= 0 ? e.touches[0].clientY : -1
    }
    const onTouchMove = (e) => {
      if (touchStartY.current < 0) return
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - touchStartY.current
      /* Which way the finger is going, decided once it has gone somewhere.
         Sideways is a rail being scrolled or a row being swiped: not a pull,
         however far down it drifts on the way. */
      if (!axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (axis === 'x' || el.scrollTop > 0) { cancel(); return }
      if (dy > 8) {
        // Resistance, like the platform's own: the hint moves at under half the finger.
        setHint(Math.min(56, (dy - 8) * 0.45), false)
        setPullState(dy > READY ? 'ready' : 'pulling')
      } else {
        setHint(0, false)
        setPullState('idle')
      }
    }
    const onTouchEnd = (e) => {
      if (touchStartY.current < 0) return
      const dy = e.changedTouches[0].clientY - touchStartY.current
      const ready = axis === 'y' && dy > READY
      cancel()
      if (ready) {
        if (canSyncRef.current) runSyncRef.current()
        else promptRef.current?.()
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', cancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', cancel)
    }
  }, [])

  return (
    /* AchievementProvider wraps the layout rather than the app: it is inside
       the router, because the celebration's Back to Home navigates, and
       outside every page, so the one evaluation is shared by every screen
       that reads it - and so something earned on the way to another route
       still gets its moment. */
    <AchievementProvider>
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
        {/* Pull-to-sync hint. Its height is the gesture's (see the touch
            listeners above); the arrow turns over once letting go would sync. */}
        <div
          ref={pullRef}
          aria-hidden="true"
          className="flex items-center justify-center gap-1.5 overflow-hidden text-xs font-medium text-primary/80"
          style={{ height: 0 }}
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
            strokeLinecap="round" strokeLinejoin="round"
            className="transition-transform duration-200"
            style={{ transform: pullState === 'ready' ? 'rotate(180deg)' : 'none' }}
          >
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
          {!canSync
            ? (pullState === 'ready' ? 'Release to sign in and sync' : 'Sync needs an account')
            : (pullState === 'ready' ? 'Release to sync' : 'Pull to sync')}
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

      {/* Renders nothing until something is actually earned. */}
      <Moments />
    </div>
    </AchievementProvider>
  )
}
