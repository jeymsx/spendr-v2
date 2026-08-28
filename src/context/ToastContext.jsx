import { createContext, useContext, useState, useCallback, useRef } from 'react'

const ToastContext = createContext(null)

const VARIANTS = {
  success: {
    icon: '✓',
    iconClass: 'text-emerald-400 dark:text-emerald-500 font-bold',
  },
  warning: {
    icon: '⚠',
    iconClass: 'text-amber-400 dark:text-amber-500 font-bold',
  },
  error: {
    icon: '✕',
    iconClass: 'text-red-400 dark:text-red-500 font-bold',
  },
}

function GlobalToast({ toast, onAction }) {
  const v = VARIANTS[toast?.type ?? 'success']
  const hasAction = !!toast?.actionLabel

  return (
    <div
      className={`fixed bottom-28 inset-x-0 z-[300] flex justify-center px-6
        transition-all duration-300
        ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
        ${hasAction ? '' : 'pointer-events-none'}`}
    >
      <div className="flex items-center gap-2.5 px-5 py-3 rounded-2xl max-w-full
        bg-slate-900 dark:bg-white
        shadow-[0_8px_32px_rgba(0,0,0,0.28)]">
        {v && <span className={`${v.iconClass} shrink-0`}>{v.icon}</span>}
        <p className="text-sm font-semibold text-white dark:text-slate-900 break-words leading-snug">
          {toast?.message}
        </p>
        {hasAction && (
          <button
            onClick={onAction}
            className="shrink-0 ml-1 px-3 py-1 -my-1 rounded-xl text-sm font-bold
              text-primary bg-white/[0.12] dark:bg-slate-900/[0.08]
              active:scale-95 transition-transform duration-75"
          >
            {toast.actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timerRef  = useRef(null)
  // Held in a ref, not in state, so firing it can't be stale after a re-render.
  const actionRef = useRef(null)

  /**
   * @param message
   * @param type     'success' | 'warning' | 'error'
   * @param options  { actionLabel, onAction, duration } — an actionable toast
   *                 becomes clickable and stays up longer.
   */
  const showToast = useCallback((message, type = 'success', options = {}) => {
    const { actionLabel = null, onAction = null, duration } = options
    if (timerRef.current) clearTimeout(timerRef.current)

    const id = Date.now()
    actionRef.current = onAction
    setToast({ message, type, id, actionLabel })

    const ms = duration
      ?? (actionLabel ? 6000 : type === 'error' ? 4000 : 2500)
    timerRef.current = setTimeout(() => {
      setToast(t => (t?.id === id ? null : t))
      actionRef.current = null
    }, ms)
  }, [])

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    actionRef.current = null
    setToast(null)
  }, [])

  // Clear before running, so a double-tapped action can only fire once.
  const runAction = useCallback(() => {
    const fn = actionRef.current
    actionRef.current = null
    dismiss()
    if (fn) fn()
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}
      <GlobalToast toast={toast} onAction={runAction} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
