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

function GlobalToast({ toast }) {
  const v = VARIANTS[toast?.type ?? 'success']
  return (
    <div
      className={`fixed bottom-28 inset-x-0 z-[300] flex justify-center px-6
        transition-all duration-300 pointer-events-none
        ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
    >
      <div className="flex items-center gap-2.5 px-5 py-3 rounded-2xl
        bg-slate-900 dark:bg-white
        shadow-[0_8px_32px_rgba(0,0,0,0.28)]">
        {v && <span className={v.iconClass}>{v.icon}</span>}
        <p className="text-sm font-semibold text-white dark:text-slate-900 whitespace-nowrap">
          {toast?.message}
        </p>
      </div>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  const showToast = useCallback((message, type = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const id = Date.now()
    setToast({ message, type, id })
    timerRef.current = setTimeout(
      () => setToast(t => (t?.id === id ? null : t)),
      type === 'error' ? 4000 : 2500,
    )
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <GlobalToast toast={toast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
