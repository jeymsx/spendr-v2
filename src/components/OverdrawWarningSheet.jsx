import { useState, useEffect, useCallback } from 'react'

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _phpFmt.format(Math.abs(n))
}

/**
 * Shown when a spend would take a non-credit account below zero.
 *
 * Deliberately an interruption rather than a hard block: a ₱0 balance usually
 * means an inflow hasn't been logged yet, not that the wallet is empty, and the
 * app shouldn't make a real expense impossible to record. Same shape as
 * DupWarningSheet so the two read as one idiom.
 */
export default function OverdrawWarningSheet({
  open, onClose, onSaveAnyway, accountName, balance = 0, amount = 0,
}) {
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

  const after = (balance ?? 0) - (amount ?? 0)

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

        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-500/[0.12] flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
        </div>

        <div className="px-6 text-center mb-5">
          <h3 className="text-base font-semibold text-slate-800 dark:text-white mb-1.5">
            Not enough in {accountName}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
            Short by {fmt(Math.abs(after))}. Log the missing income first, or save
            anyway to let the balance go negative.
          </p>
        </div>

        <div className="px-5 mb-6">
          <div className="rounded-2xl bg-slate-50 dark:bg-white/[0.04] px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 dark:text-slate-500">Available</span>
              <span className="text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">{fmt(balance)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 dark:text-slate-500">This transaction</span>
              <span className="text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">−{fmt(amount)}</span>
            </div>
            <div className="h-px bg-slate-200/70 dark:bg-white/[0.07]" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Balance after</span>
              <span className="text-sm font-bold tabular-nums text-red-500 dark:text-red-400">{fmt(after)}</span>
            </div>
          </div>
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
