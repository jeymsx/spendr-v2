import { useCallback, useEffect, useMemo, useState } from 'react'
import { RowsSkeleton } from '../ui/Skeletons'
import { Link } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useToast } from '../../context/ToastContext'
import { MissingAccountError, TRASH_DAYS, deleteForever, describeEntry, emptyTrash, purgeTrash, restoreFromTrash } from '../../db/trash'
import { fmt } from '../../lib/money'
import { txRowTone } from '../../pages/transactions/shared'
import { EmptyArt } from '../../components/ui/EmptyState'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import Dialog from '../ui/Dialog'
import DataTable from '../ui/DataTable'
import { TxAccount, TxDescription } from './txParts'
import { IChevronLeft, ITrash, IX, IUndo } from '../ui/icons'

/** "Deleted today", "Deleted yesterday", "Deleted 3 days ago". @param {string} iso @param {Date} now */
function deletedWhen(iso, now) {
  const day = (/** @type {Date} */ d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(new Date(iso))) / 86_400_000)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`
}

/**
 * Recently deleted on a computer: a table, where the phone's list puts back
 * with a button and deletes for good with a swipe - and a mouse cannot
 * swipe. Each row puts back with its own button; tick several and the bar
 * that replaces the header does either to all of them, as Transactions'
 * does. Deleting for good, one or all, asks first.
 *
 * The same thirty days and the same writes as the phone's
 * (pages/transactions/RecentlyDeleted, db/trash.js): a deletion is one row
 * here even when it took several transactions with it (a split, a plan, a
 * transfer with its fee), and puts all of them back together.
 *
 * In Settings' right half (`inPane`) it is a section like the rest; at
 * /transactions/deleted, a page under Transactions.
 *
 * @param {{inPane?: boolean}} props
 */
export default function WebRecentlyDeleted({ inPane = false }) {
  const { showToast } = useToast()
  const entries = useLiveQuery(() => db.trash.orderBy('deletedAt').reverse().toArray(), [], undefined)
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])
  const catMap = useMemo(() => Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])
  const acctMap = useMemo(() => Object.fromEntries((accounts ?? []).map(a => [a.name, a])), [accounts])
  const [now] = useState(() => new Date())
  const [selected, setSelected] = useState(/** @type {Set<string|number>} */ (new Set()))
  const [confirm, setConfirm] = useState(/** @type {null | {ids: number[], all?: boolean}} */ (null))
  const [busy, setBusy] = useState(false)

  // What is past thirty days goes as the page opens.
  useEffect(() => { purgeTrash().catch(() => { /* the next open will */ }) }, [])

  const list = useMemo(() => entries ?? [], [entries])
  const rows = useMemo(() => list.map(e => ({ ...describeEntry(e, now), id: e.id, deletedAt: e.deletedAt })), [list, now])
  // A row put back or deleted elsewhere drops out of the selection.
  const live = useMemo(() => new Set([...selected].filter(id => rows.some(r => r.id === id))), [selected, rows])
  const picked = rows.filter(r => live.has(r.id))

  /** @param {number[]} ids */
  async function putBack(ids) {
    let n = 0
    /** @type {string[]} */
    const missing = []
    for (const id of ids) {
      try {
        n += await restoreFromTrash(id)
      } catch (e) {
        if (e instanceof MissingAccountError) missing.push(...e.names)
        else { console.error('[RecentlyDeleted] restore failed:', e); showToast('Could not put it back. Try again.', 'error'); return }
      }
    }
    setSelected(new Set())
    if (missing.length) {
      const names = [...new Set(missing)]
      showToast(names.length > 1 ? `${names.join(' and ')} were deleted. Add them again first.` : `${names[0]} was deleted. Add it again first.`, 'warning')
    } else {
      showToast(n > 1 ? `${n} transactions put back` : n ? 'Transaction put back' : 'Already put back', n ? 'success' : 'warning')
    }
  }

  const forget = useCallback(async () => {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm.all) await emptyTrash()
      else for (const id of confirm.ids) await deleteForever(id)
      showToast(confirm.all ? 'Recently deleted is empty' : confirm.ids.length > 1 ? `${confirm.ids.length} deleted for good` : 'Deleted for good')
      setSelected(new Set())
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }, [confirm, showToast])
  const closeConfirm = useCallback(() => { if (!busy) setConfirm(null) }, [busy])

  const columns = [
    { key: 'when', header: 'Deleted', width: 104, render: (/** @type {any} */ r) => <span className="d-cell-muted">{deletedWhen(r.deletedAt, now)}</span> },
    {
      key: 'desc', header: 'Description',
      render: (/** @type {any} */ r) => (
        <span className="flex flex-col min-w-0">
          <TxDescription tx={r.lead} catMap={catMap} />
          {r.extra && <span className="text-12 d-cell-faint truncate pl-[42px] -mt-1">{r.extra}</span>}
        </span>
      ),
    },
    { key: 'acct', header: 'Account', width: 150, optional: true, render: (/** @type {any} */ r) => <TxAccount tx={r.lead} acctMap={acctMap} /> },
    {
      key: 'left', header: 'Kept', width: 96, optional: true,
      render: (/** @type {any} */ r) => (
        <span className={`d-badge ${r.daysLeft <= 3 ? 'd-badge-warn' : ''}`}>{r.daysLeft <= 1 ? 'Last day' : `${r.daysLeft} days`}</span>
      ),
    },
    {
      key: 'amt', header: 'Amount', width: 120, align: /** @type {const} */ ('right'),
      render: (/** @type {any} */ r) => {
        const { cls, sign, currency } = txRowTone(r.lead)
        return <span className={`d-num font-semibold whitespace-nowrap ${cls}`}>{sign}{fmt(Math.abs(r.total), currency)}</span>
      },
    },
    {
      key: 'act', header: '', width: 132, align: /** @type {const} */ ('right'),
      render: (/** @type {any} */ r) => (
        <Btn size="sm" variant="ghost" icon={<IUndo size={14} />} onClick={(e) => { e.stopPropagation(); putBack([r.id]) }}>
          {r.count > 1 ? 'Put back all' : 'Put back'}
        </Btn>
      ),
    },
  ]

  const body = (
    <Panel flush className="overflow-hidden">
      {picked.length > 0 ? (
        <div className="d-toolbar bg-[var(--d-selected)]" style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <Btn size="sm" variant="ghost" icon={<IX size={14} />} label="Clear selection" onClick={() => setSelected(new Set())} />
          <span className="text-13 font-semibold text-[var(--d-text)]">{picked.length} selected</span>
          <div className="flex-1" />
          <Btn size="sm" icon={<IUndo size={14} />} onClick={() => putBack(picked.map(r => r.id))}>Put back</Btn>
          <Btn size="sm" variant="danger" icon={<ITrash size={14} />} onClick={() => setConfirm({ ids: picked.map(r => r.id) })}>Delete for good</Btn>
        </div>
      ) : (
        <div className="d-toolbar">
          <span className="text-13 text-[var(--d-text-2)]">
            {entries === undefined ? ' ' : list.length ? `${list.length} ${list.length === 1 ? 'deletion' : 'deletions'}, each kept ${TRASH_DAYS} days` : `Kept ${TRASH_DAYS} days, then gone for good`}
          </span>
          <div className="flex-1" />
          {list.length > 0 && <Btn size="sm" variant="danger" icon={<ITrash size={14} />} onClick={() => setConfirm({ ids: list.map(e => e.id), all: true })}>Delete all</Btn>}
        </div>
      )}
      <DataTable
        label="Recently deleted"
        columns={columns}
        rows={entries === undefined ? [] : rows}
        rowKey={(r) => r.id}
        selected={live}
        onSelectedChange={setSelected}
        empty={entries === undefined ? <RowsSkeleton /> : (
          <div className="py-12 flex flex-col items-center text-center">
            <EmptyArt name="trash" size={88} />
            <p className="mt-2 text-15 font-semibold text-[var(--d-text)]">Nothing deleted</p>
            <p className="mt-1 text-13 text-[var(--d-text-2)]">Transactions you delete stay here for {TRASH_DAYS} days, so you can put them back.</p>
          </div>
        )}
      />
    </Panel>
  )

  const dialog = (
    <Dialog
      open={!!confirm}
      onClose={closeConfirm}
      title={confirm?.all ? 'Delete all for good?' : confirm && confirm.ids.length > 1 ? `Delete ${confirm.ids.length} for good?` : 'Delete for good?'}
      actions={(
        <>
          <Btn onClick={closeConfirm} disabled={busy}>Cancel</Btn>
          <Btn variant="danger-solid" data-autofocus onClick={forget} disabled={busy}>{busy ? 'Deleting…' : 'Delete for good'}</Btn>
        </>
      )}
    >
      {confirm?.all ? 'Everything here will be gone, and can’t be put back.' : 'It will be gone, and can’t be put back.'}
    </Dialog>
  )

  if (inPane) {
    return (
      <div className="pb-2">
        <header className="d-pane-head">
          <h2 className="d-pane-title">Recently deleted</h2>
        </header>
        <div className="mx-5">{body}</div>
        {dialog}
      </div>
    )
  }
  return (
    <Page
      eyebrow={<Link to="/transactions" className="inline-flex items-center gap-1 hover:text-[var(--d-text)]"><IChevronLeft size={13} />Transactions</Link>}
      title="Recently deleted"
    >
      {body}
      {dialog}
    </Page>
  )
}
