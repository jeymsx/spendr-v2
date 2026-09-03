import { lazy, Suspense } from 'react'
import { useViewMode } from './web/useViewMode'
import App from './App'

// Lazy so a phone never downloads the desktop UI, and vice versa is free
// because App is the eager default.
const WebApp = lazy(() => import('./web/WebApp'))

function Booting() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0d1117]">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

/**
 * Picks which UI to mount: the existing mobile app, or the desktop one.
 *
 * This is the only integration point between the two — everything below it is
 * either untouched (src/pages, src/components, src/layouts) or entirely new
 * (src/web). Both trees sit inside the same providers, so contexts, Dexie and
 * sync are shared rather than duplicated.
 */
export default function Shell() {
  const mode = useViewMode()

  if (mode === 'desktop') {
    return (
      <Suspense fallback={<Booting />}>
        <WebApp />
      </Suspense>
    )
  }
  return <App />
}
