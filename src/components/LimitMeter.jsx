/**
 * How far along a total you are, as a track with a handle on it.
 *
 * Two things use it: a credit card's limit, where the fill is debt and the
 * headroom is what you can still borrow, and a savings goal, where the fill
 * is money saved and the headroom is what is left to save. Opposite feelings,
 * identical geometry - which is why the tone is a prop rather than always
 * derived from the percentage. A card at 95% is bad news; a goal at 95% is
 * not, and the meter must not colour it as though it were.
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
 * They lean forward, `/`, which is -45deg. CSS angles name the gradient's
 * AXIS and the bands sit across it, so the intuitive `45deg` draws the
 * opposite lean - the stripes were falling back into the fill instead of
 * running on ahead of it.
 *
 * ── The colour ──
 *
 * Not one colour. The reference this copies is a spending limit, where blue
 * is fine; this is debt, and 90% of a credit line gone is not the same news
 * as 10%. The thresholds and the four tones are WebBar's, already used for
 * the budget meters, so a card at 95% and a food budget at 95% look alike.
 */

const TONES = {
  /* Alphas went up with the pitch. A 1.25px stroke covers little more than
     half the ink a 2px one did, so holding the old values would have faded
     the hatching as it got finer. */
  accent: { fill: 'var(--color-primary)', stripe: 'rgba(var(--color-primary-rgb), 0.62)' },
  warn:   { fill: '#f59e0b',              stripe: 'rgba(245, 158, 11, 0.66)' },
  bad:    { fill: '#ef4444',              stripe: 'rgba(239, 68, 68, 0.66)' },
  /* Arriving, rather than running out. A funded goal, which the bar it
     replaced already drew in this green for the reason its own note gives:
     scanning, "done" has to be legible without reading the number. */
  good:   { fill: '#10b981',              stripe: 'rgba(16, 185, 129, 0.66)' },
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

  /* 20 against an 18px track, so it stands a pixel proud at top and bottom.
     Flush, it read as a hole punched in the rail rather than a grip resting
     on it - and it left the shadow no room to fall.

     Centred on the boundary, so at 0% and 100% half of it would hang off the
     end. Its position is pulled in by its own radius at each end - the fill
     still runs to the true percentage, only the handle is inset, which is
     the half nobody measures off. */
  const HANDLE = 20
  const knobPct = `calc(${clamped}% + ${((50 - clamped) / 50) * (HANDLE / 2)}px)`

  return (
    <div className={className}>
      <div
        /* No overflow-hidden. It was clipping the handle flat at the top and
           bottom - an 18px circle centred in an 18px box that clips has
           nowhere to put its own edge, let alone its shadow. Nothing else
           here needs the clip: the fill and the hatch are both inset from
           the track and rounded themselves, so neither can reach a corner. */
        className="relative h-[18px] rounded-full bg-slate-100 dark:bg-white/[0.05]
          border border-slate-200/70 dark:border-white/[0.07]"
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
          className="absolute inset-y-[5px] right-[4px] rounded-full"
          style={{
            left: `calc(${clamped}% + 4px)`,
            backgroundImage:
              `repeating-linear-gradient(-45deg, ${t.stripe} 0 1.25px, transparent 1.25px 3px)`,
          }}
        />

        <div
          className="absolute inset-y-[3px] left-[3px] rounded-full transition-[width] duration-500"
          style={{
            width: `calc(${clamped}% - 3px)`,
            background: t.fill,
            minWidth: clamped > 0 ? 14 : 0,
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
            <span className="text-12 font-medium text-slate-500 dark:text-slate-400">
              {label}
            </span>
          )}
          {total != null && (
            <span className="text-12 tabular-nums text-slate-400 dark:text-slate-500">
              <span className="font-semibold text-slate-800 dark:text-white">{used}</span>
              {' / '}{total}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
