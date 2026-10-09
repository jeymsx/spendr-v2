import { lazy, Suspense, useEffect, useState } from 'react'
import { useViewMode } from './web/useViewMode'
import App from './App'
import { PageTitle } from './lib/pageTitle'
import { dbReady, storageProblem } from './db/db'
import StorageBlocked from './components/StorageBlocked'

// Lazy so a phone never downloads the desktop UI, and vice versa is free
// because App is the eager default.
const WebApp = lazy(() => import('./web/WebApp'))

function Booting() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
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
  // A browser that will not keep data gets told so, not a spinner for good (db/db.js storageProblem).
  const [blocked, setBlocked] = useState(false)
  useEffect(() => { dbReady.then(() => { if (storageProblem) setBlocked(true) }) }, [])

  // Marks the document so index.css can restyle the shared sheets as centred
  // modals on desktop. Doing it in CSS rather than in each component keeps one
  // implementation of every sheet — the alternative was a desktop copy of
  // fifteen of them.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('web', mode === 'desktop')
    return () => root.classList.remove('web')
  }, [mode])

  if (blocked) return <StorageBlocked />

  // The browser tab names the page, in either layout (lib/pageTitle.js).
  if (mode === 'desktop') {
    return (
      <>
        <PageTitle />
        <Suspense fallback={<Booting />}>
          <WebApp />
        </Suspense>
      </>
    )
  }
  return (
    <>
      <PageTitle />
      <App />
    </>
  )
}
