import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, MotionConfig, animate, motion, useIsPresent, useMotionValue } from 'motion/react'
import { useReduceMotion } from '../../hooks/useReduceMotion'
import { recapSlides, wrappedTitle } from '../../lib/recapCopy'
import { parseMonth } from '../../lib/recap'
import { useScrollLock } from '../../hooks/useScrollLock'
import { keepTabInside } from '../../components/ui/focus'
import { EXIT, SLIDE_MS, SPRING, TAP_MS, TAP_SLOP, recapPalette, tonesFor } from './theme'
import { CardTexture, SlideContext } from './parts'
import { LogoChip } from './art'
import ShareSheet from './ShareSheet'
import {
  BadgesSlide, BiggestSlide, BudgetsSlide, CategoriesSlide, DaysSlide, GoToSlide,
  IntroSlide, KeptSlide, NetWorthSlide, PersonalitySlide, SpentSlide,
} from './slides'
import SummarySlide from './SummarySlide'

/**
 * The monthly recap, as a story: "August Wrapped", full screen, one slide at
 * a time, moving on by itself - the way a story is on Instagram.
 *
 * ── What is on screen ──
 *
 * Each slide's own colour fills the screen edge to edge, with the card's
 * grain and light (theme.js, CardTexture), and cross-fades into the next.
 * Over it: the progress bars and the story's name at the top, the slide in
 * the middle, and Share at the foot of every slide - any slide can be sent as
 * a picture of its own (ShareSheet, pictures.js). On a tablet or a desktop
 * the story is a phone-width column on its own backdrop, as a story is.
 *
 * ── How it is driven ──
 *
 *   tap the right of the screen   next      tap the left    back
 *   swipe left or right           the same  drag down       close
 *   hold the screen or a chart    pause
 *   arrow keys, Escape            the same from a keyboard; Space pauses
 *
 * Autoplay also stops for the pause button, while the tab is hidden, while
 * the share sheet is open, and on the last slide, which waits for you.
 * Touching a chart gives its slide its full time again. Reduced motion keeps
 * every slide and every figure; slides change without moving, and nothing
 * loops.
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
  personality: PersonalitySlide,
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
  personality: 'Your money personality',
  summary: 'Summary',
}

const SWIPE = 48
const CLOSE_DRAG = 90

/** Space and Enter belong to a focused control, not to the story. */
const OWNS_KEYS = 'button, a[href], input, select, textarea'

/** The room the header and the foot take, and so where the slide sits between them. */
const TOP = 'calc(max(10px, env(safe-area-inset-top)) + 60px)'
const BOTTOM = 'calc(max(16px, env(safe-area-inset-bottom)) + 64px)'

/** The slide leaves a little the way the story is going, and the next arrives from the other side. */
const SWAP = {
  enter: (/** @type {number} */ d) => ({ opacity: 0, x: d >= 0 ? 28 : -28, filter: 'blur(8px)' }),
  shown: { opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } },
  leave: (/** @type {number} */ d) => ({ opacity: 0, x: d >= 0 ? -28 : 28, filter: 'blur(8px)', transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }),
}

/**
 * The story's own screen, empty: shown while the recap loads, so the step
 * from Home or Insights to the story never passes through the bare app.
 *
 * @param {{pal: import('./theme').RecapPalette}} props
 */
export function RecapBackdrop({ pal }) {
  return createPortal(
    // design-ok: the recap story's own full-screen backdrop, not a sheet.
    <div className="fixed inset-0 z-[500]" style={{ background: pal.backdrop }} aria-hidden="true" />,
    document.body,
  )
}

/**
 * The slide on screen. A slide on its way out is still in the page until its
 * exit finishes, so it asks whether it is present, and once it is not it is
 * hidden from a screen reader - which would otherwise read two slides at
 * once - closed to taps, and no longer marked as the current slide.
 *
 * @param {{dir: number, children: import('react').ReactNode}} props
 */
function Face({ dir, children }) {
  const present = useIsPresent()
  return (
    <motion.div
      className="absolute inset-0"
      style={{ containerType: 'size', pointerEvents: present ? undefined : 'none' }}
      custom={dir}
      variants={SWAP}
      initial="enter"
      animate="shown"
      exit="leave"
      data-current-slide={present ? '' : undefined}
      aria-hidden={present ? undefined : true}
    >
      {children}
    </motion.div>
  )
}

/**
 * @param {{recap: import('../../lib/recap').Recap, currency: string, accent: string, theme: 'light'|'dark',
 *          name?: string, onClose: () => void}} props
 */
export default function RecapStory({ recap: opened, currency, accent, theme, name, onClose }) {
  /* The month as it was when the story opened. A sync landing mid-story
     would otherwise rebuild the slides under the person reading them. */
  const [recap] = useState(opened)
  const ids = useMemo(() => recapSlides(recap), [recap])
  const pal = useMemo(() => recapPalette(accent, theme), [accent, theme])
  const tones = useMemo(() => tonesFor(ids).map(t => pal.tones[t]), [ids, pal])
  const title = wrappedTitle(recap.month)
  const { year } = parseMonth(recap.month)
  // The phone's Reduce Motion or Spendr's own switch - Motion's hook only knows the phone.
  const reduce = useReduceMotion()

  /* Where the story is, and which way it last moved - a slide leaves the way
     the story is going. */
  const [nav, setNav] = useState({ index: 0, dir: 1 })
  const at = Math.min(nav.index, ids.length - 1)
  const id = ids[at]
  const isLast = at === ids.length - 1

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
     exit. And a story that unmounts mid-exit - the back button, pressed
     during it - must not then navigate back a second time. */
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
  const next = useCallback(() => setNav(n => (n.index >= ids.length - 1 ? n : { index: n.index + 1, dir: 1 })), [ids.length])
  const prev = useCallback(() => setNav(n => (n.index <= 0 ? n : { index: n.index - 1, dir: -1 })), [])
  // Before paint, so a new slide's bar never shows the last one's full width.
  useLayoutEffect(() => { progress.set(isLast ? 1 : 0) }, [at, isLast, progress])

  // ── Holding still ──
  const [fingerDown, setFingerDown] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const [sharing, setSharing] = useState(false)
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
  const paused = fingerDown || chartHeld || userPaused || hidden || isLast || sharing

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
     underneath it must not close on the same Escape, or trap the same Tab.
     Except its own share sheet, which is above it and has keys of its own. */
  useEffect(() => {
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (sharing) return
      // Under the app lock the keys are the lock's: Space must reach its button.
      if (document.documentElement.classList.contains('app-locked')) return
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
  }, [next, prev, dismiss, sharing])

  // ── Touch: tap, hold, swipe, drag down ──
  /* One finger at a time: a second one landing mid-hold is ignored rather
     than taken for a new tap. The pointer is captured, so a drag that ends
     off the stage - or off the window, with a mouse - still ends here. The
     story only starts to follow the finger down once it has moved further
     than a tap may, so a still hold does not jiggle it. */
  const down = useRef(/** @type {{id: number, t: number, x: number, y: number}|null} */ (null))
  const stageRef = useRef(/** @type {HTMLElement|null} */ (null))
  const settle = () => (reduce ? y.set(0) : animate(y, 0, SPRING))
  /* Where a tap goes: the left of the stage back, the rest on. The charts
     call this too - a quick, still tap on one is the same tap as anywhere
     else, and only a hold or a drag is theirs (charts.jsx). */
  const tapAt = useCallback((/** @type {number} */ clientX) => {
    const box = stageRef.current?.getBoundingClientRect()
    if (!box) return
    if (clientX < box.left + box.width * 0.3) prev()
    else next()
  }, [next, prev])
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
    const start = down.current
    if (start?.id !== e.pointerId) return
    const dy = e.clientY - start.y
    // Down, and more down than across: that is the close, and it follows.
    if (Math.abs(dy) > Math.abs(e.clientX - start.x)) y.set(Math.max(0, dy - TAP_SLOP))
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
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) next()
      else prev()
      return
    }
    const quick = performance.now() - start.t < TAP_MS
    if (quick && Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) tapAt(e.clientX)
  }
  /** @param {import('react').PointerEvent} e */
  const onPointerCancel = (e) => {
    if (down.current?.id !== e.pointerId) return
    down.current = null
    setFingerDown(false)
    settle()
  }

  // One context per slide, made once: a fresh object per render would render
  // the slide again on every tap and hold.
  const contexts = useMemo(() => tones.map(tone => ({ pal, tone, currency, hold, tapAt })), [tones, pal, currency, hold, tapAt])
  const Slide = SLIDES[/** @type {keyof typeof SLIDES} */ (id)]

  /** A button on the colour: the story's own chrome. */
  const chrome = 'w-10 h-10 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform'

  return createPortal(
    <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>
      {/* design-ok: a full-screen story, not a sheet. It owns the whole
          viewport and a drag-down close; Sheet's docked panel, handle and
          scrim are the opposite of that. */}
      <div className="fixed inset-0 z-[500]" style={{ background: pal.backdrop, touchAction: 'none', overscrollBehavior: 'none' }}>
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className="absolute inset-0 mx-auto w-full max-w-[440px] overflow-hidden select-none outline-none sm:top-4 sm:bottom-4 sm:rounded-[28px]"
          style={{ y, opacity }}
        >
          {/* The slide's colour, full bleed. The next fades in over the last,
              which stays until it is covered, so no frame shows the
              backdrop between them. */}
          <AnimatePresence initial={false}>
            <motion.div
              key={id}
              className="absolute inset-0"
              style={{ background: tones[at]?.background }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, zIndex: 1 }}
              exit={{ opacity: 0, zIndex: 0, transition: { duration: 0.01, delay: 0.45 } }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden="true"
            >
              <CardTexture />
            </motion.div>
          </AnimatePresence>

          <header className="absolute inset-x-0 top-0 z-20 px-4" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
            <div className="flex gap-1" aria-hidden="true">
              {ids.map((sid, i) => (
                <span key={sid} className="flex-1 h-[3px] rounded-full overflow-hidden bg-white/30">
                  <motion.span
                    className="block h-full bg-white origin-left"
                    style={{ scaleX: i < at ? 1 : i === at ? progress : 0 }}
                  />
                </span>
              ))}
            </div>
            <div className="mt-3 h-11 flex items-center gap-2.5">
              <LogoChip size={30} />
              <p className="flex-1 min-w-0 truncate text-15 font-semibold text-white">
                {title} <span className="font-medium text-white/80">{year}</span>
              </p>
              {!isLast && (
                <button
                  type="button"
                  onClick={() => setUserPaused(p => !p)}
                  aria-label={userPaused ? 'Play recap' : 'Pause recap'}
                  aria-pressed={userPaused}
                  className={chrome}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {userPaused ? <path d="M8 5.5v13l10.5-6.5z" /> : <path fill="none" d="M9 6v12M15 6v12" />}
                  </svg>
                </button>
              )}
              <button type="button" onClick={dismiss} aria-label="Close recap" className={`${chrome} -mr-1.5`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </header>

          <main
            ref={stageRef}
            className="absolute inset-x-0 z-10"
            style={{ top: TOP, bottom: BOTTOM }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <AnimatePresence initial={false} custom={nav.dir}>
              <Face key={id} dir={nav.dir}>
                <SlideContext.Provider value={contexts[at]}>
                  {id === 'summary'
                    ? <SummarySlide recap={recap} name={name} />
                    : Slide && <Slide recap={recap} name={name} />}
                </SlideContext.Provider>
              </Face>
            </AnimatePresence>
          </main>

          {/* For a keyboard and a screen reader, the taps have buttons too:
              out of sight until one is focused. */}
          <div className="absolute left-3 top-1/2 z-30 flex flex-col gap-2">
            <button type="button" onClick={prev} disabled={at === 0} className="sr-only focus:not-sr-only focus:px-3 focus:py-2 focus:rounded-full focus:bg-white focus:text-slate-900 focus:text-13 focus:font-semibold">
              Previous slide
            </button>
            <button type="button" onClick={next} disabled={isLast} className="sr-only focus:not-sr-only focus:px-3 focus:py-2 focus:rounded-full focus:bg-white focus:text-slate-900 focus:text-13 focus:font-semibold">
              Next slide
            </button>
          </div>

          <footer className="absolute inset-x-0 bottom-0 z-20 px-5 flex items-center justify-center gap-3" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            {isLast && (
              <button
                type="button"
                onClick={dismiss}
                className="flex-1 h-12 rounded-full text-15 font-semibold text-white bg-white/20 active:scale-[0.98] transition-transform"
              >
                Done
              </button>
            )}
            <button
              type="button"
              onClick={() => setSharing(true)}
              aria-label={isLast ? 'Share your Wrapped' : 'Share this slide'}
              className={`${isLast ? 'flex-[1.4]' : 'px-6'} h-12 rounded-full flex items-center justify-center gap-2 text-15 font-semibold bg-white active:scale-[0.98] transition-transform shadow-[0_8px_20px_rgba(0,0,0,0.2)]`}
              style={{ color: pal.deepInk }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 15V4M8 8l4-4 4 4M6 12H5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-1" />
              </svg>
              Share
            </button>
          </footer>

          <ShareSheet
            open={sharing}
            onClose={() => setSharing(false)}
            id={id}
            recap={recap}
            currency={currency}
            pal={pal}
            tone={tones[at]}
            name={name}
            z={40}
          />

          <p className="sr-only" aria-live="polite">
            Slide {at + 1} of {ids.length}: {SLIDE_NAMES[/** @type {keyof typeof SLIDE_NAMES} */ (id)] ?? ''}{userPaused ? ', paused' : ''}
          </p>
        </motion.div>
      </div>
    </MotionConfig>,
    document.body,
  )
}
