import Button from './ui/Button'
import Sheet from './ui/Sheet'

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
  /* Sheet owns the overlay, the panel, Escape, the scroll lock, the focus
     trap and the exit animation. */

  const after = (balance ?? 0) - (amount ?? 0)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={110}
      ariaLabel="Not enough balance"
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

      </div>
    </Sheet>
  )
}
