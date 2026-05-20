import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fullSync } from '../lib/sync'
import db from '../db/db'

// ── Context ───────────────────────────────────────────────────────────────────

const SyncContext = createContext(null)

export function useSyncManager() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSyncManager must be used inside SyncManager')
  return ctx
}

// ── Status icons ──────────────────────────────────────────────────────────────

function IconSpinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  )
}

function IconCheckCircle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function IconAlertCircle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

// ── Indicator pill ────────────────────────────────────────────────────────────

function SyncIndicator({ status }) {
  const visible = status !== 'idle'

  if (!visible) return null

  const styles = {
    syncing: {
      pill: 'bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900',
      icon: <span className="animate-spin inline-block"><IconSpinner /></span>,
      label: 'Syncing…',
    },
    success: {
      pill: 'bg-emerald-500 text-white',
      icon: <IconCheckCircle />,
      label: 'Synced',
    },
    error: {
      pill: 'bg-red-500 text-white',
      icon: <IconAlertCircle />,
      label: 'Sync failed',
    },
  }[status] ?? null

  if (!styles) return null

  return (
    <div
      className={`fixed top-14 right-4 z-[400] flex items-center gap-1.5 px-3 py-1.5 rounded-full
        text-[11px] font-semibold shadow-lg
        transition-all duration-300
        ${styles.pill}`}
    >
      {styles.icon}
      <span>{styles.label}</span>
    </div>
  )
}

// ── SyncManager ───────────────────────────────────────────────────────────────
// Acts as both a React Router layout route (renders <Outlet />) and a
// context provider. Manages auto-sync on mount and window-focus.

export default function SyncManager() {
  const { user } = useAuth()
  const [status, setStatus] = useState('idle') // 'idle' | 'syncing' | 'success' | 'error'
  const syncingRef = useRef(false)
  const dismissRef = useRef(null)

  const runSync = useCallback(async () => {
    if (!user?.id || syncingRef.current) return

    syncingRef.current = true
    clearTimeout(dismissRef.current)
    setStatus('syncing')

    try {
      await fullSync(user.id)
      await db.meta.put({ key: 'lastSync', value: new Date().toISOString() })
      setStatus('success')
      dismissRef.current = setTimeout(() => setStatus('idle'), 3000)
    } catch (err) {
      console.error('[SyncManager]', err)
      setStatus('error')
      dismissRef.current = setTimeout(() => setStatus('idle'), 5000)
    } finally {
      syncingRef.current = false
    }
  }, [user?.id])

  // Sync on mount / user change
  useEffect(() => {
    if (user?.id) runSync()
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync on window focus, but at most once per 60 s (prevents firing on every tap/click in some browsers)
  useEffect(() => {
    let lastFocusSync = 0
    const onFocus = () => {
      if (!user?.id) return
      const now = Date.now()
      if (now - lastFocusSync < 60_000) return
      lastFocusSync = now
      runSync()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user?.id, runSync])

  // Cleanup on unmount
  useEffect(() => () => clearTimeout(dismissRef.current), [])

  return (
    <SyncContext.Provider value={{ status, runSync }}>
      <SyncIndicator status={status} />
      <Outlet />
    </SyncContext.Provider>
  )
}
