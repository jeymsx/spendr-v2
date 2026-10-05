import { useCallback, useMemo, useState } from 'react'
import { RowsSkeleton, StatsSkeleton } from '../ui/Skeletons'
import { useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useToast } from '../../context/ToastContext'
import { postRecurringCharge, deleteTxGroup } from '../../db/txHelpers'
import { payLoan } from '../../db/accountWrites'
import { isIncomeRecurring } from '../../lib/recurringWrite'
import { creditCardBills } from '../../lib/creditBills'
import { isLoan } from '../../lib/accountMeta'
import { loanStatus } from '../../lib/loans'
import { toMonthlyAmount, FREQ_LABEL, daysUntil, dueStatus, parseDateLocal } from '../../utils/recurring'
import { fmt } from '../../lib/money'
import BillMark from '../../components/BillMark'
import OverdrawWarningSheet from '../../components/OverdrawWarningSheet'
import LoanPaySheet from '../../pages/accounts/LoanPaySheet'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import DataTable from '../ui/DataTable'
import { Tabs } from '../ui/controls'
import { Stat, AccountTile, Empty } from '../ui/display'
import { IPlus, IRepeat } from '../ui/icons'

/**
 * Recurring on a computer: every bill and every pay that repeats, in one
 * table - what it costs, how often, when it is next, from which account -
 * with posting a due one a click in its row, and the card statements and
 * loan payments that are bills too beside it.
 *
 * The phone's figures and writes: monthly totals with bills and income kept
 * apart (utils/recurring toMonthlyAmount), "due now" the home badge's own
 * rule, postRecurringCharge (with Undo, and the overdraw warning when an
 * account would go below zero), creditCardBills, loanStatus and payLoan. A
 * bill's page and its form are the phone's.
 */
export default function WebRecurring() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const allRec = useLiveQuery(() => db.recurring.toArray(), [], undefined)
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [])
  const [tab, setTab] = useState('bills')
  const [posting, setPosting] = useState(/** @type {number|null} */ (null))
  const [overdraw, setOverdraw] = useState(/** @type {any} */ (null))
  const [loanId, setLoanId] = useState(/** @type {number|null} */ (null))
  const [loanOpen, setLoanOpen] = useState(false)
  const [loanSaving, setLoanSaving] = useState(false)

  const catMap = useMemo(() => Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])
  const acctMap = useMemo(() => Object.fromEntries((accounts ?? []).map(a => [a.name, a])), [accounts])
  const all = useMemo(() => allRec ?? [], [allRec])
  const active = all.filter(r => r.active)
  const bills = active.filter(r => !isIncomeRecurring(r))
  const monthlyBills = bills.reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0)
  const monthlyIncome = active.filter(isIncomeRecurring).reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0)
  const dueNow = bills.filter(r => (daysUntil(r.nextDate) ?? 99) <= 0)
  const thisWeek = bills.filter(r => { const n = daysUntil(r.nextDate); return n != null && n > 0 && n <= 7 })

  const cardBills = useMemo(() => creditCardBills({ accounts: accounts ?? [], transactions: transactions ?? [] }), [accounts, transactions])
  const loanDues = useMemo(() => (accounts ?? []).filter(isLoan)
    .map(a => ({ account: a, status: loanStatus(a, transactions ?? []) }))
    .filter(l => l.status.owed > 0.005 && l.status.next && l.status.nextDue)
    .sort((x, y) => x.status.nextDue.getTime() - y.status.nextDue.getTime()), [accounts, transactions])
  const payingLoan = loanDues.find(l => l.account.id === loanId) ?? null

  const rows = useMemo(() => {
    const list = tab === 'bills' ? all.filter(r => !isIncomeRecurring(r))
      : tab === 'income' ? all.filter(isIncomeRecurring)
      : tab === 'paused' ? all.filter(r => !r.active)
      : all
    return [...list].sort((a, b) => Number(b.active) - Number(a.active) || String(a.nextDate ?? '').localeCompare(String(b.nextDate ?? '')))
  }, [all, tab])

  const post = useCallback(async (/** @type {any} */ rec, force = false) => {
    setPosting(rec.id)
    try {
      const { tx } = await postRecurringCharge(rec, { allowOverdraw: force })
      setOverdraw(null)
      showToast(`${rec.name} ${isIncomeRecurring(rec) ? 'received' : 'posted'}`, 'success', tx ? {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await deleteTxGroup([tx]); showToast('Undone') } catch (err) { console.error('[WebRecurring] undo failed:', err); showToast('Could not undo', 'error') }
        },
      } : {})
    } catch (e) {
      const err = /** @type {any} */ (e)
      if (err?.name === 'OverdrawError') { setOverdraw({ rec, accountName: err.account, balance: err.balance, amount: err.amount }); return }
      console.error('[WebRecurring] post failed:', e)
      showToast('Failed to post', 'error')
    } finally {
      setPosting(null)
    }
  }, [showToast])

  const payLoanNow = useCallback(async (/** @type {any} */ { amount, from }) => {
    const loan = payingLoan?.account
    if (!loan || !from || !(amount > 0)) return
    setLoanSaving(true)
    try {
      const { interest } = await payLoan({ loan, from: from.name, amount, dateIso: new Date().toISOString() })
      setLoanOpen(false)
      showToast(interest > 0.005 ? `Paid ${fmt(amount, loan.currency)}, ${fmt(interest, loan.currency)} of it interest` : `Paid ${fmt(amount, loan.currency)} to ${loan.name}`)
    } catch (e) {
      console.error('[WebRecurring] loan payment failed:', e)
      showToast('Could not record the payment', 'error')
    } finally {
      setLoanSaving(false)
    }
  }, [payingLoan, showToast])

  const loading = allRec === undefined
  const sideItems = cardBills.length + loanDues.length

  return (
    <Page
      title="Recurring"
      subtitle={loading ? ' ' : `${active.length} active · ${all.length - active.length} paused`}
      actions={<Btn variant="primary" icon={<IPlus size={15} />} onClick={() => navigate('/recurring/new')}>New</Btn>}
    >
      {loading ? <StatsSkeleton /> : (
        <div className="d-stats grid grid-cols-4 gap-5 mb-8">
          <Stat label="Bills a month" value={fmt(monthlyBills)} note={`${bills.length} active ${bills.length === 1 ? 'bill' : 'bills'} · ${fmt(monthlyBills * 12)} a year`} />
          <Stat label="Income a month" value={fmt(monthlyIncome)} tone={monthlyIncome ? 'pos' : null} note={monthlyIncome ? 'From recurring pay' : 'No recurring income yet'} />
          <Stat label="Due now" value={String(dueNow.length)} tone={dueNow.length ? 'neg' : null} note={dueNow.length ? 'Date arrived, not yet posted' : 'Nothing waiting'} />
          <Stat label="This week" value={String(thisWeek.length)} tone={thisWeek.length ? 'warn' : null} note={thisWeek.length ? `${fmt(thisWeek.reduce((s, r) => s + (r.amount ?? 0), 0))} in the next 7 days` : 'Nothing in the next 7 days'} />
        </div>
      )}

      <div className="grid grid-cols-12 gap-5">
        <div className={`${sideItems ? 'col-span-8 d-stack' : 'col-span-12'} min-w-0`}>
          <Tabs className="mb-4" label="Show" value={tab} onChange={setTab} tabs={[
            { value: 'bills', label: 'Bills', count: all.filter(r => !isIncomeRecurring(r)).length },
            { value: 'income', label: 'Income', count: all.filter(isIncomeRecurring).length },
            { value: 'paused', label: 'Paused', count: all.length - active.length },
            { value: 'all', label: 'All', count: all.length },
          ]} />
          <Panel flush className="d-recurring">
            <DataTable
              label="Recurring"
              rows={loading ? [] : rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => navigate(`/recurring/${r.id}`)}
              rowClassName={(r) => (r.active ? '' : 'opacity-60')}
              empty={loading ? <RowsSkeleton /> : (
                <Empty icon={<IRepeat size={20} />} title={tab === 'income' ? 'No recurring income' : tab === 'paused' ? 'Nothing paused' : 'No recurring bills'}
                  body="Add the bills and pay that come round every month or week." action={<Btn variant="primary" onClick={() => navigate('/recurring/new')}>Add one</Btn>} />
              )}
              columns={[
                {
                  key: 'name', header: 'Name',
                  render: (r) => (
                    <span className="flex items-center gap-3 min-w-0">
                      <BillMark name={r.name} cat={catMap[r.category] ?? null} size={18} boxClass="w-[30px] h-[30px] rounded-[10px]" />
                      <span className="truncate font-medium">{r.name}</span>
                      {!r.active && <span className="d-badge">Paused</span>}
                      {r.split && <span className="d-badge">Split</span>}
                    </span>
                  ),
                },
                { key: 'freq', header: 'Repeats', width: 130, optional: true, render: (r) => <span className="d-cell-muted">{FREQ_LABEL[r.frequency] ?? r.frequency}</span> },
                {
                  key: 'next', header: 'Next', width: 170,
                  render: (r) => {
                    const d = parseDateLocal(r.nextDate)
                    const st = r.active ? dueStatus(r.nextDate) : null
                    return (
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <span className="d-num">{d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</span>
                        {st && st.tone !== 'calm' && <span className={`d-badge ${st.tone === 'late' ? 'd-badge-neg' : 'd-badge-warn'}`}>{st.label}</span>}
                      </span>
                    )
                  },
                },
                { key: 'acct', header: 'Account', width: 170, optional: true, render: (r) => <span className="flex items-center gap-2 min-w-0"><AccountTile account={acctMap[r.account] ?? { name: r.account }} size="sm" /><span className="truncate d-cell-muted">{r.account}</span></span> },
                { key: 'amt', header: 'Amount', width: 130, align: 'right', render: (r) => <span className={`d-num font-semibold ${isIncomeRecurring(r) ? 'd-pos' : ''}`}>{isIncomeRecurring(r) ? '+' : ''}{fmt(r.amount ?? 0)}</span> },
                {
                  key: 'act', header: '', width: 110, align: 'right',
                  render: (r) => r.active && (daysUntil(r.nextDate) ?? 99) <= 0 ? (
                    <Btn size="sm" variant="tint" disabled={posting === r.id} onClick={(e) => { e.stopPropagation(); post(r) }}>
                      {isIncomeRecurring(r) ? 'Received' : 'Post now'}
                    </Btn>
                  ) : null,
                },
              ]}
            />
          </Panel>
        </div>

        {sideItems > 0 && (
          <div className="col-span-4 d-stack-side flex flex-col gap-5 min-w-0 pt-[54px]">
            {cardBills.length > 0 && (
              <Panel title="Card statements" flush>
                <div className="pb-2">
                  {cardBills.map((b) => (
                    <div key={b.name} className="flex items-center gap-3 px-6 py-3">
                      <AccountTile account={acctMap[b.name] ?? { name: b.name }} size="sm" />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-14 font-medium">{b.name}</span>
                        <span className="block text-12 text-[var(--d-text-3)]">{b.dueDate ? `Due ${new Date(b.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Statement'}</span>
                      </span>
                      <span className="text-14 font-semibold d-num">{fmt(b.amount ?? 0)}</span>
                      <Btn size="sm" variant="tint" onClick={() => navigate('/transfer', { state: { prefill: { amount: b.amount, toAccount: b.name } } })}>Pay</Btn>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
            {loanDues.length > 0 && (
              <Panel title="Loan payments" flush>
                <div className="pb-2">
                  {loanDues.map(({ account, status }) => (
                    <div key={account.id} className="flex items-center gap-3 px-6 py-3">
                      <AccountTile account={account} size="sm" />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-14 font-medium">{account.name}</span>
                        <span className={`block text-12 ${status.overdue ? 'd-neg' : 'text-[var(--d-text-3)]'}`}>{status.overdue ? 'Overdue' : `Due ${status.nextDue.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}</span>
                      </span>
                      <span className="text-14 font-semibold d-num">{fmt(status.next?.amount ?? 0, account.currency)}</span>
                      <Btn size="sm" variant="tint" onClick={() => { setLoanId(account.id); setLoanOpen(true) }}>Pay</Btn>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        )}
      </div>

      <OverdrawWarningSheet
        open={!!overdraw}
        onClose={() => setOverdraw(null)}
        onSaveAnyway={() => { const o = overdraw; setOverdraw(null); if (o) post(o.rec, true) }}
        accountName={overdraw?.accountName}
        balance={overdraw?.balance}
        amount={overdraw?.amount}
      />
      {payingLoan && (
        <LoanPaySheet open={loanOpen} onClose={() => setLoanOpen(false)} loan={payingLoan.account} accounts={accounts ?? []} status={payingLoan.status} saving={loanSaving} onPay={payLoanNow} />
      )}
    </Page>
  )
}
