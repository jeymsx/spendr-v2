import { useMemo, useState } from 'react'
import { CardsSkeleton, RowsSkeleton, StatsSkeleton } from '../ui/Skeletons'
import { AccountCard } from '../../pages/dashboard/Tiles'
import { useNavigate } from 'react-router-dom'
import { TYPE_LABEL, INVESTMENT_KIND_LABEL } from '../../lib/accountMeta'
import { sumInBase } from '../../lib/fx'
import { fmt } from '../../lib/money'
import { nextDueDate } from '../../utils/creditCycle'
import { useNetWorthSeries, monthEnds } from '../../pages/insights/netWorth'
import { useAccountsView } from '../data/accounts'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import DataTable from '../ui/DataTable'
import { Stat, Money, AccountTile, Progress, Empty, Roll } from '../ui/display'
import { IPlus, IGrid, IList } from '../ui/icons'
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

  const creditRows = useMemo(() => groups.find(g => g.key === 'credit')?.rows ?? [], [groups])
  const loanRows = useMemo(() => groups.find(g => g.key === 'loan')?.rows ?? [], [groups])
  const available = sumInBase(creditRows.map(r => r.acct), base, rates, (a) => credit[a.name]?.availableCredit ?? 0).total
  const limit = sumInBase(creditRows.map(r => r.acct), base, rates, (a) => a.creditLimit ?? 0).total
  const have = breakdown.spending + breakdown.savings + breakdown.invested
  const owe = breakdown.credit + breakdown.loans

  // How this month has moved net worth: the same reading as Home's wallet chip.
  const { current: nwNow, txs: nwTxs, debts: nwDebts, includeDebts: nwInclude } = useNetWorthSeries('1m')
  const monthChange = useMemo(() => {
    if (nwNow == null || !nwTxs.length) return null
    return monthEnds({ txs: nwTxs, current: nwNow, months: 1, debts: nwDebts, includeDebts: nwInclude })[0]?.change ?? null
  }, [nwNow, nwTxs, nwDebts, nwInclude])

  const notes = useMemo(() => {
    const plural = (/** @type {number} */ n, /** @type {string} */ word) => `${n} ${word}${n === 1 ? '' : 's'}`
    const net = monthChange == null ? 'What you have, less what you owe'
      : Math.abs(monthChange) < 0.005 ? 'No change this month'
      : `${monthChange > 0 ? '↑' : '↓'} ${fmt(Math.abs(monthChange))} this month`

    const piles = [['spending', breakdown.spending], ['savings', breakdown.savings], ['invested', breakdown.invested]]
      .filter(([, v]) => /** @type {number} */ (v) > 0.005)
    // Where most of it is: the biggest pile, and its share.
    const biggest = [...piles].sort((a, b) => /** @type {number} */ (b[1]) - /** @type {number} */ (a[1]))[0]
    const where = biggest ? (biggest[0] === 'invested' ? 'investments' : String(biggest[0])) : ''
    const youHave = !biggest || have <= 0 ? 'Spending, savings and investments'
      : piles.length === 1 ? `All in ${where}`
      : `${Math.round((/** @type {number} */ (biggest[1]) / have) * 100)}% in ${where}`

    const parts = []
    if (creditRows.length && limit > 0) parts.push(`${Math.round((breakdown.credit / limit) * 100)}% of limit`)
    else if (creditRows.length) parts.push(plural(creditRows.length, 'card'))
    if (loanRows.length) parts.push(plural(loanRows.length, 'loan'))
    const youOwe = owe <= 0.005 ? 'Nothing owed' : parts.join(' · ') || 'Cards and loans'

    // The card whose statement falls due first, and what is left to pay on it.
    const due = creditRows
      .map(r => ({ r, st: credit[r.acct.name], on: nextDueDate(r.acct.dueDate) }))
      .filter(x => x.on && x.st?.stmtOutstanding > 0.005)
      .sort((a, b) => +a.on - +b.on)[0]
    const avail = due ? `${fmt(due.st.stmtOutstanding)} due ${due.on.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : creditRows.length ? (limit > 0 ? `Of ${fmt(limit)} in limits` : `Across ${plural(creditRows.length, 'card')}`) : 'No cards'
    return { net, youHave, youOwe, avail }
  }, [monthChange, breakdown, have, owe, creditRows, loanRows, limit, credit])

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
      {loading ? <StatsSkeleton /> : (
        <div className="d-stats grid grid-cols-4 gap-5 mb-8">
          <Stat oneLine label="Net worth" value={<Money value={breakdown.total} roll="accounts:net-worth" />} note={notes.net} />
          <Stat oneLine label="You have" value={<Roll id="accounts:have" value={have} />} note={notes.youHave} />
          <Stat oneLine label="You owe" value={<Roll id="accounts:owe" value={owe} format={(v) => (v ? `−${fmt(v)}` : fmt(0))} />} note={notes.youOwe} />
          <Stat oneLine label="Credit available" value={<Roll id="accounts:credit-available" value={available} />} note={notes.avail} />
        </div>
      )}

      {view === 'cards' && loading && <><CardsSkeleton cards={4} /><CardsSkeleton cards={2} /></>}
      {view === 'cards' && !loading && (
        groups.length === 0 ? (
          <Panel><Empty art="wallet" title="No accounts yet" body="Add your cash, a bank, an e-wallet or a card." action={<Btn variant="primary" onClick={() => navigate('/accounts/new')}>Add an account</Btn>} /></Panel>
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
          empty={loading ? <RowsSkeleton /> : (
            <Empty art="wallet" size="sm" title="No accounts yet" body="Add your cash, a bank, an e-wallet or a card." action={<Btn size="sm" onClick={() => navigate('/accounts/new')}>Add an account</Btn>} />
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
