import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import db, { UNSYNCED } from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import useRates from '../../hooks/useRates'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { useToast } from '../../context/ToastContext'
import { getCreditStatus, getNextCycleRange } from '../../utils/creditCycle'
import { statementDueDate, daysToDue, upcomingDueDate } from '../../lib/creditBills'
import { creditStatements } from '../../lib/creditStatements'
import { estimateFinanceCharge, financeChargeRow, financeChargeLogged } from '../../lib/financeCharge'
import { receivedAmount } from '../../lib/transferLegs'
import { applyBalanceEffect, postCardPayment } from '../../db/txHelpers'
import { payLoan, recordValue } from '../../db/accountWrites'
import { allocateGoals } from '../../lib/goals'
import { investmentStatus, valuedAgo } from '../../lib/investments'
import { loanStatus, foldLoanPayments } from '../../lib/loans'
import { TREND_RANGES, buildTrend, DAY_MS } from '../../lib/trend'
import { TYPE_LABEL, INVESTMENT_KIND_LABEL } from '../../lib/accountMeta'
import { accountBrand } from '../../lib/accountBrands'
import { editTransaction } from '../../lib/editTransaction'
import { fmt } from '../../lib/money'
import { AccountFormSheet, QrViewerModal, nextOccurrenceDate } from '../../pages/Accounts'
import CardPaymentSheet from '../../pages/accounts/CardPaymentSheet'
import LoanPaySheet from '../../pages/accounts/LoanPaySheet'
import UpdateValueSheet from '../../pages/accounts/UpdateValueSheet'
import OverdrawWarningSheet from '../../components/OverdrawWarningSheet'
import TxDetailSheet from '../../components/TxDetailSheet'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import DataTable from '../ui/DataTable'
import Popover, { MenuItem } from '../ui/Popover'
import { Segmented } from '../ui/controls'
import { Stat, Money, AccountTile, Progress, Empty } from '../ui/display'
import { AreaTrend } from '../ui/charts'
import { shortDate, TxDescription, TxAmount, TxCategoryText } from './txParts'
import { IEdit, IMore, IPlus, ITransfer, IChevronLeft, IList, IAlert, IRefresh, ICalendar } from '../ui/icons'

const RANGES = TREND_RANGES.filter(r => ['1m', '3m', '6m', '1y', 'all'].includes(r.key))

/**
 * One account on a computer: its figure and what it means for its kind, its
 * balance over time, and every transaction on it with the balance after
 * each.
 *
 * A card: what it owes, its limit and what is left, the last statement and
 * when it is due, paying it, a late statement's likely charge. A loan: what
 * is left, the next payment, when it ends, paying it. An investment: its
 * value, what went in, the gain, updating the value. Every figure and every
 * write is the phone's (utils/creditCycle, lib/loans, lib/investments,
 * db/txHelpers, db/accountWrites); the pay, value and edit forms are the
 * phone's own, shown as dialogs.
 */
export default function WebAccountDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], undefined)
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const goals = useLiveQuery(() => db.goals.toArray(), [], [])
  const base = useBaseCurrency()
  const { table: rates } = useRates()
  const account = (accounts ?? []).find(a => String(a.id) === String(id)) ?? null
  const name = account?.name

  const [trendRange, setTrendRange] = useState('3m')
  const [formOpen, setFormOpen] = useState(/** @type {false|'edit'|'child'} */ (false))
  const [qrOpen, setQrOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [paying, setPaying] = useState(false)
  const [overdraw, setOverdraw] = useState(/** @type {any} */ (null))
  const [loanPayOpen, setLoanPayOpen] = useState(false)
  const [loanPaying, setLoanPaying] = useState(false)
  const [valueOpen, setValueOpen] = useState(false)
  const [valueSaving, setValueSaving] = useState(false)
  const [selectedTx, setSelectedTx] = useState(/** @type {Record<string, any>|null} */ (null))
  const [logging, setLogging] = useState(false)
  const chargeInFlight = useRef(false)

  const acctTxs = useMemo(() => (!name ? [] : (transactions ?? [])
    .filter(t => t.account === name || t.fromAccount === name || t.toAccount === name)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))), [transactions, name])

  // The balance after each row, newest first, worked back from today's (as the phone does).
  const withRunning = useMemo(() => {
    if (!account) return []
    const isCard = account.type === 'credit'
    let bal = account.balance ?? 0
    return acctTxs.map(tx => {
      const balAfter = bal
      if (tx.type === 'expense' && tx.account === account.name) bal += tx.amount ?? 0
      else if (tx.type === 'inflow' && tx.account === account.name) bal -= tx.amount ?? 0
      else if (tx.type === 'transfer') {
        if (tx.fromAccount === account.name) bal += tx.amount ?? 0
        if (tx.toAccount === account.name) bal += isCard ? receivedAmount(tx) : -receivedAmount(tx)
      }
      return { ...tx, balAfter }
    })
  }, [acctTxs, account])

  const isCredit = account?.type === 'credit'
  const isLoan = account?.type === 'loan'
  const isInvestment = account?.type === 'investment'
  const isOwed = isCredit || isLoan

  const creditData = useMemo(() => {
    if (!account || !isCredit) return null
    const status = getCreditStatus(account, withRunning)
    const { cycleStart: nextStart, cycleEnd: nextEnd } = getNextCycleRange(account.cutoffDate)
    const dueDate = nextOccurrenceDate(account.dueDate)
    const stmtDue = statementDueDate(status.cycleEnd, account.dueDate)
    const stmtDays = daysToDue(stmtDue, new Date())
    return {
      ...status, nextStart, nextEnd, stmtDue, stmtDays,
      nextDue: upcomingDueDate(status, account.dueDate)?.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) ?? null,
      dueSoon: dueDate && ((dueDate - new Date()) / DAY_MS) <= 7,
      tone: !status.hasStatement ? 'none' : status.stmtPaid ? 'paid' : 'owing',
    }
  }, [account, isCredit, withRunning])

  const lateInfo = useMemo(() => {
    if (!account || !isCredit || !creditData) return null
    const late = creditData.stmtDays == null ? null : -creditData.stmtDays
    return {
      ...estimateFinanceCharge({ account, outstanding: creditData.stmtOutstanding, minimumDue: creditData.minimumDue, daysLate: late }),
      daysLate: late,
      alreadyLogged: financeChargeLogged({ transactions: withRunning, accountName: account.name, since: creditData.stmtDue }),
    }
  }, [account, isCredit, creditData, withRunning])

  const statements = useMemo(() => (isCredit && account ? creditStatements(account, withRunning) : []), [isCredit, account, withRunning])
  const invStatus = useMemo(() => (isInvestment && account ? investmentStatus(account, transactions ?? []) : null), [isInvestment, account, transactions])
  const loanInfo = useMemo(() => (isLoan && account ? loanStatus(account, transactions ?? []) : null), [isLoan, account, transactions])

  const figure = isCredit ? (creditData?.currentBalance ?? 0) : isLoan ? (loanInfo?.owed ?? 0) : (account?.balance ?? 0)
  const range = RANGES.find(r => r.key === trendRange) ?? RANGES[1]
  const trend = useMemo(() => (!name ? [] : buildTrend(acctTxs, name, isOwed, figure, range)), [acctTxs, name, isOwed, figure, range])
  const goalSplit = useMemo(() => {
    if (!account || isCredit) return null
    return allocateGoals({ goals: goals ?? [], accounts: accounts ?? [], base, rates }).byAccount[account.name] ?? null
  }, [goals, accounts, account, isCredit, base, rates])

  const catMap = useMemo(() => Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])
  const rows = useMemo(() => foldLoanPayments(withRunning), [withRunning])

  const handlePay = useCallback(async (/** @type {any} */ { amount, from, sourceAmount = null, force = false }) => {
    if (!account || !from || !(amount > 0)) return
    setPaying(true)
    try {
      await postCardPayment({ cardName: account.name, fromName: from.name, amount, sourceAmount, allowOverdraw: force })
      setPayOpen(false)
      setOverdraw(null)
      showToast(`Paid ${fmt(amount, account.currency)} to ${account.name}`)
    } catch (e) {
      if (/** @type {any} */ (e)?.name === 'OverdrawError') {
        const err = /** @type {any} */ (e)
        setOverdraw({ accountName: err.account, balance: err.balance, shortAmount: err.amount, amount, sourceAmount, from })
      } else {
        console.error('[WebAccountDetail] card payment failed:', e)
        showToast(/no exchange rate/i.test(/** @type {any} */ (e)?.message ?? '') ? /** @type {any} */ (e).message : 'Could not record the payment', 'error')
      }
    } finally {
      setPaying(false)
    }
  }, [account, showToast])

  const handleLoanPay = useCallback(async (/** @type {any} */ { amount, from }) => {
    if (!account || !from || !(amount > 0)) return
    setLoanPaying(true)
    try {
      const { interest } = await payLoan({ loan: account, from: from.name, amount, dateIso: new Date().toISOString() })
      setLoanPayOpen(false)
      showToast(interest > 0.005 ? `Paid ${fmt(amount, account.currency)}, ${fmt(interest, account.currency)} of it interest` : `Paid ${fmt(amount, account.currency)} to ${account.name}`)
    } catch (e) {
      console.error('[WebAccountDetail] loan payment failed:', e)
      showToast('Could not record the payment', 'error')
    } finally {
      setLoanPaying(false)
    }
  }, [account, showToast])

  const saveValue = useCallback(async (/** @type {number} */ value) => {
    if (!account) return
    setValueSaving(true)
    try {
      const { delta } = await recordValue(account, value, new Date().toISOString())
      setValueOpen(false)
      showToast(Math.abs(delta) < 0.005 ? 'Value confirmed' : `Value updated, ${delta > 0 ? 'up' : 'down'} ${fmt(Math.abs(delta), account.currency)}`)
    } catch (e) {
      console.error('[WebAccountDetail] value update failed:', e)
      showToast('Could not save the value', 'error')
    } finally {
      setValueSaving(false)
    }
  }, [account, showToast])

  const logFinanceCharge = useCallback(async () => {
    if (!account || !lateInfo?.canEstimate || lateInfo.total <= 0 || chargeInFlight.current) return
    chargeInFlight.current = true
    setLogging(true)
    try {
      const row = financeChargeRow({ accountName: account.name, amount: lateInfo.total })
      await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
        await db.transactions.add({ ...row, txId: crypto.randomUUID(), synced: UNSYNCED })
        await applyBalanceEffect(row)
      })
      showToast(`Logged ${fmt(lateInfo.total, account.currency)} finance charge`)
    } catch (e) {
      console.error('[WebAccountDetail] finance charge failed:', e)
      showToast('Could not log the charge', 'error')
    } finally {
      chargeInFlight.current = false
      setLogging(false)
    }
  }, [account, lateInfo, showToast])

  if (!accounts) return <Page><div className="h-40" /></Page>
  if (!account) {
    return (
      <Page title="Account not found">
        <Panel><Empty title="This account isn’t here" body="It may have been deleted." action={<Btn onClick={() => navigate('/accounts')}>Back to accounts</Btn>} /></Panel>
      </Page>
    )
  }

  const cur = account.currency || base
  const brand = accountBrand(account)
  const typeLabel = isInvestment ? (INVESTMENT_KIND_LABEL[account.kind] ?? TYPE_LABEL.investment) : TYPE_LABEL[account.type]
  const children = (accounts ?? []).filter(a => a.parentName === account.name)
  const limit = account.creditLimit ?? 0
  const chart = trend.map(p => ({ label: p.day, value: p.value }))
  const change = chart.length > 1 ? chart[chart.length - 1].value - chart[0].value : 0
  const late = isCredit && lateInfo && lateInfo.daysLate != null && lateInfo.daysLate > 0 && (creditData?.stmtOutstanding ?? 0) > 0.005

  return (
    <Page
      eyebrow={<Link to="/accounts" className="inline-flex items-center gap-1 hover:text-[var(--d-text)]"><IChevronLeft size={13} />Accounts</Link>}
      title={
        <span className="flex items-center gap-3">
          <AccountTile account={account} size="lg" />
          <span className="truncate">{account.name}</span>
        </span>
      }
      subtitle={[typeLabel, account.parentName ? `Part of ${account.parentName}` : null, cur !== base ? cur : null].filter(Boolean).join(' · ')}
      actions={
        <>
          {isCredit && <Btn variant="primary" onClick={() => setPayOpen(true)}>Pay card</Btn>}
          {isLoan && <Btn variant="primary" onClick={() => setLoanPayOpen(true)}>Make a payment</Btn>}
          {isInvestment && <Btn variant="primary" icon={<IRefresh size={14} />} onClick={() => setValueOpen(true)}>Update value</Btn>}
          {!isCredit && !isLoan && (
            <Btn icon={<ITransfer size={14} />} onClick={() => navigate('/transfer', { state: { prefill: isInvestment ? { toAccount: account.name } : { fromAccount: account.name } } })}>
              {isInvestment ? 'Add money' : 'Transfer'}
            </Btn>
          )}
          <Btn icon={<IEdit size={14} />} onClick={() => navigate(`/accounts/${account.id}/edit`)}>Edit</Btn>
          <Popover role="menu" align="end" width={220} label="More" trigger={<Btn variant="ghost" icon={<IMore size={16} />} label="More" />}>
            {!account.parentName && !isCredit && !isLoan && !isInvestment && (
              <MenuItem icon={<IPlus />} onSelect={() => setFormOpen('child')}>Add a sub-account</MenuItem>
            )}
            {isCredit && <MenuItem icon={<ICalendar />} onSelect={() => navigate(`/accounts/${account.id}/statements`)}>Statement history</MenuItem>}
            {account.qrImage && <MenuItem icon={<IList />} onSelect={() => setQrOpen(true)}>Show payment QR</MenuItem>}
            <MenuItem icon={<IEdit />} onSelect={() => setFormOpen('edit')}>Adjust balance or delete</MenuItem>
          </Popover>
        </>
      }
    >
      {late && lateInfo && (
        <div className="d-panel mb-6 px-6 py-4 flex items-center gap-3" style={{ borderColor: 'color-mix(in srgb, var(--d-neg) 35%, var(--d-border))', background: 'color-mix(in srgb, var(--d-neg) 5%, var(--d-panel))' }}>
          <IAlert size={18} className="text-[var(--d-neg)]" />
          <div className="flex-1 min-w-0 text-13">
            <span className="font-semibold text-[var(--d-text)]">The statement is {lateInfo.daysLate} {lateInfo.daysLate === 1 ? 'day' : 'days'} overdue.</span>{' '}
            <span className="text-[var(--d-text-2)]">
              {lateInfo.canEstimate && lateInfo.total > 0 ? `The bank is likely to add about ${fmt(lateInfo.total, cur)}.` : 'Pay it to stop interest building.'}
            </span>
          </div>
          {lateInfo.canEstimate && lateInfo.total > 0 && !lateInfo.alreadyLogged && (
            <Btn size="sm" disabled={logging} onClick={logFinanceCharge}>Log the charge</Btn>
          )}
          <Btn size="sm" variant="primary" onClick={() => setPayOpen(true)}>Pay now</Btn>
        </div>
      )}

      <div className="grid grid-cols-4 gap-5 mb-8">
        {isCredit && creditData && (
          <>
            <Stat label="Owed now" value={<Money value={creditData.currentBalance ?? 0} currency={cur} />} tone={(creditData.currentBalance ?? 0) > 0 ? 'neg' : null}
              note={(creditData.signedBalance ?? 0) < -0.005 ? `${fmt(-(creditData.signedBalance ?? 0), cur)} credit on the card` : 'This cycle and earlier'} />
            <Stat label="Available" value={fmt(Math.max(0, limit - (creditData.currentBalance ?? 0)), cur)} note={limit ? `Of a ${fmt(limit, cur)} limit` : 'No limit set'}>
              {limit > 0 && <Progress className="mt-2.5" value={((creditData.currentBalance ?? 0) / limit) * 100} color={(creditData.currentBalance ?? 0) / limit > 0.9 ? 'var(--d-neg)' : undefined} />}
            </Stat>
            <Stat label="Statement" value={creditData.hasStatement ? fmt(creditData.stmtOutstanding ?? 0, cur) : '—'}
              tone={creditData.tone === 'owing' ? 'neg' : creditData.tone === 'paid' ? 'pos' : null}
              note={!creditData.hasStatement ? 'No statement yet' : creditData.stmtPaid ? 'Paid' : creditData.nextDue ? `Due ${creditData.nextDue}` : 'Owing'} />
            <Stat label="Minimum due" value={fmt(creditData.minimumDue ?? 0, cur)} note={creditData.nextEnd ? `Cycle closes ${new Date(creditData.nextEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ' '} />
          </>
        )}
        {isLoan && loanInfo && (
          <>
            <Stat label="Left to pay" value={fmt(loanInfo.owed ?? 0, cur)} tone="neg" note={loanInfo.ratePct ? `${loanInfo.ratePct}% a month` : 'No interest set'}>
              {loanInfo.progress != null && <Progress className="mt-2.5" value={(loanInfo.progress ?? 0) * 100} color="var(--d-pos)" />}
            </Stat>
            <Stat label="Next payment" value={loanInfo.next ? fmt(loanInfo.next.amount ?? 0, cur) : '—'} tone={loanInfo.overdue ? 'neg' : null}
              note={loanInfo.overdue ? 'Overdue' : loanInfo.nextDue ? `Due ${new Date(loanInfo.nextDue).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ' '} />
            <Stat label="Paid off by" value={loanInfo.paidOffBy ? new Date(loanInfo.paidOffBy).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—'} note={loanInfo.monthsLeft != null ? `${loanInfo.monthsLeft} months left` : ' '} />
            <Stat label="Paid in so far" value={fmt(loanInfo.paidIn ?? 0, cur)} note="Payments recorded" />
          </>
        )}
        {isInvestment && invStatus && (
          <>
            <Stat label="Value" value={fmt(invStatus.value ?? 0, cur)} note={valuedAgo(invStatus.valuedAt)} />
            <Stat label="Paid in" value={fmt(invStatus.paidIn ?? 0, cur)} note="What went in" />
            <Stat label="Gain" value={`${(invStatus.gain ?? 0) >= 0 ? '+' : '−'}${fmt(Math.abs(invStatus.gain ?? 0), cur)}`} tone={(invStatus.gain ?? 0) >= 0 ? 'pos' : 'neg'}
              note={invStatus.gainPct != null ? `${(invStatus.gainPct * 100).toFixed(1)}%` : ' '} />
            <Stat label="Last valued" value={invStatus.valuedAt ? new Date(invStatus.valuedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'} tone={invStatus.stale ? 'warn' : null} note={invStatus.stale ? 'Worth updating' : 'Up to date'} />
          </>
        )}
        {!isCredit && !isLoan && !isInvestment && (
          <>
            <Stat label="Balance" value={<Money value={account.balance ?? 0} currency={cur} />} note={brand ? typeLabel : ' '} />
            <MonthStats txs={acctTxs} name={account.name} cur={cur} />
            <Stat label="Promised to goals" value={fmt(goalSplit?.assigned ?? 0, cur)} note={goalSplit?.goals?.length ? `${goalSplit.goals.length} ${goalSplit.goals.length === 1 ? 'goal' : 'goals'} · ${fmt(goalSplit.unassigned ?? 0, cur)} free` : 'No goals draw on it'} />
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-5 mb-5">
        <Panel
          className={children.length || statements.length ? 'col-span-2' : 'col-span-3'}
          title={isOwed ? 'Owed over time' : isInvestment ? 'Value over time' : 'Balance over time'}
          meta={chart.length > 1 ? `${change >= 0 ? '+' : '−'}${fmt(Math.abs(change), cur)} over ${range.label.toLowerCase() === 'all' ? 'all time' : range.label}` : null}
          actions={<Segmented label="Range" value={trendRange} onChange={setTrendRange} options={RANGES.map(r => ({ value: r.key, label: r.key === 'all' ? 'All' : r.label }))} />}
        >
          {chart.length > 1 ? <AreaTrend data={chart} height={220} currency={cur} color={isOwed ? 'var(--d-neg)' : brand.from} valueLabel={isOwed ? 'Owed' : 'Balance'} /> : <div className="h-[220px]" />}
        </Panel>

        {(children.length > 0 || statements.length > 0) && (
          <div className="flex flex-col gap-5 min-w-0">
            {children.length > 0 && (
              <Panel title="Sub-accounts" flush actions={<Btn size="sm" variant="ghost" icon={<IPlus size={14} />} onClick={() => setFormOpen('child')}>Add</Btn>}>
                <div className="py-1">
                  {children.map(c => (
                    <Link key={c.id} to={`/accounts/${c.id}`} className="flex items-center gap-2.5 h-10 px-4 hover:bg-[var(--d-hover)]">
                      <AccountTile account={c} size="sm" />
                      <span className="flex-1 truncate text-13">{c.name}</span>
                      <Money value={c.balance ?? 0} currency={c.currency || base} className="text-13 font-medium" />
                    </Link>
                  ))}
                </div>
              </Panel>
            )}
            {statements.length > 0 && (
              <Panel title="Statements" flush actions={<Btn size="sm" variant="ghost" onClick={() => navigate(`/accounts/${account.id}/statements`)}>All</Btn>}>
                <div className="py-1">
                  {[...statements].sort((a, b) => +new Date(b.cycleEnd) - +new Date(a.cycleEnd)).slice(0, 5).map(st => (
                    <div key={st.key} className="flex items-center gap-3 h-10 px-4 text-13">
                      <span className="flex-1 truncate text-[var(--d-text)]">Closed {new Date(st.cycleEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      <span className={`d-badge ${st.status === 'paid' ? 'd-badge-pos' : st.status === 'overdue' ? 'd-badge-neg' : st.status === 'due' ? 'd-badge-warn' : ''}`}>
                        {st.status === 'paid' ? 'Paid' : st.status === 'overdue' ? 'Overdue' : st.status === 'due' ? 'Due' : st.status === 'carried' ? 'Carried' : 'Nothing due'}
                      </span>
                      <span className="d-num font-medium w-24 text-right">{fmt(Math.max(0, st.balance ?? 0), cur)}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        )}
      </div>

      <Panel title="Transactions" meta={`${rows.length.toLocaleString()} rows`} flush>
        <DataTable
          label={`Transactions on ${account.name}`}
          rows={rows}
          rowKey={(t) => t.id}
          onRowClick={(t) => setSelectedTx(t)}
          empty={<Empty icon={<IList size={18} />} title="Nothing on this account yet" body="Transactions to and from it show here." />}
          columns={[
            { key: 'date', header: 'Date', width: 96, render: (t) => <span className="d-cell-muted d-num">{shortDate(t.date)}</span> },
            { key: 'desc', header: 'Description', render: (t) => <TxDescription tx={t} catMap={catMap} /> },
            { key: 'cat', header: 'Category', width: 170, render: (t) => <TxCategoryText tx={t} catMap={catMap} /> },
            { key: 'amt', header: 'Amount', width: 140, align: 'right', render: (t) => <TxAmount tx={t} account={account.name} /> },
            ...(isCredit || isLoan || isInvestment ? [] : [{
              key: 'bal', header: 'Balance after', width: 150, align: /** @type {const} */ ('right'),
              render: (/** @type {any} */ t) => <Money value={t.balAfter ?? 0} currency={cur} className="d-cell-muted" />,
            }]),
          ]}
        />
      </Panel>

      <AccountFormSheet
        open={!!formOpen}
        onClose={() => setFormOpen(false)}
        account={formOpen === 'edit' ? account : null}
        prefill={formOpen === 'child' ? { parentName: account.name } : null}
      />
      <QrViewerModal open={qrOpen} onClose={() => setQrOpen(false)} qrImage={account.qrImage} accountName={account.name} />
      {isCredit && (
        <CardPaymentSheet open={payOpen} onClose={() => setPayOpen(false)} card={account} accounts={accounts ?? []} status={creditData} saving={paying} onPay={handlePay} />
      )}
      <OverdrawWarningSheet
        open={!!overdraw}
        onClose={() => setOverdraw(null)}
        onSaveAnyway={() => { const p = overdraw; setOverdraw(null); if (p) handlePay({ amount: p.amount, from: p.from, sourceAmount: p.sourceAmount, force: true }) }}
        accountName={overdraw?.accountName}
        balance={overdraw?.balance}
        amount={overdraw?.shortAmount}
      />
      {isInvestment && (
        <UpdateValueSheet open={valueOpen} onClose={() => setValueOpen(false)} account={account} status={invStatus} saving={valueSaving} onSave={saveValue} />
      )}
      {isLoan && (
        <LoanPaySheet open={loanPayOpen} onClose={() => setLoanPayOpen(false)} loan={account} accounts={accounts ?? []} status={loanInfo} saving={loanPaying} onPay={handleLoanPay} />
      )}
      <TxDetailSheet
        open={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
        accounts={accounts ?? []}
        categories={categories ?? []}
        onEdit={(t) => editTransaction(navigate, t, () => setSelectedTx(null))}
      />
    </Page>
  )
}

/** This month's money in and out of a plain account. @param {{txs: Array<Record<string, any>>, name: string, cur: string}} props */
function MonthStats({ txs, name, cur }) {
  const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  let into = 0
  let out = 0
  for (const t of txs) {
    if ((t.date ?? '') < start || (t.date ?? '') > new Date().toISOString()) continue
    if (t.type === 'inflow' && t.account === name) into += t.amount ?? 0
    else if (t.type === 'expense' && t.account === name) out += t.amount ?? 0
    else if (t.type === 'transfer') {
      if (t.toAccount === name) into += receivedAmount(t)
      if (t.fromAccount === name) out += t.amount ?? 0
    }
  }
  return (
    <>
      <Stat label="In this month" value={fmt(into, cur)} note="Inflows and transfers in" />
      <Stat label="Out this month" value={fmt(out, cur)} note="Spending and transfers out" />
    </>
  )
}
