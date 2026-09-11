import { cloneElement, useEffect, useState, useMemo } from 'react'
import { useScrollLock } from '../hooks/useScrollLock'
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
import IconButton from './ui/IconButton'

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

// ── Detail rows ────────────────────────────────────────────────────────────────

/**
 * One row of an inset grouped list.
 *
 * These used to be separate rounded pills with 6px of air between them, which
 * made three facts about one transaction look like three unrelated cards. Apple
 * groups them: a single container, hairline separators, labels left and values
 * right. Same information, a quarter of the visual noise.
 *
 * The separator is drawn by the row and skipped on the last one, so the group
 * does not need to know its own length twice.
 */
function DetailRow({ label, value, dot, sub, isLast }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 px-4 py-3 ${
      isLast ? '' : 'border-b border-slate-100 dark:border-white/[0.06]'
    }`}>
      <span className="text-[13px] text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <div className="flex items-baseline gap-2 min-w-0">
        {dot && <span className="w-2 h-2 rounded-full shrink-0 self-center" style={{ backgroundColor: dot }} />}
        <div className="text-right min-w-0">
          <p className="text-[15px] font-medium text-slate-800 dark:text-white truncate">{value}</p>
          {sub && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

/** The container the rows sit in. */
function DetailGroup({ children }) {
  return (
    <div className="rounded-2xl overflow-hidden
      bg-slate-50 border border-slate-100
      dark:bg-white/[0.03] dark:border-white/[0.06]">
      {children}
    </div>
  )
}

function IconClose() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
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

  const [closing,         setClosing]         = useState(false)
  useScrollLock(open)
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

  const close = () => {
    if (saving) return
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
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
      close()
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
        close()
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
      close()
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

  if (!open && !closing) return null
  if (!tx) return null

  const cfg         = TYPE_CFG[tx.type] ?? TYPE_CFG.expense
  const cat         = catMap[tx.category]
  const acct        = acctMap[tx.account]
  const fromAcct    = acctMap[tx.fromAccount]
  const toAcct      = acctMap[tx.toAccount]
  const editCatList = categories.filter(c => c.type === tx.type)
    .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name))

  return (
    <div className="fixed inset-0" style={{ touchAction: 'none', zIndex }}>
      {/* A heavier backdrop than the other sheets use, because this panel is
          glass and glass needs something soft behind it. At black/45 with a
          4px blur the transaction list was still legible THROUGH the card -
          ghost rows and red amounts sitting under the detail group, which is
          exactly what index.css warns about for translucent floating panels.
          The answer is not to give up the glass but to obscure what it is
          frosting: 24px of blur and 55% black leaves shapes and colour behind
          the card, which is the point, and no readable text. */}
      <div className="sheet-overlay absolute inset-0 bg-black/55 backdrop-blur-xl" onClick={close} />

      {/* ── A floating card, not a slab ──

          It was flush to the bottom edge with only its top corners rounded -
          the Android bottom-sheet shape. iOS floats its action sheets: inset
          from every edge, rounded all the way round, so the page is visibly
          behind it rather than covered by it.

          `card` - the glass material, same as every panel on the home
          screen - rather than `card-solid`.

          index.css warns off translucency for floating panels on two counts,
          and neither applies here. It says a 20%-opacity panel over a
          populated page shows the page through it: true over a bare page, but
          this one sits on the backdrop below, already blurred and darkened to
          45% black, so the glass frosts that rather than the list. And it says
          backdrop-filter makes an element the containing block for its
          position:fixed descendants, which would centre the nested pickers
          against this card instead of the viewport - but the pickers are
          SIBLINGS of this panel inside the outer fixed wrapper, not
          descendants, so the blur cannot capture them. Worth keeping in mind
          if they are ever moved inside.

          The grab handle is gone with the slab. A handle says "drag me down
          from this edge", and there is no edge to drag from any more; the
          close button and the backdrop are the honest affordances.

          None of this touches desktop: `html.web .sheet-panel` re-anchors the
          panel as a centred modal at specificity (0,2,1), which beats every
          utility class here. ── */}
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'card absolute inset-x-3 rounded-[28px]',
          'bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))]',
          'max-h-[86dvh] overflow-y-auto',
        ].join(' ')}
        style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
      >
        {/* Not sticky any more. It was sticky with a hardcoded background to
            match the panel, which card-solid's gradient would have shown a
            seam against - and detail and delete both fit without scrolling. */}
        <div className="pt-4 px-5 pb-1">

          {/* mode-aware header */}
          {mode === 'detail' && (
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.badge}`}>
                {cfg.label}
              </span>
              {/* The timestamp used to live here AND in the Date row below,
                  saying the same thing twice on a card with three facts on
                  it. Dropping it here frees the corner for the close button
                  the missing grab handle left the sheet without. */}
              <IconButton label="Close" size="sm" className="-mr-1" onClick={close}>
                <IconClose />
              </IconButton>
            </div>
          )}
          {mode === 'edit' && (
            <div className="flex items-center gap-3">
              <IconButton
                label="Back to details"
                size="sm"
                onClick={() => setMode('detail')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </IconButton>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Edit {cfg.label}</h3>
            </div>
          )}
          {mode === 'confirm-delete' && (
            <div className="text-center pt-2 pb-1">
              <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white">
                {planCount > 1 ? 'Delete whole plan?' : 'Delete this transaction?'}
              </h3>
            </div>
          )}
        </div>

        <div className="px-5 pb-2">

          {/* ── DETAIL MODE ── */}
          {mode === 'detail' && (
            <>
              {/* The figure, given room. Tighter tracking at this size: at
                  42px the default spacing makes a long peso amount sprawl. */}
              <div className="text-center pt-5 pb-6">
                <p className="text-[40px] font-semibold tabular-nums leading-none tracking-tight"
                  style={{ color: cfg.color }}>
                  {cfg.sign}{fmt(tx.amount)}
                </p>
                {tx.description && (
                  <p className="text-[15px] text-slate-500 dark:text-slate-400 mt-2.5">{tx.description}</p>
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
                  { key: 'date', label: 'Date', value: fmtDisplayDate(tx.date), sub: fmtTime(tx.date) },
                ].filter(Boolean)
                return (
                  <DetailGroup>
                    {rows.map((r, i) => (
                      <DetailRow key={r.key} {...r} isLast={i === rows.length - 1} />
                    ))}
                  </DetailGroup>
                )
              })()}

              <div className="h-5" />

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
            </>
          )}

          {/* ── EDIT MODE ── */}
          {mode === 'edit' && (
            <div className="mt-2">
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
                  ...(tx.type !== 'transfer' ? [
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
                  <DetailGroup>
                    {rows.map((row, i) =>
                      // isLast is injected here so each row does not have to
                      // be told the length of a list it cannot see.
                      cloneElement(row, { isLast: i === rows.length - 1 }))}
                  </DetailGroup>
                )
              })()}

              <div className="flex gap-2.5 mt-5">
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
            </div>
          )}

          {/* ── CONFIRM DELETE MODE ── */}
          {mode === 'confirm-delete' && (
            <div className="mt-1">
              <p className="text-[13px] text-center text-slate-500 dark:text-slate-400 mb-4 px-2">
                This cannot be undone from here, though the toast afterwards
                offers one.
              </p>

              {/* What is about to go, shown as the object it is rather than
                  three centred lines of prose. Same group as everywhere else,
                  so the thing you are deleting looks like the thing you were
                  just looking at. */}
              <DetailGroup>
                <DetailRow
                  label={planCount > 1 ? `${planCount} payments` : 'Amount'}
                  value={planCount > 1 ? fmt(planTotal) : `${cfg.sign}${fmt(tx.amount)}`}
                />
                {tx.description && (
                  <DetailRow label="Note" value={tx.description} />
                )}
                <DetailRow
                  label="Balance"
                  value="Reversed automatically"
                  isLast
                />
              </DetailGroup>

              {/* Deleting one month would strand the rest, so the whole plan
                  goes. Say so before it happens rather than after. */}
              {planCount > 1 && (
                <p className="text-[12px] font-medium text-amber-600 dark:text-amber-400 mt-3 text-center">
                  All {planCount} payments in this plan ({fmt(tx.amount)} × {planCount}) will be deleted.
                </p>
              )}

              <div className="flex gap-2.5 mt-5">
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
            </div>
          )}
        </div>
        {/* The panel floats now, so it carries its own bottom padding rather
            than borrowing the screen edge's. */}
        <div className="h-4 shrink-0" />
      </div>

      {/* nested pickers — z-[110] renders above this sheet at z-[100] */}
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
  )
}
