import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { getCreditStatus, getNextCycleRange } from '../utils/creditCycle'
import { accountBrand } from '../lib/accountBrands'
import BrandMark from '../components/BrandMark'
import BrandWatermark from '../components/BrandWatermark'
import SchemeMark from '../components/SchemeMark'
import TxDetailSheet from '../components/TxDetailSheet'
import { IconChevronRight } from '../components/icons'
import {
  AccountFormSheet, QrViewerModal, StatCard, CreditTxSection, DetailTxRow,
  TYPE_LABEL, fmt, fmtCompact, fmtCycleDate, nextOccurrence, nextOccurrenceDate,
} from './Accounts'

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

// ── 30-day trend ───────────────────────────────────────────────────────────────

/**
 * How one transaction moves the number this page displays.
 *
 * For a credit card the displayed number is what you OWE, so the signs invert
 * against a deposit account: a charge raises it, a payment lowers it. Getting
 * this backwards would draw a chart that trends the wrong way, which is worse
 * than no chart, so the two cases are written out rather than negated.
 */
function forwardDelta(tx, name, isCredit) {
  const amt = tx.amount ?? 0
  if (isCredit) {
    if (tx.type === 'expense'  && tx.account === name)     return  amt  // charge
    if (tx.type === 'inflow'   && tx.account === name)     return -amt  // refund
    if (tx.type === 'transfer' && tx.toAccount === name)   return -amt  // payment
    if (tx.type === 'transfer' && tx.fromAccount === name) return  amt  // cash advance
    return 0
  }
  if (tx.type === 'expense'  && tx.account === name)     return -amt
  if (tx.type === 'inflow'   && tx.account === name)     return  amt
  if (tx.type === 'transfer' && tx.fromAccount === name) return -amt
  if (tx.type === 'transfer' && tx.toAccount === name)   return  amt
  return 0
}

const DAY_MS = 864e5

/**
 * Daily closing figures for the last `days` days, ending today.
 *
 * Built by walking BACKWARDS from the figure the page already shows, undoing
 * one day of activity at a time. Anchoring to the displayed number rather than
 * recomputing from some historic zero means the right-hand end of the line
 * always agrees with the big number above it - a chart that disagrees with the
 * balance beside it destroys trust in both.
 *
 * Future-dated rows are excluded, so an installment plan booked months ahead
 * does not draw a cliff at today's edge.
 */
function buildTrend(txs, name, isCredit, current, days = 30) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = today.getTime() - (days - 1) * DAY_MS

  // Net movement per day, for the window and for everything after it.
  const perDay = new Map()
  let afterWindow = 0
  for (const tx of txs) {
    const d = new Date(tx.date ?? 0)
    if (Number.isNaN(d.getTime())) continue
    d.setHours(0, 0, 0, 0)
    const t = d.getTime()
    const delta = forwardDelta(tx, name, isCredit)
    if (!delta) continue
    if (t > today.getTime())     { afterWindow += delta; continue }
    if (t < start)               continue
    perDay.set(t, (perDay.get(t) ?? 0) + delta)
  }

  // `current` is the live figure, which already reflects any future-dated
  // rows; take those back off so today's point is today's actual position.
  let running = current - afterWindow

  const out = []
  for (let i = 0; i < days; i++) {
    const t = today.getTime() - i * DAY_MS
    out.push({ t, value: running })
    running -= perDay.get(t) ?? 0   // step back over that day's activity
  }
  out.reverse()

  const label = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })
  return out.map(p => ({ ...p, day: label.format(new Date(p.t)) }))
}

function BalanceTrend({ data, color, isCredit }) {
  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const flat = max - min < 0.005

  if (flat) {
    return (
      <div className="px-5">
        <div className="py-10 text-center rounded-2xl bg-slate-50 dark:bg-white/[0.03]">
          <p className="text-sm text-slate-500 dark:text-slate-400">No movement in 30 days</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {isCredit ? 'No charges or payments' : 'Nothing in or out of this account'}
          </p>
        </div>
      </div>
    )
  }

  // Sparse ticks: 30 dates will not fit, and a crowded axis is worse than a
  // bare one. Always keep the last, so "today" is labelled.
  const every = Math.ceil(data.length / 5)
  const xTick = ({ x, y, payload }) => {
    if (payload.index % every !== 0 && payload.index !== data.length - 1) return null
    return <text x={x} y={y + 12} textAnchor="middle" fontSize={10} fill="#94a3b8">{payload.value}</text>
  }
  const yTickFmt = v => {
    const a = Math.abs(v)
    if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (a >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
    return String(Math.round(v))
  }

  return (
    <div className="[&_*]:outline-none [&_*]:focus:outline-none px-5">
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={data} margin={{ top: 10, right: 6, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 3" vertical={false} stroke="rgba(148,163,184,0.12)" />
          <XAxis dataKey="day" tick={xTick} axisLine={false} tickLine={false} interval={0} />
          <YAxis
            tickFormatter={yTickFmt}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={44}
            // A balance chart is about the shape of the change, and a forced
            // zero baseline flattens a month of movement on a large balance
            // into a straight line.
            domain={['auto', 'auto']}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div className="bg-white dark:bg-[#1a2130] border border-slate-200 dark:border-white/10 rounded-2xl px-3 py-2 shadow-lg text-xs">
                  <p className="font-semibold mb-0.5" style={{ color }}>{label}</p>
                  <p className="font-medium text-slate-700 dark:text-white tabular-nums">
                    {fmt(payload[0].value)}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {isCredit ? 'Outstanding' : 'Balance'}
                  </p>
                </div>
              )
            }}
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 2' }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: color, stroke: 'white', strokeWidth: 2 }}
            animationDuration={800}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function IconQr() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none" />
      <path d="M14 14h3v3" />
      <path d="M14 20h7" />
      <path d="M21 14v7" />
    </svg>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AccountDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const accounts     = useLiveQuery(() => db.accounts.toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const categories   = useLiveQuery(() => db.categories.toArray(), [])

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
  const hadAccount = useRef(false)
  if (account) hadAccount.current = true
  useEffect(() => {
    if (accounts && !account && hadAccount.current) navigate('/accounts', { replace: true })
  }, [accounts, account, navigate])

  const acctTxs = useMemo(() => {
    if (!account) return []
    return (transactions ?? [])
      .filter(tx =>
        tx.account === account.name ||
        tx.fromAccount === account.name ||
        tx.toAccount === account.name
      )
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }, [transactions, account?.name])

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

  const creditData = useMemo(() => {
    if (!account || account.type !== 'credit') return null
    const status = getCreditStatus(account, txsWithRunning)
    const { cycleStart: nextStart, cycleEnd: nextEnd } = getNextCycleRange(account.cutoffDate)
    const dueDate = nextOccurrenceDate(account.dueDate)
    return {
      ...status,
      nextStart, nextEnd,
      minimumDue: account.minimumPayment ?? 0,
      nextDue:    nextOccurrence(account.dueDate),
      dueSoon:    dueDate && ((dueDate - new Date()) / DAY_MS) <= 7,
    }
  }, [account, txsWithRunning])

  const isCredit  = account?.type === 'credit'
  const totalUsed = isCredit ? (creditData?.currentBalance ?? 0) : (account?.balance ?? 0)

  const trend = useMemo(() => {
    if (!account) return []
    return buildTrend(acctTxs, account.name, isCredit, totalUsed)
  }, [acctTxs, account?.name, isCredit, totalUsed])

  // Still loading, or gone. Deleting from the edit sheet lands here, and so
  // does a stale link, so this has to be a real state rather than a crash.
  if (!accounts) {
    return <div className="pt-safe-header px-5" />
  }
  if (!account) {
    return (
      <div className="pt-safe-header px-5">
        <button
          onClick={back}
          className="w-9 h-9 -ml-1 rounded-2xl flex items-center justify-center
            bg-white dark:bg-white/[0.07] border border-slate-200/80 dark:border-white/[0.09]
            text-slate-600 dark:text-slate-300 shadow-sm
            active:scale-90 transition-transform duration-75"
          aria-label="Back to accounts"
        >
          <IconChevronLeft />
        </button>
        <div className="py-20 text-center">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Account not found</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            It may have been deleted.
          </p>
          <button
            onClick={back}
            className="mt-5 px-4 py-2 rounded-xl text-sm font-semibold text-primary
              bg-primary/[0.08] dark:bg-primary/[0.12] active:bg-primary/[0.15] transition-colors"
          >
            Back to Accounts
          </button>
        </div>
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
      <header className="flex items-center gap-2 px-4 pt-safe-header pb-3">
        <button
          onClick={back}
          className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0
            bg-white dark:bg-white/[0.07] border border-slate-200/80 dark:border-white/[0.09]
            text-slate-600 dark:text-slate-300 shadow-sm
            active:scale-90 transition-transform duration-75"
          aria-label="Back to accounts"
        >
          <IconChevronLeft />
        </button>

        <h1 className="flex-1 text-center text-base font-semibold text-slate-800 dark:text-white truncate px-1">
          {account.name}
        </h1>

        <div className="flex items-center gap-1.5 shrink-0">
          {account.qrImage && (
            <button
              onClick={() => setQrVisible(true)}
              className="w-9 h-9 rounded-2xl flex items-center justify-center
                text-emerald-500 dark:text-emerald-400 active:opacity-60 transition-opacity"
              aria-label="Show payment QR"
            >
              <IconQr />
            </button>
          )}
          <button
            onClick={() => { setFormPrefill(null); setFormOpen(true) }}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold
              text-primary bg-primary/[0.08] dark:bg-primary/[0.15]
              active:bg-primary/[0.15] transition-colors"
          >
            Edit
          </button>
        </div>
      </header>

      {/* ── The card itself, at a size worth looking at ── */}
      <section className="px-5 mt-1">
        <div
          className="acct-card mx-auto w-full max-w-[320px] rounded-2xl px-5 pt-4 pb-4
            flex flex-col text-left text-white"
          style={{
            background: `linear-gradient(135deg, ${brand.from} 0%, ${brand.to} 100%)`,
            aspectRatio: String(CARD_RATIO),
          }}
          data-brand={brand.key}
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
            <span className="text-[9px] font-semibold uppercase tracking-wider text-white/50">
              {account.currency ?? 'PHP'}
            </span>
            <SchemeMark scheme={account.scheme} className="h-[24px]" />
          </div>
        </div>
      </section>

      {/* ── The one number, set large and centred ── */}
      <section className="px-5 mt-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {isCredit ? 'Balance Used' : 'Current Balance'}
        </p>
        <p className={`mt-1.5 text-[38px] leading-none font-semibold tracking-tight tabular-nums ${
          isCredit ? 'text-red-500 dark:text-red-400' : 'text-slate-900 dark:text-white'
        }`}>
          {fmt(totalUsed)}
        </p>

        {isCredit && limit > 0 && (
          <div className="mt-4 max-w-[320px] mx-auto">
            <div className="h-1.5 rounded-full bg-red-100 dark:bg-red-500/20 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${usedPct}%`,
                  backgroundColor: usedPct > 80 ? '#ef4444' : '#f59e0b',
                }}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {fmt(limit - totalUsed)} available of {fmt(limit)} limit ({usedPct.toFixed(0)}% used)
            </p>
          </div>
        )}
      </section>

      {/* ── 30-day trend ── */}
      <section className="mt-7">
        <div className="flex items-baseline justify-between px-5 mb-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Last 30 days
          </h2>
          <TrendDelta data={trend} isCredit={isCredit} />
        </div>
        <BalanceTrend data={trend} color={trendColor} isCredit={isCredit} />
      </section>

      {/* ── Everything below is the detail, unchanged from the sheet ── */}
      <div className="px-5 pt-7">
        {isCredit && creditData ? (
          <>
            {creditData.stmtPaid ? (
              <div className="mb-3 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/[0.08] border border-emerald-100 dark:border-emerald-500/20 flex items-center gap-2">
                <span className="text-base">✅</span>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Statement balance paid
                </p>
              </div>
            ) : creditData.dueSoon && creditData.nextDue ? (
              <div className="mb-3 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/[0.08] border border-amber-100 dark:border-amber-500/20 flex items-center gap-2">
                <span className="text-base">⚠️</span>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Payment due {creditData.nextDue}
                  {creditData.minimumDue > 0 && ` — pay at least ${fmt(creditData.minimumDue)}`}
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2 mb-5">
              <div className={`col-span-2 px-4 py-3 rounded-2xl flex items-center justify-between ${
                creditData.stmtPaid
                  ? 'bg-emerald-50 dark:bg-emerald-500/[0.08] border border-emerald-100 dark:border-emerald-500/20'
                  : 'bg-red-50 dark:bg-red-500/[0.08] border border-red-100 dark:border-red-500/20'
              }`}>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${
                    creditData.stmtPaid ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-400 dark:text-red-500'
                  }`}>Statement Balance</p>
                  <p className={`text-xl font-bold tabular-nums ${
                    creditData.stmtPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                  }`}>{fmt(creditData.thisTotal)}</p>
                  {creditData.stmtPaid ? (
                    <p className="text-[10px] text-emerald-500 dark:text-emerald-400 mt-0.5">Paid ✓</p>
                  ) : creditData.nextDue ? (
                    <p className="text-[10px] text-red-400 dark:text-red-500 mt-0.5">Due {creditData.nextDue}</p>
                  ) : null}
                </div>
                {creditData.nextTotal > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">Next Statement</p>
                    {/* What the next bill will actually ask for. The wider
                        nextTotal includes plan months billed later, and it
                        still drives Available Credit below. */}
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
              <StatCard label="Available Credit" value={fmt(creditData.availableCredit)} />
              <StatCard label="Minimum Due" value={fmt(creditData.minimumDue)} />
            </div>

            <CreditTxSection
              onSelect={setSelectedTx}
              title="This Statement"
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
                title="Next Statement"
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
                title="Scheduled Later"
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
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2.5">
              Sub-accounts · {children.length}
            </p>
            <div
              className="rounded-2xl overflow-hidden mb-3
                bg-white border border-slate-100
                dark:bg-white/[0.04] dark:border-white/[0.07]
                shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none"
            >
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
                  {i < children.length - 1 && (
                    <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => { setFormPrefill({ parentName: account.name }); setFormOpen(true) }}
              className="w-full py-3 rounded-2xl text-sm font-semibold text-primary
                bg-primary/[0.08] dark:bg-primary/[0.12]
                active:bg-primary/[0.15] transition-colors mb-5"
            >
              + Add Sub-account
            </button>

            {acctTxs.length > 0 && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2.5">
                  Direct Transactions · {acctTxs.length}
                </p>
                <TxList txs={txsWithRunning} accountName={account.name} onSelect={setSelectedTx} />
              </>
            )}
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2.5">
              Transactions · {acctTxs.length}
            </p>
            {acctTxs.length === 0 ? (
              <div className="py-12 text-center rounded-2xl bg-slate-50 dark:bg-white/[0.03]">
                <p className="text-sm text-slate-500 dark:text-slate-400">No transactions yet</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Transactions using this account will appear here
                </p>
              </div>
            ) : (
              <TxList txs={txsWithRunning} accountName={account.name} onSelect={setSelectedTx} />
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

// ── Bits ───────────────────────────────────────────────────────────────────────

function TxList({ txs, accountName, onSelect }) {
  return (
    <div
      className="rounded-2xl overflow-hidden mb-4
        bg-white border border-slate-100
        dark:bg-white/[0.04] dark:border-white/[0.07]
        shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none"
    >
      {txs.map((tx, i) => (
        <div key={tx.id ?? i}>
          <DetailTxRow tx={tx} accountName={accountName} onSelect={onSelect} />
          {i < txs.length - 1 && (
            <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Net change across the window, which is the question the chart's shape
 * prompts. For a credit card a rise is money owed, so the colours invert.
 */
function TrendDelta({ data, isCredit }) {
  if (data.length < 2) return null
  const delta = data[data.length - 1].value - data[0].value
  if (Math.abs(delta) < 0.005) {
    return <span className="text-[11px] text-slate-400 dark:text-slate-500">no change</span>
  }
  const bad  = isCredit ? delta > 0 : delta < 0
  const tone = bad
    ? 'text-red-500 dark:text-red-400'
    : 'text-emerald-600 dark:text-emerald-400'
  return (
    <span className={`text-[11px] font-semibold tabular-nums ${tone}`}>
      {delta > 0 ? '+' : '−'}{fmtCompact(Math.abs(delta))}
    </span>
  )
}
