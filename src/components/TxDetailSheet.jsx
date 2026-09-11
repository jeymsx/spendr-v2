import { cloneElement, useEffect, useState, useMemo } from 'react'
import db, { UNSYNCED } from '../db/db'
import { reverseBalanceEffect, applyBalanceEffect, restoreDeletedTx,
         deleteTxGroup, restoreDeletedTxs } from '../db/txHelpers'
import { findInstallmentGroup, isInstallmentRow } from '../utils/installments'
import { useLiveQuery } from '../hooks/useLiveQuery'
import CategoryPickerSheet from './CategoryPickerSheet'
import AccountPickerSheet from './AccountPickerSheet'
import { useToast } from '../context/ToastContext'
import { EditRow, RowInput, RowDate, RowPicker } from './FormRows'
import CategoryGlyph from './CategoryGlyph'
import Button from './ui/Button'
import Card from './ui/Card'
import DetailRow from './ui/DetailRow'
import IconButton from './ui/IconButton'
import Sheet from './ui/Sheet'

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _phpFmt.format(Math.abs(n))
}

const TYPE_CFG = {
  expense:  { label: 'Expense',  color: '#ef4444', badge: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',      sign: '−' },
  inflow:   { label: 'Inflow',   color: '#22c55e', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400', sign: '+' },
  transfer: { label: 'Transfer', color: 'var(--color-primary)', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',   sign: '' },
}

function toLocalDateStr(isoStr) {
  if (!isoStr) return ''
  return isoStr.slice(0, 10)
}

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

export default function TxDetailSheet({ open, onClose, transaction: tx, accounts = [], categories = [], zIndex = 100 }) {
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
    if (tx) setMode('detail')
    setSaving(false)
    // Hydrates the form when the sheet opens. Listing every field would
    // re-run the effect that SETS them and clobber edits in progress;
    // `open` plus the record id is what actually means "something else is
    // being edited now".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx?.id])

  function enterEdit() {
    if (!tx) return
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
      const newDateISO = editDate
        ? editDate + (tx.date?.slice(10) ?? 'T00:00:00.000Z')
        : tx.date

      const patch = { amount: newAmount, description: editDescription.trim(), date: newDateISO, updatedAt: now, synced: UNSYNCED }

      if (tx.type !== 'transfer') {
        patch.category = editCategory?.name ?? tx.category
        patch.account  = editAccount?.name  ?? tx.account
      } else {
        patch.fromAccount = editFrom?.name ?? tx.fromAccount
        patch.toAccount   = editTo?.name   ?? tx.toAccount
      }

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

  async function handleDelete() {
    setSaving(true)
    // Snapshot before deleting — this is what Undo replays. For an installment
    // plan that's every month, since deleting one would strand the rest.
    const group    = planCount > 1 ? planRows.map(t => ({ ...t })) : null
    const snapshot = { ...tx }
    try {
      if (group) {
        await deleteTxGroup(group)
        onClose()
        showToast(`${group.length} payments deleted`, 'success', {
          actionLabel: 'Undo',
          onAction: async () => {
            try {
              const n = await restoreDeletedTxs(group)
              showToast(n ? `${n} payments restored` : 'Already restored',
                        n ? 'success' : 'warning')
            } catch (err) {
              console.error('[TxDetailSheet] group undo failed:', err)
              showToast('Undo failed', 'error')
            }
          },
        })
        return
      }
      // The tombstone write used to sit outside the transaction, so a failure
      // below left the txId marked deleted while the row survived locally —
      // and the next sync then removed it remotely. It's inside now.
      await db.transaction('rw',
        [db.transactions, db.accounts, db.balances, db.recurring, db.meta],
        async () => {
          if (tx.txId) {
            const existing = await db.meta.get('deletedTxIds')
            const list = existing?.value ?? []
            if (!list.includes(tx.txId)) {
              await db.meta.put({ key: 'deletedTxIds', value: [...list, tx.txId] })
            }
          }
          await reverseBalanceEffect(tx)
          await db.transactions.delete(tx.id)
          if (tx.recurringId && tx.recurringPrevDate) {
            await db.recurring.update(tx.recurringId, { nextDate: tx.recurringPrevDate })
          }
        })
      onClose()
      showToast('Transaction deleted', 'success', {
        actionLabel: 'Undo',
        onAction: async () => {
          try {
            const ok = await restoreDeletedTx(snapshot)
            showToast(ok ? 'Transaction restored' : 'Already restored',
                      ok ? 'success' : 'warning')
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

  const cfg         = TYPE_CFG[rec.type] ?? TYPE_CFG.expense
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
        <Button className="flex-[2]" onClick={enterEdit}>
          Edit
        </Button>
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
    'confirm-delete': (
      <div className="flex gap-2.5">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => setMode('detail')} disabled={saving}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          className="flex-[1.6]"
          onClick={handleDelete} disabled={saving}
        >
          {saving ? 'Deleting…' : planCount > 1 ? `Delete all ${planCount}` : 'Delete'}
        </Button>
      </div>
    ),
  }[mode]

  /* Edit and confirm-delete head themselves with a line of text, so they hand
     it to Sheet and get aria-labelledby pointing at it. Detail's heading is
     the coloured type pill - a graphic, not a line of text - so it stays in
     the body and ariaLabel names the dialog instead. */
  const title = {
    edit:             `Edit ${cfg.label.toLowerCase()}`,
    'confirm-delete': planCount > 1 ? 'Delete whole plan?' : 'Delete this transaction?',
  }[mode] ?? null

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
        /* Only used when there is no title - which is detail mode. */
        ariaLabel={`${cfg.label} details`}
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
              {/* The type, as a pill, in place of a title. The timestamp used
                  to sit opposite it and say exactly what the Date row below
                  says - the corner it freed went to a close button, which
                  Sheet's handle and scrim have now made unnecessary. */}
              <div className="flex items-center">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.badge}`}>
                  {cfg.label}
                </span>
              </div>

              {/* The figure, given room. Tighter tracking at this size: at
                  42px the default spacing makes a long peso amount sprawl. */}
              <div className="text-center pt-5 pb-6">
                <p className="text-[40px] font-semibold tabular-nums leading-none tracking-tight"
                  style={{ color: cfg.color }}>
                  {cfg.sign}{fmt(rec.amount)}
                </p>
                {rec.description && (
                  <p className="text-[15px] text-slate-500 dark:text-slate-400 mt-2.5">{rec.description}</p>
                )}
              </div>

              {/* One group, hairline separators. `rows` is built first so the
                  last row knows it is last without every branch repeating the
                  check. */}
              {(() => {
                const rows = [
                  cat      && { key: 'cat',  label: 'Category', value: <><CategoryGlyph cat={cat} size={14} className="inline-block mr-1.5 -mt-px" />{cat.name}</> },
                  acct     && { key: 'acct', label: 'Account',  value: acct.name,     dot: acct.color },
                  fromAcct && { key: 'from', label: 'From',     value: fromAcct.name, dot: fromAcct.color },
                  toAcct   && { key: 'to',   label: 'To',       value: toAcct.name,   dot: toAcct.color },
                  { key: 'date', label: 'Date', value: fmtDisplayDate(rec.date), sub: fmtTime(rec.date) },
                ].filter(Boolean)
                return (
                  <Card surface="recessed" clip>
                    {rows.map((r, i) => (
                      <DetailRow key={r.key} {...r} isLast={i === rows.length - 1} />
                    ))}
                  </Card>
                )
              })()}
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
                      value={editAmount ? `₱${editAmount}` : ''}
                      onChange={e => setEditAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="₱0.00"
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
            <div className="pt-1">
              <p className="text-[13px] text-center text-slate-500 dark:text-slate-400 mb-4 px-2">
                This cannot be undone from here, though the toast afterwards
                offers one.
              </p>

              {/* What is about to go, shown as the object it is rather than
                  three centred lines of prose. Same group as everywhere else,
                  so the thing you are deleting looks like the thing you were
                  just looking at. */}
              <Card surface="recessed" clip>
                <DetailRow
                  label={planCount > 1 ? `${planCount} payments` : 'Amount'}
                  value={planCount > 1 ? fmt(planTotal) : `${cfg.sign}${fmt(rec.amount)}`}
                />
                {rec.description && (
                  <DetailRow label="Note" value={rec.description} />
                )}
                <DetailRow
                  label="Balance"
                  value="Reversed automatically"
                  isLast
                />
              </Card>

              {/* Deleting one month would strand the rest, so the whole plan
                  goes. Say so before it happens rather than after. */}
              {planCount > 1 && (
                <p className="text-[12px] font-medium text-amber-600 dark:text-amber-400 mt-3 text-center">
                  All {planCount} payments in this plan ({fmt(rec.amount)} × {planCount}) will be deleted.
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
    </>
  )
}
