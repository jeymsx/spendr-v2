import { useRef, useCallback, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useKeyboardInset } from '../hooks/useKeyboardInset'

/* ── SVG icon primitives ───────────────────────────────── */
function IconHome({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.12 : 0} />
      <polyline points="9 21 9 12 15 12 15 21" />
    </svg>
  )
}

function IconList({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="3" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.12 : 0} />
      <line x1="7" y1="9" x2="17" y2="9" />
      <line x1="7" y1="13" x2="14" y2="13" />
      <line x1="7" y1="17" x2="11" y2="17" />
    </svg>
  )
}

function IconChart({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="14" width="4" height="7" rx="1" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.25 : 0} />
      <rect x="10" y="9" width="4" height="12" rx="1" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.25 : 0} />
      <rect x="17" y="4" width="4" height="17" rx="1" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.25 : 0} />
    </svg>
  )
}

function IconWallet({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="14" rx="2" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.12 : 0} />
      <path d="M2 10h20" />
      <path d="M6 6V4a1 1 0 011-1h10a1 1 0 011 1v2" />
      <circle cx="17" cy="15" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/* ── Navbar ────────────────────────────────────────────── */
const LEFT_TABS = [
  { path: '/',             label: 'Home',         Icon: IconHome  },
  { path: '/transactions', label: 'Transactions',  Icon: IconList  },
]
const RIGHT_TABS = [
  { path: '/accounts',  label: 'Accounts',  Icon: IconWallet },
  { path: '/insights',  label: 'Insights',  Icon: IconChart  },
]

function Tab({ path, label, Icon }) {
  const location = useLocation()
  const HOME_SECONDARY = ['/debts', '/recurring', '/import']
  const active = path === '/'
    ? location.pathname === '/' || HOME_SECONDARY.some(p => location.pathname.startsWith(p))
    : location.pathname.startsWith(path)

  return (
    <NavLink
      to={path}
      className="flex flex-col items-center gap-0.5 flex-1 py-2 transition-colors duration-150"
      style={{ color: active ? 'var(--color-primary)' : undefined }}
    >
      <span className={active ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}>
        <Icon active={active} />
      </span>
      <span
        className={`text-10 font-medium tracking-wide ${
          active ? 'text-primary' : 'text-slate-400 dark:text-slate-500'
        }`}
      >
        {label}
      </span>
    </NavLink>
  )
}

/* How long the + must be held before it becomes quick log. Long enough not to
   fire on a firm tap, short enough that you do not wonder whether it worked. */
const HOLD_MS = 420
/* How far the finger may wander and still count as a press. 12px is roughly
   the slop a browser itself allows before it stops calling a touch a tap. */
const SLOP_PX = 12

export default function Navbar({ onAddClick, onQuickLog }) {
  const timer   = useRef(null)
  const heldRef = useRef(false)   // the hold fired: quick log is open
  const offRef  = useRef(false)   // the finger left: do nothing on release
  const downAt  = useRef({ x: 0, y: 0 })

  const clearTimer = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = null
  }, [])

  const startPress = useCallback((e) => {
    heldRef.current = false
    offRef.current = false
    downAt.current = { x: e.clientX, y: e.clientY }
    timer.current = setTimeout(() => {
      heldRef.current = true
      timer.current = null
      // A short buzz, so a hold is confirmed by feel rather than by the
      // overlay appearing - which on a slow frame lands after your thumb has
      // already left.
      try { navigator.vibrate?.(14) } catch { /* unsupported, or denied */ }
      onQuickLog?.()
    }, HOLD_MS)
  }, [onQuickLog])

  /*
    Slide off to cancel - the behaviour every button has.

    This has to be measured from pointermove, not onPointerLeave, and that is
    not a stylistic preference. A touch pointer is IMPLICITLY CAPTURED to the
    element that received pointerdown, so pointerout - which is what React's
    onPointerLeave is built on - does not fire until the finger lifts. On a
    phone the leave handler therefore arrives strictly too late: the 420ms
    timer has already fired and quick log is already open.

    pointermove does fire during capture, so distance is the only signal that
    actually exists mid-gesture. Guarded on timer.current so a mouse merely
    travelling across the button does nothing.
  */
  const onMove = useCallback((e) => {
    if (!timer.current) return
    const dx = e.clientX - downAt.current.x
    const dy = e.clientY - downAt.current.y
    if (dx * dx + dy * dy > SLOP_PX * SLOP_PX) {
      offRef.current = true
      clearTimer()
    }
  }, [clearTimer])

  const abortPress = useCallback(() => {
    offRef.current = true
    clearTimer()
  }, [clearTimer])

  const endPress = useCallback(() => {
    clearTimer()
    // Neither gesture on release if the finger wandered off. Without the
    // offRef check a cancelled hold would fall through to the add sheet,
    // which is the one thing the user just said they did not want.
    if (!heldRef.current && !offRef.current) onAddClick?.()
    heldRef.current = false
    offRef.current = false
  }, [clearTimer, onAddClick])

  useEffect(() => () => clearTimeout(timer.current), [])

  /* Out of the way while the keyboard is up.
     A tab bar is pinned to the bottom of the LAYOUT viewport, which iOS does
     not shrink for the keyboard - so it ends up dragged into the middle of
     the screen with a strip of background under it, which is the gap you see.
     Following the visible viewport instead would leave a tab bar hovering on
     top of the keyboard, which is worse and is why no native app does it:
     nothing here is reachable while you are typing anyway.
     See hooks/useKeyboardInset.js. */
  const { open: keyboardOpen } = useKeyboardInset()

  return (
    <nav
      className={[
        'fixed bottom-0 inset-x-0 z-50',
        'flex items-center justify-around',
        'px-2',
        'bg-white/90 border-t border-slate-200/70',
        'dark:bg-navy/90 dark:border-white/[0.06]',
        'backdrop-filter backdrop-blur-xl',
        keyboardOpen && 'hidden',
      ].filter(Boolean).join(' ')}
      style={{ paddingTop: '8px', paddingBottom: '16px' }}
    >
      {/* left tabs */}
      {LEFT_TABS.map(t => (
        <Tab key={t.path} {...t} />
      ))}

      {/* center add button */}
      <div className="flex flex-col items-center flex-1">
        {/* Tap adds, hold quick-logs, slide off cancels.

            Pointer events rather than onClick, because the two gestures share
            one target: a timer starts on down and whichever fires first wins.

            onPointerMove is the one that does the cancelling - see the note on
            implicit pointer capture above. Leave and cancel are kept as well;
            they are the ones that fire for a mouse, and for the case where the
            browser takes the gesture away. */}
        <button
          onPointerDown={startPress}
          onPointerMove={onMove}
          onPointerUp={endPress}
          onPointerLeave={abortPress}
          onPointerCancel={abortPress}
          onContextMenu={e => e.preventDefault()}
          aria-label="Add transaction. Hold to quick log."
          className={[
            'w-14 h-14 rounded-full -mt-7',
            'flex items-center justify-center',
            'active:scale-95 transition-transform duration-100',
            'border-4 border-white dark:border-navy',
            'select-none touch-none',
          ].join(' ')}
          style={{ background: 'var(--color-primary)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <span className="text-10 font-medium text-slate-400 dark:text-slate-500 mt-0.5">Add</span>
      </div>

      {/* right tabs */}
      {RIGHT_TABS.map(t => (
        <Tab key={t.path} {...t} />
      ))}
    </nav>
  )
}
