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

/**
 * The tone for a given percentage.
 *
 * "On track" takes the app's accent, so a blue theme gets a blue meter. The
 * two warning states do NOT: amber and red are encoding state, not taste,
 * and handing them to a user preference would break the encoding outright -
 * with the Ember or Honey accent, an over-budget month would render the same
 * colour as a healthy one. So the accent replaces the neutral colour only,
 * and going over always looks like going over.
 *
 * `color` is for graphics - a CSS variable works in an inline style, which is
 * where the meter pills and progress bars get it. `svgColor` is the same
 * thing resolved to a hex, because Recharts writes `fill` as an SVG
 * attribute and attributes do not resolve var(). `textClass` exists because
 * the raw accent is not readable as small text: #2D9DFF is 2.85:1 on white,
 * so the class shifts it darker in light mode and lighter in dark, which
 * measures 5.1:1 and 7.1:1.
 */
export function budgetTone(pct, accentHex) {
  if (pct > 100) {
    return { key: 'over', color: '#ef4444', svgColor: '#ef4444', textClass: 'text-red-500 dark:text-red-400' }
  }
  if (pct >= 75) {
    return { key: 'warn', color: '#f59e0b', svgColor: '#f59e0b', textClass: 'text-amber-600 dark:text-amber-400' }
  }
  return {
    key: 'ok',
    color: 'var(--color-primary)',
    svgColor: accentHex || '#2D9DFF',
    textClass: 'budget-tone-ok',
  }
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
