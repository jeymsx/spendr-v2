import { useMemo, useState } from 'react'
import { RowsSkeleton, StatsSkeleton } from '../ui/Skeletons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { byPerson } from '../../lib/people'
import { isSettled, owedOn, daysToDue, getInitials, getAvatarColor, fmtDueDate } from '../../pages/debts/shared'
import { DebtFormSheet } from '../../pages/debts/DebtFormSheet'
import { fmt } from '../../lib/money'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import DataTable from '../ui/DataTable'
import { Tabs } from '../ui/controls'
import { Stat, Empty } from '../ui/display'
import { IPlus } from '../ui/icons'
import { shortDate } from './txParts'

/**
 * Debts on a computer: the people money is open with, one row each - which
 * way it runs and how much, how many debts are open, the nearest due date -
 * and the figures over them.
 *
 * The phone's reading: one running number per person (lib/people byPerson),
 * so the order things happened in stops mattering; archived people filed,
 * not counted; every figure over the rows shown, so the tiles agree with the
 * list. Adding is the phone's form; a person's page is the phone's.
 */
export default function WebDebts() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [view, setView] = useState(() => {
    const t = params.get('tab')
    return t === 'owed_to_me' || t === 'i_owe' ? t : 'all'
  })
  const [showArchived, setShowArchived] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const allDebts = useLiveQuery(() => db.debts.orderBy('createdAt').reverse().toArray(), [], undefined)

  const rows = useMemo(() => (allDebts ?? []).filter(d => showArchived || !d.archivedAt), [allDebts, showArchived])
  const visible = useMemo(() => (view === 'all' ? rows : rows.filter(d => d.type === view)), [rows, view])
  const people = useMemo(() => byPerson(visible), [visible])
  const archivedCount = (allDebts ?? []).filter(d => d.archivedAt).length

  const totals = useMemo(() => {
    let owe = 0, owed = 0, overdue = 0, dueWeek = 0
    for (const d of visible) {
      if (isSettled(d)) continue
      const left = owedOn(d)
      if (d.type === 'i_owe') owe += left
      else owed += left
      const n = daysToDue(d.dueDate)
      if (n == null) continue
      if (n < 0) overdue += 1
      else if (n <= 7) dueWeek += 1
    }
    return { owe, owed, overdue, dueWeek, net: owed - owe }
  }, [visible])

  const loading = allDebts === undefined

  return (
    <Page
      title="Debts"
      subtitle={loading ? ' ' : `${people.length} ${people.length === 1 ? 'person' : 'people'}`}
      actions={
        <>
          {archivedCount > 0 && <Btn variant="ghost" onClick={() => setShowArchived(s => !s)}>{showArchived ? 'Hide' : 'Show'} archived</Btn>}
          <Btn variant="primary" icon={<IPlus size={15} />} onClick={() => setFormOpen(true)}>New debt</Btn>
        </>
      }
    >
      {loading ? <StatsSkeleton /> : (
        <div className="d-stats grid grid-cols-4 gap-5 mb-8">
          <Stat label="Owed to you" value={fmt(totals.owed)} tone={totals.owed ? 'pos' : null} note="Still to come back" />
          <Stat label="You owe" value={fmt(totals.owe)} tone={totals.owe ? 'neg' : null} note="Still to pay" />
          <Stat label="Net" value={`${totals.net >= 0 ? '+' : '−'}${fmt(Math.abs(totals.net))}`} tone={totals.net > 0 ? 'pos' : totals.net < 0 ? 'neg' : null} note={totals.net >= 0 ? 'In your favour' : 'Against you'} />
          <Stat label="Overdue" value={String(totals.overdue)} tone={totals.overdue ? 'neg' : null} note={totals.dueWeek ? `${totals.dueWeek} more due this week` : 'Nothing due this week'} />
        </div>
      )}

      <Tabs className="mb-4" label="Show" value={view} onChange={setView} tabs={[
        { value: 'all', label: 'Everyone' },
        { value: 'owed_to_me', label: 'Owed to me' },
        { value: 'i_owe', label: 'I owe' },
      ]} />
      <Panel flush>
        <DataTable
          label="People"
          rows={loading ? [] : people}
          rowKey={(p) => p.key}
          onRowClick={(p) => navigate(`/debts/person/${encodeURIComponent(p.key)}`)}
          empty={loading ? <RowsSkeleton /> : (
            <Empty art="people" title="No debts" body="Money lent or borrowed, between you and the people you know." action={<Btn variant="primary" onClick={() => setFormOpen(true)}>Add one</Btn>} />
          )}
          columns={[
            {
              key: 'name', header: 'Person',
              render: (p) => (
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-11 font-bold text-white shrink-0" style={{ background: getAvatarColor(p.label) }} aria-hidden="true">{getInitials(p.label)}</span>
                  <span className="truncate font-medium">{p.label}</span>
                </span>
              ),
            },
            { key: 'open', header: 'Open', width: 110, render: (p) => <span className="d-cell-muted">{p.open ? `${p.open} open` : 'Settled'}</span> },
            {
              key: 'due', header: 'Nearest due', width: 170,
              render: (p) => {
                const due = p.rows.filter(d => !isSettled(d) && d.dueDate).map(d => d.dueDate).sort()[0]
                if (!due) return <span className="d-cell-faint">—</span>
                const n = daysToDue(due)
                return (
                  <span className="flex items-center gap-2">
                    <span className="d-num">{fmtDueDate(due)}</span>
                    {n != null && n < 0 && <span className="d-badge d-badge-neg">Overdue</span>}
                    {n != null && n >= 0 && n <= 7 && <span className="d-badge d-badge-warn">Soon</span>}
                  </span>
                )
              },
            },
            { key: 'last', header: 'Last change', width: 140, render: (p) => <span className="d-cell-muted d-num">{p.updatedAt ? shortDate(p.updatedAt) : '—'}</span> },
            {
              key: 'net', header: 'Balance', width: 240, align: 'right',
              render: (p) => Math.abs(p.net) < 0.005
                ? <span className="d-cell-faint">Square</span>
                : <span className={`d-num font-semibold whitespace-nowrap ${p.net > 0 ? 'd-pos' : 'd-neg'}`}>{p.net > 0 ? 'Owes you ' : 'You owe '}{fmt(Math.abs(p.net))}</span>,
            },
          ]}
        />
      </Panel>

      <DebtFormSheet open={formOpen} onClose={() => setFormOpen(false)} editDebt={null} defaultTab={view === 'all' ? undefined : view} />
    </Page>
  )
}
