import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
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
import { IconChevronRight, IconTick, IconWarning} from '../components/icons'
import {
  AccountFormSheet, QrViewerModal, StatCard, CreditTxSection, DetailTxRow,
  TYPE_LABEL, fmt, fmtCompact, fmtCycleDate, nextOccurrence, nextOccurrenceDate,
} from './Accounts'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Divider from '../components/ui/Divider'
import EmptyState from '../components/ui/EmptyState'
import IconButton from '../components/ui/IconButton'
import SectionLabel from '../components/ui/SectionLabel'

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
const HOUR_MS = 36e5

/**
 * How the statement-balance card is coloured, by what the statement is.
 *
 * Three states rather than two. Red carries a claim - you owe this - and so
 * does green: you were billed and you settled it. A cycle that billed nothing
 * supports neither, and it used to get green plus a tick regardless, because
 * "payments >= charges" is also true of zero against zero.
 */
const STMT_TONE = {
  none: {
    box:   'bg-slate-50 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/10',
    label: 'text-slate-400 dark:text-slate-500',
    value: 'text-slate-500 dark:text-slate-400',
    note:  'text-slate-400 dark:text-slate-500',
  },
  paid: {
    box:   'bg-emerald-50 dark:bg-emerald-500/[0.08] border border-emerald-100 dark:border-emerald-500/20',
    label: 'text-emerald-500 dark:text-emerald-400',
    value: 'text-emerald-600 dark:text-emerald-400',
    note:  'text-emerald-500 dark:text-emerald-400',
  },
  owing: {
    box:   'bg-red-50 dark:bg-red-500/[0.08] border border-red-100 dark:border-red-500/20',
    label: 'text-red-400 dark:text-red-500',
    value: 'text-red-500 dark:text-red-400',
    note:  'text-red-400 dark:text-red-500',
  },
}

/**
 * The ranges the chart can show.
 *
 * `points` is the number of samples, not a bucket size, so each range gets a
 * resolution that suits its span rather than a fixed one: five-minute steps
 * across an hour, hourly across a day, daily across a month, weekly across a
 * year. A fixed daily bucket would draw 1H as a single point and 1Y as 365
 * of them.
 *
 * Be warned that 1H and 1D will usually be flat lines for a bank account -
 * most people do not transact twice in an hour. They are here because the
 * ranges are a familiar set and a missing one reads as broken, and because
 * they are genuinely useful on the day you are watching a transfer land.
 */
const TREND_RANGES = [
  { key: '1h',  label: '1H',  span: HOUR_MS,          points: 13 },
  { key: '1d',  label: '1D',  span: 24 * HOUR_MS,     points: 25 },
  { key: '7d',  label: '7D',  span: 7 * DAY_MS,       points: 29 },
  { key: '1m',  label: '1M',  span: 30 * DAY_MS,      points: 31 },
  { key: '3m',  label: '3M',  span: 90 * DAY_MS,      points: 46 },
  { key: '6m',  label: '6M',  span: 180 * DAY_MS,     points: 61 },
  { key: '1y',  label: '1Y',  span: 365 * DAY_MS,     points: 53 },
  // Span is worked out from the oldest transaction on the account.
  { key: 'all', label: 'ALL', span: null,             points: 60 },
]

const RANGE_TITLE = {
  '1h': 'Last hour', '1d': 'Last 24 hours', '7d': 'Last 7 days',
  '1m': 'Last 30 days', '3m': 'Last 3 months', '6m': 'Last 6 months',
  '1y': 'Last year', all: 'All time',
}

/**
 * A point's label, at a resolution the span justifies.
 *
 * An hour of five-minute samples all labelled "Sep 10" tells you nothing; a
 * year of weekly ones labelled "3:20 PM" tells you less.
 */
function trendLabeller(span) {
  if (span <= 2 * DAY_MS) {
    return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' })
  }
  if (span <= 400 * DAY_MS) {
    return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })
  }
  return new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric' })
}

/**
 * The balance over time, as `points` samples ending now.
 *
 * Built by walking BACKWARDS from the figure the page already shows, undoing
 * activity as it goes. Anchoring to the displayed number rather than
 * recomputing from some historic zero means the right-hand end of the line
 * always agrees with the big number above it - a chart that disagrees with the
 * balance beside it destroys trust in both.
 *
 * This used to bucket by calendar day, which capped the resolution at one
 * point per day and made 1H impossible. Now it sorts the movements once and
 * sweeps a single pointer back through them, so the sample interval is just
 * span/(points-1) and any range works the same way. A transaction's full
 * timestamp is used rather than its date, which is what makes an hourly
 * line meaningful.
 *
 * Future-dated rows are excluded, so an installment plan booked months ahead
 * does not draw a cliff at today's edge.
 */
function buildTrend(txs, name, isCredit, current, range, now = Date.now()) {
  const moves = []
  let oldest = Infinity
  for (const tx of txs) {
    const t = new Date(tx.date ?? 0).getTime()
    if (Number.isNaN(t)) continue
    const delta = forwardDelta(tx, name, isCredit)
    if (!delta) continue
    moves.push({ t, delta })
    if (t < oldest) oldest = t
  }
  moves.sort((a, b) => b.t - a.t)   // newest first

  // ALL spans back to the oldest movement - plus exactly one sample step, so
  // the first point sits BEFORE that movement rather than on it.
  //
  // Without the padding, "all time" starts at the instant of the first
  // transaction, which means that transaction is already inside the first data
  // point and you never see it arrive. Measured on a real account: ALL read
  // −₱7.2K while 1Y read +₱32.8K on the same history, because 1Y's window
  // began before the ₱40,000 payroll and ALL's began at it. Both figures were
  // arithmetically right and one of them was useless - "all time" hiding the
  // largest event in the account's life.
  //
  // Padding by one step is solved rather than fudged with a 1.02 multiplier:
  // we want span = raw + span/(points-1), so span = raw·(points-1)/(points-2).
  //
  // The floor stops a day-old account rendering "all time" as a few hours.
  const rawSpan = Number.isFinite(oldest) ? now - oldest : 30 * DAY_MS
  const padded = rawSpan * (range.points - 1) / (range.points - 2)
  const span = range.span ?? Math.max(7 * DAY_MS, padded)
  const step = span / (range.points - 1)

  // `current` is the live figure and already includes any future-dated rows,
  // so take those back off before the sweep starts.
  let running = current
  let i = 0
  while (i < moves.length && moves[i].t > now) { running -= moves[i].delta; i++ }

  const out = []
  for (let k = 0; k < range.points; k++) {
    const t = now - k * step
    // Everything more recent than this sample has to come back off.
    while (i < moves.length && moves[i].t > t) { running -= moves[i].delta; i++ }
    out.push({ t, value: running })
  }
  out.reverse()

  const label = trendLabeller(span)
  return out.map(pt => ({ ...pt, day: label.format(new Date(pt.t)) }))
}

/** The Insights page's chip row, at eight options instead of five. */
function TrendRangeChips({ range, onRange }) {
  const activeIdx = TREND_RANGES.findIndex(r => r.key === range)
  return (
    <div className="relative flex items-center justify-center">
      <div className="relative flex items-center">
        {/* sliding frosted glass pill */}
        <div
          className="absolute top-0 bottom-0 rounded-xl border bg-primary/[0.10] dark:bg-primary/[0.12]
            border-primary/30 dark:border-primary/[0.25] pointer-events-none"
          style={{
            width: `${100 / TREND_RANGES.length}%`,
            transform: `translateX(${activeIdx * 100}%)`,
            transition: 'transform 0.26s cubic-bezier(0.34, 1.4, 0.64, 1)',
          }}
        />
        {TREND_RANGES.map(r => (
          <button
            key={r.key}
            onClick={() => onRange(r.key)}
            aria-pressed={range === r.key}
            className={`relative z-10 w-[38px] py-1.5 text-[10px] font-bold text-center
              transition-colors duration-200 ${
                range === r.key ? 'text-primary' : 'text-slate-400 dark:text-slate-500'
              }`}
          >{r.label}</button>
        ))}
      </div>
    </div>
  )
}

function BalanceTrend({ data, color, isCredit, rangeKey, rangeTitle }) {
  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const flat = max - min < 0.005

  if (flat) {
    // No filled panel behind this. A grey card reads as a component that
    // failed to load - a thing gone wrong - when the truth is milder and
    // more specific: the balance genuinely did not move. So the empty state
    // is drawn in the chart's own language, as the line it would have been:
    // a dashed baseline, flat, because flat is the answer.
    //
    // The height matches the real chart's 132px so switching ranges never
    // shifts the page. Same margins too, so the dashed line starts and ends
    // exactly where a real line would.
    return (
      <div className="px-5">
        <div className="h-[132px] flex flex-col items-center justify-center text-center">
          <IconFlatChart />
          <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mt-3">
            Flat · {rangeTitle.toLowerCase()}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            {isCredit ? 'No charges or payments' : 'Nothing in or out of this account'}
          </p>
        </div>
      </div>
    )
  }

  // No axes, no gridlines. This is a shape - "your balance did this over the
  // last month" - and the exact figure behind any point is what the tooltip
  // is for, so the scaffolding was only competing with the line. Both axes
  // are still declared, because removing them would change the plot: the
  // XAxis carries the dataKey the tooltip labels itself with, and the YAxis
  // carries the domain. `hide` renders nothing and reserves no space, which
  // is also what lets the line sit centred in the full width.
  return (
    <div className="[&_*]:outline-none [&_*]:focus:outline-none px-5">
      <ResponsiveContainer width="100%" height={132}>
        <LineChart key={rangeKey} data={data} margin={{ top: 10, right: 6, left: 6, bottom: 10 }}>
          <XAxis dataKey="day" hide />
          <YAxis
            hide
            // A balance chart is about the shape of the change, and a forced
            // zero baseline flattens a month of movement on a large balance
            // into a straight line.
            domain={['auto', 'auto']}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div className="bg-lifted border border-slate-200 dark:border-white/10 rounded-2xl px-3 py-2 shadow-lg text-xs">
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

/**
 * Empty-ledger glyph: a page with two ruled lines and a third left blank.
 *
 * 24x24 grid, 2px stroke on integer coordinates so the edges land on pixel
 * boundaries at 1x, currentColor so it takes the tone of the EmptyState disc
 * it sits in, and aria-hidden because the sentence under it already says
 * this. The missing third line is the whole idea - the rows that would be
 * here. 32px to match the glyph every other empty state puts in that disc.
 */
/**
 * Flat-chart glyph: an axis corner with a dashed, level series.
 *
 * Same family as IconEmptyLedger - 24x24, 2px stroke on integer coordinates
 * so edges land on pixel boundaries at 1x, currentColor, no fill. A rising
 * line would have been the wrong picture: it implies data. Level and dashed
 * is the actual answer.
 */
function IconFlatChart() {
  return (
    <svg
      width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="text-slate-300 dark:text-white/20"
      aria-hidden="true" focusable="false"
    >
      <path d="M4 4v16h16" />
      <path d="M8 13h9" strokeDasharray="3 3" />
    </svg>
  )
}

function IconEmptyLedger() {
  return (
    <svg
      width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
    >
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M8 9h8M8 13h5" />
      <path d="M8 17h3" strokeDasharray="2 2" />
    </svg>
  )
}

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

// ── Bits ───────────────────────────────────────────────────────────────────────

function TxList({ txs, accountName, onSelect, catMap }) {
  return (
    <Card clip className="mb-4">
      {txs.map((tx, i) => (
        <div key={tx.id ?? i}>
          <DetailTxRow tx={tx} accountName={accountName} onSelect={onSelect} catMap={catMap} />
          {i < txs.length - 1 && <Divider inset="row" />}
        </div>
      ))}
    </Card>
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
