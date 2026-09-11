import { useState, useEffect } from 'react'
import { useScrollLock } from '../hooks/useScrollLock'
import SwipeConfirm from './SwipeConfirm'
import CategoryGlyph from './CategoryGlyph'

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _phpFmt.format(Math.abs(n))
}

function ToggleSwitch({ on }) {
  return (
    <span className={`inline-flex items-center shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors duration-200 ${on ? 'bg-primary' : 'bg-slate-200 dark:bg-white/25'}`}>
      <span className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </span>
  )
}

const TYPE_CONFIG = {
  expense:  { label: 'Expense',  sign: '−', color: '#ef4444', badge: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
  inflow:   { label: 'Inflow',   sign: '+', color: '#22c55e', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  transfer: { label: 'Transfer', sign: '',  color: 'var(--color-primary)', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
}

function DetailRow({ label, value, dot, accent }) {
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl ${
      accent
        ? 'bg-amber-50 dark:bg-amber-500/[0.08] border border-amber-100 dark:border-amber-500/20'
        : 'bg-slate-50 dark:bg-white/[0.04]'
    }`}>
      <span className={`text-xs ${accent ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        {dot && (
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
        )}
        <span className={`text-sm font-medium text-right max-w-[180px] truncate ${
          accent ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'
        }`}>
          {value}
        </span>
      </div>
    </div>
  )
}

function Divider() {
  return <div className="h-px bg-slate-100 dark:bg-white/[0.06] my-0.5" />
}

export default function TxConfirmSheet({
  open,
  onClose,
  onConfirm,
  saving        = false,
  type          = 'expense',
  amount        = 0,
  fee           = 0,
  description,
  category,
  account,
  fromAccount,
  toAccount,
  onSaveTemplate = null,  // if provided, shows save-as-template toggle
  installment    = null,  // { months, monthly, total, firstLabel, lastLabel }
  /* The confirm button's words. "Save Transaction" is right when a form is
     being saved and wrong when a bill is being posted - the sheet is the
     same review either way, but the verb is the caller's. */
  confirmLabel   = null,
  savingLabel    = 'Saving…',
  /* Drag the last step instead of tapping it. Opt-in, not the default: the
     expense and inflow forms already made you open this sheet on purpose,
     and adding a gesture to every save would tax the common case to guard
     the rare one. Posting a bill is the rare one - it fires from a list row
     and writes three things at once. */
  swipeToConfirm = false,
}) {
  const [closing,       setClosing]       = useState(false)
  useScrollLock(open)
  const [saveTemplate,  setSaveTemplate]  = useState(false)
  const [templateName,  setTemplateName]  = useState('')

  useEffect(() => {
    if (open) {
      // Hydrate-on-open. The sheet renders null when closed but stays
      // mounted through its own exit animation, so the parent can neither
      // unmount nor re-key it to reset these fields for the next record.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSaveTemplate(false)
      setTemplateName(description?.trim() || '')
    }
    // Hydrates the form when the sheet opens. Listing every field would
    // re-run the effect that SETS them and clobber edits in progress;
    // `open` plus the record id is what actually means "something else is
    // being edited now".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const close = () => {
    if (saving) return
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  if (!open && !closing) return null

  const cfg     = TYPE_CONFIG[type] ?? TYPE_CONFIG.expense
  const hasFee  = type === 'transfer' && fee > 0

  return (
    <div className="fixed inset-0 z-[120]">
      <div
        className="sheet-overlay absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={close}
      />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px] px-5 pt-6',
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
        ].join(' ')}
        style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}
      >
        <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-6" />

        {/* type badge + amount */}
        <div className="text-center mb-7">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${cfg.badge}`}>
            {cfg.label}
          </span>
          <p
            className="text-[44px] font-bold mt-3 tabular-nums leading-none"
            style={{ color: cfg.color }}
          >
            {cfg.sign}{fmt(amount)}
          </p>
          {hasFee && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-medium">
              +{fmt(fee)} transfer fee · {fmt(amount + fee)} total deducted
            </p>
          )}
          {installment && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
              per month · {installment.months} months · {fmt(installment.total)} total
            </p>
          )}
        </div>

        {/* detail rows */}
        <div className="flex flex-col gap-1.5 mb-6">
          {description && description.trim() && (
            <DetailRow label="Note" value={description} />
          )}
          {category && (
            <DetailRow label="Category" value={<><CategoryGlyph cat={category} size={14} className="inline-block mr-1.5 -mt-px" />{category.name}</>} />
          )}
          {account && (
            <DetailRow label="Account" value={account.name} dot={account.color} />
          )}

          {/* Installment schedule */}
          {installment && (
            <>
              <Divider />
              <DetailRow label="Per month"      value={fmt(installment.monthly)} />
              <DetailRow label="Months"         value={`${installment.months}`} />
              <DetailRow label="Total"          value={fmt(installment.total)} accent />
              <DetailRow label="First payment"  value={installment.firstLabel} />
              <DetailRow label="Last payment"   value={installment.lastLabel} />
            </>
          )}

          {/* Transfer rows */}
          {fromAccount && (
            <DetailRow label="From" value={fromAccount.name} dot={fromAccount.color} />
          )}
          {toAccount && (
            <DetailRow label="To" value={toAccount.name} dot={toAccount.color} />
          )}

          {/* Fee breakdown (transfer only) */}
          {hasFee && (
            <>
              <Divider />
              <DetailRow label="Transfer amount" value={fmt(amount)} />
              <DetailRow label="Transfer fee" value={fmt(fee)} accent />
              <DetailRow
                label={`Total from ${fromAccount?.name ?? '…'}`}
                value={fmt(amount + fee)}
              />
              <DetailRow
                label={`Received by ${toAccount?.name ?? '…'}`}
                value={fmt(amount)}
              />
            </>
          )}
        </div>

        {/* save-as-template toggle */}
        {onSaveTemplate && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setSaveTemplate(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl
                bg-slate-50 dark:bg-white/[0.04]
                border border-slate-100 dark:border-white/[0.07]
                active:bg-slate-100 dark:active:bg-white/[0.08] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Save as template</span>
              </div>
              <ToggleSwitch on={saveTemplate} />
            </button>
            {saveTemplate && (
              <div className="mt-2 px-4 py-3 rounded-2xl bg-primary/[0.06] dark:bg-primary/[0.10] border border-primary/20">
                <p className="text-[11px] font-semibold text-primary mb-1.5">Template name</p>
                <input
                  type="text"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder="e.g. Jeep fare"
                  maxLength={40}
                  className="w-full bg-transparent text-sm font-medium text-slate-800 dark:text-white
                    placeholder-slate-400 dark:placeholder-slate-500 outline-none"
                />
              </div>
            )}
          </div>
        )}

        {/* actions */}
        {swipeToConfirm ? (
          /* Stacked, not side by side. A drag needs the full width to have
             any travel in it, and a 52px pill next to a Cancel button would
             give the gesture about 200px to happen in. */
          <div className="flex flex-col gap-2">
            <SwipeConfirm
              onConfirm={() => onConfirm(null)}
              label={confirmLabel ?? 'Swipe to confirm'}
              confirmingLabel={savingLabel}
              busy={saving}
            />
            <button
              onClick={close}
              disabled={saving}
              className="w-full py-3 rounded-2xl text-sm font-semibold
                text-slate-500 dark:text-slate-400
                active:bg-slate-100 dark:active:bg-white/[0.06]
                disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
        <div className="flex gap-3">
          <button
            onClick={close}
            disabled={saving}
            className="flex-1 py-3.5 rounded-2xl text-sm font-semibold
              text-slate-600 dark:text-slate-300
              bg-slate-100 dark:bg-white/[0.06]
              active:bg-slate-200 dark:active:bg-white/[0.10]
              disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const tmpl = (saveTemplate && templateName.trim() && onSaveTemplate)
                ? { name: templateName.trim(), type, amount, description, category: category?.name, account: account?.name, fromAccount: fromAccount?.name, toAccount: toAccount?.name }
                : null
              onConfirm(tmpl)
            }}
            disabled={saving}
            className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
              bg-primary shadow-[0_4px_20px_rgba(var(--color-primary-rgb),0.4)]
              disabled:opacity-50 disabled:shadow-none
              active:scale-[0.98] transition-all duration-100"
          >
            {saving ? savingLabel
              : confirmLabel ?? (installment ? `Schedule ${installment.months} Payments` : 'Save Transaction')}
          </button>
        </div>
        )}
      </div>
    </div>
  )
}
