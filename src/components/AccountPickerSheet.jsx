import { useState } from 'react'

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

const TYPE_LABEL = { cash: 'Cash', savings: 'Savings', credit: 'Credit', ewallet: 'E-Wallet', bank: 'Bank' }

export default function AccountPickerSheet({ open, onClose, accounts, selected, onSelect, exclude = [] }) {
  const [closing, setClosing] = useState(false)

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  const pick = (acct) => { onSelect(acct); close() }

  const visible = (accounts || []).filter(a => !exclude.includes(a.id))

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
          Select Account
        </p>

        <div className="flex flex-col gap-2 pb-2">
          {visible.map(acct => {
            const isCredit    = acct.type === 'credit'
            const isSelected  = selected?.id === acct.id
            const displayBal  = isCredit
              ? fmt((acct.creditLimit ?? 0) - (acct.balance ?? 0))
              : fmt(acct.balance)
            const balLabel    = isCredit ? 'available' : 'balance'

            return (
              <button
                key={acct.id}
                onClick={() => pick(acct)}
                className={[
                  'flex items-center gap-3 px-4 py-3 rounded-2xl text-left',
                  'active:scale-[0.98] transition-all duration-75',
                  isSelected
                    ? 'ring-2 ring-primary/40 bg-primary/6 dark:bg-primary/12'
                    : 'bg-slate-50 dark:bg-white/[0.04] active:bg-slate-100 dark:active:bg-white/[0.08]',
                ].join(' ')}
              >
                {/* color dot */}
                <span
                  className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: (acct.color ?? '#2D9DFF') + '22' }}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: acct.color ?? '#2D9DFF' }}
                  />
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{acct.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{TYPE_LABEL[acct.type] ?? acct.type}</p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                    {displayBal}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{balLabel}</p>
                </div>

                {isSelected && (
                  <svg className="text-primary shrink-0 ml-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
