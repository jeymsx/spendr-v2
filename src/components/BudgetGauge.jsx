/**
 * The month's spending, as a fan of ticks over a half circle.
 *
 * It replaces a number, a second number, and a horizontal meter stacked
 * above each other - three things saying one thing. The arc puts the amount
 * inside the measurement, so the figure and how far along it is are read in
 * one look.
 *
 * ── Why ticks rather than a stroked arc ──
 *
 * A solid arc with a rounded cap is a smooth quantity; a fan of separate
 * ticks is a scale you are somewhere on. The second is the truer picture of
 * a budget, which is spent in discrete chunks and has a hard end. It also
 * degrades honestly at the extremes: one tick lit is visibly "barely
 * started" where 2% of a stroked arc is a dot you cannot see.
 *
 * ── The gradient runs over the FILLED span, not the whole circle ──
 *
 * So the ramp is fully travelled whatever the percentage: at 20% the twenty
 * percent of ticks carry blue through to orange, and at 90% so do the
 * ninety. The alternative - a fixed ramp around the whole arc - means the
 * colour tells you the percentage a second time and the early months all
 * look blue.
 */

/* Left end to the spent boundary. Four stops rather than two because a
   two-stop blend across a 180-degree fan reads as one muddy colour in the
   middle; the turns are what make it look like a spectrum. */
const RAMP = ['#3b5bdb', '#7950f2', '#12b886', '#fd7e14']

const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const toHex = (c) => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')

/** A colour `t` of the way along RAMP, 0..1. */
function rampAt(t) {
  const clamped = Math.max(0, Math.min(1, t))
  const span = (RAMP.length - 1) * clamped
  const i = Math.min(RAMP.length - 2, Math.floor(span))
  const f = span - i
  const a = hex(RAMP[i]), b = hex(RAMP[i + 1])
  return toHex(a.map((v, k) => v + (b[k] - v) * f))
}

const TICKS = 34
const W = 280
const CY = 134          // centre sits on the baseline, so the fan is a half
const R_OUT = 128
const R_IN = 99

/* Each tick TAPERS: wide at the rim, narrow at the hub.

   A uniform stroke is what a <line> gives you, and in a fan it reads wrong -
   the ticks crowd together as they approach the centre, so a constant width
   makes the inner ring denser than the outer one and the whole thing looks
   heavier on the inside than the outside. Tapering pays that back: the gaps
   stay even because the strokes narrow at the same rate the arc does.
   
   It is also why these are paths rather than lines. A stroke cannot change
   width along its length, so the shape has to be drawn. */
const W_OUT = 3.2       // half-width at the rim
const W_IN = 1.05       // half-width at the hub
const PAD = W_OUT       // so the widest cap cannot clip the viewBox

export default function BudgetGauge({
  pct,
  amount,
  label = 'Spent',
  leftNote,
  rightNote,
  className = '',
}) {
  const value = Number(pct) || 0
  /* Clamped for the geometry only. An over-budget month fills the fan - there
     is no more arc to give it - and the true figure is in leftNote, which is
     why that is a prop rather than something derived here. */
  const filled = Math.min(TICKS, Math.round((Math.min(value, 100) / 100) * TICKS))

  const ticks = Array.from({ length: TICKS }, (_, i) => {
    // 180deg on the left through 0deg on the right, over the top.
    const a = Math.PI * (1 - i / (TICKS - 1))
    const cos = Math.cos(a), sin = Math.sin(a)
    const on = i < filled

    /* Screen coords, so y runs down: the outward radial unit is
       (cos, -sin) and rotating it a quarter turn gives (sin, cos), which
       is the direction the tick's width is measured along. */
    const px = Math.sin(a), py = Math.cos(a)
    const ox = W / 2 + R_OUT * cos, oy = CY - R_OUT * sin
    const ix = W / 2 + R_IN * cos,  iy = CY - R_IN * sin

    const p = (x, y) => `${x.toFixed(2)} ${y.toFixed(2)}`
    /* Round cap at the rim bulging outward (sweep 0), down one side,
       round cap at the hub bulging inward (sweep 1), back up. Both sweeps
       were worked out at the top of the arc, where the outward direction
       is -y: right-to-left over the top is a decreasing angle on screen,
       hence 0, and left-to-right under the hub is increasing, hence 1. */
    const d = [
      `M ${p(ox + px * W_OUT, oy + py * W_OUT)}`,
      `A ${W_OUT} ${W_OUT} 0 0 0 ${p(ox - px * W_OUT, oy - py * W_OUT)}`,
      `L ${p(ix - px * W_IN, iy - py * W_IN)}`,
      `A ${W_IN} ${W_IN} 0 0 1 ${p(ix + px * W_IN, iy + py * W_IN)}`,
      'Z',
    ].join(' ')

    return {
      i,
      on,
      d,
      // Normalised across the lit span, not across the whole fan.
      color: on ? rampAt(filled > 1 ? i / (filled - 1) : 1) : null,
    }
  })

  return (
    <div className={`relative ${className}`} style={{ maxWidth: W, marginInline: 'auto' }}>
      <svg
        viewBox={`0 0 ${W} ${CY + PAD}`}
        className="w-full block"
        role="img"
        aria-label={`${label}: ${Math.round(value)}% of budget`}
      >
        {/* Unlit ticks take currentColor, so one class answers both themes -
            an inline stroke cannot. */}
        <g className="text-slate-200 dark:text-white/[0.13]">
          {ticks.filter(t => !t.on).map(t => (
            <path key={t.i} d={t.d} fill="currentColor" />
          ))}
        </g>

        {ticks.filter(t => t.on).map(t => (
          <path
            key={t.i}
            d={t.d}
            fill={t.color}
            className="gauge-tick"
            /* Swept rather than appearing at once: the fan fills the way the
               month did. 14ms apart is fast enough to read as one motion and
               slow enough to have a direction. */
            style={{ animationDelay: `${t.i * 14}ms` }}
          />
        ))}
      </svg>

      {/* HTML, not <text>. The amount wants the app's own font stack, its
          tabular figures and its truncation, none of which SVG text gives
          without restating them. */}
      <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: '49%' }}>
        <p className="text-[12px] font-medium text-slate-400 dark:text-slate-500">{label}</p>
        <p className="mt-0.5 text-[30px] leading-none font-semibold tracking-tight tabular-nums
          text-slate-900 dark:text-white">
          {amount}
        </p>
      </div>

      {(leftNote || rightNote) && (
        /* mt-1, not -mt-1. The arc's endpoints sit on the very bottom edge
           of the viewBox, so a negative margin put the notes level with the
           tips of the outermost ticks and the row read as part of the fan. */
        <div className="flex items-baseline justify-between gap-3 mt-1 px-1">
          <span className="text-[12px] tabular-nums text-slate-500 dark:text-slate-400">{leftNote}</span>
          <span className="text-[12px] tabular-nums text-slate-500 dark:text-slate-400">{rightNote}</span>
        </div>
      )}
    </div>
  )
}
