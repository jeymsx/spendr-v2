import { useState, useEffect } from 'react'
import db from '../../db/db'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { deleteDebtRemote } from '../../lib/sync'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../../utils/moneyInput'
import SegTabs from '../../components/SegTabs'
import { RowGroup, EditRow, RowInput, RowDate } from '../../components/FormRows'
import Sheet from '../../components/ui/Sheet'
import { fmtDueDate } from './shared'

// ── Debt Form Sheet ────────────────────────────────────────────────────────────

export function DebtFormSheet({ open, onClose, editDebt, defaultTab }) {
  const { showToast } = useToast()
  const { user } = useAuth()
  const [contact,    setContact]    = useState('')
  const [amountStr,  setAmountStr]  = useState('')
  const [paidStr,    setPaidStr]    = useState('0')
  const [dueDate,    setDueDate]    = useState('')
  const [type,       setType]       = useState('i_owe')
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [errors,     setErrors]     = useState({})
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting,   setDeleting]   = useState(false)

  useEffect(() => {
    if (open) {
      if (editDebt) {
        // Hydrate-on-open. The sheet renders null when closed but stays
        // mounted through its own exit animation, so the parent can neither
        // unmount nor re-key it to reset these fields for the next record.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setContact(editDebt.contact ?? editDebt.name ?? '')
        setAmountStr(editDebt.amount != null ? numToMoneyStr(editDebt.amount) : '')
        setPaidStr(editDebt.amountPaid != null ? numToMoneyStr(editDebt.amountPaid) : '0')
        setDueDate(editDebt.dueDate ? editDebt.dueDate.slice(0, 10) : '')
        setType(editDebt.type ?? 'i_owe')
        setNotes(editDebt.notes ?? '')
      } else {
        setContact('')
        setAmountStr('')
        setPaidStr('0')
        setDueDate('')
        setType(defaultTab ?? 'i_owe')
        setNotes('')
      }
      setErrors({})
      setConfirmDel(false)
      setDeleting(false)
    }
  }, [open, editDebt, defaultTab])

  async function handleSave() {
    const errs = {}
    if (!contact.trim()) errs.contact = 'Required'
    const amount = parseMoney(amountStr)
    if (!amountStr || amount <= 0) errs.amount = 'Enter a valid amount'
    const paid = parseMoney(paidStr)
    if (paid < 0) errs.paid = 'Cannot be negative'
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    try {
      const data = {
        contact:    contact.trim(),
        amount,
        amountPaid: Math.min(paid, amount),
        dueDate:    dueDate || null,
        type,
        notes:      notes.trim() || null,
      }
      if (editDebt) {
        await db.debts.update(editDebt.id, data)
        showToast('Debt updated')
      } else {
        await db.debts.add({ ...data, createdAt: new Date().toISOString() })
        showToast('Debt saved')
      }
      onClose()
    } catch (e) {
      console.error('[DebtForm] save failed:', e)
      showToast('Failed to save debt', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    try {
      await db.debts.delete(editDebt.id)
      await deleteDebtRemote(user?.id, editDebt.id)
      onClose()
    } catch (e) {
      console.error('[DebtForm] delete failed:', e)
      showToast('Failed to delete debt', 'error')
      setDeleting(false)
    }
  }

  return (
    /* Sheet owns the overlay, the panel, the grab handle, the scroll lock,
       Escape, the focus trap and the exit animation. Delete rides on the
       title row as `titleAction`, and Save is pinned under the scrolling body
       as `footer` so it cannot end up below the fold on a short screen. */
    <Sheet
      open={open}
      onClose={onClose}
      scrim={40}
      maxHeight="92dvh"
      title={editDebt ? 'Edit Debt' : 'Add Debt'}
      titleAction={editDebt && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className={[
            'text-xs font-semibold px-3 py-1.5 rounded-xl transition-all duration-150',
            confirmDel
              ? 'bg-red-500 text-white'
              : 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10',
          ].join(' ')}
        >
          {deleting ? 'Deleting…' : confirmDel ? 'Confirm delete' : 'Delete'}
        </button>
      )}
      footer={(
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-[15px] rounded-2xl font-semibold text-[15px] text-white
            bg-primary
            disabled:opacity-40 disabled:shadow-none
            active:scale-[0.98] transition-all duration-100"
        >
          {saving ? 'Saving…' : editDebt ? 'Save changes' : 'Add debt'}
        </button>
      )}
    >
      <div>

        {/* ── The body ──
            Rebuilt from a stack of six outlined boxes, each with a small-caps
            label above it, into the two shapes the rest of the app uses for
            this job: the amount as the hero, and everything else as native
            settings rows in one card.

            The amount led the change. Every other place in Spendr where you
            type money - Add expense, Add inflow, Transfer, and now the payment
            sheet - opens with one big centred figure, because the amount IS
            the transaction. Here it was the third field down, the same size as
            a note, which made a debt feel like a form to fill rather than a
            number to record. */}

        <div className="flex flex-col items-center pt-1 pb-5">
          <input
            type="text"
            inputMode="decimal"
            autoFocus={!editDebt}
            placeholder="₱0.00"
            value={amountStr}
            onChange={e => { moneyChangeHandler(setAmountStr)(e); setErrors(p => ({ ...p, amount: null })) }}
            aria-label="Amount"
            className="amount-input font-semibold tabular-nums bg-transparent text-center w-full
              text-slate-900 dark:text-white outline-none
              placeholder-slate-200 dark:placeholder-slate-800"
          />
          <p className={`text-xs mt-2 tracking-wide ${
            errors.amount ? 'text-red-500 dark:text-red-400 font-medium' : 'text-slate-400 dark:text-slate-500'
          }`}>
            {errors.amount ?? 'Amount'}
          </p>
        </div>

        {/* Direction, as the app's segmented control - and the pill takes
            the colour of the side it is on, so the control itself says
            which way the money goes. Red and green are load-bearing here in
            a way they are not on a chart: they are the two states. */}
        <SegTabs
          tabs={[
            { value: 'i_owe',      label: 'I owe'      },
            { value: 'owed_to_me', label: 'Owed to me' },
          ]}
          value={type}
          onChange={setType}
          color={type === 'i_owe' ? '#ef4444' : '#10b981'}
        />

        <RowGroup className="mt-4">
          <EditRow label={errors.contact ? 'Who *' : 'Who'}>
            <RowInput
              value={contact}
              onChange={e => { setContact(e.target.value); setErrors(p => ({ ...p, contact: null })) }}
              placeholder={type === 'i_owe' ? 'Who you owe' : 'Who owes you'}
              autoFocus={false}
            />
          </EditRow>

          {/* "Already paid" rather than "Amount Paid": this is a debt you
              are recording after the fact, and the question is how much of
              it is behind you. Zero is the answer almost every time, so it
              shows as a placeholder rather than a typed-in 0 you have to
              clear. */}
          <EditRow label={errors.paid ? 'Already paid *' : 'Already paid'}>
            {/* The peso rides in the value, not in a leading span. A RowInput
                is right-aligned and flex-1, so a span would claim the space
                and push the mark back against the label - the same reason
                TxDetailSheet's edit rows do it this way. The strip on the way
                out is what keeps parseMoney seeing digits. */}
            <RowInput
              value={paidStr && paidStr !== '0' ? `₱${paidStr}` : ''}
              onChange={e => { e.target.value = e.target.value.replace(/[^0-9.]/g, ''); moneyChangeHandler(setPaidStr)(e); setErrors(p => ({ ...p, paid: null })) }}
              placeholder="₱0.00"
              inputMode="decimal"
            />
          </EditRow>

          <EditRow label="Due date">
            <RowDate
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              display={dueDate ? fmtDueDate(dueDate) : ''}
            />
          </EditRow>

          <EditRow label="Note" isLast>
            <RowInput
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </EditRow>
        </RowGroup>

        {(errors.contact || errors.paid) && (
          <p className="mt-2 px-1 text-xs text-red-500 dark:text-red-400">
            {errors.contact ? 'Say who this debt is with.' : errors.paid}
          </p>
        )}

        <div className="h-4 shrink-0" />
      </div>
    </Sheet>
  )
}
