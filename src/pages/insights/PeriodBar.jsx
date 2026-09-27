import { monthKeyOf, addMonths, parseMonth } from '../../lib/recap'
import { EASE_OUT } from '../../components/ui/motion'
import { MONTHS_SHORT, RANGES, monthOfPeriod, usePeriod } from './period'

/**
 * The period controls, on the overview and on every page it opens: the
 * range chips, and for 1M the month with its arrows. Both write to the one
 * store in period.js, so whichever page moves them, the others follow.
 *
 * The pill slides on the app's ease-out, not the overshooting curve it had:
 * nothing in Spendr bounces.
 */

/** @param {{range: string, onRange: (range: string) => void}} props */
export function RangeChips({ range, onRange }) {
  const activeIdx = RANGES.findIndex(r => r.key === range)
  return (
    <div className="relative flex items-center" role="group" aria-label="Period">
      <div
        className="absolute top-0 bottom-0 rounded-xl border bg-primary/[0.10] dark:bg-primary/[0.12] border-primary/30 dark:border-primary/[0.25] pointer-events-none"
        style={{
          width: `${100 / RANGES.length}%`,
          transform: `translateX(${activeIdx * 100}%)`,
          transition: `transform 0.3s ${EASE_OUT}`,
        }}
      />
      {RANGES.map(r => (
        <button
          key={r.key}
          type="button"
          onClick={() => onRange(r.key)}
          aria-pressed={range === r.key}
          className={`relative z-10 w-9 py-1 text-10 font-bold text-center transition-colors duration-200 ${
            range === r.key ? 'text-primary' : 'text-slate-400 dark:text-slate-500'
          }`}
        >{r.label}</button>
      ))}
    </div>
  )
}

const Chevron = ({ d }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points={d} />
  </svg>
)

/** @param {{month: string, onMonth: (month: string|null) => void, className?: string}} props  month: "2026-08" */
export function MonthNav({ month, onMonth, className = '' }) {
  const current = monthKeyOf(new Date())
  const isCurrent = month >= current
  const { year, month: m } = parseMonth(month)
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      <button type="button" onClick={() => onMonth(addMonths(month, -1))} aria-label="Previous month"
        className="p-1 text-slate-400 dark:text-slate-500 active:text-slate-700 dark:active:text-slate-200">
        <Chevron d="15 18 9 12 15 6" />
      </button>
      <button type="button" onClick={() => !isCurrent && onMonth(null)} className="press press-fade flex items-center gap-1.5"
        aria-label={isCurrent ? `${MONTHS_SHORT[m]} ${year}` : `${MONTHS_SHORT[m]} ${year}, back to this month`}>
        <span className="text-13 font-semibold text-slate-600 dark:text-slate-300">{MONTHS_SHORT[m]} {year}</span>
        {!isCurrent && (
          <span className="text-10 font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Now</span>
        )}
      </button>
      <button type="button" onClick={() => onMonth(addMonths(month, 1))} disabled={isCurrent} aria-label="Next month"
        className="p-1 text-slate-400 dark:text-slate-500 active:text-slate-700 dark:active:text-slate-200 disabled:opacity-25">
        <Chevron d="9 18 15 12 9 6" />
      </button>
    </div>
  )
}

/**
 * The same two controls for a page opened from the overview: the chips
 * centred under its title, and the month under them.
 *
 * @param {{className?: string}} props
 */
export function PeriodControls({ className = '' }) {
  const { period, setRange, setMonth } = usePeriod()
  return (
    <div className={`px-5 flex flex-col items-center gap-3 ${className}`}>
      <RangeChips range={period.range} onRange={setRange} />
      {period.range === '1m' && <MonthNav month={monthOfPeriod(period)} onMonth={setMonth} />}
    </div>
  )
}
