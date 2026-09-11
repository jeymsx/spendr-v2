/**
 * How much of a credit limit is gone, as a track with a handle on it.
 *
 * It was a 6px hairline with a percentage in a sentence underneath. That
 * reads as a progress bar - something filling up on its own - when the thing
 * it describes is a position you chose and can move. A thicker track with a
 * handle at the boundary and the remaining run struck through says the
 * opposite: here is where you are, and here is how far there is left.
 *
 * ── The hatching ──
 *
 * The unspent run is striped rather than plain, which is what separates
 * "available" from "empty track". A plain grey remainder reads as the bar's
 * background; a hatched one reads as headroom that exists. It is a
 * repeating-linear-gradient, so there is no asset and it scales with the
 * element - and it is masked to the unfilled portion only, so the stripes
 * never run under the fill where they would muddy it.
 *
 * ── The colour ──
 *
 * Not one colour. The reference this copies is a spending limit, where blue
 * is fine; this is debt, and 90% of a credit line gone is not the same news
 * as 10%. The thresholds and the four tones are WebBar's, already used for
 * the budget meters, so a card at 95% and a food budget at 95% look alike.
 */

const TONES = {
  accent: { fill: 'var(--color-primary)', stripe: 'rgba(var(--color-primary-rgb), 0.5)' },
  warn:   { fill: '#f59e0b',              stripe: 'rgba(245, 158, 11, 0.55)' },
  bad:    { fill: '#ef4444',              stripe: 'rgba(239, 68, 68, 0.55)' },
}

export function limitTone(pct) {
  if (pct >= 90) return 'bad'
  if (pct >= 70) return 'warn'
  return 'accent'
}

export default function LimitMeter({
  pct,
  label,
  used,
  total,
  tone = limitTone(pct),
  className = '',
}) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0))
  const t = TONES[tone] ?? TONES.accent

  /* The handle is 18px across and centred on the boundary, so at 0% and 100%
     half of it would hang outside the track. Its position is pulled in by
     its own radius at each end - the fill still runs to the true percentage,
     only the handle is inset, which is the half nobody measures off. */
  const HANDLE = 14
  const knobPct = `calc(${clamped}% + ${((50 - clamped) / 50) * (HANDLE / 2)}px)`

  return (
    <div className={className}>
      <div
        className="relative h-[14px] rounded-full bg-slate-100 dark:bg-white/[0.05]
          border border-slate-200/70 dark:border-white/[0.07] overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ? `${label}: ${Math.round(clamped)}% used` : undefined}
      >
        {/* Headroom, struck through.

            A thinner band than the fill, not the full height of the track.
            At full height the hatching read as a second filled bar sitting
            next to the first - two slabs of the same colour, one of them
            textured - and the eye had to work out which one meant "spent".
            Inset, it reads as a rule with the run left on it, and the solid
            fill is the only thing with weight.

            Starts where the fill ends, so no stripes pass under it. */}
        <div
          className="absolute inset-y-[4px] right-[3px] rounded-full"
          style={{
            left: `calc(${clamped}% + 3px)`,
            backgroundImage:
              `repeating-linear-gradient(45deg, ${t.stripe} 0 1.5px, transparent 1.5px 3.5px)`,
          }}
        />

        <div
          className="absolute inset-y-[2px] left-[2px] rounded-full transition-[width] duration-500"
          style={{
            width: `calc(${clamped}% - 2px)`,
            background: t.fill,
            minWidth: clamped > 0 ? 12 : 0,
          }}
        />

        {clamped > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1/2 rounded-full bg-white
              shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-[left] duration-500"
            style={{
              left: knobPct,
              width: HANDLE,
              height: HANDLE,
              transform: 'translate(-50%, -50%)',
              border: `3px solid ${t.fill}`,
            }}
          />
        )}
      </div>

      {(label || total != null) && (
        <div className="flex items-baseline justify-between gap-3 mt-2">
          {label && (
            <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
              {label}
            </span>
          )}
          {total != null && (
            <span className="text-[12px] tabular-nums text-slate-400 dark:text-slate-500">
              <span className="font-semibold text-slate-800 dark:text-white">{used}</span>
              {' / '}{total}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
