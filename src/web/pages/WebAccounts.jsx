import { useMemo, useState } from 'react'
import { AccountCard } from '../../pages/dashboard/Tiles'
import { useNavigate } from 'react-router-dom'
import { TYPE_LABEL, INVESTMENT_KIND_LABEL } from '../../lib/accountMeta'
import { sumInBase } from '../../lib/fx'
import { fmt } from '../../lib/money'
import { useAccountsView } from '../data/accounts'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import DataTable from '../ui/DataTable'
import { Stat, Money, AccountTile, Progress, Empty } from '../ui/display'
import { IPlus, IWallet, IGrid, IList } from '../ui/icons'
import { Segmented } from '../ui/controls'
import { shortDate } from './txParts'

/**
 * Accounts on a computer: every account in one table, in the phone's piles
 * (Spending, Savings, Investments, Credit cards, Loans) with each pile's
 * total, a card's limit used, and when each account last moved. A row opens
 * the account's page. Figures come from data/accounts, the same reading as
 * Home.
 */
export default function WebAccounts() {
  const navigate = useNavigate()
  const { loading, groups, breakdown, txAll, base, rates, credit } = useAccountsView()
  const [view, setViewState] = useState(() => {
    try { return localStorage.getItem('spendr-web-accounts-view') === 'list' ? 'list' : 'cards' } catch { return 'cards' }
  })
  const setView = (/** @type {string} */ v) => {
    setViewState(v)
    try { localStorage.setItem('spendr-web-accounts-view', v) } catch { /* storage off */ }
  }

  const lastMove = useMemo(() => {
    /** @type {Record<string, string>} */
    const at = {}
    for (const t of txAll) {
      for (const n of [t.account, t.fromAccount, t.toAccount]) {
        if (n && (!at[n] || t.date > at[n])) at[n] = t.date
      }
    }
    return at
  }, [txAll])

  const creditRows = groups.find(g => g.key === 'credit')?.rows ?? []
  const available = sumInBase(creditRows.map(r => r.acct), base, rates, (a) => credit[a.name]?.availableCredit ?? 0).total
  const have = breakdown.spending + breakdown.savings + breakdown.invested
  const owe = breakdown.credit + breakdown.loans

  /** @type {any[]} */
  const rows = []
  for (const g of groups) {
    rows.push({ __group: true, key: g.key, label: g.label, right: `${g.owed ? '−' : ''}${fmt(Math.abs(g.total))}` })
    for (const r of g.rows) rows.push({ ...r, owed: g.owed })
  }

  return (
    <Page
      title="Accounts"
      subtitle={loading ? ' ' : `${groups.reduce((n, g) => n + g.rows.length, 0)} accounts`}
      actions={
        <>
          <Segmented label="View" value={view} onChange={setView} options={[
            { value: 'cards', label: <span className="inline-flex items-center gap-1.5"><IGrid size={14} />Cards</span> },
            { value: 'list', label: <span className="inline-flex items-center gap-1.5"><IList size={14} />List</span> },
          ]} />
          <Btn variant="primary" icon={<IPlus size={15} />} onClick={() => navigate('/accounts/new')}>New account</Btn>
        </>
      }
    >
      <div className="grid grid-cols-4 gap-5 mb-8">
        <Stat label="Net worth" value={<Money value={breakdown.total} />} note="What you have, less what you owe" />
        <Stat label="You have" value={fmt(have)} note="Spending, savings and investments" />
        <Stat label="You owe" value={owe ? `−${fmt(owe)}` : fmt(0)} note="Cards and loans" />
        <Stat label="Credit available" value={fmt(available)} note={creditRows.length ? `Across ${creditRows.length} ${creditRows.length === 1 ? 'card' : 'cards'}` : 'No cards'} />
      </div>

      {view === 'cards' && !loading && (
        groups.length === 0 ? (
          <Panel><Empty icon={<IWallet size={20} />} title="No accounts yet" body="Add your cash, a bank, an e-wallet or a card." action={<Btn variant="primary" onClick={() => navigate('/accounts/new')}>Add an account</Btn>} /></Panel>
        ) : groups.map(g => (
          <section key={g.key} className="mb-8" aria-label={g.label}>
            <div className="d-section-head">
              <h2 className="d-section-title">{g.label}</h2>
              <span className="text-15 font-semibold d-num text-[var(--d-text-2)]">{g.owed && g.total ? '−' : ''}{fmt(Math.abs(g.total))}</span>
            </div>
            <div className="d-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {g.rows.map(r => (
                <AccountCard key={r.acct.id} acct={r.acct} hidden={false} stmt={credit[r.acct.name]} onClick={() => navigate(`/accounts/${r.acct.id}`)} />
              ))}
            </div>
          </section>
        ))
      )}

      {view === 'list' && <Panel flush>
        <DataTable
          label="Accounts"
          rows={loading ? [] : rows}
          rowKey={(r) => r.acct.id}
          onRowClick={(r) => navigate(`/accounts/${r.acct.id}`)}
          empty={loading ? <div className="h-40" /> : (
            <Empty icon={<IWallet size={18} />} title="No accounts yet" body="Add your cash, a bank, an e-wallet or a card." action={<Btn size="sm" onClick={() => navigate('/accounts/new')}>Add an account</Btn>} />
          )}
          columns={[
            {
              key: 'name', header: 'Account',
              render: (r) => (
                <span className="flex items-center gap-2.5 min-w-0" style={{ paddingLeft: r.depth ? 26 : 0 }}>
                  <AccountTile account={r.acct} size="sm" />
                  <span className="truncate font-medium">{r.acct.name}</span>
                  {r.depth > 0 && <span className="d-cell-faint text-12 truncate">in {r.acct.parentName}</span>}
                </span>
              ),
            },
            {
              key: 'type', header: 'Type', width: 160,
              render: (r) => <span className="d-cell-muted">{r.acct.type === 'investment' ? (INVESTMENT_KIND_LABEL[r.acct.kind] ?? TYPE_LABEL.investment) : TYPE_LABEL[r.acct.type] ?? r.acct.type}</span>,
            },
            {
              key: 'detail', header: 'Limit used', width: 270,
              render: (r) => {
                if (r.acct.type !== 'credit' || !(r.acct.creditLimit > 0)) return <span className="d-cell-faint">—</span>
                const pct = (r.value / r.acct.creditLimit) * 100
                return (
                  <span className="flex items-center gap-2.5">
                    <Progress value={pct} className="w-24" color={pct > 90 ? 'var(--d-neg)' : pct > 70 ? 'var(--d-warn)' : undefined} />
                    <span className="text-12 d-cell-muted d-num whitespace-nowrap">{Math.round(pct)}% of {fmt(r.acct.creditLimit, r.currency)}</span>
                  </span>
                )
              },
            },
            {
              key: 'last', header: 'Last activity', width: 130,
              render: (r) => <span className="d-cell-muted d-num">{lastMove[r.acct.name] ? shortDate(lastMove[r.acct.name]) : '—'}</span>,
            },
            {
              key: 'balance', header: 'Balance', width: 160, align: 'right',
              render: (r) => <Money value={r.owed ? -r.value : r.value} currency={r.currency} className="font-semibold" />,
            },
          ]}
        />
      </Panel>}
    </Page>
  )
}
