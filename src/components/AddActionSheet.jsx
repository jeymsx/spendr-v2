import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const ACTIONS = [
  {
    label: 'Expense',
    description: 'Record money spent',
    path: '/expense',
    emoji: '↑',
    colorLight: 'bg-red-50 text-red-500 border-red-100',
    colorDark: 'dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
    dot: 'bg-red-400',
  },
  {
    label: 'Inflow',
    description: 'Record money received',
    path: '/inflow',
    emoji: '↓',
    colorLight: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    colorDark: 'dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
  {
    label: 'Transfer',
    description: 'Move between accounts',
    path: '/transfer',
    emoji: '⇄',
    colorLight: 'bg-blue-50 text-blue-600 border-blue-100',
    colorDark: 'dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
    dot: 'bg-blue-400',
  },
]

export default function AddActionSheet({ open, onClose }) {
  const navigate = useNavigate()
  const [closing, setClosing] = useState(false)
  const overlayRef = useRef(null)

  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      onClose()
    }, 240)
  }, [onClose])

  const handleAction = (path) => {
    handleClose()
    setTimeout(() => navigate(path), 260)
  }

  const handleCloseRef = useRef(handleClose)
  useEffect(() => { handleCloseRef.current = handleClose }, [handleClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') handleCloseRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[100]">
      {/* backdrop */}
      <div
        ref={overlayRef}
        className="sheet-overlay absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* panel */}
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0',
          'rounded-t-[28px] px-5 pt-5 pb-10',
          /* light */
          'bg-white border-t border-slate-100',
          /* dark */
          'dark:bg-[#111820] dark:border-white/[0.07]',
        ].join(' ')}
        style={{ paddingBottom: 'max(40px, env(safe-area-inset-bottom))' }}
      >
        {/* drag handle */}
        <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-6" />

        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4 px-1">
          Add Transaction
        </p>

        <div className="flex flex-col gap-3">
          {ACTIONS.map(({ label, description, path, emoji, colorLight, colorDark, dot }) => (
            <button
              key={path}
              onClick={() => handleAction(path)}
              className={[
                'flex items-center gap-4 w-full text-left',
                'px-4 py-3.5 rounded-2xl border',
                'active:scale-[0.98] transition-transform duration-100',
                colorLight,
                colorDark,
              ].join(' ')}
            >
              <span className="text-2xl w-8 text-center leading-none select-none">{emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[15px]">{label}</p>
                <p className="text-[12px] opacity-70 mt-0.5">{description}</p>
              </div>
              <span className={`w-2 h-2 rounded-full ${dot} opacity-80`} />
            </button>
          ))}
        </div>

        <button
          onClick={handleClose}
          className="mt-5 w-full py-3 rounded-2xl text-sm font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.04] active:bg-slate-200 dark:active:bg-white/[0.08] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
