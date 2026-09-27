import { useEffect, useMemo, useRef, useState } from 'react'
import Sheet from '../../components/ui/Sheet'
import SwipeConfirm from '../../components/SwipeConfirm'
import AmountHero from '../../components/ui/AmountHero'
import AmountInput from '../../components/ui/AmountInput'
import DetailRow from '../../components/ui/DetailRow'
import AccountPickerSheet, { AccountChip } from '../../components/AccountPickerSheet'
import FadeScroller from '../../components/FadeScroller'
import { RAIL_TOUCH } from '../../components/ui/Rail'
import { IconChevronRight } from '../../components/icons'
import { parseMoney, numToMoneyStr } from '../../utils/moneyInput'
import { chipClass } from './shared'
import { fmt } from '../../lib/money'
import { isLiquid } from '../../lib/accountMeta'
import { splitPayment } from '../../lib/loans'

/** The accent the app paints money leaving an account. */
const PAY_COLOR = '#10b981'

/**
 * Paying a loan, from the loan's own page.
 *
 * Built as CardPaymentSheet is - the figure is the input, two presets, where
 * it comes from, swipe to pay - because it is the same moment: money moving
 * to something you owe. The one thing it adds is the split under the figure:
 * how much of it is interest (which is spending) and how much comes off what
 * you owe (which only moves your money). You never have to work that out;
 * seeing it is how the two lines in the ledger make sense afterwards.
 */
export default function LoanPaySheet({ open, onClose, loan, accounts = [], status, onPay, saving = false }) {
  const [amount, setAmount] = useState('')
  const [from, setFrom] = useState(/** @type {any} */ (null))
  const [pickerOpen, setPickerOpen] = useState(false)
  const amountRef = useRef(/** @type {HTMLInputElement|null} */ (null))
  const cur = loan?.currency

  /* Money you hold, in the loan's currency. A card paying a loan is a cash
     advance by another name, and a cross-currency payment needs the transfer
     form, which asks what left and what arrived. */
  const payable = useMemo(
    () => accounts.filter(a => isLiquid(a) && a.name !== loan?.name && (a.currency || cur) === cur),
    [accounts, loan, cur],
  )

  const owed = status?.owed ?? 0
  const monthly = status?.next?.amount ?? 0
  const payoff = owed > 0 ? owed + (status?.next?.interest ?? 0) : 0

  const presets = useMemo(() => {
    const out = []
    const add = (/** @type {string} */ label, /** @type {number} */ value) => {
      if (value > 0 && !out.some(p => Math.abs(p.value - value) < 0.005)) out.push({ label, value })
    }
    add('Monthly', monthly)
    add('Pay it off', Math.round(payoff * 100) / 100)
    return out
  }, [monthly, payoff])

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAmount(monthly > 0 ? numToMoneyStr(monthly) : '')
    setFrom([...payable].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))[0] ?? null)
    setPickerOpen(false)
  }, [open, monthly, payable])

  const value = parseMoney(amount)
  const split = value > 0 ? splitPayment(owed, value, loan?.interestRate) : { interest: 0, principal: 0 }
  const short = from ? value - (from.balance ?? 0) : 0
  const ready = value > 0 && !!from && !saving

  const onAmount = (/** @type {any} */ e) => {
    const v = String(e.target.value).replace(/[^0-9.]/g, '')
    const parts = v.split('.')
    setAmount(parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : v)
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        z={120}
        scrim={55}
        dismissible={!saving}
        ariaLabel={`Pay ${loan?.name ?? 'loan'}`}
      >
        <div className="pb-1">
          <div className="text-center">
            <h3 className="text-17 font-semibold text-slate-900 dark:text-white">
              Pay {loan?.name}
            </h3>
            <p className="mt-1 mx-auto max-w-[268px] text-13 leading-snug text-slate-400 dark:text-slate-500">
              Only the interest counts as spending.
            </p>
          </div>

          <AmountHero color={PAY_COLOR} className="mt-5 mb-6">
            <AmountInput
              currency={cur}
              ref={amountRef}
              value={amount}
              onChange={onAmount}
              label="Payment amount"
              color={PAY_COLOR}
            />
          </AmountHero>

          {presets.length > 1 && (
            <FadeScroller
              axis="x"
              style={RAIL_TOUCH}
              className="flex items-center gap-2 mb-5 -mx-5 px-5 pb-0.5"
            >
              {presets.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setAmount(numToMoneyStr(p.value))}
                  className={chipClass(Math.abs(value - p.value) < 0.005)}
                >
                  {p.label} · {fmt(p.value, cur)}
                </button>
              ))}
            </FadeScroller>
          )}

          <div className="flex flex-col mb-2">
            <DetailRow label="Off what you owe" value={fmt(Math.max(0, value - split.interest), cur)} padded={false} isLast />
            <DetailRow
              label="Interest"
              value={fmt(split.interest, cur)}
              sub={loan?.interestRate ? `${loan.interestRate}% a month` : 'No rate set'}
              padded={false}
              isLast
            />
          </div>

          {payable.length === 0 ? (
            <p className="mb-5 text-12 text-amber-600 dark:text-amber-400">
              You need a cash, e-wallet, bank or savings account in {cur} to pay from.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full flex items-center gap-3 mb-1 py-2 -mx-1 px-1 rounded-2xl
                active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
            >
              {from ? <AccountChip acct={from} size="sm" /> : null}
              <span className="flex-1 min-w-0 text-left">
                <span className="block text-11 text-slate-400 dark:text-slate-500">Paying from</span>
                <span className="block text-14 font-semibold text-slate-800 dark:text-white truncate">
                  {from?.name ?? 'Choose an account'}
                </span>
              </span>
              <span className="text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true">
                <IconChevronRight />
              </span>
            </button>
          )}

          {short > 0 && (
            <p className="mb-2 text-11 text-amber-600 dark:text-amber-400">
              This leaves {from?.name} short by {fmt(short, cur)}.
            </p>
          )}

          <div className="mt-5">
            <SwipeConfirm
              onConfirm={() => onPay({ amount: value, from })}
              disabled={!ready}
              busy={saving}
              label="Swipe to pay"
              confirmingLabel="Paying…"
            />
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="press press-fade active:opacity-60 w-full mt-3 py-2 text-13 font-semibold
              text-slate-500 dark:text-slate-400 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </Sheet>

      <AccountPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        accounts={payable}
        selected={from}
        onSelect={setFrom}
      />
    </>
  )
}
