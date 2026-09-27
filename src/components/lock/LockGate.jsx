import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { supabase } from '../../lib/supabase'
import {
  LOCK_KEY, awayTooLong, cancelRecovery, clearAway, clearLock, clearTries, forgetFaceIdTest, locksOnLaunch, noteAway,
  noteReload, readAway, readLock, recoveryOutcome, saveLock, spendReload,
} from '../../lib/appLock'

/* The lock screen is only ever needed by someone who turned the lock on, so
   it is fetched when it is - the gate that decides stays in the first bundle,
   the screen, the keypad and the passkey checks do not. Precached like every
   other chunk, so it is there offline. */
const LockScreen = lazy(() => import('./LockScreen'))

/** @typedef {import('../../lib/appLock').LockConfig} LockConfig */

/**
 * @typedef {object} AppLockApi
 * @property {LockConfig | null} config  the lock, or null when it is off
 * @property {boolean} locked  the lock is up now
 * @property {(config: LockConfig) => void} save  turn it on, or change it - throws if it could not be kept
 * @property {() => void} turnOff
 */

const LockContext = createContext(/** @type {AppLockApi | null} */ (null))

/** The lock, for Settings. @returns {AppLockApi} */
export function useAppLock() {
  const ctx = useContext(LockContext)
  if (!ctx) throw new Error('useAppLock must be used inside LockGate')
  return ctx
}

/** How long the lock takes to fade off an unlocked app. index.css's .app-lock-leaving matches it. */
const LEAVE_MS = 220

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** What the lock says when "Sign in again" came back without turning it off. */
const RECOVERY_NOTE = {
  /* Its sign-in had already taken the place of yours on this phone, so
     signing it out leaves the phone signed out. Said, so it is no surprise. */
  'wrong-account': "That Google account isn't the one this lock belongs to. It's been signed out, so this phone is signed out now too.",
  stale: "Signing in didn't finish, so Spendr is still locked.",
}

/** Take the cover off - only when Spendr is on screen, never under the app switcher. */
function uncover() {
  if (document.visibilityState === 'visible') document.documentElement.classList.remove('app-covered')
}

/**
 * What stands between opening Spendr and seeing your money, when the lock
 * is on (lib/appLock.js has the rules).
 *
 * ── Nothing renders first ──
 *
 * The lock is read from localStorage in the first render, and a locked
 * launch renders no app at all - not the home screen, not a balance, not a
 * loading state - only the lock. The app is mounted the moment it is
 * unlocked, under the lock as it fades.
 *
 * ── Off screen, covered; back, locked if it has been long enough ──
 *
 * Going off screen covers the app at once, from the visibilitychange event
 * itself, with a class on <html> rather than a React render, so it is
 * already covered when iOS takes the app switcher's snapshot (best effort -
 * iOS gives no promise about when it takes it). Coming back uncovers it, or
 * locks it if the time away reached "Lock after". Once opened, a relock
 * lays the lock over the app rather than taking the app away, so a
 * half-written expense is still there after Face ID.
 *
 * While locked, index.css hides everything in the body but the lock - the
 * app, and anything it portalled over itself.
 *
 * @param {{ children: import('react').ReactNode }} props
 */
export default function LockGate({ children }) {
  const { loading: authLoading, session } = useAuth()
  const { showToast } = useToast()
  const [s, setS] = useState(() => {
    const config = readLock()
    const locked = locksOnLaunch(config, Date.now())
    return { config, locked, opened: !locked, fading: false, lockId: 0, note: '' }
  })

  /* The state as the event listeners need it: now, not as of their closure.
     Set in the handler as well as after render, for a second event that
     lands before the render the first one asked for. */
  const live = useRef(s)
  useLayoutEffect(() => { live.current = s })

  /* Once, on the way up: a reload's grace is spent, a launch that locked
     spends the time away (so the same departure cannot be tried against the
     clock launch after launch), and phase 1's test is tidied away. */
  useEffect(() => {
    spendReload()
    if (live.current.locked) clearAway()
    forgetFaceIdTest()
  }, [])

  /* The cover's mark, fetched ahead of time. index.css paints it as a
     background, which a browser otherwise fetches only once it is needed -
     the moment Spendr goes off screen. Even warm it can land a frame after
     the cover itself; the cover's own colour is what hides the money, and it
     is there at once. */
  const hasLock = !!s.config
  useEffect(() => {
    if (!hasLock) return
    const mark = new Image()
    mark.src = '/icons/icon-192.png'
    mark.decode?.().catch(() => {})
  }, [hasLock])

  // The class index.css hides the app by, following the state.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.toggle('app-locked', !!s.config && s.locked)
    return () => root.classList.remove('app-locked')
  }, [s.config, s.locked])

  useEffect(() => {
    const root = document.documentElement
    /* When this page last went off screen, by the wall clock and by one
       nobody can set: a return is long enough if either says so. In memory,
       for a return; the stored copy (noteAway) is for an opening after iOS
       let the page go. A page that starts off screen - reloaded in the
       background - has gone by the stored copy, or from now. A "visible"
       with no "hidden" before it is not a return. */
    const startsHidden = document.visibilityState === 'hidden'
    let leftAt = startsHidden ? (readAway() ?? Date.now()) : /** @type {number | null} */ (null)
    let leftTick = startsHidden ? performance.now() : /** @type {number | null} */ (null)
    if (startsHidden && live.current.config) root.classList.add('app-covered')
    const onVisibility = () => {
      const cur = live.current
      if (!cur.config) {
        root.classList.remove('app-covered')
        return
      }
      if (document.visibilityState === 'hidden') {
        root.classList.add('app-covered')
        leftAt = Date.now()
        leftTick = performance.now()
        if (!cur.locked) noteAway(leftAt)
        return
      }
      const away = leftAt
      const tick = leftTick
      leftAt = null
      leftTick = null
      const longEnough = away !== null && (awayTooLong(cur.config.delay, away, Date.now())
        || (tick !== null && performance.now() - tick >= cur.config.delay))
      if (longEnough && !cur.locked) {
        root.classList.add('app-locked')
        clearAway()
        const next = { ...cur, locked: true, fading: false, lockId: cur.lockId + 1 }
        live.current = next
        setS(next)
      }
      root.classList.remove('app-covered')
    }
    // Reloading while open and on screen - an update, a sign-in's redirect.
    const onPageHide = () => {
      const cur = live.current
      if (cur.config && !cur.locked && document.visibilityState === 'visible') noteReload(Date.now())
    }
    // Back from the back-forward cache: nothing reloaded, so no grace is owed.
    const onPageShow = (/** @type {PageTransitionEvent} */ e) => { if (e.persisted) spendReload() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      root.classList.remove('app-covered')
    }
  }, [])

  /* Another tab turned the lock on, changed it or turned it off - on a
     desktop, where two can be open. Off there is off here too: turning it off
     took Face ID in that tab. */
  useEffect(() => {
    const onStorage = (/** @type {StorageEvent} */ e) => {
      if (e.key !== null && e.key !== LOCK_KEY) return
      const config = readLock()
      setS(prev => (config ? { ...prev, config } : { ...prev, config: null, locked: false, fading: false, opened: true }))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const unlock = useCallback(() => {
    cancelRecovery()
    clearAway()
    clearTries()
    document.documentElement.classList.remove('app-locked')
    uncover()
    const fade = !reducedMotion()
    const next = { ...live.current, locked: false, opened: true, fading: fade, note: '' }
    live.current = next
    setS(next)
    if (fade) setTimeout(() => setS(prev => (prev.fading && !prev.locked ? { ...prev, fading: false } : prev)), LEAVE_MS)
  }, [])

  /* Back from "Forgot? Sign in again", once the session is known. Its own
     account, freshly signed in, turns the lock off; anybody else's is signed
     straight back out, before the app has mounted to sync anything to it. */
  useEffect(() => {
    if (authLoading || !s.config || !s.locked) return
    const outcome = recoveryOutcome(session, Date.now())
    if (outcome === 'none') return
    if (outcome === 'reset') {
      clearLock()
      document.documentElement.classList.remove('app-locked')
      uncover()
      showToast('App lock is off. You can turn it on again in Settings.', 'success')
    } else if (outcome === 'wrong-account') {
      supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the sign-in came back from Google, which is outside React
    setS(prev => (outcome === 'reset'
      ? { ...prev, config: null, locked: false, opened: true, fading: false, note: '' }
      : { ...prev, note: RECOVERY_NOTE[outcome] }))
  }, [authLoading, session, s.config, s.locked, showToast])

  const api = useMemo(() => /** @type {AppLockApi} */ ({
    config: s.config,
    locked: !!s.config && s.locked,
    save(config) {
      saveLock(config)
      setS(prev => ({ ...prev, config }))
    },
    turnOff() {
      clearLock()
      document.documentElement.classList.remove('app-locked')
      uncover()
      setS(prev => ({ ...prev, config: null, locked: false, opened: true, fading: false }))
    },
  }), [s.config, s.locked])

  const showLock = !!s.config && (s.locked || s.fading)

  return (
    <LockContext.Provider value={api}>
      {s.opened && children}
      {showLock && createPortal(
        <div className={`app-lock-layer${s.fading && !s.locked ? ' app-lock-leaving' : ''}`}>
          <Suspense fallback={null}>
            <LockScreen key={s.lockId} config={/** @type {LockConfig} */ (s.config)} onUnlock={unlock} note={s.note} active={s.locked} />
          </Suspense>
        </div>,
        document.body,
      )}
    </LockContext.Provider>
  )
}
