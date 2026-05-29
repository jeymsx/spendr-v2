import { useState } from 'react'
import db from '../db/db'

const CURRENT_VERSION = '0.1.0'

const WHATS_NEW = [
  {
    icon: '📅',
    title: 'Cash Flow Calendar',
    desc: 'View transactions in a monthly calendar. Tap any date to see what you spent.',
  },
  {
    icon: '🎯',
    title: 'Monthly Budgets',
    desc: 'Set per-category spending limits in Settings. Track progress with live bars.',
  },
  {
    icon: '⚠️',
    title: 'Duplicate Detection',
    desc: 'Get warned before saving a transaction that looks like a double-entry.',
  },
  {
    icon: '🔍',
    title: 'Amount Range Filter',
    desc: 'Filter transactions by amount using a histogram slider in the Transactions page.',
  },
  {
    icon: '💾',
    title: 'Export Confirmations',
    desc: 'CSV and JSON backup exports now have a confirmation step to prevent accidents.',
  },
]

export default function WhatsNewModal({ onClose }) {
  const [hiding, setHiding] = useState(false)

  function dismiss(persist) {
    setHiding(true)
    setTimeout(async () => {
      if (persist) {
        await db.meta.put({ key: 'whatsNewSeen', value: CURRENT_VERSION })
      }
      onClose()
    }, 220)
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-4"
      style={{ touchAction: 'none' }}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-220 ${hiding ? 'opacity-0' : 'opacity-100'}`}
        onClick={() => dismiss(false)}
      />

      {/* Card */}
      <div className={[
        'relative w-full max-w-sm rounded-3xl overflow-hidden',
        'bg-white dark:bg-[#111820]',
        'border border-slate-100 dark:border-white/[0.07]',
        'shadow-[0_24px_64px_rgba(0,0,0,0.4)]',
        'transition-all duration-220',
        hiding ? 'opacity-0 translate-y-4 scale-[0.97]' : 'opacity-100 translate-y-0 scale-100',
      ].join(' ')}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-xl">🎉</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">What's New</h2>
              <p className="text-[11px] font-semibold text-primary">Version {CURRENT_VERSION}</p>
            </div>
          </div>
        </div>

        {/* Feature list */}
        <div className="px-5 py-4 flex flex-col gap-3.5 max-h-[55vh] overflow-y-auto no-scrollbar">
          {WHATS_NEW.map(({ icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3">
              <span className="text-xl leading-none mt-0.5 shrink-0">{icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-white leading-snug">{title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 pt-3 border-t border-slate-100 dark:border-white/[0.06] flex flex-col gap-2">
          <button
            onClick={() => dismiss(false)}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-white
              bg-primary shadow-[0_4px_16px_rgba(var(--color-primary-rgb),0.35)]
              active:scale-[0.98] transition-all duration-100">
            Got it
          </button>
          <button
            onClick={() => dismiss(true)}
            className="w-full py-2.5 text-xs font-semibold text-slate-400 dark:text-slate-500
              active:opacity-60 transition-opacity">
            Don't show again
          </button>
        </div>
      </div>
    </div>
  )
}

export { CURRENT_VERSION }
