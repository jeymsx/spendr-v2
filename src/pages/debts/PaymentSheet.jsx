import { useState, useEffect } from 'react'
import db, { UNSYNCED } from '../../db/db'
import { applyBalanceEffect } from '../../db/txHelpers'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useCreditAvailMap } from '../../hooks/useCreditAvailMap'
import { useToast } from '../../context/ToastContext'
import { parseMoney, moneyChangeHandler } from '../../utils/moneyInput'
import AccountPickerSheet from '../../components/AccountPickerSheet'
import AccountSelectRow from '../../components/AccountSelectRow'
import Sheet from '../../components/ui/Sheet'
import { fmt } from '../../lib/money'
import { getInitials, getAvatarColor } from './shared'

// ── Payment Sheet ──────────────────────────────────────────────────────────────

export function PaymentSheet({ open, onClose, debt }) {
  const { showToast } = useToast()
  const [amountStr,     setAmountStr]     = useState('0')
  const [account,       setAccount]       = useState(null)
  const [acctError,     setAcctError]     = useState(false)
  const [showAcctSheet, setShowAcctSheet] = useState(false)
  const [saving,        setSaving]        = useState(false)

  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])
  /* A credit card's balance is what you OWE, so the row shows headroom
     instead. Derived from the ledger, which is why it is passed in. */
  const creditAvailMap = useCreditAvailMap(accounts)

  useEffect(() => {
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) { setAmountStr('0'); setAccount(null); setAcctError(false) }
  }, [open])

  const paymentAmount = parseMoney(amountStr)
  const remaining     = debt ? Math.max(0, (debt.amount ?? 0) - (debt.amountPaid ?? 0)) : 0
  const isIOwe        = debt?.type === 'i_owe'
  const isDisabled    = paymentAmount <= 0 || paymentAmount > remaining

  function onConfirmPress() {
    if (!account) { setAcctError(true); return }
    handleConfirm()
  }

  async function handleConfirm() {
    if (!debt || paymentAmount <= 0 || !account) return
    setSaving(true)
    try {
      const now    = new Date()
      const txType = isIOwe ? 'expense' : 'inflow'
      const category = isIOwe ? 'Debt Payment' : 'Debt Collection'
      const description = isIOwe
        ? `Payment to ${debt.contact ?? debt.name}`
        : `Received from ${debt.contact ?? debt.name}`

      await db.transaction('rw', [db.transactions, db.accounts, db.balances, db.debts], async () => {
        await db.transactions.add({
          txId:        crypto.randomUUID(),
          type:        txType,
          amount:      paymentAmount,
          description,
          category,
          account:     account.name,
          date:        now.toISOString(),
          synced:      UNSYNCED,
          updatedAt:   now.toISOString(),
        })
        await applyBalanceEffect({ type: txType, amount: paymentAmount, account: account.name })
        const newPaid = Math.min((debt.amountPaid ?? 0) + paymentAmount, debt.amount ?? 0)
        await db.debts.update(debt.id, { amountPaid: newPaid })
      })
      showToast('Payment recorded')
      onClose()
    } catch (e) {
      console.error('[PaymentSheet] save failed:', e)
      showToast('Failed to record payment', 'error')
    } finally {
      setSaving(false)
    }
  }

  const initials    = getInitials(debt?.contact ?? debt?.name ?? '')
  const avatarColor = getAvatarColor(debt?.contact ?? debt?.name ?? '')

  return (
    <>
      {/* Sheet owns the overlay, the panel, the grab handle, the scroll lock,
          Escape, the focus trap and the exit animation. */}
      <Sheet
        open={open}
        onClose={onClose}
        scrim={40}
        /* Capped and scrollable, the same as the debt form sheet. The amount
           is a real text input, so the OS keyboard comes up over the bottom
           of the screen - a fixed-height panel would put the confirm button
           underneath it. Sheet pins the button under the scrolling body, so
           what gives way is the content rather than the action. */
        maxHeight="92dvh"
        /* No visible heading - the sheet opens from a debt row that already
           names the contact, and the contact block below repeats it. This
           names the dialog for a screen reader instead. */
        ariaLabel={isIOwe ? 'Record payment' : 'Record receipt'}
        footer={(
          /* The keypad carried its own confirm, so losing it means the
             sheet needs one. Full width and the app's accent, the same as
             every other primary action. */
          <button
            onClick={onConfirmPress}
            disabled={isDisabled || saving}
            className="w-full py-[15px] rounded-2xl font-semibold text-[15px] text-white
              bg-primary
              disabled:opacity-40 disabled:shadow-none
              active:scale-[0.98] transition-all duration-100"
          >
            {saving
              ? 'Saving…'
              : isIOwe ? 'Record payment' : 'Record receipt'}
          </button>
        )}
      >
        <div>
          {/* Contact info */}
          {debt && (
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                  {debt.contact ?? debt.name}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Remaining:{' '}
                  <span className="font-medium tabular-nums text-slate-600 dark:text-slate-300">
                    {fmt(remaining)}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* ── Amount ──
              The same field Add expense, Add inflow and Transfer use, down to
              the class: one big centred `amount-input`, inputMode="decimal",
              driven by moneyChangeHandler.

              It replaced a bespoke 10-key pad. The pad looked deliberate, and
              was the odd one out - every other place in the app where you type
              money uses the system keyboard, so the one screen with its own
              keypad taught a gesture that worked nowhere else. It also could
              not do the things a real input does for free: no caret, no
              select-all, no paste, no hardware keyboard on the desktop build,
              and no dictation.

              autoFocus so the keyboard arrives on open, which is what the pad
              did by simply being there. */}
          <div className="flex flex-col items-center pt-2 pb-6 shrink-0">
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              placeholder="₱0.00"
              value={amountStr === '0' ? '' : amountStr}
              onChange={moneyChangeHandler(setAmountStr)}
              aria-label="Payment amount"
              className="amount-input font-semibold tabular-nums bg-transparent text-center w-full
                text-slate-900 dark:text-white outline-none
                placeholder-slate-200 dark:placeholder-slate-800"
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 tracking-wide">
              {isIOwe ? 'Paying' : 'Receiving'}
            </p>
          </div>

          {paymentAmount > remaining && remaining > 0 && (
            <p className="text-center text-xs text-amber-600 dark:text-amber-400 mb-3 -mt-1">
              Cannot exceed remaining balance of {fmt(remaining)}
            </p>
          )}

          {/* The same field as the expense, inflow and transfer forms: the
              card, the name, the balance under it, a Choose chip. It used to
              be a 20px colour square and the balance floated where the
              chevron belongs, so the row never looked tappable.

              The label is just "Select account". The direction was in the
              placeholder - "Pay from account…" / "Receive into account…" -
              but the hero two rows up already says Paying or Receiving, so
              that was the same word twice. It survives as the aria-label,
              which is the one reader that cannot see the hero. */}
          <div className="mb-3">
            <AccountSelectRow
              account={account}
              creditAvailable={account ? creditAvailMap?.[account.name] : null}
              error={acctError}
              ariaLabel={isIOwe ? 'Pay from' : 'Receive into'}
              onClick={() => { setAcctError(false); setShowAcctSheet(true) }}
            />
          </div>
        </div>
      </Sheet>

      <AccountPickerSheet
        open={showAcctSheet}
        onClose={() => setShowAcctSheet(false)}
        accounts={accounts ?? []}
        selected={account}
        onSelect={acct => { setAccount(acct); setAcctError(false) }}
      />
    </>
  )
}
