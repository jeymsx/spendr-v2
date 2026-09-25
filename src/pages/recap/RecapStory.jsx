import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, MotionConfig, animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { recapSlides } from '../../lib/recapCopy'
import { useScrollLock } from '../../hooks/useScrollLock'
import { keepTabInside } from '../../components/ui/focus'
import { COLOR_EASE, EXIT, PALETTES, SHAPES, SLIDE_MS, SPRING } from './theme'
import { SlideContext } from './parts'
import {
  BadgesSlide, BiggestSlide, BudgetsSlide, CategoriesSlide, DaysSlide, GoToSlide,
  IntroSlide, KeptSlide, NetWorthSlide, SpentSlide,
} from './slides'
import SummarySlide from './SummarySlide'

/**
 * The monthly recap, as a story: one slide at a time, moving on by itself.
 *
 * ── The one moving object ──
 *
 * Every slide is drawn inside a single surface that never unmounts. Between
 * slides it springs to its next size, corner radius and colour (theme.js),
 * the screen behind it eases to its next colour, and the content swaps
 * through a short blur. The content is laid out at the surface's FINAL size
 * and clipped by the surface as it grows, so text never reflows mid-morph.
 *
 * ── How it is driven ──
 *
 *   tap the right of the screen   next      tap the left    back
 *   hold the screen or a chart    pause     drag down       close
 *   arrow keys, Escape            the same from a keyboard; Space pauses
 *
 * Autoplay also stops for the pause button, while the tab is hidden, and on
 * the last slide, which waits for you. Touching a chart gives its slide its
 * full time again. Reduced motion keeps every slide and every figure; the
 * morph snaps instead of springing, and the swap is a plain fade.
 *
 * ── Out of the page, into the body ──
 *
 * Rendered through a portal. Inside the app's scroller it inherited two
 * things it must not have: the page's enter animation, whose transform made
 * the story's `fixed` box the size of the page for its first 220ms, and the
 * scroller's pull-to-sync, which every drag-to-close set off.
 *
 * ── Per frame, nothing re-renders ──
 *
 * The progress bar and the drag-down are motion values written straight to
 * the DOM, so a finger dragging the story or the clock ticking never renders
 * the slide underneath again.
 */

const SLIDES = {
  intro: IntroSlide,
  spent: SpentSlide,
  kept: KeptSlide,
  categories: CategoriesSlide,
  days: DaysSlide,
  biggest: BiggestSlide,
  goto: GoToSlide,
  budgets: BudgetsSlide,
  networth: NetWorthSlide,
  badges: BadgesSlide,
}

/** What each slide is, for a screen reader moving through them. */
const SLIDE_NAMES = {
  intro: 'Your month',
  spent: 'What you spent',
  kept: 'What you kept',
  categories: 'Where it went',
  days: 'Day by day',
  biggest: 'Biggest purchase',
  goto: 'Your go-to',
  budgets: 'Budgets',
  networth: 'Net worth',
  badges: 'New badges',
  summary: 'Summary',
}

/** A tap is short and still; anything else is a hold or a drag. */
const TAP_MS = 250
const TAP_SLOP = 10
const CLOSE_DRAG = 90

/** Space and Enter belong to a focused control, not to the story. */
const OWNS_KEYS = 'button, a[href], input, select, textarea'

/** The screen colour before the first slide is drawn - the intro's. @param {'light'|'dark'} theme */
const openingBg = (theme) => PALETTES[theme][SHAPES.intro.palette].bg

/**
 * The story's own screen, empty: shown while the recap loads, so the step
 * from Insights to the story never passes through the bare app behind it.
 *
 * @param {{theme: 'light'|'dark'}} props
 */
export function RecapBackdrop({ theme }) {
  return createPortal(
    // design-ok: the recap story's own full-screen backdrop, not a sheet.
    <div className="fixed inset-0 z-[500]" style={{ backgroundColor: openingBg(theme) }} aria-hidden="true" />,
    document.body,
  )
}

/** The space the surface may fill, tracked as the window changes. */
function useStageSize() {
  const ref = useRef(/** @type {HTMLElement|null} */ (null))
  const [size, setSize] = useState({ w: 0, h: 0 })
  // Before paint, so the first frame already has the surface in it.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return /** @type {const} */ ([ref, size])
}

/**
 * @param {{recap: import('../../lib/recap').Recap, currency: string, theme: 'light'|'dark',
 *          name?: string, onClose: () => void}} props
 */
export default function RecapStory({ recap: opened, currency, theme, name, onClose }) {
  /* The month as it was when the story opened. A sync landing mid-story
     would otherwise rebuild the slides under the person reading them - and
     throw away the summary picture already drawn for them. */
  const [recap] = useState(opened)
  const ids = useMemo(() => recapSlides(recap), [recap])
  const [index, setIndex] = useState(0)
  const at = Math.min(index, ids.length - 1)
  const id = ids[at]
  const isLast = at === ids.length - 1

  const shape = SHAPES[id] ?? SHAPES.spent
  const pal = PALETTES[theme === 'dark' ? 'dark' : 'light'][shape.palette]
  const reduce = useReducedMotion()

  // ── Opening and closing ──
  const dialogRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const y = useMotionValue(0)
  const opacity = useMotionValue(0)
  useEffect(() => {
    const controls = animate(opacity, 1, { duration: 0.2 })
    return () => controls.stop()
  }, [opacity])

  /* Out the way it came, then gone - quicker than it arrived, and only once:
     a second tap on Done, or Escape during a drag, must not start a second
     exit. The backdrop stays put, so the bare app never shows through. And a
     story that unmounts mid-exit - the back button, pressed during it - must
     not then navigate back a second time from beyond the grave. */
  const closing = useRef(false)
  const mounted = useRef(true)
  // Set in the effect, not only cleared: React mounts twice in development.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const dismiss = useCallback(() => {
    if (closing.current) return
    closing.current = true
    if (reduce) { onClose(); return }
    animate(y, y.get() + 64, EXIT)
    animate(opacity, 0, EXIT).then(() => { if (mounted.current) onClose() })
  }, [onClose, opacity, reduce, y])

  useScrollLock(true)

  /* Focus in on open, as Sheet does: a screen reader should land in the
     story, and a keyboard should not tab through the page behind it. */
  useEffect(() => {
    const before = /** @type {HTMLElement|null} */ (document.activeElement)
    dialogRef.current?.focus({ preventScroll: true })
    return () => before?.focus?.({ preventScroll: true })
  }, [])

  // ── Moving between slides ──
  const progress = useMotionValue(0)
  const next = useCallback(() => setIndex(i => Math.min(i + 1, ids.length - 1)), [ids.length])
  const prev = useCallback(() => setIndex(i => Math.max(i - 1, 0)), [])
  // Before paint, so a new slide's bar never shows the last one's full width.
  useLayoutEffect(() => { progress.set(isLast ? 1 : 0) }, [at, isLast, progress])

  // ── Holding still ──
  const [fingerDown, setFingerDown] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  /* A chart hold belongs to the slide it started on. Kept with the slide's
     index, so a hold whose finger never lifted - the slide changed under it
     - cannot freeze every slide after it. */
  const [held, setHeld] = useState({ at: -1, on: false })
  const chartHeld = held.on && held.at === at
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden')
  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  const paused = fingerDown || chartHeld || userPaused || hidden || isLast

  /** @param {boolean} on */
  const hold = useCallback((on) => {
    setHeld({ at, on })
    // Let go of a chart, and its slide starts its time again.
    if (!on) progress.set(0)
  }, [at, progress])

  // ── Autoplay: the progress bar is the clock ──
  useEffect(() => {
    if (paused) return
    let raf = 0
    let last = performance.now()
    const step = (/** @type {number} */ now) => {
      const p = progress.get() + (now - last) / SLIDE_MS
      last = now
      if (p >= 1) { progress.set(1); next(); return }
      progress.set(p)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [paused, at, next, progress])

  // ── Keyboard ──
  /* On the capture phase, and stopped there: while the story is open it is
     the only thing on screen, so its keys are its own - a sheet left open
     underneath it must not close on the same Escape, or trap the same Tab. */
  useEffect(() => {
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      // Alt+Left is the browser's own Back; leave every chord alone.
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const onControl = !!(/** @type {HTMLElement} */ (e.target)).closest?.(OWNS_KEYS)
      let handled = true
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'Escape') dismiss()
      else if (e.key === ' ' && !onControl) setUserPaused(p => !p)
      else if (e.key === 'Tab') { keepTabInside(e, dialogRef.current); e.stopPropagation(); return }
      else handled = false
      if (handled) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [next, prev, dismiss])

  // ── Touch: tap, hold, drag down ──
  /* One finger at a time: a second one landing mid-hold is ignored rather
     than taken for a new tap. The pointer is captured, so a drag that ends
     off the stage - or off the window, with a mouse - still ends here. The
     story only starts to follow the finger once it has moved further than a
     tap may, so a still hold does not jiggle it. */
  const down = useRef(/** @type {{id: number, t: number, x: number, y: number}|null} */ (null))
  const settle = () => (reduce ? y.set(0) : animate(y, 0, SPRING))
  /** @param {import('react').PointerEvent<HTMLElement>} e */
  const onPointerDown = (e) => {
    if (down.current || closing.current) return
    if (/** @type {HTMLElement} */ (e.target).closest('[data-interactive]')) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    down.current = { id: e.pointerId, t: performance.now(), x: e.clientX, y: e.clientY }
    setFingerDown(true)
  }
  /** @param {import('react').PointerEvent} e */
  const onPointerMove = (e) => {
    if (down.current?.id !== e.pointerId) return
    y.set(Math.max(0, e.clientY - down.current.y - TAP_SLOP))
  }
  /** @param {import('react').PointerEvent<HTMLElement>} e */
  const onPointerUp = (e) => {
    const start = down.current
    if (start?.id !== e.pointerId) return
    down.current = null
    setFingerDown(false)
    const dx = e.clientX - start.x, dy = e.clientY - start.y
    if (dy > CLOSE_DRAG && Math.abs(dy) > Math.abs(dx)) { dismiss(); return }
    settle()
    const quick = performance.now() - start.t < TAP_MS
    if (quick && Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) {
      const box = e.currentTarget.getBoundingClientRect()
      if (e.clientX < box.left + box.width * 0.3) prev()
      else next()
    }
  }
  /** @param {import('react').PointerEvent} e */
  const onPointerCancel = (e) => {
    if (down.current?.id !== e.pointerId) return
    down.current = null
    setFingerDown(false)
    settle()
  }

  // ── The surface's next shape ──
  const [stageRef, stage] = useStageSize()
  const target = useMemo(() => {
    const w = Math.round(stage.w * shape.width)
    const h = Math.round(stage.h * shape.height)
    const side = Math.min(w, h)
    return shape.circle
      ? { w: side, h: side, r: side / 2 }
      : { w, h, r: Math.min(shape.radius, Math.min(w, h) / 2) }
  }, [stage, shape])
  const surfaceColor = shape.circle ? pal.ink : pal.surface

  const context = useMemo(() => ({ pal, currency, hold }), [pal, currency, hold])
  const Slide = SLIDES[id]

  return createPortal(
    <MotionConfig reducedMotion="user">
      {/* design-ok: a full-screen story, not a sheet. It owns the whole
          viewport, its own backdrop colour per slide, and a drag-down close;
          Sheet's docked panel, handle and scrim are the opposite of that. */}
      <motion.div
        className="fixed inset-0 z-[500]"
        style={{ touchAction: 'none', overscrollBehavior: 'none' }}
        initial={{ backgroundColor: openingBg(theme) }}
        animate={{ backgroundColor: pal.bg }}
        transition={COLOR_EASE}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${recap.label} recap`}
          tabIndex={-1}
          /* A phone's width at most: on a tablet or a desktop the story is a
             column on its own backdrop, as a story is, not a card stretched
             across the screen. */
          className="absolute inset-0 mx-auto w-full max-w-[440px] flex flex-col select-none outline-none"
          style={{ y, opacity }}
        >
          <header className="px-5" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
            <div className="flex gap-1" aria-hidden="true">
              {ids.map((sid, i) => (
                <motion.span
                  key={sid}
                  className="flex-1 h-[3px] rounded-full overflow-hidden"
                  animate={{ backgroundColor: pal.track }}
                  transition={COLOR_EASE}
                >
                  <motion.span
                    className="block h-full origin-left"
                    style={{ scaleX: i < at ? 1 : i === at ? progress : 0 }}
                    animate={{ backgroundColor: pal.ink }}
                    transition={COLOR_EASE}
                  />
                </motion.span>
              ))}
            </div>
            <div className="mt-3 h-10 flex items-center gap-1">
              <motion.span className="flex-1 min-w-0 truncate text-13 font-semibold" animate={{ color: pal.muted }} transition={COLOR_EASE}>
                {recap.label} recap
              </motion.span>
              {!isLast && (
                <motion.button
                  type="button"
                  onClick={() => setUserPaused(p => !p)}
                  aria-label={userPaused ? 'Play recap' : 'Pause recap'}
                  aria-pressed={userPaused}
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  animate={{ color: pal.ink }}
                  transition={COLOR_EASE}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {userPaused ? <path d="M8 5.5v13l10.5-6.5z" /> : <path d="M9 6v12M15 6v12" />}
                  </svg>
                </motion.button>
              )}
              <motion.button
                type="button"
                onClick={dismiss}
                aria-label="Close recap"
                className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center"
                animate={{ color: pal.ink }}
                transition={COLOR_EASE}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </motion.button>
            </div>
          </header>

          <main
            ref={stageRef}
            className="relative flex-1 mx-5 mt-2"
            style={{ marginBottom: 'max(24px, env(safe-area-inset-bottom))' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            {stage.w > 0 && (
              <motion.div
                className="absolute left-1/2 top-1/2 overflow-hidden"
                style={{ x: '-50%', y: '-50%' }}
                initial={false}
                animate={{ width: target.w, height: target.h, borderRadius: target.r, backgroundColor: surfaceColor }}
                // Reduced motion: the card takes its next shape at once. Its
                // colour still eases - a change of colour is not movement.
                transition={{ default: reduce ? { duration: 0 } : SPRING, backgroundColor: COLOR_EASE }}
              >
                <SlideContext.Provider value={context}>
                  {/* Both slides are absolutely placed, so the outgoing one
                      fades where it stood while the next arrives over it. */}
                  <AnimatePresence>
                    <motion.div
                      key={id}
                      className="absolute left-1/2 top-1/2"
                      style={{ width: target.w, height: target.h, x: '-50%', y: '-50%' }}
                      initial={{ opacity: 0, filter: 'blur(10px)' }}
                      animate={{ opacity: 1, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, filter: 'blur(10px)', transition: { duration: 0.18 } }}
                      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {id === 'summary'
                        ? <SummarySlide recap={recap} name={name} onDone={dismiss} />
                        : Slide && <Slide recap={recap} name={name} />}
                    </motion.div>
                  </AnimatePresence>
                </SlideContext.Provider>
              </motion.div>
            )}
          </main>

          <p className="sr-only" aria-live="polite">
            Slide {at + 1} of {ids.length}: {SLIDE_NAMES[id] ?? ''}{userPaused ? ', paused' : ''}
          </p>
        </motion.div>
      </motion.div>
    </MotionConfig>,
    document.body,
  )
}
