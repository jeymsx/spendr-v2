import { useEffect } from 'react'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { CHAPTERS } from '../../lib/recapCopy'
import { SPRING } from './theme'

/**
 * Where you are in the story, and the controls to move through it.
 *
 * ── The dial ──
 *
 * The chapters sit around the top of a large wheel, the one you are on at
 * the top of it and the ones either side curving away, with a tick between.
 * Moving to another slide turns the wheel on the shared spring; tapping a
 * chapter on it goes straight there. It is a pointer shortcut and a picture
 * of progress - for a screen reader the story's live region says where you
 * are, and the buttons below move you - so it is hidden from one.
 *
 * ── The controls ──
 *
 * Back, play/pause, forward. The ring around play/pause is the slide's
 * clock, filling as it runs down: `progress`, a motion value written by the
 * story's own frame loop, so the ring moves without anything re-rendering.
 * On the last slide the middle button starts the story again.
 */

/** Degrees between chapters on the wheel. 360 / STEP must be whole, for the ticks. */
const STEP = 15
/** The wheel's radius. Large, so the arc is gentle and three chapters fit across. */
const R = 460
/** Where a chapter's label sits, from the top of the dial. */
const LABEL_Y = 18
/** The ticks' ring, just under the labels. */
const TICK_R = R - 22

/**
 * @param {{ids: string[], at: number, pal: import('./theme').RecapPalette,
 *          progress: import('motion/react').MotionValue<number>, userPaused: boolean, isLast: boolean,
 *          onJump: (i: number) => void, onPrev: () => void, onNext: () => void,
 *          onToggle: () => void, onReplay: () => void}} props
 */
export default function Dial({ ids, at, pal, progress, userPaused, isLast, onJump, onPrev, onNext, onToggle, onReplay }) {
  const reduce = useReducedMotion()
  const wheel = useMotionValue(-at * STEP)
  useEffect(() => {
    const controls = animate(wheel, -at * STEP, reduce ? { duration: 0 } : SPRING)
    return () => controls.stop()
  }, [at, reduce, wheel])

  const ink = pal.mode === 'dark' ? '#0b0f14' : '#FFFFFF'
  const minor = (2 * Math.PI * TICK_R) / (360 / (STEP / 5))
  const major = (2 * Math.PI * TICK_R) / (360 / STEP)
  const box = TICK_R * 2 + 12

  return (
    <div className="shrink-0 px-4" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
      <div className="relative h-12 overflow-hidden select-none" aria-hidden="true" data-interactive>
        <div className="absolute left-1/2" style={{ top: LABEL_Y + R }}>
          <motion.div className="absolute left-0 top-0" style={{ rotate: wheel }}>
            <svg
              className="absolute -rotate-90"
              style={{ left: -box / 2, top: -box / 2, width: box, height: box }}
              viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`}
            >
              <circle r={TICK_R} fill="none" stroke={pal.chromeFaint} strokeWidth="6" strokeDasharray={`1.5 ${minor - 1.5}`} strokeDashoffset="0.75" />
              <circle r={TICK_R} fill="none" stroke={pal.chromeMuted} strokeWidth="10" strokeDasharray={`2 ${major - 2}`} strokeDashoffset="1" />
            </svg>
            {ids.map((id, i) => {
              const far = Math.abs(i - at)
              return (
                <div key={id} className="absolute left-0 top-0" style={{ transform: `rotate(${i * STEP}deg)` }}>
                  <motion.button
                    type="button"
                    tabIndex={-1}
                    onClick={() => onJump(i)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 h-9 px-2 whitespace-nowrap text-12 font-semibold uppercase tracking-[0.14em]"
                    style={{ top: -R, left: 0, pointerEvents: far > 2 ? 'none' : 'auto' }}
                    initial={false}
                    animate={{ opacity: far === 0 ? 1 : far === 1 ? 0.55 : far === 2 ? 0.2 : 0, color: far === 0 ? pal.chrome : pal.chromeMuted }}
                    transition={{ duration: 0.3 }}
                  >
                    {CHAPTERS[id] ?? id}
                  </motion.button>
                </div>
              )
            })}
          </motion.div>
        </div>
        {/* The pointer: the notch the chapter on top sits over. */}
        <span className="absolute left-1/2 -translate-x-1/2 w-[3px] h-3.5 rounded-full" style={{ top: LABEL_Y + 17, backgroundColor: pal.chrome }} />
      </div>

      <div className="mt-1 flex items-center justify-center gap-8">
        <button
          type="button"
          onClick={onPrev}
          disabled={at === 0}
          aria-label="Previous slide"
          className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform"
          style={{ color: pal.chrome }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>

        <button
          type="button"
          onClick={isLast ? onReplay : onToggle}
          aria-label={isLast ? 'Replay recap' : userPaused ? 'Play recap' : 'Pause recap'}
          aria-pressed={isLast ? undefined : userPaused}
          className="relative w-[60px] h-[60px] rounded-full flex items-center justify-center active:scale-95 transition-transform"
        >
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 60 60" aria-hidden="true">
            <circle cx="30" cy="30" r="28" fill="none" stroke={pal.chromeFaint} strokeWidth="3" />
            <motion.circle cx="30" cy="30" r="28" fill="none" stroke={pal.chrome} strokeWidth="3" strokeLinecap="round" style={{ pathLength: progress }} />
          </svg>
          <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: pal.chrome, color: ink }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {isLast
                ? <path fill="none" d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" />
                : userPaused
                  ? <path d="M8 5.5v13l10.5-6.5z" />
                  : <path fill="none" d="M9 6v12M15 6v12" />}
            </svg>
          </span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={isLast}
          aria-label="Next slide"
          className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform"
          style={{ color: pal.chrome }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
