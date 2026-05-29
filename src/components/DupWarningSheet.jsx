import { useState, useEffect, useCallback } from 'react'

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

const TYPE_LABEL = { expense: 'expense', inflow: 'inflow', transfer: 'transfer' }

export default function DupWarningSheet({ open, onClose, onSaveAnyway, amount, type }) {
  const [closing, setClosing] = useState(false)

  const close = useCallback(() => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[110]">
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
        ].join(' ')}
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
      >
        <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mt-5 mb-5" />

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-500/[0.12] flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
        </div>

        <div className="px-6 text-center mb-6">
          <h3 className="text-base font-semibold text-slate-800 dark:text-white mb-1.5">
            Possible duplicate
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
            A {fmt(amount)} {TYPE_LABEL[type] ?? type} with the same amount and account already exists today.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 px-5">
          <button
            onClick={() => { close(); setTimeout(onSaveAnyway, 260) }}
            className="w-full py-4 rounded-2xl text-sm font-semibold text-white
              bg-primary shadow-[0_4px_16px_rgba(var(--color-primary-rgb),0.3)]
              active:scale-[0.98] transition-all duration-100"
          >
            Save anyway
          </button>
          <button
            onClick={close}
            className="w-full py-4 rounded-2xl text-sm font-semibold
              text-slate-600 dark:text-slate-300
              bg-slate-100 dark:bg-white/[0.07]
              active:scale-[0.98] transition-all duration-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
