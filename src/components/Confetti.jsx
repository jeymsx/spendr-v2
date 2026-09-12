import { useState } from 'react'

/**
 * The celebration confetti, shared.
 *
 * This is the burst Onboarding's last step has always used, lifted out so
 * the account-created screen can show the same one. It is deliberately not a
 * package: seventy absolutely-positioned rectangles on a single CSS keyframe
 * is less code than the import would be, and it composites on the GPU
 * without any JavaScript running per frame.
 *
 * One thing is new in the move - a prefers-reduced-motion guard. A screenful
 * of small fast-moving objects is close to the worst case for anyone who set
 * that, and nothing here carries meaning, so it is simply skipped.
 *
 * ── Two shapes, one file ──
 *
 * `Confetti` rains from the top of the screen: the right thing when the whole
 * screen is the celebration, which is what onboarding and account-created are.
 * `ConfettiBurst` throws from a point outwards, for when there is a specific
 * object being celebrated and the confetti should look like it came OUT of it.
 *
 * They live together rather than in two files because they are one idea with
 * one palette and one reduced-motion rule, and a second confetti somewhere
 * else in the tree is exactly how a third appears.
 */

const COLORS = ['#2D9DFF', '#34D399', '#F472B6', '#FBBF24', '#A78BFA', '#FB7185', '#38BDF8']

export default function Confetti({ count = 70 }) {
  /* Lazy useState, not useMemo: these are random, and they have to be the
     same random on every render or the burst restarts whenever anything
     above it changes. */
  const [particles] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 0.8 + Math.random() * 0.7,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      w: 6 + Math.random() * 7,
      h: 4 + Math.random() * 5,
    })),
  )

  const [reduced] = useState(
    () => typeof window !== 'undefined'
      && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  if (reduced) return null

  return (
    /* design-ok: not a dialog. A decorative canvas over the whole screen,
       pointer-events-none and aria-hidden - nothing to focus or dismiss. */
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50" aria-hidden="true">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-[2px]"
          style={{
            left: `${p.x}%`,
            top: '-12px',
            width: p.w,
            height: p.h,
            backgroundColor: p.color,
            animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  )
}

/**
 * A burst thrown outward from a point.
 *
 * Absolutely positioned and centred on its parent, so the parent decides where
 * the explosion happens - put it inside the badge's own box and the paper
 * appears to come off the badge.
 *
 * Each particle carries its own vector as CSS variables and they all share one
 * keyframe, so this is still zero JavaScript per frame. `--by` has gravity
 * folded into it rather than animated separately: a second keyframe on a
 * wrapper would double the element count for a curve nobody can see at this
 * speed.
 */
/**
 * The four shapes a burst throws.
 *
 * One rectangle repeated forty times reads as debris. Real party confetti is a
 * mix, and the mix is what makes it read as paper rather than as pixels: bars
 * tumble, dots read as the small stuff, rings and curls catch the eye because
 * they are open shapes among filled ones.
 *
 * All four are one <span> with borders and a radius - no SVG, no extra nodes.
 * A ring is a circle with a transparent middle; a curl is the same circle with
 * three of its four borders removed, which leaves a single arc.
 */
function shapeStyle(kind, color, size) {
  switch (kind) {
    case 'dot':
      return { width: size, height: size, borderRadius: '50%', backgroundColor: color }
    case 'ring':
      return {
        width: size * 1.5, height: size * 1.5, borderRadius: '50%',
        border: `2px solid ${color}`,
      }
    case 'curl':
      return {
        width: size * 1.9, height: size * 1.5, borderRadius: '50%',
        borderTop: `2px solid ${color}`,
        borderRight: `2px solid ${color}`,
      }
    default:
      return {
        width: size * 1.7, height: size * 0.75, borderRadius: 1.5,
        backgroundColor: color,
      }
  }
}

const SHAPES = ['bar', 'bar', 'dot', 'ring', 'curl']

/**
 * A burst thrown outward from a point.
 *
 * Absolutely positioned and centred on its parent, so the parent decides where
 * the explosion happens - put it inside the badge's own box and the paper
 * appears to come off the badge.
 *
 * Each particle carries its own vector as CSS variables and they all share one
 * keyframe, so this is still zero JavaScript per frame. `--by` has gravity
 * folded into it rather than animated separately: a second keyframe on a
 * wrapper would double the element count for a curve nobody can see.
 */
export function ConfettiBurst({ count = 46 }) {
  const [particles] = useState(() =>
    Array.from({ length: count }, (_, i) => {
      /* Jittered around an even spread rather than fully random: pure
         Math.random() on the angle clumps, and a clumped burst reads as the
         badge leaking rather than popping. */
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.55
      const dist = 95 + Math.random() * 175
      return {
        id: i,
        kind: SHAPES[i % SHAPES.length],
        bx: Math.cos(angle) * dist,
        /* Gravity, folded in - but only a little.
           The first version added 55 to 185px of fall to EVERY particle, which
           is not gravity so much as a downward offset on the whole burst: the
           cloud's centre ended up well below the badge it was supposed to be
           coming out of. It is the badge that is being celebrated, so the badge
           has to be the origin. A 0-45px drift keeps the paper falling without
           moving where it came from. */
        by: Math.sin(angle) * dist + Math.random() * 45,
        rot: Math.random() * 900 - 450,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 5 + Math.random() * 4,
        delay: Math.random() * 0.16,
        /* Slow and long. The first pass was under a second and was over before
           you had finished reading the badge's name. */
        duration: 1.7 + Math.random() * 1.1,
      }
    }),
  )

  const [reduced] = useState(
    () => typeof window !== 'undefined'
      && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  if (reduced) return null

  return (
    <span className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {particles.map(p => {
        const shape = shapeStyle(p.kind, p.color, p.size)
        return (
          <span
            key={p.id}
            className="absolute left-1/2 top-1/2 confetti-burst"
            style={{
              ...shape,
              marginLeft: -(parseFloat(shape.width) || 0) / 2,
              marginTop: -(parseFloat(shape.height) || 0) / 2,
              '--bx': `${p.bx}px`,
              '--by': `${p.by}px`,
              '--br': `${p.rot}deg`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        )
      })}
    </span>
  )
}
