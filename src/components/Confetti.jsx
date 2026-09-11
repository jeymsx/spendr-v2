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
