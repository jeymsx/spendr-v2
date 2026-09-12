import Button from './ui/Button'
import Sheet from './ui/Sheet'
import { fmt } from '../lib/money'

const TYPE_LABEL = { expense: 'expense', inflow: 'inflow', transfer: 'transfer' }

export default function DupWarningSheet({ open, onClose, onSaveAnyway, amount, type }) {
  /* Sheet owns the overlay, the panel, Escape, the scroll lock, the focus
     trap and the exit animation. */

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={110}
      ariaLabel="Possible duplicate"
      footer={(
        <div className="flex flex-col gap-2.5">
          {/* The action fires after the exit animation rather than with it:
              both callers open another sheet in response, and two sheets
              crossing over each other reads as a glitch. */}
          <Button size="lg" block onClick={() => { onClose(); setTimeout(onSaveAnyway, 260) }}>
            Save anyway
          </Button>
          <Button variant="secondary" size="lg" block onClick={onClose}>
            Cancel
          </Button>
        </div>
      )}
    >
      <div>

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

        <div className="text-center mb-6">
          <h3 className="text-base font-semibold text-slate-800 dark:text-white mb-1.5">
            Possible duplicate
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
            A {fmt(amount)} {TYPE_LABEL[type] ?? type} with the same amount and account already exists today.
          </p>
        </div>

      </div>
    </Sheet>
  )
}
