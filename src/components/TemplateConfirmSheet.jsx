import { useState, useEffect } from 'react'
import db, { UNSYNCED } from '../db/db'
import { applyBalanceEffect } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import { IconTemplate } from './icons'
import CategoryGlyph from './CategoryGlyph'
import Button from './ui/Button'
import Card from './ui/Card'
import DetailRow from './ui/DetailRow'
import Sheet from './ui/Sheet'

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const TYPE_CONFIG = {
  expense:  { label: 'Expense',  sign: '−', color: '#ef4444', badge: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
  inflow:   { label: 'Inflow',   sign: '+', color: '#22c55e', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  transfer: { label: 'Transfer', sign: '',  color: 'var(--color-primary)', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
}

export default function TemplateConfirmSheet({ open, onClose, template }) {
  const { showToast } = useToast()
  const [saving,      setSaving]      = useState(false)
  const [amountStr,   setAmountStr]   = useState('')
  const [description, setDescription] = useState('')

  const accounts   = useLiveQuery(() => db.accounts.toArray(), [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])

  useEffect(() => {
    if (open && template) {
      // Hydrate-on-open. The sheet renders null when closed but stays
      // mounted through its own exit animation, so the parent can neither
      // unmount nor re-key it to reset these fields for the next record.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmountStr(numToMoneyStr(template.amount ?? 0))
      setDescription(template.description ?? '')
      setSaving(false)
    }
  }, [open, template])

  /* Sheet owns the overlay, the panel, the handle, the scroll lock, Escape,
     the focus trap and the exit animation. */
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
            date: dateISO, synced: UNSYNCED, updatedAt: updISO,
          })
          await applyBalanceEffect({ type: 'transfer', amount, fromAccount: template.fromAccount, toAccount: template.toAccount })
        })
      } else {
        await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
          await db.transactions.add({
            txId: crypto.randomUUID(), type: template.type, amount,
            description: description.trim(), category: template.category,
            account: template.account, date: dateISO, synced: UNSYNCED, updatedAt: updISO,
          })
          await applyBalanceEffect({ type: template.type, amount, account: template.account })
        })
      }
      showToast('Transaction saved')
      onClose()
    } catch (e) {
      console.error('[TemplateConfirmSheet] save failed:', e)
      showToast('Failed to save transaction', 'error')
      setSaving(false)
    }
  }

  /* Built as a list so the shared row can draw its own separators and know
     which one is last. Same four conditions, in the same order. */
  const detailRows = [
    category && {
      label: 'Category',
      value: <><CategoryGlyph cat={category} size={15} /> {category.name}</>,
    },
    account     && { label: 'Account', value: account.name,     dot: account.color     },
    fromAccount && { label: 'From',    value: fromAccount.name, dot: fromAccount.color },
    toAccount   && { label: 'To',      value: toAccount.name,   dot: toAccount.color   },
  ].filter(Boolean)

  const actions = (
    <div className="flex gap-3">
      <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button className="flex-[2]" onClick={handleSave} loading={saving} disabled={amount <= 0}>
        {saving ? 'Saving…' : 'Save transaction'}
      </Button>
    </div>
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={120}
      scrim={50}
      dismissible={!saving}
      ariaLabel={`Use template ${template.name}`}
      footer={actions}
    >
      <div className="pt-1">
        {/* Badge + template name */}
        <div className="flex items-center gap-2 mb-4">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.badge}`}>
            {cfg.label}
          </span>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
            <IconTemplate size={13} className="inline-block mr-1 -mt-px" /> {template.name}
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

        {/* Detail rows. One recessed group rather than four floating pills -
            same rows, same conditions, drawn by the shared DetailRow. */}
        {detailRows.length > 0 && (
          <Card surface="recessed" clip className="mb-5">
            {detailRows.map((row, i) => (
              <DetailRow
                key={row.label}
                label={row.label}
                value={row.value}
                dot={row.dot}
                isLast={i === detailRows.length - 1}
              />
            ))}
          </Card>
        )}

      </div>
    </Sheet>
  )
}
