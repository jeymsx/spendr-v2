import { useState, useEffect } from 'react'
import { accountBrand } from '../lib/accountBrands'
import SwipeConfirm from './SwipeConfirm'
import Button from './ui/Button'
import Sheet from './ui/Sheet'
import CategoryGlyph from './CategoryGlyph'
import BrandMark from './BrandMark'

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

/* The type chip is gone. It sat above the amount saying "Expense" while the
   amount directly under it was already red with a minus in front of it, and
   the title can carry the word without spending a row on it. What is left per
   type is the sign, the colour, and the noun the title uses. */
const TYPE_CONFIG = {
  expense:  { noun: 'expense',  sign: '−', color: '#ef4444' },
  inflow:   { noun: 'inflow',   sign: '+', color: '#22c55e' },
  transfer: { noun: 'transfer', sign: '',  color: 'var(--color-primary)' },
}

/**
 * The rule over the amount.
 *
 * Decorative, deliberately. It is the one mark on the sheet that says "this is
 * a measured figure" rather than a number that was typed into a box, and it
 * does the job the chip was doing badly: the centre tick is tall and solid and
 * the rest fall away toward the edges, so the eye is delivered to the middle -
 * which is exactly where the amount sits underneath.
 *
 * Drawn, not imported: 41 lines cost less than any asset, and the ticks either
 * side take currentColor, so one class answers both themes.
 */
function AmountRule({ color }) {
  const TICKS = 41
  const W = 232
  const H = 24
  const mid = (TICKS - 1) / 2

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true"
      className="block mx-auto" style={{ maxWidth: W }}>
      {Array.from({ length: TICKS }, (_, i) => {
        const away = Math.abs(i - mid) / mid       // 0 at the centre, 1 at the ends
        const isMid = i === mid
        const h = isMid ? H : 7 + (1 - away) * 5
        // 0.75 in, so the round cap on the outermost tick cannot clip.
        const x = 0.75 + i * ((W - 1.5) / (TICKS - 1))
        return (
          <line key={i}
            x1={x} y1={(H - h) / 2} x2={x} y2={(H + h) / 2}
            stroke={isMid ? color : 'currentColor'}
            strokeWidth={isMid ? 2 : 1.25}
            strokeLinecap="round"
            /* Squared, not linear. A linear fade still left legible ticks
               hard against the ends, which reads as a rule that has been cut
               off rather than one that has faded out. */
            opacity={isMid ? 1 : 0.12 + (1 - away) ** 2 * 0.5}
          />
        )
      })}
    </svg>
  )
}

/**
 * One fact, as a row.
 *
 * Each of these used to be its own filled, rounded card with a gap beneath it,
 * so a transfer with a fee stacked nine little slabs down the sheet and the
 * eye had to cross nine borders to read nine values.
 *
 * Nothing is drawn between them now - not a card, not even a hairline. A
 * label hard left and its value hard right is already two columns; ruling
 * every pair was drawing a table nobody needed, and at three or four rows the
 * lines outnumbered the facts. Alignment and an even rhythm do the work.
 *
 * `accent` used to mean an amber card. It is amber TEXT now: the point was
 * that a fee is worth noticing, never that it deserved a box.
 */
function DetailRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className={`text-[13px] shrink-0 ${
        accent ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'
      }`}>
        {label}
      </span>
      <span className={`text-[14px] font-semibold text-right truncate ${
        accent ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'
      }`}>
        {value}
      </span>
    </div>
  )
}

/**
 * An account, as the card you already recognise.
 *
 * It was a name and an 8px colour dot on a row labelled "From" - the account
 * reduced to the one thing about it you never learned. Everywhere else in the
 * app an account is its card: GCash is the blue one, SPayLater the burnt
 * orange one, and you pick it out without reading. accountBrand gives the
 * same gradient and mark the full-size faces use, so the thumbnail here is
 * the same object seen smaller - the same call AccountSelectRow makes on the
 * form you just came from, at the same 46x29.
 *
 * `delta` is what this account is out or up by, and it is the whole reason the
 * two transfer legs exist: with a fee, the amount leaving the source is not
 * the amount arriving at the destination, and that is worth seeing on the two
 * rows it happens to rather than inferring from a total.
 */
/**
 * The card itself, at the real card ratio - 46x29 and 38x24 are both 1.586:1,
 * the same proportion the full-size faces use, so this is that object seen
 * smaller rather than a differently shaped swatch.
 *
 * `sm` is for the transfer pair, where two of these share one row: it buys
 * the names 8px each, which is the difference between "Maya Savings" fitting
 * and being truncated.
 */
function CardThumb({ account, sm = false }) {
  const brand = accountBrand(account)
  return (
    <span
      className={`shrink-0 rounded-lg overflow-hidden text-white
        flex items-center justify-center ${sm ? 'w-[38px] h-[24px]' : 'w-[46px] h-[29px]'}`}
      style={{ background: `linear-gradient(135deg, ${brand.from} 0%, ${brand.to} 100%)` }}
    >
      <BrandMark mark={brand.mark} size={sm ? 13 : 15} />
    </span>
  )
}

function AccountLine({ role, account }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <CardThumb account={account} />
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] leading-tight text-slate-400 dark:text-slate-500">
          {role}
        </span>
        <span className="block text-[14px] font-semibold leading-tight truncate
          text-slate-800 dark:text-slate-100">
          {account.name}
        </span>
      </span>
    </div>
  )
}

/**
 * One side of a transfer: the card, then what it is here and what it is
 * called, on one line.
 *
 * No figure. Each leg used to carry what that account was out or up by, so a
 * fee showed as -5,025 leaving and +5,000 arriving. Without a fee those were
 * the headline amount twice more with signs on it, and with one the fee row
 * above already states the difference - three numbers to say what two say.
 * The leg's job is to name the account, not to restate the arithmetic.
 */
function TransferLeg({ role, account }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <CardThumb account={account} sm />
      <span className="min-w-0">
        <span className="block text-[11px] leading-tight text-slate-400 dark:text-slate-500">
          {role}
        </span>
        <span className="block text-[14px] font-semibold leading-tight truncate
          text-slate-800 dark:text-slate-100">
          {account.name}
        </span>
      </span>
    </div>
  )
}

/** A breath between groups of rows, where a filled card used to do the job. */
function Divider() {
  return <div className="h-4" />
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
          : confirmLabel ?? (installment ? `Schedule ${installment.months} Payments` : 'Save transaction')}
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
          <p className="mt-1 mx-auto max-w-[268px] text-[12.5px] leading-snug
            text-slate-400 dark:text-slate-500">
            Check the details below. Nothing is saved to your ledger until you confirm.
          </p>
        </div>

        <div className="text-center mt-5 mb-6">
          <div className="text-slate-400 dark:text-slate-600">
            <AmountRule color={cfg.color} />
          </div>
          <p
            className="text-[40px] font-bold mt-1 tabular-nums leading-none"
            style={{ color: cfg.color }}
          >
            {cfg.sign}{fmt(amount)}
          </p>
          {installment && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
              per month · {installment.months} months · {fmt(installment.total)} total
            </p>
          )}
        </div>

        {/* One list, not a stack of cards. */}
        <div className="flex flex-col mb-6">
          {description && description.trim() && (
            <DetailRow label="Note" value={description} />
          )}
          {category && (
            <DetailRow label="Category" value={<><CategoryGlyph cat={category} size={14} className="inline-block mr-1.5 -mt-px" />{category.name}</>} />
          )}
          {hasFee && (
            <DetailRow label="Transfer fee" value={fmt(fee)} accent />
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
            /* A grid, not flex: 1fr a side gives the two legs equal room
               whatever the names are, so the arrow stays on the centre line of
               the sheet instead of drifting toward the longer name. */
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2.5">
              {fromAccount
                ? <TransferLeg role="From" account={fromAccount} />
                : <span />}
              <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.4"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </span>
              {toAccount
                ? <TransferLeg role="To" account={toAccount} />
                : <span />}
            </div>
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
        </div>

        {/* save-as-template, in the same flat language as the rows above */}
        {onSaveTemplate && (
          <div className="mb-5">
            <button
              type="button"
              onClick={() => setSaveTemplate(v => !v)}
              className="w-full flex items-center justify-between gap-4 py-3
                border-t border-slate-100 dark:border-white/[0.06]
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
