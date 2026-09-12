import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { fmt } from '../../lib/money'

// ── 30-day trend ───────────────────────────────────────────────────────────────

/**
 * How one transaction moves the number this page displays.
 *
 * For a credit card the displayed number is what you OWE, so the signs invert
 * against a deposit account: a charge raises it, a payment lowers it. Getting
 * this backwards would draw a chart that trends the wrong way, which is worse
 * than no chart, so the two cases are written out rather than negated.
 */
export function forwardDelta(tx, name, isCredit) {
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

export const DAY_MS = 864e5
export const HOUR_MS = 36e5

/**
 * How the statement-balance card is coloured, by what the statement is.
 *
 * Three states rather than two. Red carries a claim - you owe this - and so
 * does green: you were billed and you settled it. A cycle that billed nothing
 * supports neither, and it used to get green plus a tick regardless, because
 * "payments >= charges" is also true of zero against zero.
 */
export const STMT_TONE = {
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
export const TREND_RANGES = [
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

export const RANGE_TITLE = {
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
export function trendLabeller(span) {
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
export function buildTrend(txs, name, isCredit, current, range, now = Date.now()) {
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
export function TrendRangeChips({ range, onRange }) {
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

export function BalanceTrend({ data, color, isCredit, rangeKey, rangeTitle }) {
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
export function IconFlatChart() {
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

export function IconEmptyLedger() {
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

export function IconChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export function IconQr() {
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
