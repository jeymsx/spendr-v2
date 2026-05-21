import { useState, useEffect } from 'react'
import db from '../db/db'
import { applyBalanceEffect } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useScrollLock } from '../hooks/useScrollLock'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

const TYPE_CONFIG = {
  expense:  { label: 'Expense',  sign: '−', color: '#ef4444', badge: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
  inflow:   { label: 'Inflow',   sign: '+', color: '#22c55e', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  transfer: { label: 'Transfer', sign: '',  color: 'var(--color-primary)', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
}

export default function TemplateConfirmSheet({ open, onClose, template }) {
  const [closing,     setClosing]     = useState(false)
  useScrollLock(open)
  const { showToast } = useToast()
  const [saving,      setSaving]      = useState(false)
  const [amountStr,   setAmountStr]   = useState('')
  const [description, setDescription] = useState('')

  const accounts   = useLiveQuery(() => db.accounts.toArray(), [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])

  useEffect(() => {
    if (open && template) {
      setAmountStr(numToMoneyStr(template.amount ?? 0))
      setDescription(template.description ?? '')
      setSaving(false)
    }
  }, [open, template])

  const close = () => {
    if (saving) return
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  if (!open && !closing) return null
  if (!template) return null

  const cfg         = TYPE_CONFIG[template.type] ?? TYPE_CONFIG.expense
  const amount      = parseMoney(amountStr)
  const category    = (categories ?? []).find(c => c.name === template.category)
  const account     = (accounts ?? []).find(a => a.name === template.account)
  const fromAccount = (accounts ?? []).find(a => a.name === template.fromAccount)
  const toAccount   = (accounts ?? []).find(a => a.name === template.toAccount)

  async function handleSave() {
    if (amount <= 0) return
    setSaving(true)
    try {
      const now    = new Date()
      const dateISO = now.toISOString()
      const updISO  = now.toISOString()

      if (template.type === 'transfer') {
        await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
          await db.transactions.add({
            txId: crypto.randomUUID(), type: 'transfer', amount,
            fromAccount: template.fromAccount, toAccount: template.toAccount,
            date: dateISO, synced: false, updatedAt: updISO,
          })
          await applyBalanceEffect({ type: 'transfer', amount, fromAccount: template.fromAccount, toAccount: template.toAccount })
        })
      } else {
        await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
          await db.transactions.add({
            txId: crypto.randomUUID(), type: template.type, amount,
            description: description.trim(), category: template.category,
            account: template.account, date: dateISO, synced: false, updatedAt: updISO,
          })
          await applyBalanceEffect({ type: template.type, amount, account: template.account })
        })
      }
      showToast('Transaction saved')
      close()
    } catch (e) {
      console.error('[TemplateConfirmSheet] save failed:', e)
      showToast('Failed to save transaction', 'error')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="sheet-overlay absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
      <div
        className={`${closing ? 'sheet-panel-exit' : 'sheet-panel'} absolute bottom-0 inset-x-0 rounded-t-[28px] px-5 pt-6
          bg-white dark:bg-[#111820]
          border-t border-slate-100 dark:border-white/[0.07]`}
        style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}
      >
        <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-5" />

        {/* Badge + template name */}
        <div className="flex items-center gap-2 mb-4">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.badge}`}>
            {cfg.label}
          </span>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
            ⚡ {template.name}
          </span>
        </div>

        {/* Editable amount */}
        <div className="flex items-center gap-2 px-4 py-3.5 rounded-2xl mb-2
          bg-slate-50 dark:bg-white/[0.04]
          border border-slate-100 dark:border-white/[0.07]">
          <span className="text-slate-400 dark:text-slate-500 text-sm shrink-0 font-medium">Amount</span>
          <span className="text-slate-300 dark:text-slate-600 mx-1">·</span>
          <span className="text-slate-500 dark:text-slate-400 text-sm shrink-0">₱</span>
          <input
            type="text"
            inputMode="decimal"
            value={amountStr}
            onChange={moneyChangeHandler(setAmountStr)}
            className="flex-1 bg-transparent text-sm font-bold text-slate-800 dark:text-white
              outline-none tabular-nums min-w-0"
          />
        </div>

        {/* Editable description (only for expense/inflow) */}
        {template.type !== 'transfer' && (
          <div className="flex items-center gap-2 px-4 py-3.5 rounded-2xl mb-3
            bg-slate-50 dark:bg-white/[0.04]
            border border-slate-100 dark:border-white/[0.07]">
            <span className="text-slate-400 dark:text-slate-500 text-sm shrink-0 font-medium">Note</span>
            <span className="text-slate-300 dark:text-slate-600 mx-1">·</span>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add note…"
              maxLength={100}
              className="flex-1 bg-transparent text-sm text-slate-800 dark:text-white
                placeholder-slate-400 dark:placeholder-slate-500 outline-none min-w-0"
            />
          </div>
        )}

        {/* Detail rows */}
        <div className="flex flex-col gap-1.5 mb-5">
          {category && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.04]">
              <span className="text-xs text-slate-400 dark:text-slate-500">Category</span>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {category.icon}  {category.name}
              </span>
            </div>
          )}
          {account && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.04]">
              <span className="text-xs text-slate-400 dark:text-slate-500">Account</span>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: account.color }} />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{account.name}</span>
              </div>
            </div>
          )}
          {fromAccount && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.04]">
              <span className="text-xs text-slate-400 dark:text-slate-500">From</span>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: fromAccount.color }} />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{fromAccount.name}</span>
              </div>
            </div>
          )}
          {toAccount && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.04]">
              <span className="text-xs text-slate-400 dark:text-slate-500">To</span>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: toAccount.color }} />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{toAccount.name}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={close}
            disabled={saving}
            className="flex-1 py-3.5 rounded-2xl text-sm font-semibold
              text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06]
              disabled:opacity-40 active:bg-slate-200 dark:active:bg-white/[0.10] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || amount <= 0}
            className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white
              bg-primary shadow-[0_4px_20px_rgba(var(--color-primary-rgb),0.4)]
              disabled:opacity-50 disabled:shadow-none
              active:scale-[0.98] transition-all duration-100"
          >
            {saving ? 'Saving…' : 'Save Transaction'}
          </button>
        </div>
      </div>
    </div>
  )
}
