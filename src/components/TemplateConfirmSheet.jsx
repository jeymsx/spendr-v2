import { useState, useEffect } from 'react'
import db, { UNSYNCED } from '../db/db'
import { applyBalanceEffect } from '../db/txHelpers'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import { IconTemplate } from './icons'
import CategoryGlyph from './CategoryGlyph'
import AmountHero from './ui/AmountHero'
import { CardThumb, TransferLegs } from './AccountLine'
import Button from './ui/Button'
import DetailRow from './ui/DetailRow'
import Sheet from './ui/Sheet'
import { fieldFrame } from './ui/Field'

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
  /* The same two rows the confirm and detail sheets draw, drawn the same way.

     The category glyph had no alignment of its own, so it sat on the text
     baseline and hung below the name - which is the "weird icon" you can see
     without being able to name. The other sheets pass
     `inline-block mr-1.5 -mt-px`; so does this one now.

     The account was an 8px colour dot. Everywhere else in the app an account
     is its card - GCash is the blue one - and this was the last sheet still
     reducing it to the one thing about it you never learned. */
  const detailRows = [
    category && {
      label: 'Category',
      value: (
        <>
          <CategoryGlyph cat={category} size={14} className="inline-block mr-1.5 -mt-px" />
          {category.name}
        </>
      ),
    },
    account && {
      label: 'Account',
      value: (
        <span className="inline-flex items-center gap-2 align-middle">
          <CardThumb account={account} sm />
          {account.name}
        </span>
      ),
    },
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
      {/* The confirm sheet's shape, because this IS a confirm sheet.

          It had its own: a left-aligned badge row, two label-dot-value pills
          for the amount and the note, and the facts boxed in a recessed card.
          Saving a transaction from a template and saving one from the form
          are the same act one tap apart, and they looked like different
          screens. */}
      <div>
        <div className="flex items-center justify-center gap-2">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.badge}`}>
            {cfg.label}
          </span>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
            <IconTemplate size={13} className="inline-block mr-1 -mt-px" />
            {template.name}
          </span>
        </div>

        {/* The amount, large and still editable - a template's figure is the
            one thing you change on the way past. The input sizes itself to
            its digits so the row stays optically centred as you type; `ch`
            works because the figure is tabular-nums. */}
        <AmountHero color={cfg.color} className="mt-5 mb-6">
          <span className="inline-flex items-baseline justify-center">
            <span>{cfg.sign}₱</span>
            <input
              type="text"
              inputMode="decimal"
              value={amountStr}
              onChange={moneyChangeHandler(setAmountStr)}
              aria-label="Amount"
              style={{ width: `${Math.max(amountStr.length, 1) + 0.5}ch` }}
              className="amount-hero-input bg-transparent outline-none text-inherit
                font-bold tracking-tight tabular-nums"
            />
          </span>
        </AmountHero>

        {/* One list, not a card of rows - matching the confirm sheet, where
            every row is `isLast` because nothing is drawn between them and
            the sheet already owns the gutter. */}
        <div className="flex flex-col">
          {template.type !== 'transfer' && (
            <div className="py-2.5">
              <div className={fieldFrame(false)}>
                <span className="text-[13px] text-slate-500 dark:text-slate-400 shrink-0">Note</span>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional"
                  maxLength={100}
                  className="flex-1 min-w-0 bg-transparent outline-none text-right
                    text-[14px] font-medium text-slate-800 dark:text-white
                    placeholder-slate-400 dark:placeholder-slate-500 placeholder:font-normal"
                />
              </div>
            </div>
          )}

          {detailRows.map(row => (
            <DetailRow
              key={row.label}
              label={row.label}
              value={row.value}
              padded={false}
              isLast
            />
          ))}

          {(fromAccount || toAccount) && (
            <TransferLegs from={fromAccount} to={toAccount} />
          )}
        </div>
      </div>
    </Sheet>
  )
}
