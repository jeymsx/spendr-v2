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
import { currencyOfAccountName } from '../../lib/fxContext'
import { estimateConversion } from '../../lib/transferLegs'

/** The accent the app paints money leaving an account. */
const PAY_COLOR = '#10b981'

/**
 * Paying a card, from the card's own page.
 *
 * ── Why it is not the transfer form ──
 *
 * A card payment IS a transfer, and the Bills page already opens the transfer
 * form with both ends filled in. That is right there - it is a bill in a list
 * of bills, and a list's job is to hand you off. On the card's own page the
 * hand-off is the wrong shape: you are already looking at the statement, the
 * amount and the due date, and being sent to a form that asks you to confirm
 * the two things on the screen in front of you reads as a detour.
 *
 * So this asks the two questions the page cannot answer - how much, from
 * where - and commits. Both arrive answered, so the common case is open,
 * swipe, done.
 *
 * ── The same sheet as a confirmation, because it is one ──
 *
 * The rule and the big figure are AmountHero, which is what TxConfirmSheet
 * puts above every transaction before it is written. This is that moment for
 * a payment, so it looks like it: the figure is the subject, the two rows
 * under it are the details, and the swipe is the commit.
 *
 * The difference is that the figure here is EDITABLE, because a payment is
 * the one transaction whose amount you decide at the moment of paying. So the
 * hero is an input styled as the hero rather than a rendered value - one
 * control, no second amount field competing with the one you are reading.
 *
 * ── The presets ──
 *
 * Three figures a card can want, and they are genuinely different questions:
 * the closed statement (what avoids interest), the minimum (what avoids a
 * late fee), and everything outstanding including charges since the cutoff
 * (what clears the card). Only the ones that exist and differ are offered - a
 * card whose statement equals its balance gets one chip, not three saying the
 * same number.
 */
export default function CardPaymentSheet({
  open, onClose, card, accounts = [], status, onPay, saving = false,
}) {
  /* Two currencies can be in play here and they are not the same question:
     the presets are amounts OWED on the card, and the shortfall warning is
     about the account the money would leave. A dollar card paid from a peso
     account is exactly the case that makes conflating them wrong. */

  const [amount, setAmount] = useState('')
  const [from, setFrom] = useState(/** @type {any} */ (null))
  const [pickerOpen, setPickerOpen] = useState(false)
  const amountRef = useRef(/** @type {HTMLInputElement|null} */ (null))

  /* Anything that can send money. A card cannot pay a card - the balance
     would move the wrong way on both ends and the statement would read as
     settled by more debt. */
  const cardCur = currencyOfAccountName(card?.name)
  const fromCur = currencyOfAccountName(from?.name)

  const payable = useMemo(
    () => accounts.filter(a => a.type !== 'credit' && a.name !== card?.name),
    [accounts, card],
  )

  const presets = useMemo(() => {
    const out = []
    const add = (label, value) => {
      if (value > 0 && !out.some(p => Math.abs(p.value - value) < 0.005)) {
        out.push({ label, value })
      }
    }
    add('Statement', status?.stmtOutstanding ?? 0)
    add('Minimum', status?.minimumDue ?? 0)
    add('Full balance', status?.currentBalance ?? 0)
    return out
  }, [status])

  /* Hydrate on the way IN. The sheet renders null when closed but stays
     mounted through its own exit animation, so the parent can neither unmount
     nor re-key it to reset these for the next payment. */
  const due = status?.stmtOutstanding || status?.currentBalance || 0
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAmount(due > 0 ? numToMoneyStr(due) : '')
    /* The fullest account, which is the one most likely to cover it. Not the
       last one used: a card payment is large and infrequent, and whatever
       covered the last one may not cover this. */
    setFrom([...payable].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))[0] ?? null)
    setPickerOpen(false)
  }, [open, due, payable])

  const value = parseMoney(amount)
  /* What LEAVES the source, in the source's currency. The same number when
     both are in one currency; today's estimate when they are not, because
     the card is asking for pesos and the dollar account pays in dollars.
     Null when there is no rate to estimate with, and then the sheet cannot
     say what this costs, so it does not let the payment through - the
     transfer form, which asks for both figures, still can. */
  const crosses = !!from && fromCur !== cardCur
  const sourceValue = crosses ? estimateConversion(value, cardCur, fromCur) : value
  const short = from && sourceValue != null ? sourceValue - (from.balance ?? 0) : 0
  const ready = value > 0 && !!from && !saving && sourceValue != null

  /* Digits and one point, same rule as every other money input - but written
     out rather than using moneyChangeHandler, because the hero shows the raw
     string and re-inserting thousands separators mid-type moves the caret. */
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
        z={120}
        scrim={55}
        dismissible={!saving}
        ariaLabel={`Pay ${card?.name ?? 'card'}`}
      >
        <div className="pb-1">
          <div className="text-center">
            <h3 className="text-17 font-semibold text-slate-900 dark:text-white">
              Pay {card?.name}
            </h3>
            <p className="mt-1 mx-auto max-w-[268px] text-13 leading-snug
              text-slate-400 dark:text-slate-500"
            >
              Moves money to the card.<br />Nothing is spent.
            </p>
          </div>

          {/* The hero IS the input. */}
          <AmountHero color={PAY_COLOR} className="mt-5 mb-6">
            <AmountInput
              currency={cardCur}
              ref={amountRef}
              value={amount}
              onChange={onAmount}
              label="Payment amount"
              color={PAY_COLOR}
            />
          </AmountHero>

          {presets.length > 1 && (
            /* A rail, not a centred row.

               justify-center on a flex container whose content overflows
               pushes the leading items off the START edge, and there is no
               scroll position that brings them back - the first preset was
               both unreadable and unreachable. Three chips of "Label - P0,000"
               overflow any phone, so this was the normal case, not the edge.

               Left-aligned it scrolls like every other chip row here, and
               FadeScroller feathers whichever end still has chips past it -
               nothing at the end you have reached, so the row never implies
               presets that are not there. */
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
                  {p.label} · {fmt(p.value, cardCur)}
                </button>
              ))}
            </FadeScroller>
          )}

          {/* The same bare rows the confirm sheet uses: a label hard left, its
              value hard right, no card and no rules between them. */}
          <div className="flex flex-col mb-2">
            <DetailRow label="Card" value={card?.name} padded={false} isLast />
            {status?.nextDue && (
              <DetailRow label="Due" value={status.nextDue} padded={false} isLast />
            )}
          </div>

          {payable.length === 0 ? (
            <p className="mb-5 text-12 text-amber-600 dark:text-amber-400">
              You need a cash, e-wallet, bank or savings account to pay from.
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
                <span className="block text-11 text-slate-400 dark:text-slate-500">
                  Paying from
                </span>
                <span className="block text-14 font-semibold text-slate-800 dark:text-white truncate">
                  {from?.name ?? 'Choose an account'}
                </span>
              </span>
              <span className="text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true">
                <IconChevronRight />
              </span>
            </button>
          )}

          {crosses && value > 0 && (
            sourceValue != null ? (
              <DetailRow
                label={`From ${from?.name}`}
                value={`≈ ${fmt(sourceValue, fromCur)}`}
                sub="At today's rate"
                padded={false}
                isLast
              />
            ) : (
              <p className="mb-2 text-11 text-amber-600 dark:text-amber-400">
                There is no {fromCur} to {cardCur} rate yet. Use Transfer to enter what left {from?.name} and what reached the card.
              </p>
            )
          )}

          {/* Said, not blocked: the app warns and lets you through everywhere
              else money moves, because the balance it knows about is not
              always the balance you have. */}
          {short > 0 && (
            <p className="mb-2 text-11 text-amber-600 dark:text-amber-400">
              This leaves {from?.name} short by {fmt(short, fromCur)}.
            </p>
          )}
          {/* Paying more than the card holds is allowed - the rest stays on it
              as a credit, counted in net worth - but it is said, because it is
              almost always a slip of a digit. */}
          {value > (status?.currentBalance ?? 0) + 0.005 && (
            <p className="mb-2 text-11 text-amber-600 dark:text-amber-400">
              {fmt(value - (status?.currentBalance ?? 0), cardCur)} more than you owe. It stays on the card as credit.
            </p>
          )}

          <div className="mt-5">
            <SwipeConfirm
              onConfirm={() => onPay({ amount: value, from, sourceAmount: crosses ? sourceValue : null })}
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
