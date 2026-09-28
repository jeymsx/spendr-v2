import { createContext, forwardRef, useContext } from 'react'
import { createPortal } from 'react-dom'

/**
 * The pieces every step of setup is built from, so each step file is only
 * what that step asks.
 *
 *   StepBody    the scrolling middle: the heading, then whatever it asks
 *   Heading     the question, and one line under it
 *   StepFooter  the buttons, pinned under the thumb
 *   Overlay     where a step's sheet goes
 */

/**
 * The element a step's sheet renders into.
 *
 * A step slides in and out on transform and blur, and either one makes the
 * step the box a `position: fixed` sheet is laid out in - the sheet would
 * open inside the step, clipped, and slide with it. So sheets go to a host
 * at the shell's own level: still inside the dark shell, so they are dark,
 * but outside anything that moves.
 */
export const OverlayHost = createContext(/** @type {HTMLElement|null} */ (null))

/** @param {{children: import('react').ReactNode}} props */
export function Overlay({ children }) {
  const host = useContext(OverlayHost)
  return host ? createPortal(children, host) : null
}

/**
 * @param {{title: import('react').ReactNode, sub?: import('react').ReactNode}} props
 */
export const Heading = forwardRef(
  /** @param {{title: import('react').ReactNode, sub?: import('react').ReactNode}} props @param {import('react').Ref<HTMLHeadingElement>} ref */
  function Heading({ title, sub }, ref) {
    return (
      <div className="shrink-0 pt-1">
        {/* Focused when the step arrives (Onboarding.jsx), so a screen
            reader reads the question - which is also why it can take focus
            without being a control. */}
        <h2 ref={ref} tabIndex={-1} className="text-28 font-semibold leading-[1.15] tracking-tight text-white outline-none text-balance">
          {title}
        </h2>
        {sub && <p className="mt-2 text-15 leading-snug text-slate-400 text-pretty">{sub}</p>}
      </div>
    )
  },
)

/** @param {{children: import('react').ReactNode, className?: string}} props */
export function StepBody({ children, className = '' }) {
  return (
    <div
      className={`flex-1 min-h-0 overflow-y-auto no-scrollbar -mx-6 px-6 pb-3 flex flex-col gap-5 ${className}`}
      style={{ overscrollBehavior: 'contain' }}
    >
      {children}
    </div>
  )
}

/** @param {{children: import('react').ReactNode}} props */
export function StepFooter({ children }) {
  return (
    <div
      className="shrink-0 flex flex-col gap-2 pt-3"
      style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
    >
      {children}
    </div>
  )
}

/** Google's G, in its own colours, for the two buttons that sign in. */
export function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}
