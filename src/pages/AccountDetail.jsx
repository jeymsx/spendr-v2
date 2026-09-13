import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { allocateGoals } from '../lib/goals'
import { getCreditStatus, getNextCycleRange } from '../utils/creditCycle'
import { accountBrand } from '../lib/accountBrands'
import { normalizeDesign } from '../lib/cardDesigns'
import BrandMark from '../components/BrandMark'
import BrandWatermark from '../components/BrandWatermark'
import SchemeMark from '../components/SchemeMark'
import TxDetailSheet from '../components/TxDetailSheet'
import LimitMeter from '../components/LimitMeter'
import { statementDueDate, daysToDue } from '../lib/creditBills'
import {
  estimateFinanceCharge, financeChargeRow, financeChargeLogged,
} from '../lib/financeCharge'
import { applyBalanceEffect } from '../db/txHelpers'
import { UNSYNCED } from '../db/db'
import { useToast } from '../context/ToastContext'
import { IconChevronRight, IconTick, IconWarning, IconNotFound } from '../components/icons'
import {
  AccountFormSheet,
  QrViewerModal,
  StatCard,
  CreditTxSection,
  TYPE_LABEL,
  fmt,
  fmtCycleDate,
  nextOccurrence,
  nextOccurrenceDate,
} from './Accounts'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Divider from '../components/ui/Divider'
import EmptyState from '../components/ui/EmptyState'
import IconButton from '../components/ui/IconButton'
import SectionLabel from '../components/ui/SectionLabel'
import {
  TREND_RANGES, RANGE_TITLE, buildTrend, TrendRangeChips, BalanceTrend,
  IconChevronLeft, IconQr, IconEmptyLedger, STMT_TONE, DAY_MS,
} from './accounts/Trend'
import { TxList, TrendDelta } from './accounts/DetailBits'

/**
 * One account, as a page rather than a sheet.
 *
 * It was a bottom sheet, which capped it at 92vh with the list showing behind
 * and put a hard ceiling on how much could ever go on it. As a route it gets
 * the whole viewport, a real history entry (so the hardware back button and a
 * shared link both work), and room to grow per account type.
 *
 * The layout follows the platform convention for a detail screen: a back
 * chevron and a centred title, the object's own identity below it, then the
 * one number you came for, set large and centred, then the supporting detail.
 * The identity is the actual brand card face - the same `.acct-card` material
 * as the Accounts list - so tapping a card takes you to a bigger version of
 * the thing you tapped rather than to an unrelated screen.
 */

const CARD_RATIO = 1.586

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AccountDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const accounts     = useLiveQuery(() => db.accounts.toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const categories   = useLiveQuery(() => db.categories.toArray(), [])
  // Every goal, not just this account's, because the split depends on them.
  // A goal higher up the list can drain this balance before the goals shown
  // here ever see it, so allocating from a filtered set would overstate them.
  const goals        = useLiveQuery(() => db.goals.toArray(), [], [])

  // Category name -> {icon, color}, so a ledger row can show the same emoji
  // and tint the Transactions page shows.
  const catMap = useMemo(
    () => Object.fromEntries((categories ?? []).map(c => [c.name, c])),
    [categories],
  )

  // 1m is the old fixed behaviour, so the page opens on what it always showed.
  const [trendRange,  setTrendRange]  = useState('1m')
  const [selectedTx,  setSelectedTx]  = useState(null)
  const [qrVisible,   setQrVisible]   = useState(false)
  const [formOpen,    setFormOpen]    = useState(false)
  const [formPrefill, setFormPrefill] = useState(null)

  // Route params are strings; account ids are numbers from Dexie.
  const account = useMemo(
    () => (accounts ?? []).find(a => String(a.id) === String(id)),
    [accounts, id],
  )

  const back = () => navigate('/accounts')

  // Deleting from the edit sheet leaves this page pointing at a row that is
  // gone. Landing on "not found" after deleting something yourself reads as a
  // fault, so a delete that happens while you are here returns you to the
  // list; a URL that never resolved still gets the explanation below.
  //
  // The flag is set INSIDE the effect, not during render. Writing a ref while
  // rendering is idempotent here and worked, but render is allowed to run and
  // be thrown away under concurrent React, and a "have I ever seen this
  // account" flag set by a discarded render is how you get sent back to the
  // list for an account that still exists.
  const hadAccount = useRef(false)
  useEffect(() => {
    if (account) { hadAccount.current = true; return }
    if (accounts && hadAccount.current) navigate('/accounts', { replace: true })
  }, [accounts, account, navigate])

  /* Keyed on the NAME, and reading the name, so the dependency list is
     honest rather than narrowed behind a disable. `account` comes from a
     .find() and is a fresh object every render; depending on it would
     recompute this filter over every transaction on each pass. */
  const accountName = account?.name
  const acctTxs = useMemo(() => {
    if (!accountName) return []
    return (transactions ?? [])
      .filter(tx =>
        tx.account === accountName ||
        tx.fromAccount === accountName ||
        tx.toAccount === accountName
      )
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }, [transactions, accountName])

  // Running balance, newest first: start at the current balance and reverse
  // each transaction to recover the balance before it. getCreditStatus is
  // handed these rows rather than the raw ones so its charge and payment
  // buckets keep the field the ledger renders.
  const txsWithRunning = useMemo(() => {
    if (!account) return []
    const acctIsCredit = account.type === 'credit'
    let bal = account.balance ?? 0
    return acctTxs.map(tx => {
      const balAfter = bal
      if (tx.type === 'expense' && tx.account === account.name)       bal += tx.amount ?? 0
      else if (tx.type === 'inflow' && tx.account === account.name)   bal -= tx.amount ?? 0
      else if (tx.type === 'transfer') {
        if (tx.fromAccount === account.name) bal += tx.amount ?? 0
        if (tx.toAccount   === account.name) bal += acctIsCredit ? (tx.amount ?? 0) : -(tx.amount ?? 0)
      }
      return { ...tx, balAfter }
    })
  }, [acctTxs, account])

  /**
   * How late this statement is, and what the bank is likely to add for it.
   *
   * Kept out of creditData because it is a different question: creditData
   * says what the card holds, this says what happens if you leave it. Both
   * derive from the same status, and neither writes anything - the charge is
   * only written when you press the button, because a finance charge is the
   * bank's to decide and this is an estimate of it.
   */
  const lateInfo = useMemo(() => {
    if (!account || account.type !== 'credit') return null
    const status = getCreditStatus(account, txsWithRunning)
    const due    = statementDueDate(status.cycleEnd, account.dueDate)
    const days   = daysToDue(due, new Date())
    const late   = days == null ? null : -days
    return {
      ...estimateFinanceCharge({
        account,
        outstanding: status.stmtOutstanding,
        minimumDue:  status.minimumDue,
        daysLate:    late,
      }),
      daysLate: late,
      /* Once one is logged the offer has to go. Logging raises the balance,
         which keeps the statement late and makes the next estimate bigger -
         so the button would sit there compounding itself on every tap. */
      alreadyLogged: financeChargeLogged({
        transactions: txsWithRunning, accountName: account.name, since: due,
      }),
    }
  }, [account, txsWithRunning])

  const { showToast } = useToast()
  const [loggingCharge, setLoggingCharge] = useState(false)
  /* A ref as well as the state, because the state guard only takes effect on
     the next render - two taps inside one frame, or a re-render landing
     mid-write, would both get past it. This is a button that writes money;
     the guard has to be synchronous. */
  const chargeInFlight = useRef(false)

  /* Writes the estimate as an ordinary expense on the card - which is exactly
     what the bank does - so the balance, the available credit and Insights all
     pick it up with no special handling anywhere. Editable afterwards like any
     other transaction, which is the point of writing a row rather than
     inventing a derived figure. */
  const logFinanceCharge = useCallback(async () => {
    if (!account || !lateInfo?.canEstimate || lateInfo.total <= 0) return
    if (chargeInFlight.current) return
    chargeInFlight.current = true
    setLoggingCharge(true)
    try {
      const row = financeChargeRow({ accountName: account.name, amount: lateInfo.total })
      await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
        await db.transactions.add({ ...row, txId: crypto.randomUUID(), synced: UNSYNCED })
        await applyBalanceEffect(row)
      })
      showToast(`Logged ${fmt(lateInfo.total)} finance charge`)
    } catch (e) {
      console.error('[AccountDetail] finance charge failed:', e)
      showToast('Could not log the charge', 'error')
    } finally {
      chargeInFlight.current = false
      setLoggingCharge(false)
    }
  }, [account, lateInfo, showToast])

  const creditData = useMemo(() => {
    if (!account || account.type !== 'credit') return null
    const status = getCreditStatus(account, txsWithRunning)
    const { cycleStart: nextStart, cycleEnd: nextEnd } = getNextCycleRange(account.cutoffDate)
    const dueDate = nextOccurrenceDate(account.dueDate)
    return {
      ...status,
      nextStart, nextEnd,
      // minimumDue now comes from ...status, which caps it at what is still
      // owed rather than printing the account's stored figure regardless.
      nextDue:    nextOccurrence(account.dueDate),
      dueSoon:    dueDate && ((dueDate - new Date()) / DAY_MS) <= 7,
      tone:       !status.hasStatement ? 'none' : status.stmtPaid ? 'paid' : 'owing',
    }
  }, [account, txsWithRunning])

  const isCredit  = account?.type === 'credit'
  const totalUsed = isCredit ? (creditData?.currentBalance ?? 0) : (account?.balance ?? 0)

  const range = useMemo(
    () => TREND_RANGES.find(r => r.key === trendRange) ?? TREND_RANGES[3],
    [trendRange],
  )
  const trend = useMemo(() => {
    if (!accountName) return []
    return buildTrend(acctTxs, accountName, isCredit, totalUsed, range)
  }, [acctTxs, accountName, isCredit, totalUsed, range])

  // What this balance is already promised to. Every goal is passed in, not
  // just this account's: a higher-ranked goal can drain the balance before the
  // ones shown here see any of it, so allocating from a filtered set would
  // overstate them. See lib/goals.js.
  //
  // Above the early returns with the rest of the hooks, and guarded inside the
  // callback like its neighbours - a useMemo below them runs on the loaded
  // render but not the loading one, which is a changed hook count and a hard
  // React error rather than a glitch.
  const goalSplit = useMemo(() => {
    if (!account || account.type === 'credit') return null
    const alloc = allocateGoals({ goals: goals ?? [], accounts: accounts ?? [] })
    return alloc.byAccount[account.name] ?? null
  }, [goals, accounts, account])

  // Still loading, or gone. Deleting from the edit sheet lands here, and so
  // does a stale link, so this has to be a real state rather than a crash.
  if (!accounts) {
    return <div className="pt-safe-header px-5" />
  }
  if (!account) {
    return (
      <div className="pt-safe-header px-5">
        <IconButton label="Back to accounts" className="-ml-1" onClick={back}>
          <IconChevronLeft />
        </IconButton>
        <EmptyState
          icon={<IconNotFound />}
          title="Account not found"
          body="It may have been deleted."
          action={
            <Button variant="tint" size="sm" className="px-4" onClick={back}>
              Back to accounts
            </Button>
          }
        />
      </div>
    )
  }

  const brand     = accountBrand(account)
  const limit     = account.creditLimit ?? 0
  const usedPct   = isCredit && limit > 0 ? Math.min((totalUsed / limit) * 100, 100) : 0
  const children  = (accounts ?? []).filter(a => a.parentName === account.name)
  const isParent  = children.length > 0
  const isChild   = !!account.parentName
  const trendColor = isCredit ? '#ef4444' : brand.from

  // An account named after its own type - "Cash" - would otherwise label
  // itself twice on the card face. Declared after isChild, which it reads.
  const typeLabel = TYPE_LABEL[account.type]
  const cardSubtitle = isChild
    ? `Part of ${account.parentName}`
    : (typeLabel && typeLabel.toLowerCase() !== (account.name ?? '').trim().toLowerCase() ? typeLabel : null)

  return (
    <div className="pb-10">
      {/* ── Header: back, centred title, edit ── */}
      <header className="flex items-center gap-2 px-5 pt-safe-header pb-3">
        <IconButton label="Back to accounts" onClick={back}>
          <IconChevronLeft />
        </IconButton>

        <h1 className="flex-1 text-center text-base font-semibold text-slate-800 dark:text-white truncate px-1">
          {account.name}
        </h1>

        <div className="flex items-center gap-1.5 shrink-0">
          {account.qrImage && (
            <IconButton label="Show payment QR" onClick={() => setQrVisible(true)}>
              <IconQr />
            </IconButton>
          )}
          {/* A page now, not a sheet - the form outgrew one, and it opens on
              the card rather than on a text field. The sheet below stays
              mounted, because adding a sub-account from here is a short
              create and belongs in one. */}
          <Button
            variant="tint"
            size="xs"
            className="shrink-0 px-4"
            onClick={() => navigate(`/accounts/${account.id}/edit`)}
          >
            Edit
          </Button>
        </div>
      </header>

      {/* ── The one number, leading the page ── */}
      <section className="px-5 mt-1 text-center">
        <SectionLabel>
          {isCredit ? 'Balance used' : 'Current balance'}
        </SectionLabel>
        <p className={`text-[38px] leading-none font-semibold tracking-tight tabular-nums ${
          isCredit ? 'text-red-500 dark:text-red-400' : 'text-slate-900 dark:text-white'
        }`}>
          {fmt(totalUsed)}
        </p>

        {isCredit && limit > 0 && (
          /* The hairline this replaces was amber up to 80% and red past it,
             so a card with a tenth of its line gone was already warning
             about something. Tones come from limitTone now, which is
             WebBar's scale - accent under 70, amber to 90, red past it - so
             this and the budget meters agree about what 95% looks like.

             The sentence went with it. "₱2,500.00 available of ₱10,000.00
             limit (75% used)" said the percentage the bar had just drawn and
             the limit the track's own length already stands for; what was
             worth keeping is how much is left, which is now the label. */
          <div className="mt-5 max-w-[320px] mx-auto text-left">
            <LimitMeter
              pct={usedPct}
              label={`${fmt(Math.max(0, limit - totalUsed))} left`}
              used={fmt(totalUsed)}
              total={fmt(limit)}
            />
          </div>
        )}
      </section>

      {/* ── Late, and what that is about to cost ── */}
      {isCredit && lateInfo?.isLate && (
        <section className="px-5 mt-5">
          <Card padding="md" className="border border-red-200 dark:border-red-500/30">
            {/* Three lines became one and a button. The first draft explained
                the estimate in a paragraph, and a paragraph about a caveat is
                longer than the fact it qualifies - "Estimated" on the button
                says the same thing in one word. */}
            <p className="text-[13px] font-semibold text-red-500 dark:text-red-400">
              {lateInfo.daysLate} day{lateInfo.daysLate === 1 ? '' : 's'} overdue
              {' · '}{fmt(creditData.stmtOutstanding)} unpaid
            </p>
            {lateInfo.alreadyLogged ? (
              <p className="mt-1.5 text-[12.5px] text-slate-500 dark:text-slate-400">
                Finance charge logged. Edit it in the list below if your statement differs.
              </p>
            ) : lateInfo.canEstimate ? (
              <>
                <p className="mt-1.5 text-[12.5px] text-slate-600 dark:text-slate-300 tabular-nums">
                  {fmt(lateInfo.interest)} interest + {fmt(lateInfo.lateFee)} late fee
                </p>
                <Button
                  variant="tint"
                  size="sm"
                  className="mt-3 px-4"
                  onClick={logFinanceCharge}
                  disabled={loggingCharge}
                >
                  {loggingCharge ? 'Logging…' : `Log ${fmt(lateInfo.total)} (estimated)`}
                </Button>
              </>
            ) : (
              <p className="mt-1.5 text-[12.5px] text-slate-500 dark:text-slate-400">
                Add an interest rate to this card to estimate what that costs.
              </p>
            )}
          </Card>
        </section>
      )}

      {/* ── The card, laid back so it costs less height ── */}
      <section className="px-5 card-tilt">
        <div
          className="acct-card mx-auto w-full max-w-[300px] rounded-2xl px-5 pt-4 pb-4
            flex flex-col text-left text-white"
          style={{
            '--card-from': brand.from,
            '--card-to': brand.to,
            aspectRatio: String(CARD_RATIO),
          }}
          data-brand={brand.key}
          data-design={normalizeDesign(account.design)}
        >
          <BrandWatermark brand={brand} />

          <div className="flex items-center gap-2.5">
            <BrandMark mark={brand.mark} size={22} className="shrink-0" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-tight truncate">{account.name}</p>
              {cardSubtitle && (
                <p className="text-[10px] text-white/65 truncate">{cardSubtitle}</p>
              )}
            </div>
          </div>

          {/* The face carries identity only. The balance used to be here too,
              directly above the same figure set three times larger - the card
              is what the account IS, the number below is what it currently
              holds, and printing state on a card face is not what a card does
              anyway. Currency in its place, matching the Accounts list. */}
          <div className="mt-auto flex items-end justify-between gap-3">
            <span className="text-[9px] font-semibold text-white/50">
              {account.currency ?? 'PHP'}
            </span>
            <SchemeMark scheme={account.scheme} className="h-[30px]" />
          </div>
        </div>
      </section>

      {/* ── Balance over time ──────────────────────────────────────────────

          Chips below the chart, not above it: the reading order is "here is
          the shape, and here is the span it covers", and it keeps the tap
          targets away from the thumb's path across the line itself. ── */}
      <section className="mt-7">
        <div className="flex items-baseline justify-between px-5">
          <SectionLabel>{RANGE_TITLE[range.key]}</SectionLabel>
          <TrendDelta data={trend} isCredit={isCredit} />
        </div>
        <BalanceTrend
          data={trend}
          color={trendColor}
          isCredit={isCredit}
          rangeKey={range.key}
          rangeTitle={RANGE_TITLE[range.key]}
        />
        <div className="mt-2.5">
          <TrendRangeChips range={range.key} onRange={setTrendRange} />
        </div>
      </section>

      {/* ── What this balance is earmarked for ──────────────────────────────

          The other half of a goal. On the Goals page you pick the account that
          funds a goal; here you see what the money in front of you is already
          promised to - otherwise the link only points one way and a balance
          that looks spare on this screen is quietly someone's emergency fund.

          Credit accounts are skipped: a card holds debt, and debt cannot fund
          anything. ── */}
      {goalSplit && goalSplit.goals.length > 0 && (
        <section className="mt-7 px-5">
          <div className="flex items-baseline justify-between">
            <SectionLabel>
              Funding {goalSplit.goals.length} goal{goalSplit.goals.length === 1 ? '' : 's'}
            </SectionLabel>
            <Link to="/goals" className="text-[11px] font-medium text-primary active:opacity-70">
              Manage
            </Link>
          </div>
          <Card clip>
            {goalSplit.goals.map((g, i) => (
              <div key={g.goalId}>
                <div className="flex items-baseline justify-between gap-3 px-4 py-3">
                  <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200 truncate min-w-0">
                    {g.name}
                  </span>
                  <span className="text-[13px] font-bold tabular-nums text-slate-800 dark:text-slate-100 shrink-0">
                    {fmt(g.amount)}
                  </span>
                </div>
                {i < goalSplit.goals.length - 1 && <Divider inset="row" />}
              </div>
            ))}
            <Divider />
            <div className="flex items-baseline justify-between gap-3 px-4 py-3
              bg-slate-50/60 dark:bg-white/[0.02]">
              <span className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                Unassigned
              </span>
              <span className="text-[13px] font-bold tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                {fmt(goalSplit.unassigned)}
              </span>
            </div>
          </Card>
        </section>
      )}

      {/* ── Everything below is the detail, unchanged from the sheet ── */}
      <div className="px-5 pt-7">
        {isCredit && creditData ? (
          <>
            {creditData.stmtPaid ? (
              <div className="mb-3 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/[0.08] border border-emerald-100 dark:border-emerald-500/20 flex items-center gap-2">
                <span className="text-emerald-500 dark:text-emerald-400"><IconTick size={16} /></span>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Statement balance paid
                </p>
              </div>
            ) : creditData.dueSoon && creditData.nextDue && creditData.stmtOutstanding > 0 ? (
              <div className="mb-3 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/[0.08] border border-amber-100 dark:border-amber-500/20 flex items-center gap-2">
                <span className="text-amber-500 dark:text-amber-400"><IconWarning size={16} /></span>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Payment due {creditData.nextDue}
                  {creditData.minimumDue > 0 && ` — pay at least ${fmt(creditData.minimumDue)}`}
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2 mb-5">
              {/* Red says "you owe this", green says "you settled it". A cycle
                  that billed nothing is neither, and colouring it either way
                  states something untrue - so it gets the neutral surface and
                  says so in words. */}
              <div className={`col-span-2 px-4 py-3 rounded-2xl flex items-center justify-between ${STMT_TONE[creditData.tone].box}`}>
                <div>
                  <p className={`text-xs font-semibold mb-0.5 ${STMT_TONE[creditData.tone].label}`}>
                    Statement balance
                  </p>
                  <p className={`text-xl font-bold tabular-nums ${STMT_TONE[creditData.tone].value}`}>
                    {fmt(creditData.thisTotal)}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${STMT_TONE[creditData.tone].note}`}>
                    {creditData.tone === 'none'  ? 'Nothing billed this cycle'
                      : creditData.tone === 'paid' ? 'Paid ✓'
                      : creditData.nextDue ? `Due ${creditData.nextDue}` : 'Unpaid'}
                  </p>
                </div>
                {creditData.nextTotal > 0 && (
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-0.5">Next statement</p>
                    {/* What the next bill will actually ask for. The wider
                        nextTotal includes plan months billed later, and it
                        still drives Available credit below. */}
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300 tabular-nums">{fmt(creditData.nextStatementTotal)}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Closes {fmtCycleDate(creditData.nextEnd)}
                    </p>
                    {creditData.laterTotal > 0 && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        +{fmt(creditData.laterTotal)} on later bills
                      </p>
                    )}
                  </div>
                )}
              </div>
              <StatCard label="Available credit" value={fmt(creditData.availableCredit)} />
              {/* An em dash rather than a zero: nothing is being asked for,
                  which is not the same as being asked for nothing. */}
              <StatCard label="Minimum due" value={creditData.minimumDue > 0 ? fmt(creditData.minimumDue) : '—'} />
            </div>

            <CreditTxSection
              onSelect={setSelectedTx}
              catMap={catMap}
              title="This statement"
              dateRange={`${fmtCycleDate(creditData.cycleStart)} – ${fmtCycleDate(creditData.cycleEnd)}`}
              txs={creditData.thisCharges}
              total={creditData.thisTotal}
              accountName={account.name}
              emptyLabel="No charges this statement"
              totalColor="text-red-500 dark:text-red-400"
            />

            {creditData.nextStatementCharges.length > 0 && (
              <CreditTxSection
                onSelect={setSelectedTx}
              catMap={catMap}
                title="Next statement"
                dateRange={`${fmtCycleDate(creditData.nextStart)} – ${fmtCycleDate(creditData.nextCycleEnd)}`}
                txs={creditData.nextStatementCharges}
                total={creditData.nextStatementTotal}
                accountName={account.name}
                totalColor="text-slate-600 dark:text-slate-300"
              />
            )}

            {/* Installment plans write every month up front, so these are
                already against the limit while being nowhere near due. */}
            {creditData.laterCharges.length > 0 && (
              <CreditTxSection
                onSelect={setSelectedTx}
              catMap={catMap}
                title="Scheduled later"
                dateRange={`After ${fmtCycleDate(creditData.nextCycleEnd)}`}
                txs={creditData.laterCharges}
                total={creditData.laterTotal}
                accountName={account.name}
                totalColor="text-slate-500 dark:text-slate-400"
              />
            )}

            {creditData.payments.length > 0 && (
              <CreditTxSection
                onSelect={setSelectedTx}
              catMap={catMap}
                title="Payments"
                txs={creditData.payments}
                total={creditData.payments.reduce((s, tx) => s + (tx.amount ?? 0), 0)}
                accountName={account.name}
                totalColor="text-emerald-600 dark:text-emerald-400"
                totalSign="−"
              />
            )}
          </>
        ) : isParent ? (
          <>
            <SectionLabel gap="loose">
              Sub-accounts · {children.length}
            </SectionLabel>
            <Card clip className="mb-3">
              {children.map((child, i) => (
                <div key={child.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/accounts/${child.id}`)}
                    className="w-full text-left flex items-center gap-3 px-4 py-3.5
                      active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
                  >
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                      style={{ background: `linear-gradient(135deg, ${accountBrand(child).from}, ${accountBrand(child).to})` }}
                    >
                      <BrandMark mark={accountBrand(child).mark} size={16} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">{child.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{TYPE_LABEL[child.type]}</p>
                    </div>
                    <p className="text-[13px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                      {fmt(child.balance ?? 0)}
                    </p>
                    <span className="text-slate-300 dark:text-slate-600 shrink-0">
                      <IconChevronRight />
                    </span>
                  </button>
                  {i < children.length - 1 && <Divider inset="row" />}
                </div>
              ))}
            </Card>
            <Button
              variant="tint"
              size="sm"
              block
              className="mb-5"
              onClick={() => { setFormPrefill({ parentName: account.name }); setFormOpen(true) }}
            >
              + Add sub-account
            </Button>

            {acctTxs.length > 0 && (
              <>
                <SectionLabel gap="loose">
                  Direct transactions · {acctTxs.length}
                </SectionLabel>
                <TxList txs={txsWithRunning} accountName={account.name} onSelect={setSelectedTx} catMap={catMap} />
              </>
            )}
          </>
        ) : (
          <>
            <SectionLabel gap="loose">
              Transactions · {acctTxs.length}
            </SectionLabel>
            {acctTxs.length === 0 ? (
              <EmptyState
                icon={<IconEmptyLedger />}
                title="No transactions yet"
                body="Anything you spend or receive here will show up"
              />
            ) : (
              <TxList txs={txsWithRunning} accountName={account.name} onSelect={setSelectedTx} catMap={catMap} />
            )}
          </>
        )}
      </div>

      <AccountFormSheet
        open={formOpen}
        onClose={() => { setFormOpen(false); setFormPrefill(null) }}
        account={formPrefill ? null : account}
        prefill={formPrefill}
      />

      <QrViewerModal
        open={qrVisible}
        onClose={() => setQrVisible(false)}
        qrImage={account.qrImage}
        accountName={account.name}
      />

      <TxDetailSheet
        open={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
        accounts={accounts ?? []}
        categories={categories ?? []}
      />
    </div>
  )
}

