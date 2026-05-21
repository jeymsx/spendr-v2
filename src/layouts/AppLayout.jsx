import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Navbar from '../components/Navbar'
import AddActionSheet from '../components/AddActionSheet'
import { useSyncManager } from '../components/SyncManager'

export default function AppLayout() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const { runSync } = useSyncManager()
  const location = useLocation()
  const mainRef = useRef(null)
  const touchStartY = useRef(-1)
  const [pullState, setPullState] = useState('idle') // idle | pulling | ready
  const runSyncRef   = useRef(runSync)
  const pathnameRef  = useRef(location.pathname)
  useEffect(() => { runSyncRef.current  = runSync },          [runSync])
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
      if (dy > 64) runSyncRef.current()
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
        className="flex-1 overflow-y-auto min-h-0 relative"
      >
        {/* Pull-to-refresh hint */}
        <div className={`flex items-center justify-center overflow-hidden transition-all duration-200 text-xs font-medium text-primary/70 ${
          pullState !== 'idle' ? 'h-9' : 'h-0'
        }`}>
          {pullState === 'ready' ? '↑ Release to sync' : '↓ Pull to sync'}
        </div>

        {/* pb-nav ensures content isn't hidden under the fixed navbar */}
        <div key={location.pathname} className="page-enter pb-nav">
          <Outlet />
        </div>
      </main>

      <Navbar onAddClick={() => setSheetOpen(true)} />
      <AddActionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  )
}
