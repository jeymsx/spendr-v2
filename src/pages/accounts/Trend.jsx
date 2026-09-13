import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { fmt } from '../../lib/money'
import { TREND_RANGES, RANGE_TITLE } from '../../lib/trend'

/* The arithmetic moved to lib/trend.js when the category page needed
   `buildSpendTrend` beside `buildTrend`. Re-exported, not redefined, so every
   `from './accounts/Trend'` import still resolves - see the note there. */
export {
  forwardDelta, DAY_MS, HOUR_MS, TREND_RANGES, RANGE_TITLE,
  trendLabeller, buildTrend, buildSpendTrend, SPEND_TREND_RANGES,
  spendSpan, spendBaseline, BASELINE_MIN_DAYS, BASELINE_MIN_ROWS,
} from '../../lib/trend'

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
 * The Insights page's chip row, at eight options instead of five.
 *
 * `ranges` so a chart can offer fewer: the category page drops the hour and
 * the day, which are a flat zero on any spending history. The pill is sized
 * from the list it is given rather than from the full set, or six chips would
 * be tracked by a pill built for eight.
 */
export function TrendRangeChips({ range, onRange, ranges = TREND_RANGES }) {
  const activeIdx = ranges.findIndex(r => r.key === range)
  return (
    <div className="relative flex items-center justify-center">
      <div className="relative flex items-center">
        {/* sliding frosted glass pill */}
        <div
          className="absolute top-0 bottom-0 rounded-xl border bg-primary/[0.10] dark:bg-primary/[0.12]
            border-primary/30 dark:border-primary/[0.25] pointer-events-none"
          style={{
            width: `${100 / ranges.length}%`,
            transform: `translateX(${activeIdx * 100}%)`,
            transition: 'transform 0.26s cubic-bezier(0.34, 1.4, 0.64, 1)',
          }}
        />
        {ranges.map(r => (
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

/**
 * @param {object} props
 * @param {Array<Record<string, any>>} props.data
 * @param {string} props.color
 * @param {boolean} [props.isCredit]
 * @param {string} props.rangeKey
 * @param {string} props.rangeTitle
 * @param {string} [props.valueLabel]  what the tooltip's figure IS
 * @param {string} [props.emptyTitle]
 * @param {string} [props.emptyBody]
 * @param {string|null} [props.baselineKey]   a second, dashed series
 * @param {string} [props.baselineLabel]      its name in the tooltip
 */
export function BalanceTrend({
  data, color, isCredit, rangeKey, rangeTitle,
  /* The three strings that were hardcoded to the account page's question.
     The category page draws the identical chart from a different number, and
     the only thing that differs is what to call it - so they are props with
     the old values as defaults, and AccountDetail passes none of them. */
  valueLabel = isCredit ? 'Outstanding' : 'Balance',
  emptyTitle = null,
  emptyBody = isCredit ? 'No charges or payments' : 'Nothing in or out of this account',
  baselineKey = null,
  baselineLabel = 'Usual',
}) {
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
            {emptyTitle ?? `Flat · ${rangeTitle.toLowerCase()}`}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            {emptyBody}
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
              /* Found by key, not by index. With a baseline there are two
                 series and recharts orders them by declaration, so reading
                 payload[0] would have printed the dashed line's figure as
                 the headline on every category page. */
              const main = payload.find(p => p.dataKey === 'value') ?? payload[0]
              const base = baselineKey
                ? payload.find(p => p.dataKey === baselineKey)
                : null
              return (
                <div className="bg-lifted border border-slate-200 dark:border-white/10 rounded-2xl px-3 py-2 shadow-lg text-xs">
                  <p className="font-semibold mb-0.5" style={{ color }}>{label}</p>
                  <p className="font-medium text-slate-700 dark:text-white tabular-nums">
                    {fmt(main.value)}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {valueLabel}
                  </p>
                  {base && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 tabular-nums">
                      {baselineLabel} {fmt(base.value)}
                    </p>
                  )}
                </div>
              )
            }}
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 2' }}
          />
          {/* Declared FIRST so the real line paints over it where they
              cross - the reference is the thing you read the real line
              against, not a series in its own right. Slate rather than a
              tint of the category's colour, so it cannot be mistaken for
              more of the same data, and unanimated because a reference that
              flies in draws the eye it is supposed to give away. */}
          {baselineKey && (
            <Line
              type="linear"
              dataKey={baselineKey}
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              strokeOpacity={0.75}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          )}
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
