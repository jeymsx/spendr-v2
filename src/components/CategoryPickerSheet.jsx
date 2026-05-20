import { useState } from 'react'
import { useScrollLock } from '../hooks/useScrollLock'

export default function CategoryPickerSheet({ open, onClose, categories, selected, onSelect }) {
  const [closing, setClosing] = useState(false)
  useScrollLock(open)

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  const pick = (cat) => { onSelect(cat); close() }

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[130]">
      <div
        className="sheet-overlay absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={close}
      />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px] px-5 pt-5',
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
        ].join(' ')}
        style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}
      >
        <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-5" />

        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">
          Select Category
        </p>

        <div className="grid grid-cols-4 gap-2.5 pb-2">
          {categories.map(cat => {
            const isSelected = selected?.id === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => pick(cat)}
                className={[
                  'flex flex-col items-center gap-1.5 py-3.5 px-1 rounded-2xl',
                  'active:scale-[0.95] transition-all duration-75',
                  isSelected
                    ? 'ring-2 ring-primary/50 bg-primary/8 dark:bg-primary/15'
                    : 'bg-slate-50 dark:bg-white/[0.04] active:bg-slate-100 dark:active:bg-white/[0.09]',
                ].join(' ')}
              >
                <span className="text-[26px] leading-none">{cat.icon}</span>
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 text-center leading-tight">
                  {cat.name}
                </span>
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
