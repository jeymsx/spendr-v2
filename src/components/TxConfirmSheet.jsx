import { useState, useEffect } from 'react'
import SwipeConfirm from './SwipeConfirm'
import Button from './ui/Button'
import DetailRow from './ui/DetailRow'
import Divider from './ui/Divider'
import Sheet from './ui/Sheet'
import CategoryGlyph from './CategoryGlyph'
import AmountHero from './ui/AmountHero'
import AccountLine, { TransferLegs } from './AccountLine'
import { fmt } from '../lib/money'

function ToggleSwitch({ on }) {
  return (
    <span className={`inline-flex items-center shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors duration-200 ${on ? 'bg-primary' : 'bg-slate-200 dark:bg-white/25'}`}>
      <span className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </span>
  )
}

/* The type chip is gone. It sat above the amount saying "Expense" while the
   amount directly under it was already red with a minus in front of it, and
   the title can carry the word without spending a row on it. What is left per
   type is the sign, the colour, and the noun the title uses. */
const TYPE_CONFIG = {
  expense:  { noun: 'expense',  sign: '−', color: '#ef4444' },
  inflow:   { noun: 'inflow',   sign: '+', color: '#22c55e' },
  transfer: { noun: 'transfer', sign: '',  color: 'var(--color-primary)' },
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
  /* The confirm button's words. "Save transaction" is right when a form is
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
  const [saveTemplate, setSaveTemplate] = useState(false)

  const cfg    = TYPE_CONFIG[type] ?? TYPE_CONFIG.expense
  const hasFee = type === 'transfer' && fee > 0

  useEffect(() => {
    if (open) {
      // Reset-on-open. The sheet renders null when closed but stays mounted
      // through its own exit animation, so the parent can neither unmount
      // nor re-key it to clear this for the next record.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSaveTemplate(false)
    }
  }, [open])

  /* The overlay, the panel, the grab handle, the scroll lock, the exit
     animation, the float-or-dock measurement, Escape, the focus trap and the
     dialog role all live in <Sheet> now. What is left in this file is what
     the sheet is ABOUT. */

  /* The template's name, worked out rather than asked for.

     The toggle used to reveal a text field pre-filled with the note, which
     made naming a decision you had to make at the exact moment you were
     trying to finish - and for a transfer, which has no note field at all,
     it opened empty and the template silently did not save.

     So: the note if you wrote one, else the thing that identifies this
     record on its own - the two accounts for a transfer, the category for
     anything else. A transfer from Metrobank to Maya is called "Metrobank →
     Maya", because that is what it is. */
  const templateName = (
    description?.trim()
    || (type === 'transfer'
      ? [fromAccount?.name, toAccount?.name].filter(Boolean).join(' → ')
      : '')
    || category?.name
    || cfg.noun.charAt(0).toUpperCase() + cfg.noun.slice(1)
  )

  /* Only the fields that apply. Spreading undefined ones wrote keys with no
     value into the row, and applyTemplate then had to test each one anyway. */
  const templatePayload = () => ({
    name: templateName,
    type,
    amount,
    ...(description?.trim() ? { description: description.trim() } : {}),
    ...(category    ? { category:    category.name    } : {}),
    ...(account     ? { account:     account.name     } : {}),
    ...(fromAccount ? { fromAccount: fromAccount.name } : {}),
    ...(toAccount   ? { toAccount:   toAccount.name   } : {}),
  })

  /* The actions are Sheet's `footer`, which pins them under the scrolling
     body. They used to be the last thing inside a panel that scrolled as one
     piece, so on a short screen - and on desktop, where the modal is capped
     at 84vh - Save transaction sat below the fold. */
  const actions = swipeToConfirm ? (
    /* Stacked, not side by side. A drag needs the full width to have any
       travel in it, and a 52px pill next to a Cancel button would give the
       gesture about 200px to happen in. */
    <div className="flex flex-col gap-2">
      <SwipeConfirm
        onConfirm={() => onConfirm(null)}
        label={confirmLabel ?? 'Swipe to confirm'}
        confirmingLabel={savingLabel}
        busy={saving}
      />
      <Button variant="quiet" size="sm" block onClick={onClose} disabled={saving}>
        Cancel
      </Button>
    </div>
  ) : (
    <div className="flex gap-3">
      <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button
        className="flex-[2]"
        loading={saving}
        onClick={() => {
          onConfirm(saveTemplate && onSaveTemplate ? templatePayload() : null)
        }}
      >
        {saving ? savingLabel
          : confirmLabel ?? (installment ? `Schedule ${installment.months} payments` : 'Save transaction')}
      </Button>
    </div>
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={120}
      scrim={50}
      /* Not while it is writing: the sheet that is saving a transaction must
         not be dismissed out from under the write. */
      dismissible={!saving}
      /* The heading is centred and carries a subtitle, so it stays in the
         body rather than using Sheet's own left-aligned title - but the
         dialog still needs a name, and this is it. */
      ariaLabel={`Confirm ${cfg.noun}`}
      footer={actions}
    >
      <div>
        {/* A name for what is about to happen, then the rule, then the figure.

            The sheet used to open on a chip and a number with nothing saying
            what either was for. Naming the act, and saying plainly that it is
            about to be written, is what makes this a confirmation rather than
            a receipt for something already done. */}
        <div className="text-center">
          <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white">
            Confirm {cfg.noun}
          </h3>
          {/* The break is written, not negotiated.

              Greedy wrapping stranded "confirm." alone on the second line.
              text-wrap: balance fixed the orphan and then broke after "your",
              which splits the sentence mid-phrase - "Nothing is saved to
              your / ledger until you confirm." reads worse than the problem
              it solved, because "your ledger" is one idea.

              So the break is explicit and lands where the clause does. This
              is a fixed 48-character subtitle in a 268px box, not flowing
              body copy: the line it wants is knowable, and a <br> is how you
              say so. Both halves fit well inside the box at the narrowest
              phone this runs on, so nothing re-wraps underneath it. */}
          <p className="mt-1 mx-auto max-w-[268px] text-[12.5px] leading-snug
            text-slate-400 dark:text-slate-500">
            Nothing is saved to your ledger<br />until you confirm.
          </p>
        </div>

        <AmountHero
          color={cfg.color}
          className="mt-5 mb-6"
          sub={installment
            ? `per month · ${installment.months} months · ${fmt(installment.total)} total`
            : null}
        >
          {cfg.sign}{fmt(amount)}
        </AmountHero>

        {/* One list, not a stack of cards.

            Every row is `isLast`, which is not a mistake: nothing is drawn
            between these - not a card, not even a hairline. A label hard left
            and its value hard right is already two columns, and this stack is
            not inside a card, so a full-bleed rule between each pair would be
            drawing a table across the sheet's own gutter. `padded={false}`
            for the same reason: the sheet already owns the horizontal inset. */}
        <div className="flex flex-col mb-6">
          {description && description.trim() && (
            <DetailRow label="Note" value={description} padded={false} isLast />
          )}
          {category && (
            <DetailRow label="Category" value={<><CategoryGlyph cat={category} size={14} className="inline-block mr-1.5 -mt-px" />{category.name}</>} padded={false} isLast />
          )}
          {hasFee && (
            <DetailRow label="Transfer fee" value={fmt(fee)} tone="text-amber-600 dark:text-amber-400" padded={false} isLast />
          )}
          {account && (
            <AccountLine
              role={type === 'inflow' ? 'Received in' : 'Paid from'}
              account={account}
            />
          )}

          {/* The two legs, side by side, with the arrow between them.

              Stacked, they were two rows that happened to be about the same
              event, and the arrow had to sit out in the left margin pointing
              down a column to say so. Laid out across, the movement IS the
              layout: source, direction, destination, read in the order it
              happens.

              They close the list because they are the conclusion - everything
              above is what this transfer IS, and this is what it DOES to the
              two accounts. The four-row fee breakdown that used to follow is
              gone: "Total from GCash" and "Received by Maya" said in words
              exactly what the legs and the fee row now say between them. */}
          {(fromAccount || toAccount) && (
            <TransferLegs from={fromAccount} to={toAccount} />
          )}

          {/* Installment schedule */}
          {installment && (
            <>
              <div className="h-4" />
              <DetailRow label="Per month"      value={fmt(installment.monthly)} padded={false} isLast />
              <DetailRow label="Months"         value={`${installment.months}`} padded={false} isLast />
              <DetailRow label="Total"          value={fmt(installment.total)} tone="text-amber-600 dark:text-amber-400" padded={false} isLast />
              <DetailRow label="First payment"  value={installment.firstLabel} padded={false} isLast />
              <DetailRow label="Last payment"   value={installment.lastLabel} padded={false} isLast />
            </>
          )}
        </div>

        {/* save-as-template, in the same flat language as the rows above */}
        {onSaveTemplate && (
          <div className="mb-5">
            <Divider />
            <button
              type="button"
              onClick={() => setSaveTemplate(v => !v)}
              className="w-full flex items-center justify-between gap-4 py-3
                active:opacity-60 transition-opacity"
            >
              <div className="flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 shrink-0">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <span className="text-[13px] text-slate-500 dark:text-slate-400">Save as template</span>
              </div>
              <ToggleSwitch on={saveTemplate} />
            </button>
          </div>
        )}

      </div>
    </Sheet>
  )
}
