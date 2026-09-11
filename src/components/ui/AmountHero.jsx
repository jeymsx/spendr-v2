/**
 * The figure a sheet is about, with the rule over it.
 *
 * ── The rule ──
 *
 * Decorative, deliberately. It is the one mark on the sheet that says "this
 * is a measured figure" rather than a number that was typed into a box, and
 * it does the job a type chip was doing badly: the centre tick is tall and
 * solid and the rest fall away toward the edges, so the eye is delivered to
 * the middle - which is exactly where the amount sits underneath.
 *
 * Drawn, not imported: 40 lines cost less than any asset, and the ticks
 * either side take currentColor, so one class answers both themes.
 *
 * ── Why it is shared ──
 *
 * The confirm sheet and the detail sheet show the same transaction either
 * side of the moment it is written. The confirm side got the rule and a 40px
 * bold figure; the detail side got a bare semibold one at different tracking.
 * Same number, same sheet width, two treatments - so the same transaction
 * looked like a different kind of object depending on which direction you
 * arrived from.
 */

function AmountRule({ color }) {
  const TICKS = 41
  const W = 232
  const H = 24
  const mid = (TICKS - 1) / 2

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true"
      className="block mx-auto" style={{ maxWidth: W }}>
      {Array.from({ length: TICKS }, (_, i) => {
        const away = Math.abs(i - mid) / mid       // 0 at the centre, 1 at the ends
        const isMid = i === mid
        const h = isMid ? H : 7 + (1 - away) * 5
        // 0.75 in, so the round cap on the outermost tick cannot clip.
        const x = 0.75 + i * ((W - 1.5) / (TICKS - 1))
        return (
          <line key={i}
            x1={x} y1={(H - h) / 2} x2={x} y2={(H + h) / 2}
            stroke={isMid ? color : 'currentColor'}
            strokeWidth={isMid ? 2 : 1.25}
            strokeLinecap="round"
            /* Squared, not linear. A linear fade still left legible ticks
               hard against the ends, which reads as a rule that has been cut
               off rather than one that has faded out. */
            opacity={isMid ? 1 : 0.12 + (1 - away) ** 2 * 0.5}
          />
        )
      })}
    </svg>
  )
}

export default function AmountHero({
  /** Already signed and formatted - the caller owns the currency. */
  children,
  /** The figure's colour, and the centre tick's. */
  color,
  /** A quieter line under the figure: an instalment breakdown, a plan total. */
  sub = null,
  className = '',
}) {
  return (
    <div className={`text-center ${className}`}>
      <div className="text-slate-400 dark:text-slate-600">
        <AmountRule color={color} />
      </div>
      {/* tracking-tight at this size: the default spacing makes a long peso
          amount sprawl past the rule it is supposed to sit under. */}
      <p
        className="text-[40px] font-bold mt-1 tabular-nums leading-none tracking-tight"
        style={{ color }}
      >
        {children}
      </p>
      {sub && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
          {sub}
        </p>
      )}
    </div>
  )
}
