/**
 * The segmented budget meter.
 *
 * Discrete pills rather than a continuous bar, and that is the whole point: a
 * continuous fill reads as "some progress", while a row of pills of which you
 * can see fourteen lit reads as a quantity you can estimate without reading
 * the number. It also degrades honestly at both ends - 3% of a budget lights
 * one pill instead of drawing a sliver nobody can see, and going over does
 * not silently cap at a full-looking bar.
 *
 * `pct` may exceed 100. Every pill lights at that point and the tone turns,
 * because a meter that just looks "full" cannot tell you the difference
 * between spending your last peso and spending twice your limit.
 */

/** Green under three quarters, amber approaching the limit, red past it. */
export function budgetTone(pct) {
  if (pct > 100) return { key: 'over', color: '#ef4444' }
  if (pct >= 75) return { key: 'warn', color: '#f59e0b' }
  return { key: 'ok', color: '#22c55e' }
}

export default function BudgetMeter({
  pct = 0,
  segments = 26,
  height = 28,
  className = '',
  'aria-hidden': ariaHidden = true,
}) {
  const clamped = Math.max(0, Math.min(pct, 100))
  // Round rather than floor, so a hair under a segment boundary does not
  // read as a whole segment less - but never light zero pills for spending
  // that actually happened, or the meter denies something the number above
  // it is reporting.
  const lit = clamped > 0 ? Math.max(1, Math.round((clamped / 100) * segments)) : 0
  const { color } = budgetTone(pct)

  return (
    <div
      className={`flex items-stretch gap-[5px] ${className}`}
      style={{ height }}
      aria-hidden={ariaHidden}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={`flex-1 rounded-full transition-colors duration-500 ${
            i < lit ? '' : 'bg-slate-200 dark:bg-white/[0.13]'
          }`}
          style={i < lit ? { backgroundColor: color } : undefined}
        />
      ))}
    </div>
  )
}
