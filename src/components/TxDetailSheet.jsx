import { cloneElement, useEffect, useState, useMemo } from 'react'
import db, { UNSYNCED } from '../db/db'
import { postRefund } from '../db/txHelpers'
import { reverseBalanceEffect, applyBalanceEffect } from '../db/txHelpers'
import { moveToTrash, restoreFromTrash } from '../db/trash'
import { findInstallmentGroup, isInstallmentRow } from '../utils/installments'
import { isoToDateInput, dateInputToIso } from '../utils/txDate'
import { isRefund, refundedAmount, refundableAmount, splitGroup, splitTotal } from '../lib/txMoney'
import { outstanding, isSettled } from '../lib/people'
import RefundSheet from './RefundSheet'
import { useLiveQuery } from '../hooks/useLiveQuery'
import CategoryPickerSheet from './CategoryPickerSheet'
import AccountPickerSheet from './AccountPickerSheet'
import { useToast } from '../context/ToastContext'
import { EditRow, RowInput, RowDate, RowPicker } from './FormRows'
import CategoryGlyph from './CategoryGlyph'
import AmountHero from './ui/AmountHero'
import SwipeConfirm from './SwipeConfirm'
import { CardThumb, TransferLegs } from './AccountLine'
import { feeOf } from '../lib/transferFee'
import Button from './ui/Button'
import Card from './ui/Card'
import DetailRow from './ui/DetailRow'
import IconButton from './ui/IconButton'
import Sheet from './ui/Sheet'
import { fmt, baseSymbol } from '../lib/money'
import { currencyOfTx, repriceForEdit } from '../lib/fxContext'
import { isAdjustment } from '../lib/flows'
import { impliedRate, rederiveReceived } from '../lib/transferLegs'
import { interestLoanOf, isLoanPayment, loanPairOf } from '../lib/loans'

const TYPE_CFG = {
  expense:  { label: 'Expense',  color: '#ef4444', badge: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',      sign: '−' },
  inflow:   { label: 'Inflow',   color: '#22c55e', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400', sign: '+' },
  transfer: { label: 'Transfer', color: 'var(--color-primary)', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',   sign: '' },
}

/* Was `isoStr.slice(0, 10)`, which is the UTC date. The row two lines down
   renders with toLocaleDateString, so the sheet SHOWED one day and offered a
   different one to edit for anybody east of Greenwich in the evening. See
   utils/txDate.js. */
const toLocalDateStr = isoToDateInput

function fmtDisplayDate(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// ── Edit rows ──────────────────────────────────────────────────────────────────

/**
 * An editable row of the same inset group the detail view uses.
 *
 * The fields here were label-above-box: a stack of five captions each with a
 * 48px bordered input under it, which is a web form wearing rounded corners.
 * Native editing on iOS - Contacts, Settings - keeps the grouped list and just
 * makes the right-hand value editable in place. Label left, value right, one
 * container, hairline separators.
 *
 * That also means edit mode no longer reshapes the card. Detail and edit are
 * the same layout with the same rows in the same places; only the values
 * become typeable, which is what makes tapping Edit feel like a mode rather
 * than a different screen.
 */
// ── Main component ─────────────────────────────────────────────────────────────

export default function TxDetailSheet({
  open, onClose, transaction: tx, accounts = [], categories = [], zIndex = 100,
  /**
   * Hand the whole edit off instead of opening the rows below.
   *
   * The mobile pages pass this and it routes to the form that CREATED the
   * transaction, where every control exists rather than the five that fit in
   * a panel. Nothing passes it on desktop, where the sheet is an overlay
   * inside a layout of its own and navigating away from it would leave the
   * page behind it - so that side keeps the inline rows, unchanged.
   */
  onEdit = null,
  /**
   * 'delete' opens straight on the delete confirmation - for a row swiped
   * away in a list that is part of a plan, where one gesture should not take
   * twelve payments without saying so.
   */
  startWith = 'detail',
}) {
  /* The record the panel keeps showing while it slides away - see the note
     above `rec`. State rather than a ref, because a ref read during render is
     not something the component re-renders for, and the compiler is right to
     say so. */
  const [lastTx, setLastTx] = useState(null)
  const { showToast } = useToast()

  // The sheet is handed a single transaction, so the plan's other months are
  // looked up here rather than threaded in from both call sites.
  const planRows = useLiveQuery(async () => {
    if (!tx || !isInstallmentRow(tx)) return null
    const all = await db.transactions.toArray()
    const group = findInstallmentGroup(tx, all)
    return group.length > 1 ? group : null
  }, [tx?.id, tx?.installmentId, tx?.description], null)

  const planCount = planRows?.length ?? 0
  const planTotal = (planRows ?? []).reduce((s, t) => s + (t.amount ?? 0), 0)

  /* Every transaction, for the refund maths. Only fetched for a purchase that
     could have one - a transfer, an inflow or a refund itself never can, and
     the sheet opens on every row in the app. */
  /* A correction or an investment's value moving is a row the app wrote to
     match a balance, not a purchase: nothing to refund, and editing it as an
     expense or an inflow would dress it up as one. Delete it and record the
     value again instead. */
  const adjustment = isAdjustment(tx)
  const canRefund = tx?.type === 'expense' && !!tx?.txId && !isRefund(tx) && !adjustment
  /* Also when this is a leg of a split, which needs its siblings to say what
     the whole purchase came to. */
  // And for a transfer, whose fee is a row of its own (lib/transferFee.js).
  const needsAll = canRefund || !!tx?.splitId || tx?.type === 'transfer'
  const allTxs = useLiveQuery(
    async () => (needsAll ? db.transactions.toArray() : []),
    [needsAll, tx?.txId, tx?.splitId], [])

  /* A loan payment is two rows - what went to the loan, and its interest
     (lib/loans.js) - and the lists show them as one. Opened on either half,
     this shows the payment: the whole, and its two parts. Keyed on the
     record still on screen rather than `tx`, which goes null the moment the
     sheet starts to close: the payment would turn back into half of itself
     as it slid away. */
  const shown = tx ?? lastTx
  const loanHalf = isLoanPayment(shown) || interestLoanOf(shown) != null
  const loanPair = useLiveQuery(
    async () => (loanHalf ? loanPairOf(shown, await db.transactions.toArray()) : null),
    [loanHalf, shown?.id, shown?.date], null)

  const legs = tx?.splitId ? splitGroup(tx, allTxs) : []
  const wholePurchase = tx?.splitId ? splitTotal(tx, allTxs) : 0
  /* Deleting one part deletes the purchase (db/txHelpers.js expandDeletion),
     so its confirmation shows the purchase, not the part you opened. */
  const splitParts = legs.length > 1 ? legs.length : 0
  /* The fee the transfer was saved with: shown with it, and deleted with it
     (db/txHelpers.js expandDeletion), so the confirmation says so. */
  const transferFee = tx?.type === 'transfer' ? feeOf(tx, allTxs) : null

  /* Who owes you a piece of this.

     Matched against every leg of the purchase, not just the row you tapped.
     A share is opened against ONE leg - whichever came first - so keying
     this on tx.txId alone would show the people on the Groceries leg and
     nothing at all on the Household one, which is the same purchase and the
     same debt.

     Filtered in JS: sourceTxId is a plain property with no Dexie index, and
     where() on an unindexed key throws - the same trap deleteTxGroup fell
     into. */
  const groupTxIds = (legs.length ? legs : tx ? [tx] : [])
    .map(t => t.txId).filter(Boolean)
  const shares = useLiveQuery(
    async () => (groupTxIds.length
      ? (await db.debts.toArray()).filter(d => d.sourceTxId && groupTxIds.includes(d.sourceTxId))
      : []),
    [groupTxIds.join(',')], [])

  const sharedTotal = shares.reduce((s, d) => s + (d.amount ?? 0), 0)
  const sharedLeft  = shares.reduce((s, d) => s + outstanding(d), 0)

  const backAlready = refundedAmount(tx, allTxs)
  const stillOut    = refundableAmount(tx, allTxs)
  const [refundOpen, setRefundOpen] = useState(false)
  const [refunding,  setRefunding]  = useState(false)

  async function handleRefund({ amount, toAccount }) {
    setRefunding(true)
    try {
      await postRefund({ originalTxId: tx.txId, amount, toAccount })
      showToast(`Refund of ${fmt(amount, currencyOfTx(tx))} logged`)
      setRefundOpen(false)
    } catch (e) {
      console.error('[TxDetailSheet] refund failed:', e)
      showToast(/** @type {any} */ (e)?.message ?? 'Could not log that refund', 'error')
    } finally {
      setRefunding(false)
    }
  }

  /* No `closing` flag and no scroll lock here: Sheet owns the overlay, the
     panel, the grab handle, the scroll lock, Escape, the focus trap and the
     exit animation, and `open` is the only thing that decides any of it. */
  const [mode,            setMode]            = useState('detail')   // 'detail' | 'edit' | 'confirm-delete'
  const [saving,          setSaving]          = useState(false)

  // edit state
  const [editAmount,      setEditAmount]      = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editDate,        setEditDate]        = useState('')
  const [editCategory,    setEditCategory]    = useState(null)
  const [editAccount,     setEditAccount]     = useState(null)
  const [editFrom,        setEditFrom]        = useState(null)
  const [editTo,          setEditTo]          = useState(null)

  // nested pickers
  const [showCatPicker,  setShowCatPicker]  = useState(false)
  const [showAcctPicker, setShowAcctPicker] = useState(false)
  const [showFromPicker, setShowFromPicker] = useState(false)
  const [showToPicker,   setShowToPicker]   = useState(false)

  const acctMap = useMemo(() => Object.fromEntries(accounts.map(a => [a.name, a])), [accounts])
  const catMap  = useMemo(() => Object.fromEntries(categories.map(c => [c.name, c])), [categories])

  // reset mode when a different transaction is opened
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tx) setLastTx(tx)
  }, [tx])

  useEffect(() => {
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tx) setMode(startWith === 'delete' ? 'confirm-delete' : 'detail')
    setSaving(false)
    // Hydrates the form when the sheet opens. Listing every field would
    // re-run the effect that SETS them and clobber edits in progress;
    // `open` plus the record id is what actually means "something else is
    // being edited now".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx?.id])

  function enterEdit() {
    if (!tx) return
    if (onEdit) { onEdit(tx); return }
    setEditAmount(String(tx.amount ?? ''))
    setEditDescription(tx.description ?? '')
    setEditDate(toLocalDateStr(tx.date))
    setEditCategory(catMap[tx.category] ?? null)
    setEditAccount(acctMap[tx.account] ?? null)
    setEditFrom(acctMap[tx.fromAccount] ?? null)
    setEditTo(acctMap[tx.toAccount] ?? null)
    setMode('edit')
  }

  async function handleSave() {
    setSaving(true)
    try {
      const newAmount = parseFloat(editAmount) || 0
      const now = new Date().toISOString()
      /* Same two-clock problem as the field above: the old form pasted a
         local date onto a UTC time. */
      // A plan's payment keeps a date ahead; anything else is capped at now.
      const newDateISO = editDate ? dateInputToIso(editDate, tx.date, undefined, isInstallmentRow(tx)) : tx.date

      const patch = { amount: newAmount, description: editDescription.trim(), date: newDateISO, updatedAt: now, synced: UNSYNCED }

      if (tx.type !== 'transfer') {
        patch.category = editCategory?.name ?? tx.category
        patch.account  = editAccount?.name  ?? tx.account
      } else {
        patch.fromAccount = editFrom?.name ?? tx.fromAccount
        patch.toAccount   = editTo?.name   ?? tx.toAccount
        /* The received leg follows the edit: scaled at the rate the transfer
           actually got when only the amount moved, re-estimated when an end
           changed, cleared when both ends now share a currency. See
           lib/transferLegs.js. */
        const leg = rederiveReceived(tx, { ...tx, ...patch })
        patch.toAmount   = leg.toAmount
        patch.toCurrency = leg.toCurrency
      }
      // The totals read baseAmount first, so it has to follow the new amount.
      Object.assign(patch, repriceForEdit(tx, patch))

      await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
        await reverseBalanceEffect(tx)
        await applyBalanceEffect({ ...tx, ...patch })
        await db.transactions.update(tx.id, patch)
      })
      onClose()
    } catch (e) {
      console.error('[TxDetailSheet] save failed:', e)
      showToast('Failed to save changes', 'error')
      setSaving(false)
    }
  }

  /* Into Recently deleted (db/trash.js), whole: a plan with all its months,
     and whatever deleting the row takes with it - a split's other legs, its
     refunds, what a settlement paid. Undo is putting it straight back. It
     used to delete a single row by hand here, which left a split's other
     legs and a settlement's payments behind; moveToTrash goes through the
     one deletion the rest of the app uses. */
  async function handleDelete() {
    setSaving(true)
    const group = planCount > 1 ? planRows.map(t => ({ ...t })) : [{ ...tx }]
    try {
      const moved = await moveToTrash(group)
      onClose()
      if (!moved) return
      const what = planCount > 1 ? `${moved.count} payments` : moved.count > 1 ? `${moved.count} transactions` : 'Transaction'
      showToast(`${what} moved to Recently deleted`, 'success', {
        actionLabel: 'Undo',
        onAction: async () => {
          try {
            const n = await restoreFromTrash(moved.id)
            showToast(n ? (n > 1 ? `${n} transactions restored` : 'Transaction restored') : 'Already restored',
                      n ? 'success' : 'warning')
          } catch (err) {
            console.error('[TxDetailSheet] undo failed:', err)
            showToast('Undo failed', 'error')
          }
        },
      })
    } catch (e) {
      console.error('[TxDetailSheet] delete failed:', e)
      showToast('Failed to delete transaction', 'error')
      setSaving(false)
    }
  }

  /* Hold the last record across the exit.

     Every caller nulls its selection inside onClose - setSelectedTx(null) on
     Transactions, AccountDetail and three desktop pages - in the same batch
     that flips `open` false. With a bare `if (!tx) return null` the whole
     Sheet unmounted on the very next render, so the panel vanished instead of
     sliding away. Sheet keeps ITS contents alive through the exit, but it
     cannot help if the component above it stops rendering.

     So: remember the last non-null record and read that. It is only ever the
     thing the sheet is already showing. */
  const rec = tx ?? lastTx
  if (!rec) return null

  /* Every figure in this sheet is this one transaction's, or derived from
     it - the refund that came back, the split it belongs to, the whole
     installment plan. So they are all in ITS currency, not the ledger's: a
     $40 charge showed as -P40.00 here, which is wrong by a factor of sixty
     and looks entirely plausible. */
  const txCur       = currencyOfTx(rec)
  /** The loan payment this row is half of, as its two parts; null for any other row. */
  const payment     = loanPair
    ? (isLoanPayment(rec) ? { principal: rec, interest: loanPair } : { principal: loanPair, interest: rec })
    : null
  // A payment reads as what it mostly is, money moved to the loan.
  const cfg         = payment ? TYPE_CFG.transfer : (TYPE_CFG[rec.type] ?? TYPE_CFG.expense)
  const heroAmount  = payment
    ? fmt((payment.principal.amount ?? 0) + (payment.interest.amount ?? 0), txCur)
    : `${cfg.sign}${fmt(rec.amount, txCur)}`
  const cat         = catMap[rec.category]
  const acct        = acctMap[rec.account]
  const fromAcct    = acctMap[rec.fromAccount]
  const toAcct      = acctMap[rec.toAccount]
  const editCatList = categories.filter(c => c.type === rec.type)
    .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name))

  /* One action row per mode, pinned by Sheet under the scrolling body.

     They used to be the last thing inside each mode's block, so anything
     that made the card tall - a plan warning, a long note - pushed Save or
     Delete below the fold of a panel that scrolls as one piece. */
  const footer = {
    detail: (
      <div className="flex gap-3">
        <Button
          variant="dangerTint"
          className="flex-1"
          onClick={() => setMode('confirm-delete')}
        >
          Delete
        </Button>
        {canRefund && stillOut > 0 && (
          <Button variant="secondary" className="flex-1" onClick={() => setRefundOpen(true)}>
            Refund
          </Button>
        )}
        {/* Nor for a loan payment: its split is worked out from the loan's
            rate, and editing one half would leave the other wrong. Delete
            takes both, and paying again splits it afresh. */}
        {!adjustment && !payment && (
          <Button className="flex-[2]" onClick={enterEdit}>
            Edit
          </Button>
        )}
      </div>
    ),
    edit: (
      <div className="flex gap-2.5">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => setMode('detail')} disabled={saving}
        >
          Cancel
        </Button>
        <Button
          className="flex-[1.6]"
          onClick={handleSave} disabled={saving || !parseFloat(editAmount)}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    ),
    /* A drag, not a tap. This sheet already exists because a tap was too
       cheap for the act; answering it with another tap put the whole weight
       of the decision on reading a heading. Cancel stays a tap - backing out
       should always be the easy one. */
    'confirm-delete': (
      <div>
        <SwipeConfirm
          tone="danger"
          label={planCount > 1 ? `Swipe to delete all ${planCount}` : 'Swipe to delete'}
          confirmingLabel="Deleting…"
          busy={saving}
          onConfirm={handleDelete}
        />
        {!saving && (
          <Button block variant="quiet" size="sm" className="mt-2" onClick={() => setMode('detail')}>
            Cancel
          </Button>
        )}
      </div>
    ),
  }[mode]

  /* Only edit heads itself with Sheet's own left-aligned title. Detail's
     heading is the coloured type pill and delete's is a red disc over a
     centred line - both graphics rather than lines of text, so both stay in
     the body and ariaLabel names the dialog instead. */
  // Sentence case, as every page and sheet title is: "Edit expense".
  const title = mode === 'edit' ? `Edit ${cfg.label.toLowerCase()}` : null

  const deleteHeading = planCount > 1 ? 'Delete whole plan?' : payment ? 'Delete this loan payment?' : 'Delete this transaction?'

  return (
    <>
      {/* ── A floating card, not a slab, and now not by hand ──

          This panel was flush to the bottom edge with only its top corners
          rounded - the Android bottom-sheet shape - and was hand-converted to
          the iOS one: inset from every edge, rounded all the way round, so
          the page is visibly behind it rather than covered by it.

          That geometry lives in Sheet now, and Sheet does the harder half of
          it: it measures at open time and only floats while the content fits,
          docking to the bottom edge when it does not - because a card that
          has to scroll with a gap beneath it puts its own bottom edge and the
          screen's in the same place, and the rounded corners then read as a
          rendering fault. So no maxHeight here: asking for a height would pin
          this to the docked shape permanently, and detail and delete both fit
          without scrolling on every phone this runs on.

          The glass went with the hand-rolled panel - Sheet's material is
          opaque, which retires the argument that a translucent card needs
          something soft behind it. The 55% scrim stays anyway, on its own
          merits: this opens over the transaction list, the densest page in
          the app, and what shows behind a sheet should read as a page rather
          than as rows you can almost finish reading.

          The grab handle comes back with Sheet, and the header's close button
          goes: the handle, the scrim and Escape all dismiss this now. ── */}
      <Sheet
        open={open}
        onClose={onClose}
        z={zIndex}
        scrim={55}
        /* Not while it is writing: the sheet that is saving or deleting a
           transaction must not be dismissed out from under the write. This
           is the `if (saving) return` the old local close() opened with. */
        dismissible={!saving}
        title={title}
        /* Used whenever there is no title - detail and delete. */
        ariaLabel={mode === 'confirm-delete' ? deleteHeading : `${cfg.label} details`}
        titleAction={mode === 'edit' ? (
          <IconButton
            label="Back to details"
            size="sm"
            onClick={() => setMode('detail')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </IconButton>
        ) : null}
        footer={footer}
      >
        <div>

          {/* ── DETAIL MODE ── */}
          {mode === 'detail' && (
            <>
              {/* The type, as a pill, centred where the confirm sheet puts
                  its title. This sheet has no title of its own - the pill is
                  the only thing naming what you are looking at, so it sits
                  where the name goes rather than hard left. */}
              <div className="flex justify-center">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-11 font-semibold ${cfg.badge}`}>
                  {payment ? 'Loan payment' : cfg.label}
                </span>
              </div>

              <AmountHero color={cfg.color} className="mt-5 mb-6">
                {heroAmount}
              </AmountHero>

              {/* What the purchase actually cost, once money came back.

                  Under the hero rather than replacing it, because the hero is
                  what you paid and that stays true - editing it down would
                  rewrite a statement the bank already billed. This is the
                  second fact, not a correction of the first. */}
              {backAlready > 0 && (
                <p className="-mt-4 mb-6 text-center text-13 text-emerald-600 dark:text-emerald-400">
                  Refunded {fmt(backAlready, txCur)}
                  <span className="text-slate-400 dark:text-slate-500">
                    {' · '}{fmt(Math.max(0, stillOut), txCur)} net
                  </span>
                </p>
              )}

              {/* The hero is what LEFT the account, and that stays true. But
                  when part of it is owed back, a figure with nothing beside
                  it reads as money you spent - so the share is said here,
                  the same way a refund is. Without this there was no sign
                  anywhere on the sheet that a purchase was shared at all. */}
              {sharedTotal > 0 && (
                <p className="-mt-4 mb-6 text-center text-13">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {fmt(sharedTotal, txCur)} shared
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">
                    {sharedLeft > 0.005
                      ? ` · ${fmt(sharedLeft, txCur)} still owed to you`
                      : ' · all settled'}
                  </span>
                </p>
              )}

              {/* One leg of a purchase filed under several categories. The
                  hero shows THIS leg, because that is the row you tapped and
                  the amount that hit this category - so the whole is said
                  here rather than by inflating the figure above. */}
              {legs.length > 1 && (
                <p className="-mt-4 mb-6 text-center text-13 text-slate-400 dark:text-slate-500">
                  Part of {fmt(wholePurchase, txCur)} across {legs.length} categories
                </p>
              )}

              {/* One list, not a card of rows.

                  This is the confirm sheet's stack, and deliberately: the two
                  sheets show the same transaction either side of the moment it
                  is written, and this one used to box its rows in a recessed
                  card while the other laid them flat. Same object, two
                  containers, so arriving from the ledger looked like a
                  different kind of thing from arriving from the form.

                  Every row is `isLast` on purpose - nothing is drawn between
                  them. A label hard left and its value hard right is already
                  two columns, and the sheet owns the horizontal inset, so
                  `padded={false}` keeps them on its gutter. */}
              <div className="flex flex-col">
                {payment && (
                  <>
                    <DetailRow label={`To ${payment.principal.toAccount}`} value={fmt(payment.principal.amount, txCur)} padded={false} isLast />
                    <DetailRow label="Interest" value={fmt(payment.interest.amount, txCur)} padded={false} isLast />
                  </>
                )}
                {/* The notes and the interest's category are the app's own
                    words for the two halves - the rows above say it. */}
                {!payment && rec.description && rec.description.trim() && (
                  <DetailRow label="Note" value={rec.description} padded={false} isLast />
                )}
                {cat && !payment && (
                  <DetailRow
                    label="Category"
                    value={<><CategoryGlyph cat={cat} size={14} className="inline-block mr-1.5 -mt-px" />{cat.name}</>}
                    padded={false}
                    isLast
                  />
                )}
                {/* The account is a row like the others, with its card as
                    the value rather than a coloured dot. It was a two-line
                    block of its own under the list - a fourth fact about the
                    transaction, presented as though it were a different kind
                    of fact. */}
                {acct && !payment && (
                  <DetailRow
                    label="Account"
                    value={(
                      <span className="inline-flex items-center gap-2 align-middle">
                        <CardThumb account={acct} sm />
                        {acct.name}
                      </span>
                    )}
                    padded={false}
                    isLast
                  />
                )}
                {legs.length > 1 && (
                  <DetailRow
                    label="Split"
                    value={legs.map(l => l.category).filter(Boolean).join(', ')}
                    sub={`${fmt(wholePurchase, txCur)} in total`}
                    padded={false}
                    isLast
                  />
                )}
                {shares.length > 0 && (
                  <DetailRow
                    label={shares.length === 1 ? 'Shared with' : `Shared with ${shares.length}`}
                    value={shares.map(d => d.contact || d.name).filter(Boolean).join(', ')}
                    sub={shares.every(isSettled)
                      ? 'Settled up'
                      : shares.map(d => `${d.contact || d.name} ${fmt(outstanding(d), txCur)}`).join(' · ')}
                    padded={false}
                    isLast
                  />
                )}
                <DetailRow
                  label="Date"
                  value={fmtDisplayDate(rec.date)}
                  sub={fmtTime(rec.date)}
                  padded={false}
                  isLast
                />
                {/* What arrived, when it was a different currency from what
                    left - the hero above is the sent figure. */}
                {rec.type === 'transfer' && rec.toAmount != null && (() => {
                  const r = impliedRate(rec)
                  return (
                    <DetailRow
                      label={`${rec.toAccount ?? 'Destination'} received`}
                      value={fmt(rec.toAmount, rec.toCurrency)}
                      sub={r ? `1 ${r.from} = ${Number(r.rate.toPrecision(4))} ${r.to}` : null}
                      padded={false}
                      isLast
                    />
                  )
                })()}
                {transferFee && (
                  <DetailRow
                    label="Fee"
                    value={fmt(transferFee.amount ?? 0, txCur)}
                    sub={`Spent from ${transferFee.account}`}
                    padded={false}
                    isLast
                  />
                )}
                {payment ? (
                  <TransferLegs from={acctMap[payment.principal.fromAccount]} to={acctMap[payment.principal.toAccount]} />
                ) : (fromAcct || toAcct) && (
                  <TransferLegs from={fromAcct} to={toAcct} />
                )}
              </div>
            </>
          )}

          {/* ── EDIT MODE ── */}
          {mode === 'edit' && (
            <div className="pt-2">
              {(() => {
                const rows = [
                  <EditRow key="amt" label="Amount">
                    {/* The sign is part of the displayed value rather than a
                        separate span. As a span it landed at the LEFT of the
                        value column - the input is flex-1, so it claimed the
                        space and pushed the ₱ back against the label, reading
                        "Amount ₱      300". onChange already strips anything
                        that is not a digit or a dot, so the prefix round-trips
                        harmlessly. */}
                    <RowInput
                      value={editAmount ? `${baseSymbol(txCur)}${editAmount}` : ''}
                      onChange={e => setEditAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder={`${baseSymbol(txCur)}0.00`}
                      inputMode="decimal"
                      autoFocus
                    />
                  </EditRow>,
                  <EditRow key="desc" label="Note">
                    <RowInput
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      placeholder="Optional"
                      maxLength={100}
                    />
                  </EditRow>,
                  <EditRow key="date" label="Date">
                    <RowDate
                      value={editDate}
                      onChange={e => setEditDate(e.target.value)}
                      display={editDate ? fmtDisplayDate(`${editDate}T00:00:00`) : ''}
                    />
                  </EditRow>,
                  ...(rec.type !== 'transfer' ? [
                    <EditRow key="cat" label="Category">
                      <RowPicker
                        label={editCategory?.name}
                        icon={<CategoryGlyph cat={editCategory} size={17} emoji="🏷️" />}
                        placeholder="Choose"
                        onClick={() => setShowCatPicker(true)}
                      />
                    </EditRow>,
                    <EditRow key="acct" label="Account">
                      <RowPicker
                        label={editAccount?.name}
                        dot={editAccount?.color}
                        placeholder="Choose"
                        onClick={() => setShowAcctPicker(true)}
                      />
                    </EditRow>,
                  ] : [
                    <EditRow key="from" label="From">
                      <RowPicker
                        label={editFrom?.name}
                        dot={editFrom?.color}
                        placeholder="Choose"
                        onClick={() => setShowFromPicker(true)}
                      />
                    </EditRow>,
                    <EditRow key="to" label="To">
                      <RowPicker
                        label={editTo?.name}
                        dot={editTo?.color}
                        placeholder="Choose"
                        onClick={() => setShowToPicker(true)}
                      />
                    </EditRow>,
                  ]),
                ]
                return (
                  <Card surface="recessed" clip>
                    {rows.map((row, i) =>
                      // isLast is injected here so each row does not have to
                      // be told the length of a list it cannot see.
                      cloneElement(row, { isLast: i === rows.length - 1 }))}
                  </Card>
                )
              })()}
            </div>
          )}

          {/* ── CONFIRM DELETE MODE ── */}
          {mode === 'confirm-delete' && (
            <div>
              {/* The same shape as the sheet you just came from: something
                  centred at the top naming what this is, then the figure,
                  then the flat list. Delete used to be the odd one out - a
                  left-aligned title, a centred paragraph and a boxed card -
                  so the last screen before a destructive act was the one that
                  looked least like the app.

                  A red disc rather than the type pill: the pill says what the
                  transaction IS, and at this moment what matters is what is
                  about to happen to it. This is the disc the sign-out and
                  reset confirmations already use. */}
              <div className="flex justify-center">
                <span className="w-14 h-14 rounded-2xl flex items-center justify-center
                  bg-red-100 dark:bg-red-500/15 text-red-500 dark:text-red-400">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </span>
              </div>

              <div className="text-center mt-4">
                <h3 className="text-17 font-semibold text-slate-900 dark:text-white">
                  {deleteHeading}
                </h3>
                <p className="mt-1 mx-auto max-w-[268px] text-13 leading-snug text-balance
                  text-slate-400 dark:text-slate-500">
                  It goes to Recently deleted, where you can put it back for 30 days.
                </p>
              </div>

              <AmountHero color={cfg.color} className="mt-5 mb-6">
                {planCount > 1 ? fmt(planTotal, txCur) : splitParts ? `${cfg.sign}${fmt(wholePurchase, txCur)}` : heroAmount}
              </AmountHero>

              {/* The same flat list the detail sheet uses, including the
                  account as its card. You are being asked about one specific
                  transaction, so it should look like the one you were just
                  looking at. */}
              <div className="flex flex-col">
                {planCount > 1 && (
                  <DetailRow label="Payments" value={`${planCount}`} padded={false} isLast />
                )}
                {/* Both go: one payment, two rows (db/txHelpers.js expandDeletion). */}
                {payment && (
                  <>
                    <DetailRow label={`To ${payment.principal.toAccount}`} value={fmt(payment.principal.amount, txCur)} padded={false} isLast />
                    <DetailRow label="Interest" value={fmt(payment.interest.amount, txCur)} padded={false} isLast />
                  </>
                )}
                {!payment && rec.description && rec.description.trim() && (
                  <DetailRow label="Note" value={rec.description} padded={false} isLast />
                )}
                <DetailRow
                  label="Balance"
                  value="Reversed automatically"
                  padded={false}
                  isLast
                />
                {acct && (
                  <DetailRow
                    label="Account"
                    value={(
                      <span className="inline-flex items-center gap-2 align-middle">
                        <CardThumb account={acct} sm />
                        {acct.name}
                      </span>
                    )}
                    padded={false}
                    isLast
                  />
                )}
                {(fromAcct || toAcct) && (
                  <TransferLegs from={fromAcct} to={toAcct} />
                )}
              </div>

              {/* Deleting one month would strand the rest, so the whole plan
                  goes. Say so before it happens rather than after. */}
              {planCount > 1 && (
                <p className="text-12 font-medium text-amber-600 dark:text-amber-400 mt-3 text-center">
                  All {planCount} payments in this plan ({fmt(rec.amount, txCur)} × {planCount}) will be deleted.
                </p>
              )}
              {splitParts > 0 && (
                <p className="text-12 font-medium text-amber-600 dark:text-amber-400 mt-3 text-center">
                  {splitParts === 2 ? 'Both parts' : `All ${splitParts} parts`} of this split will be deleted.
                </p>
              )}
              {transferFee && (
                <p className="text-12 font-medium text-amber-600 dark:text-amber-400 mt-3 text-center">
                  Its {fmt(transferFee.amount ?? 0, txCur)} fee will be deleted too.
                </p>
              )}
            </div>
          )}
        </div>
      </Sheet>

      {/* ── The nested pickers, outside <Sheet> rather than among its children ──

          `.sheet-panel` animates a transform, and a transformed element is the
          containing block for any position:fixed descendant - a picker
          rendered inside this panel would centre itself against the panel
          instead of the viewport.

          The wrapper is a stacking context one step above this sheet, and
          that is the whole of its job: the pickers carry z-[130] of their
          own, which clears this sheet at its default z of 100 but not the 160
          the desktop pages hand it. Nesting them in a context above this
          sheet's holds them on top whatever z it is given - which is what the
          old hand-rolled wrapper did by keeping the panel and the pickers
          inside one z-indexed element. Fixed and empty, so it takes no space
          and catches no taps when every picker is closed. ── */}
      <div className="fixed" style={{ zIndex: zIndex + 1 }}>
        <CategoryPickerSheet
          open={showCatPicker}
          onClose={() => setShowCatPicker(false)}
          categories={editCatList}
          selected={editCategory}
          onSelect={c => { setEditCategory(c); setShowCatPicker(false) }}
        />
        <AccountPickerSheet
          open={showAcctPicker}
          onClose={() => setShowAcctPicker(false)}
          accounts={accounts}
          selected={editAccount}
          onSelect={a => { setEditAccount(a); setShowAcctPicker(false) }}
        />
        <AccountPickerSheet
          open={showFromPicker}
          onClose={() => setShowFromPicker(false)}
          accounts={accounts}
          selected={editFrom}
          onSelect={a => { setEditFrom(a); setShowFromPicker(false) }}
          exclude={editTo ? [editTo.id] : []}
        />
        <AccountPickerSheet
          open={showToPicker}
          onClose={() => setShowToPicker(false)}
          accounts={accounts}
          selected={editTo}
          onSelect={a => { setEditTo(a); setShowToPicker(false) }}
          exclude={editFrom ? [editFrom.id] : []}
        />
      </div>

      <RefundSheet
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        tx={tx}
        allTxs={allTxs}
        accounts={accounts}
        onRefund={handleRefund}
        saving={refunding}
      />
    </>
  )
}
