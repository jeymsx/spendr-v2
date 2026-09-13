import { useEffect, useMemo, useState } from 'react'
import Sheet from './ui/Sheet'
import AmountHero from './ui/AmountHero'
import DetailRow from './ui/DetailRow'
import Button from './ui/Button'
import AccountPickerSheet, { AccountChip } from './AccountPickerSheet'
import FadeScroller from './FadeScroller'
import { RAIL_TOUCH } from './ui/Rail'
import { IconChevronRight } from './icons'
import { parseMoney, numToMoneyStr } from '../utils/moneyInput'
import { chipClass } from '../pages/accounts/shared'
import { fmt } from '../lib/money'
import { refundableAmount, refundedAmount } from '../lib/txMoney'

/** The accent for money coming back. */
const BACK_COLOR = '#10b981'

/**
 * Money coming back on a purchase.
 *
 * ── Why this is not "edit the amount" ──
 *
 * A refund is two events at two times. You were genuinely out of pocket from
 * the day you paid to the day it came back, and that is true of your balance
 * on every day in between. Editing the original down erases those weeks, and
 * on a card it rewrites a statement the bank has already billed - which
 * getCreditStatus cannot survive, because a charge has to stay in the cycle it
 * happened in.
 *
 * So the original keeps its amount and keeps saying what came back, and this
 * writes a second row.
 *
 * ── The shape of the form ──
 *
 * The same AmountHero and editable figure as the card payment sheet, for the
 * same reason: the amount is the one thing you decide at the moment of doing
 * it, and a partial refund is the common case rather than the exception. Two
 * presets - the full remaining amount, and half - because "some of it came
 * back" is usually one of those two.
 *
 * The account defaults to where the money left but can be changed: a card
 * refund sometimes lands as cash, or against a different card.
 */
export default function RefundSheet({
  open, onClose, tx, allTxs = [], accounts = [], onRefund, saving = false,
}) {
  const [amount, setAmount] = useState('')
  const [to, setTo] = useState(/** @type {any} */ (null))
  const [pickerOpen, setPickerOpen] = useState(false)

  const remaining = useMemo(() => refundableAmount(tx, allTxs), [tx, allTxs])
  const already = useMemo(() => refundedAmount(tx, allTxs), [tx, allTxs])

  /* Hydrate on the way IN. Sheet renders null when closed but stays mounted
     through its own exit animation, so the parent can neither unmount nor
     re-key it to reset these for the next refund. */
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAmount(remaining > 0 ? numToMoneyStr(remaining) : '')
    const landed = accounts.find(a => a.name === tx?.account) ?? accounts[0] ?? null
    setTo(landed)
    setPickerOpen(false)
  }, [open, remaining, accounts, tx?.account])

  const value = parseMoney(amount)
  const over = value > remaining + 0.005
  const ready = value > 0 && !!to && !saving

  const presets = useMemo(() => {
    const out = []
    const add = (label, v) => {
      const r = Math.round(v * 100) / 100
      if (r > 0 && !out.some(p => Math.abs(p.value - r) < 0.005)) out.push({ label, value: r })
    }
    add('All of it', remaining)
    add('Half', remaining / 2)
    return out
  }, [remaining])

  /* Digits and one point, written out rather than using moneyChangeHandler:
     the hero shows the raw string, and re-inserting thousands separators
     mid-type moves the caret. */
  const onAmount = (e) => {
    const v = String(e.target.value).replace(/[^0-9.]/g, '')
    const parts = v.split('.')
    setAmount(parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : v)
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        z={130}
        scrim={55}
        dismissible={!saving}
        ariaLabel="Log a refund"
      >
        <div className="pb-1">
          <div className="text-center">
            <h3 className="text-17 font-semibold text-slate-900 dark:text-white">
              Log a refund
            </h3>
            <p className="mt-1 mx-auto max-w-[280px] text-13 leading-snug
              text-slate-400 dark:text-slate-500"
            >
              The original purchase stays as it is.<br />This records what came back.
            </p>
          </div>

          <AmountHero color={BACK_COLOR} className="mt-5 mb-6">
            <span className="inline-flex items-baseline justify-center gap-0.5">
              <span aria-hidden="true">₱</span>
              <input
                /* Sized to the text, not to the box. `size={1}` plus w-full
                   made the input as wide as the sheet allowed, so a short
                   figure centred itself away from the peso sign and rendered
                   as "P    650". Tracking the length keeps them adjacent at
                   every amount. */
                size={Math.max(1, amount.length)}
                value={amount}
                onChange={onAmount}
                inputMode="decimal"
                placeholder="0"
                aria-label="Refund amount"
                /* amount-hero-input, not a Tailwind size: index.css forces
                   every input to 16px !important so iOS does not zoom on
                   focus, and a utility cannot beat that. */
                className="amount-hero-input min-w-0 max-w-[220px] bg-transparent
                  outline-none text-center tabular-nums tracking-tight
                  placeholder:text-slate-300 dark:placeholder:text-slate-600"
                style={{ color: BACK_COLOR }}
              />
            </span>
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
                  {p.label} · {fmt(p.value)}
                </button>
              ))}
            </FadeScroller>
          )}

          <div className="flex flex-col mb-2">
            <DetailRow label="Purchase" value={tx?.description || tx?.category || 'Purchase'} padded={false} isLast />
            <DetailRow label="Paid" value={fmt(tx?.amount ?? 0)} padded={false} isLast />
            {already > 0 && (
              <DetailRow label="Already back" value={fmt(already)} padded={false} isLast />
            )}
          </div>

          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full flex items-center gap-3 mb-1 py-2 -mx-1 px-1 rounded-2xl
              active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
          >
            {to ? <AccountChip acct={to} size="sm" /> : null}
            <span className="flex-1 min-w-0 text-left">
              <span className="block text-11 text-slate-400 dark:text-slate-500">
                Coming back to
              </span>
              <span className="block text-14 font-semibold text-slate-800 dark:text-white truncate">
                {to?.name ?? 'Choose an account'}
              </span>
            </span>
            <span className="text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true">
              <IconChevronRight />
            </span>
          </button>

          {/* Said, not blocked. A shop can hand back more than you paid, and a
              shared bill can be settled generously - both are real, and the
              app warns rather than refusing everywhere else money moves. */}
          {over && (
            <p className="mb-2 text-11 text-amber-600 dark:text-amber-400">
              That is more than the {fmt(remaining)} still outstanding on this purchase.
            </p>
          )}

          <div className="mt-5 flex gap-2.5">
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="flex-[1.6]"
              onClick={() => onRefund({ amount: value, toAccount: to?.name })}
              disabled={!ready}
            >
              {saving ? 'Saving…' : 'Log refund'}
            </Button>
          </div>
        </div>
      </Sheet>

      <AccountPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        accounts={accounts}
        selected={to}
        onSelect={setTo}
      />
    </>
  )
}
