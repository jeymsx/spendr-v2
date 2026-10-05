import { useCallback, useMemo, useState } from 'react'
import { usePageTitle } from '../../lib/pageTitle'
import { DetailSkeleton } from '../ui/Skeletons'
import { Link, useNavigate, useParams } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { deleteDebtRemote } from '../../lib/sync'
import { byPerson, outstanding, isSettled } from '../../lib/people'
import { fmt } from '../../lib/money'
import { getInitials, getAvatarColor, fmtDueDate } from '../../pages/debts/shared'
import { DebtFormSheet } from '../../pages/debts/DebtFormSheet'
import PersonSheet from '../../pages/debts/PersonSheet'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import Dialog from '../ui/Dialog'
import DataTable from '../ui/DataTable'
import Popover, { MenuItem } from '../ui/Popover'
import { Stat, Empty } from '../ui/display'
import { IChevronLeft, IPlus, ITrash, IMore, IUsers, IRefresh } from '../ui/icons'

/**
 * One person in Debts on a computer: who they are and where you stand at the
 * top, their figures in a row, and every entry their balance is made of in a
 * table - the phone's page (pages/debts/PersonDetail) across the width.
 *
 * Keyed by the person (lib/people personKey), not a row, as the phone's is:
 * a balance is many rows, and deleting the one you came to delete must not
 * take the page with it. Settling up is the phone's sheet (PersonSheet), an
 * entry's form the phone's (DebtFormSheet) - dialogs here; deleting an entry
 * asks first; archiving files the person away and brings them back.
 */
export default function WebDebtPerson() {
  const { key } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { user } = useAuth()
  const [editDebt, setEditDebt] = useState(/** @type {any} */ (null))
  const [formOpen, setFormOpen] = useState(false)
  const [settleOpen, setSettleOpen] = useState(false)
  const [confirmId, setConfirmId] = useState(/** @type {any} */ (null))
  const [busy, setBusy] = useState(false)

  const allDebts = useLiveQuery(() => db.debts.toArray(), [], undefined)
  const person = useMemo(() => byPerson(allDebts ?? []).find(p => p.key === decodeURIComponent(key ?? '')) ?? null, [allDebts, key])
  usePageTitle(person?.label)
  const rows = useMemo(() => [...(person?.rows ?? [])].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))), [person])
  const archived = rows.length > 0 && rows.every(d => d.archivedAt)
  const confirmDebt = rows.find(d => d.id === confirmId) ?? null
  const net = person?.net ?? 0
  const theyOwe = net > 0.005
  const youOwe = net < -0.005
  const square = !theyOwe && !youOwe
  const open = rows.filter(d => !isSettled(d))
  const lent = rows.filter(d => d.type !== 'i_owe').reduce((s, d) => s + (d.amount ?? 0), 0)
  const borrowed = rows.filter(d => d.type === 'i_owe').reduce((s, d) => s + (d.amount ?? 0), 0)

  async function remove() {
    if (!confirmDebt) return
    setBusy(true)
    try {
      await db.debts.delete(confirmDebt.id)
      await deleteDebtRemote(user?.id, confirmDebt.id, confirmDebt.syncId)
      showToast('Entry deleted')
      setConfirmId(null)
    } catch (e) {
      console.error('[WebDebtPerson] delete failed:', e)
      showToast('Could not delete that', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function toggleArchive() {
    if (!person) return
    setBusy(true)
    try {
      const stamp = archived ? null : new Date().toISOString()
      for (const d of rows) await db.debts.update(d.id, { archivedAt: stamp })
      showToast(archived ? `${person.label} is back` : `${person.label} archived`)
      if (!archived) navigate('/debts')
    } catch (e) {
      console.error('[WebDebtPerson] archive failed:', e)
      showToast('Could not archive', 'error')
    } finally {
      setBusy(false)
    }
  }
  const closeDel = useCallback(() => { if (!busy) setConfirmId(null) }, [busy])

  const eyebrow = <Link to="/debts" className="inline-flex items-center gap-1 hover:text-[var(--d-text)]"><IChevronLeft size={13} />Debts</Link>
  if (allDebts === undefined) return <Page eyebrow={eyebrow}><DetailSkeleton /></Page>
  if (!person) {
    return (
      <Page eyebrow={eyebrow} title="Nobody here">
        <Panel><Empty icon={<IUsers size={20} />} title="Every entry for this person has been deleted" action={<Btn onClick={() => navigate('/debts')}>Back to debts</Btn>} /></Panel>
      </Page>
    )
  }

  return (
    <Page
      eyebrow={eyebrow}
      media={(
        <span className={`w-16 h-16 rounded-full flex items-center justify-center text-20 font-bold text-white ${square ? 'opacity-50' : ''}`}
          style={{ background: getAvatarColor(person.label) }} aria-hidden="true">
          {getInitials(person.label)}
        </span>
      )}
      title={person.label}
      subtitle={(
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`d-badge d-badge-lg ${theyOwe ? 'd-badge-pos' : youOwe ? 'd-badge-warn' : ''}`}>
            {square ? 'All square' : theyOwe ? `Owes you ${fmt(net)}` : `You owe ${fmt(-net)}`}
          </span>
          {archived && <span className="d-badge d-badge-lg">Archived</span>}
        </span>
      )}
      actions={(
        <>
          <Btn icon={<IPlus size={15} />} onClick={() => { setEditDebt(null); setFormOpen(true) }}>Add an entry</Btn>
          {!square && <Btn variant="primary" onClick={() => setSettleOpen(true)}>{theyOwe ? 'Record a payment' : 'Pay them back'}</Btn>}
          <Popover role="menu" align="end" width={220} label="More" trigger={<Btn variant="ghost" icon={<IMore size={16} />} label="More" />}>
            <MenuItem icon={<IRefresh />} onSelect={toggleArchive}>{archived ? 'Bring back' : 'Archive'}</MenuItem>
          </Popover>
        </>
      )}
    >
      <div className="d-stats grid grid-cols-4 gap-5 mb-8">
        <Stat label="Balance" value={square ? 'All square' : fmt(Math.abs(net))} tone={theyOwe ? 'pos' : youOwe ? 'warn' : null} note={square ? 'Nothing owed either way' : theyOwe ? 'Owes you' : 'You owe them'} />
        <Stat label="Open entries" value={String(open.length)} note={`${rows.length} in all`} />
        <Stat label="Lent to them" value={fmt(lent)} note="Every entry, settled or not" />
        <Stat label="Borrowed from them" value={fmt(borrowed)} note="Every entry, settled or not" />
      </div>

      <Panel title={`${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`} meta="What the balance is made of" flush>
        <DataTable
          label="Entries"
          rows={rows}
          rowKey={(d) => d.id}
          onRowClick={(d) => { setEditDebt(d); setFormOpen(true) }}
          rowClassName={(d) => (isSettled(d) ? 'opacity-55' : '')}
          columns={[
            { key: 'what', header: 'What', render: (d) => <span className="font-medium truncate">{d.notes || d.name || person.label}</span> },
            { key: 'dir', header: 'Direction', width: 130, render: (d) => <span className={d.type === 'i_owe' ? 'd-warn' : 'd-pos'}>{d.type === 'i_owe' ? 'You owe' : 'Owes you'}</span> },
            { key: 'due', header: 'Due', width: 150, optional: true, render: (d) => <span className="d-cell-muted">{isSettled(d) ? 'Settled' : d.dueDate ? fmtDueDate(d.dueDate) : '—'}</span> },
            { key: 'amt', header: 'Amount', width: 130, align: 'right', render: (d) => <span className="d-num d-cell-muted">{fmt(d.amount ?? 0)}</span> },
            { key: 'left', header: 'Left', width: 130, align: 'right', render: (d) => <span className="d-num font-semibold">{fmt(isSettled(d) ? 0 : outstanding(d))}</span> },
            {
              key: 'act', header: '', width: 56, align: 'right',
              render: (d) => <Btn size="sm" variant="ghost" icon={<ITrash size={14} />} label={`Delete ${d.notes || d.name || 'entry'}`} onClick={(e) => { e.stopPropagation(); setConfirmId(d.id) }} />,
            },
          ]}
        />
      </Panel>

      <Dialog
        open={!!confirmDebt}
        onClose={closeDel}
        title="Delete this entry?"
        actions={(
          <>
            <Btn onClick={closeDel} disabled={busy}>Cancel</Btn>
            <Btn variant="danger-solid" data-autofocus onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Btn>
          </>
        )}
      >
        {confirmDebt ? `${fmt(confirmDebt.amount ?? 0)} comes off their balance. Nothing in the ledger moves.` : null}
      </Dialog>
      <DebtFormSheet open={formOpen} onClose={() => setFormOpen(false)} editDebt={editDebt} defaultContact={editDebt ? undefined : person.label} />
      <PersonSheet person={settleOpen ? person : null} onClose={() => setSettleOpen(false)} onEditRow={(d) => { setSettleOpen(false); setEditDebt(d); setFormOpen(true) }} />
    </Page>
  )
}
