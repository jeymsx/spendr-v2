import { useCallback, useMemo, useState } from 'react'
import { usePageTitle } from '../../lib/pageTitle'
import { RowsSkeleton, DetailSkeleton } from '../ui/Skeletons'
import { Link, useNavigate, useParams } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useToast } from '../../context/ToastContext'
import { isoToDateInput } from '../../utils/txDate'
import { postRecurringCharge, deleteTxGroup } from '../../db/txHelpers'
import { deleteRecurringRemote } from '../../lib/sync'
import { FREQ_LABEL, toMonthlyAmount, billingLine, dueStatus, fmtDateFull } from '../../utils/recurring'
import { fmt } from '../../lib/money'
import { currencyOfAccountName, currencyOfTx } from '../../lib/fxContext'
import OverdrawWarningSheet from '../../components/OverdrawWarningSheet'
import BillMark from '../../components/BillMark'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import Dialog from '../ui/Dialog'
import DataTable from '../ui/DataTable'
import Popover, { MenuItem } from '../ui/Popover'
import { Stat, AccountTile, CategoryTile, Empty } from '../ui/display'
import { IChevronLeft, IEdit, IMore, ITrash, IZap } from '../ui/icons'

/** A desktop chip for a dueStatus tone. */
const DUE_BADGE = /** @type {Record<string, string>} */ ({ late: 'd-badge-neg', soon: 'd-badge-warn', calm: '' })

/**
 * One bill, or one income on a schedule, on a computer: what it is and when
 * it next falls at the top, its figures in a row, its details beside every
 * charge it has posted - the phone's page (pages/RecurringDetail) across the
 * width.
 *
 * The same writes as the phone's: posting a charge (postRecurringCharge)
 * moves a balance, writes the transaction and advances the date, with Undo
 * in its toast; pausing flips `active`; deleting keeps what was posted.
 * Posting asks first in a dialog, where the phone asks for a swipe - a
 * mouse has no swipe, and a click is as easy to make by mistake.
 */
export default function WebRecurringItem() {
  const { id } = useParams()
  const recId = Number(id)
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [posting, setPosting] = useState(false)
  const [confirmPost, setConfirmPost] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [overdraw, setOverdraw] = useState(/** @type {any} */ (null))
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const rec = useLiveQuery(() => (Number.isFinite(recId) ? db.recurring.get(recId).then(r => r ?? null) : Promise.resolve(null)), [recId], undefined)
  usePageTitle(rec?.name)
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])
  const income = rec?.type === 'inflow'
  const noun = income ? 'income' : 'bill'
  const billCur = currencyOfAccountName(rec?.account)

  // Every charge it has posted: by its stable id, its local id, or - for the
  // year before either existed - its name and category (as the phone's page).
  const charges = useLiveQuery(async () => {
    if (!rec) return []
    const all = await db.transactions.toArray()
    return all.filter(t => (rec.syncId && t.recurringSyncId === rec.syncId)
      || (Number.isFinite(recId) && t.recurringId === recId)
      || (!t.recurringSyncId && !t.recurringId && t.type === (income ? 'inflow' : 'expense') && t.description === rec.name && t.category === rec.category))
  }, [recId, rec?.syncId, rec?.name, rec?.category, rec?.type], undefined)
  const history = useMemo(() => (charges ?? []).slice().sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? ''))), [charges])
  const paidTotal = history.reduce((s, t) => s + (t.amount ?? 0), 0)
  const activeSince = history.length ? fmtDateFull(isoToDateInput(history[history.length - 1].date)) : null

  const cat = (categories ?? []).find(c => c.name === rec?.category)
  const acct = (accounts ?? []).find(a => a.name === rec?.account)
  const due = rec ? dueStatus(rec.nextDate) : null
  const monthly = rec ? toMonthlyAmount(rec.amount, rec.frequency) : 0

  async function post({ force = false } = {}) {
    if (!rec) return
    setConfirmPost(false)
    setPosting(true)
    try {
      const { tx } = await postRecurringCharge(rec, { allowOverdraw: force })
      showToast(`${rec.name} ${income ? 'received' : 'posted'}`, 'success', tx ? {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await deleteTxGroup([tx]); showToast('Undone') } catch (err) { console.error('[WebRecurringItem] undo failed:', err); showToast('Could not undo', 'error') }
        },
      } : {})
    } catch (e) {
      if (/** @type {any} */ (e)?.name === 'OverdrawError') {
        const err = /** @type {any} */ (e)
        setOverdraw({ accountName: err.account, balance: err.balance, amount: err.amount })
        return
      }
      console.error('[WebRecurringItem] post failed:', e)
      showToast('Failed to post', 'error')
    } finally {
      setPosting(false)
    }
  }

  async function toggle() {
    if (!rec) return
    setToggling(true)
    try { await db.recurring.update(rec.id, { active: !rec.active }) } catch (e) { console.error('[WebRecurringItem] toggle failed:', e); showToast('Failed to update', 'error') } finally { setToggling(false) }
  }

  async function remove() {
    setDeleting(true)
    try {
      await db.recurring.delete(recId)
      await deleteRecurringRemote(recId, rec?.name, rec?.syncId)
      showToast(income ? 'Income deleted' : 'Bill deleted')
      navigate('/recurring', { replace: true })
    } catch (e) {
      console.error('[WebRecurringItem] delete failed:', e)
      showToast('Failed to delete', 'error')
      setDeleting(false)
    }
  }
  const closePost = useCallback(() => setConfirmPost(false), [])
  const closeDel = useCallback(() => { if (!deleting) setConfirmDel(false) }, [deleting])

  const eyebrow = <Link to="/recurring" className="inline-flex items-center gap-1 hover:text-[var(--d-text)]"><IChevronLeft size={13} />Recurring</Link>
  if (rec === undefined) return <Page eyebrow={eyebrow}><DetailSkeleton kind="bill" /></Page>
  if (!rec) {
    return (
      <Page eyebrow={eyebrow} title="Not found">
        <Panel><Empty art="notFound" title="This isn’t here" body="It may have been deleted." action={<Btn onClick={() => navigate('/recurring')}>Back to recurring</Btn>} /></Panel>
      </Page>
    )
  }

  return (
    <Page
      eyebrow={eyebrow}
      media={<BillMark name={rec.name} cat={cat} size={30} dim={!rec.active} boxClass="w-16 h-16 rounded-[20px]" />}
      title={rec.name}
      subtitle={(
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <span className="d-badge d-badge-lg">{income ? 'Income' : 'Bill'} · {FREQ_LABEL[rec.frequency] ?? rec.frequency}</span>
          {!rec.active
            ? <span className="d-badge d-badge-lg d-badge-warn">Paused</span>
            : <span className={`d-badge d-badge-lg ${income ? '' : DUE_BADGE[due?.tone ?? 'calm'] ?? ''}`}>{billingLine(rec.nextDate, income)}</span>}
        </span>
      )}
      actions={(
        <>
          <Btn onClick={toggle} disabled={toggling}>{rec.active ? 'Pause' : 'Resume'}</Btn>
          <Btn icon={<IEdit size={14} />} onClick={() => navigate(`/recurring/${rec.id}/edit`)}>Edit</Btn>
          <Btn variant="primary" icon={<IZap size={14} />} onClick={() => setConfirmPost(true)} disabled={posting}>{posting ? 'Saving…' : income ? 'Mark received' : 'Post now'}</Btn>
          <Popover role="menu" align="end" width={220} label="More" trigger={<Btn variant="ghost" icon={<IMore size={16} />} label="More" />}>
            <MenuItem icon={<ITrash />} danger onSelect={() => setConfirmDel(true)}>Delete this {noun}</MenuItem>
          </Popover>
        </>
      )}
    >
      <div className="d-stats grid grid-cols-4 gap-5 mb-8">
        <Stat label="Amount" value={`${income ? '+' : ''}${fmt(rec.amount, billCur)}`} tone={income ? 'pos' : null} note={`${fmt(monthly * 12, billCur)} a year`} />
        <Stat label={income ? 'Next' : 'Next charge'} value={rec.nextDate ? fmtDateFull(rec.nextDate) : 'No date'} tone={!income && rec.active && due?.tone === 'late' ? 'neg' : null}
          note={!rec.active ? 'Paused' : due ? due.label : ' '} />
        <Stat label={income ? 'A month' : 'Monthly cost'} value={fmt(monthly, billCur)} note={rec.frequency === 'monthly' ? 'Once a month' : 'Averaged over a month'} />
        <Stat label={income ? 'Received so far' : 'Paid so far'} value={fmt(paidTotal, billCur)} note={history.length ? `${history.length} ${history.length === 1 ? 'time' : 'times'}${activeSince ? ` since ${activeSince}` : ''}` : 'Nothing yet'} />
      </div>

      <div className="grid grid-cols-12 gap-5">
        <Panel className="col-span-5 d-side self-start" title="Details">
          <dl className="d-dl">
            <dt>Account</dt>
            <dd>{acct ? <><AccountTile account={acct} size="sm" /><span className="truncate">{acct.name}</span></> : (rec.account || '—')}</dd>
            <dt>Category</dt>
            <dd>{cat ? <><CategoryTile cat={cat} size="sm" /><span className="truncate">{cat.name}</span></> : (rec.category || '—')}</dd>
            <dt>Repeats</dt>
            <dd>{FREQ_LABEL[rec.frequency] ?? rec.frequency}</dd>
            <dt>Status</dt>
            <dd className={rec.active ? 'd-pos' : 'd-warn'}>{rec.active ? 'Active' : 'Paused'}{activeSince ? <span className="d-cell-faint font-normal"> · since {activeSince}</span> : null}</dd>
          </dl>
        </Panel>

        <Panel className="col-span-7 d-main self-start" title={income ? 'History' : 'Billing history'} meta={history.length ? fmt(paidTotal, billCur) : null} flush>
          <DataTable
            label={income ? 'History' : 'Billing history'}
            rows={charges === undefined ? [] : history}
            rowKey={(t) => t.id}
            onRowClick={(t) => navigate(`/transactions?tx=${t.id}`)}
            empty={charges === undefined ? <RowsSkeleton rows={4} /> : (
              <Empty art="receipt" size="sm" title={income ? 'Nothing received yet' : 'Nothing charged yet'} body={income ? 'Each one you mark received shows here.' : 'Charges appear here once posted.'} />
            )}
            columns={[
              { key: 'date', header: 'Date', render: (t) => <span className="d-num">{new Date(t.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span> },
              { key: 'acct', header: 'Account', width: 180, optional: true, render: (t) => <span className="d-cell-muted truncate">{t.account}</span> },
              { key: 'amt', header: 'Amount', width: 140, align: 'right', render: (t) => <span className={`d-num font-semibold ${income ? 'd-pos' : ''}`}>{income ? '+' : ''}{fmt(t.amount, currencyOfTx(t))}</span> },
            ]}
          />
        </Panel>
      </div>

      <Dialog
        open={confirmPost}
        onClose={closePost}
        title={income ? `Mark ${rec.name} received?` : `Post ${rec.name} now?`}
        actions={(
          <>
            <Btn onClick={closePost}>Cancel</Btn>
            <Btn variant="primary" data-autofocus onClick={() => post()}>{income ? 'Mark received' : 'Post it'}</Btn>
          </>
        )}
      >
        {income
          ? <>{fmt(rec.amount, billCur)} into {rec.account || 'its account'}, and the next date moves on.</>
          : <>{fmt(rec.amount, billCur)} from {rec.account || 'its account'}{rec.category ? `, under ${rec.category}` : ''}, and the next charge moves on. You can undo it from the message that follows.</>}
      </Dialog>
      <Dialog
        open={confirmDel}
        onClose={closeDel}
        title={`Delete this ${noun}?`}
        actions={(
          <>
            <Btn onClick={closeDel} disabled={deleting}>Cancel</Btn>
            <Btn variant="danger-solid" data-autofocus onClick={remove} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Btn>
          </>
        )}
      >
        {income ? 'What you already received stays in the ledger. Only the schedule goes.' : 'Charges already posted stay in the ledger. Only the reminder goes.'}
      </Dialog>
      <OverdrawWarningSheet
        open={!!overdraw}
        onClose={() => setOverdraw(null)}
        onSaveAnyway={() => { setOverdraw(null); post({ force: true }) }}
        accountName={overdraw?.accountName}
        balance={overdraw?.balance}
        amount={overdraw?.amount}
      />
    </Page>
  )
}
