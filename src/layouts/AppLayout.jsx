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
import { keepStorage } from '../lib/keepStorage'
import { useBack } from '../hooks/useBack'

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
  const pageRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const pullRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const back = useBack()
  const backRef = useRef(back)
  useEffect(() => { backRef.current = back }, [back])
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

  /* Past setup, so the ledger is worth keeping: ask the browser not to clear
     it when space runs low (lib/keepStorage.js). Once a session; the browser
     remembers the answer. */
  useEffect(() => { keepStorage() }, [])

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

  /* ── Swipe from the left edge to go back ──
     What every iPhone app does on a page you reached from another, and what
     an installed web app does not get from iOS: Safari's own edge swipe is
     not there once Spendr is on the Home Screen. So in that mode, and only
     there, a swipe that starts at the left edge drags the page with the
     finger and, let go past a third of the way (or flicked), finishes the
     slide and goes back - to the page behind, or the one above when the
     page was opened cold (hooks/useBack.js). Android has the system's back
     gesture, and a browser tab has its own, so neither gets a second one.
     Not on the tabs' own pages, which have nothing to go back to, and not
     while a sheet is up. */
  useEffect(() => {
    const el = mainRef.current
    if (!el || typeof navigator === 'undefined' || !(/** @type {any} */ (navigator).standalone)) return
    const EDGE = 20
    const TABS = new Set(['/', '/transactions', '/accounts', '/insights'])
    /* Scrolled sideways already: a drag right there is the rail scrolling
       back, not a way out of the page. At the rail's start it can only be
       the swipe, which is what iOS does too. */
    const inScrolledRail = (/** @type {EventTarget|null} */ t) => {
      for (let n = /** @type {HTMLElement|null} */ (t instanceof HTMLElement ? t : null); n && n !== el; n = n.parentElement) {
        if (n.scrollLeft > 0 && n.scrollWidth > n.clientWidth) return true
      }
      return false
    }
    /* What the page's own Back button does - a step back in a flow with
       steps (New account, the import wizard), the zoom back into an
       Insights card - so the swipe and the button never disagree. The
       generic back only when a page has no button of its own. */
    const pageBack = () => {
      const btn = /** @type {HTMLButtonElement|null} */ (pageRef.current?.querySelector('header button'))
      const label = btn?.getAttribute('aria-label') ?? ''
      if (btn && /back|previous|leave|close/i.test(label)) btn.click()
      else backRef.current()
    }
    /** @type {{x: number, y: number, t: number}|null} */
    let start = null
    /** @type {'x'|'y'|null} */
    let axis = null
    let dx = 0
    let leaving = false
    const slide = (/** @type {number} */ x, /** @type {boolean} */ settle) => {
      const page = pageRef.current
      if (!page) return
      page.style.transition = settle ? 'transform 240ms cubic-bezier(0.2, 0.9, 0.25, 1), box-shadow 240ms' : 'none'
      page.style.transform = x ? `translateX(${x}px)` : ''
      /* A hairline as well as the shadow: on a dark page over a dark ground
         the shadow alone is invisible, and the page floats with no edge. */
      page.style.boxShadow = x ? '-1px 0 0 rgba(148, 163, 184, 0.28), -16px 0 32px -12px rgba(0, 0, 0, 0.45)' : ''
    }
    const onStart = (/** @type {TouchEvent} */ e) => {
      /* A second finger mid-swipe - a palm, the other thumb - calls the
         swipe off. It used to leave the page frozen half off the screen. */
      if (start && e.touches.length > 1) { start = null; slide(0, true); return }
      start = null
      const t = e.touches[0]
      if (leaving || e.touches.length !== 1 || t.clientX > EDGE || TABS.has(pathnameRef.current)) return
      if (document.querySelector('.sheet-overlay, [aria-modal="true"]')) return
      if (inScrolledRail(e.target)) return
      start = { x: t.clientX, y: t.clientY, t: performance.now() }
      axis = null
      dx = 0
    }
    const onMove = (/** @type {TouchEvent} */ e) => {
      if (!start) return
      const t = e.touches[0]
      const mx = t.clientX - start.x
      const my = t.clientY - start.y
      if (!axis && (Math.abs(mx) > 8 || Math.abs(my) > 8)) axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'
      if (axis === 'y') { start = null; return }
      if (axis !== 'x') return
      // The page is being dragged, not scrolled.
      e.preventDefault()
      dx = Math.max(0, mx)
      slide(dx, false)
    }
    const onEnd = (/** @type {TouchEvent} */ e) => {
      if (e.touches.length > 0) return
      if (!start || axis !== 'x') { start = null; return }
      const speed = dx / Math.max(1, performance.now() - start.t)
      start = null
      const width = el.clientWidth || window.innerWidth
      if (dx > width / 3 || (speed > 0.5 && dx > 40)) {
        leaving = true
        slide(width, true)
        setTimeout(() => {
          leaving = false
          pageBack()
          // If nothing navigated (a page with nowhere to go), bring it back.
          requestAnimationFrame(() => { if (pageRef.current?.style.transform) slide(0, true) })
        }, 200)
      } else {
        slide(0, true)
      }
    }
    /* The system taking the touch away (a notification pulled down, a call)
       is not a release: spring back, as iOS does with an interrupted pop. */
    const onCancel = () => {
      if (!start) return
      start = null
      slide(0, true)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
    }
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
    const deadline = performance.now() + 2000
    const stop = () => { gaveUp = true }
    el.addEventListener('touchstart', stop, { passive: true })
    el.addEventListener('wheel', stop, { passive: true })
    const place = () => {
      if (gaveUp) return
      const max = el.scrollHeight - el.clientHeight
      if (max >= saved - 1) { el.scrollTop = saved; return }
      /* As far as the page goes so far - which is also what makes a long
         list (ui/InfiniteList) load its next rows, so the page grows toward
         where you were instead of stopping at its first screenful. */
      el.scrollTop = max
      if (performance.now() < deadline) raf = requestAnimationFrame(place)
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
        <div key={location.pathname} ref={pageRef} className="page-enter pb-nav">
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
