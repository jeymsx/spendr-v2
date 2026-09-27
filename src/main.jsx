import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { CurrencyProvider } from './context/CurrencyContext'
import FxContextSync from './context/FxContextSync'
import ErrorBoundary from './components/ErrorBoundary'
import { recordCrash } from './lib/crashLog'
import { version as APP_VERSION } from '../package.json'
import Shell from './Shell'
import LockGate from './components/lock/LockGate'
/* Inter, from this origin rather than Google Fonts: the same three weights
   the stylesheet link used to ask for, so nothing renders differently, and
   one fewer third party contacted on every launch. Each weight brings all of
   its script subsets behind unicode-range, exactly as Google served them -
   the browser only downloads the ones a page actually uses. */
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import './index.css'

/**
 * Recover when a lazily-imported chunk has gone from the server.
 *
 * Every page here is code-split, and the filenames are content-hashed, so a
 * deploy replaces them. A tab left open across a deploy still holds the old
 * import map and asks for a chunk that no longer exists. registerType is
 * 'autoUpdate', which means the new service worker takes over live tabs and
 * drops the previous precache, so the old chunk is gone from both the network
 * and the cache. Clicking anything not yet loaded - the PDF report is the
 * likeliest, since it is only fetched when you export - then fails.
 *
 * Reloading picks up the new index.html and its new import map. Guarded by a
 * session flag so a genuinely missing chunk cannot become a reload loop: the
 * second failure in a session is left to surface as a normal error.
 */
const RELOADED_KEY = 'spendr-chunk-reload'
function recoverFromStaleChunk(event) {
  let alreadyTried = false
  try { alreadyTried = sessionStorage.getItem(RELOADED_KEY) === '1' } catch { /* private mode */ }
  if (alreadyTried) return
  try { sessionStorage.setItem(RELOADED_KEY, '1') } catch { /* ignore */ }
  event?.preventDefault?.()
  window.location.reload()
}

// Vite fires this for a failed module preload.
window.addEventListener('vite:preloadError', recoverFromStaleChunk)

// A dynamic import that fails outright surfaces as an unhandled rejection.
window.addEventListener('unhandledrejection', (e) => {
  const msg = String(e?.reason?.message ?? e?.reason ?? '')
  if (/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(msg)) {
    recoverFromStaleChunk(e)
    // A stale chunk after a deploy is expected and self-healing, not a crash.
    return
  }
  /* Everything else that nothing caught: a failed write, a rejected fetch, a
     Dexie error inside an async handler. ErrorBoundary only sees errors thrown
     DURING RENDER, and most of what goes wrong in this app happens in an
     event handler or a promise, which React never hears about. */
  recordCrash(e?.reason ?? msg, 'promise', { version: APP_VERSION })
})

// And a synchronous throw outside React - an event handler, a timer.
window.addEventListener('error', (e) => {
  recordCrash(e?.error ?? e?.message, 'error', { version: APP_VERSION })
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <CurrencyProvider>
                <FxContextSync />
                <LockGate>
                  <Shell />
                </LockGate>
              </CurrencyProvider>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
