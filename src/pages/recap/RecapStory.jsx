import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MotionConfig, animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { recapSlides, wrappedTitle } from '../../lib/recapCopy'
import { parseMonth } from '../../lib/recap'
import { useScrollLock } from '../../hooks/useScrollLock'
import { keepTabInside } from '../../components/ui/focus'
import { EXIT, SLIDE_MS, SPRING, recapPalette, tonesFor } from './theme'
import { SlideContext, useBox } from './parts'
import { Logo } from './art'
import Deck from './Deck'
import Dial from './Dial'
import {
  BadgesSlide, BiggestSlide, BudgetsSlide, CategoriesSlide, DaysSlide, GoToSlide,
  IntroSlide, KeptSlide, NetWorthSlide, SpentSlide,
} from './slides'
import SummarySlide from './SummarySlide'

/**
 * The monthly recap, as a story: "August Wrapped", one card at a time,
 * moving on by itself.
 *
 * ── What is on screen ──
 *
 * The app's own backdrop under an accent wash; the Spendr mark and the
 * story's name above; the deck of cards (Deck) in the middle, in the accent's
 * tones; and the chapter dial and the controls (Dial) below. Everything is
 * drawn from the accent you chose - on Azure it is blues, on Honey golds -
 * the way the net-worth card on Home is (theme.js).
 *
 * ── How it is driven ──
 *
 *   tap the right of a card      next      tap the left    back
 *   swipe left or right          the same  drag down       close
 *   hold a card or a chart       pause
 *   the dial and the buttons     jump, back, play/pause, forward
 *   arrow keys, Escape           the same from a keyboard; Space pauses
 *
 * Autoplay also stops for the pause button, while the tab is hidden, and on
 * the last slide, which waits for you. Touching a chart gives its slide its
 * full time again. Reduced motion keeps every slide and every figure: the
 * cards change places at once instead of flying, and nothing loops.
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
 * The slide's clock and the drag-down are motion values written straight to
 * the DOM, so a finger dragging the story or the clock ticking never renders
 * the card underneath again.
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

/** A tap is short and still; anything else is a hold, a swipe or a drag. */
const TAP_MS = 250
const TAP_SLOP = 10
const SWIPE = 48
const CLOSE_DRAG = 90

/** Space and Enter belong to a focused control, not to the story. */
const OWNS_KEYS = 'button, a[href], input, select, textarea'

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
 * @param {{recap: import('../../lib/recap').Recap, currency: string, accent: string, theme: 'light'|'dark',
 *          name?: string, onClose: () => void}} props
 */
export default function RecapStory({ recap: opened, currency, accent, theme, name, onClose }) {
  /* The month as it was when the story opened. A sync landing mid-story
     would otherwise rebuild the slides under the person reading them - and
     throw away the summary picture already drawn for them. */
  const [recap] = useState(opened)
  const ids = useMemo(() => recapSlides(recap), [recap])
  const pal = useMemo(() => recapPalette(accent, theme), [accent, theme])
  const tones = useMemo(() => tonesFor(ids).map(t => pal.tones[t]), [ids, pal])
  const title = wrappedTitle(recap.month)
  const { year } = parseMonth(recap.month)
  const reduce = useReducedMotion()

  /* Where the story is, and which way it last moved - the deck throws a card
     off to the left going forward, and brings it back from there going back. */
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
  const [userPaused, setUserPaused] = useState(false)
  const next = useCallback(() => setNav(n => (n.index >= ids.length - 1 ? n : { index: n.index + 1, dir: 1 })), [ids.length])
  const prev = useCallback(() => setNav(n => (n.index <= 0 ? n : { index: n.index - 1, dir: -1 })), [])
  const jump = useCallback((/** @type {number} */ i) => setNav(n => (i === n.index ? n : { index: i, dir: i > n.index ? 1 : -1 })), [])
  const replay = useCallback(() => { setUserPaused(false); setNav({ index: 0, dir: -1 }) }, [])
  // Before paint, so a new slide's ring never shows the last one's full circle.
  useLayoutEffect(() => { progress.set(isLast ? 1 : 0) }, [at, isLast, progress])

  // ── Holding still ──
  const [fingerDown, setFingerDown] = useState(false)
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

  // ── Autoplay: the ring is the clock ──
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

  // ── Touch: tap, hold, swipe, drag down ──
  /* One finger at a time: a second one landing mid-hold is ignored rather
     than taken for a new tap. The pointer is captured, so a drag that ends
     off the stage - or off the window, with a mouse - still ends here. The
     story only starts to follow the finger down once it has moved further
     than a tap may, so a still hold does not jiggle it. */
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

  const [stageRef, stage] = useBox()
  // One context per card, made once: a fresh object per render would render
  // every slide again on every tap and hold.
  const contexts = useMemo(() => tones.map(tone => ({ pal, tone, currency, hold })), [tones, pal, currency, hold])
  const face = useCallback((/** @type {string} */ sid, /** @type {number} */ i) => {
    const Slide = SLIDES[/** @type {keyof typeof SLIDES} */ (sid)]
    return (
      <SlideContext.Provider value={contexts[i]}>
        {sid === 'summary'
          ? <SummarySlide recap={recap} name={name} onDone={dismiss} />
          : Slide && <Slide recap={recap} name={name} />}
      </SlideContext.Provider>
    )
  }, [contexts, recap, name, dismiss])

  const screen = theme === 'dark' ? '#0b0f14' : '#f8fafc'

  return createPortal(
    <MotionConfig reducedMotion="user">
      {/* design-ok: a full-screen story, not a sheet. It owns the whole
          viewport, its own backdrop and a drag-down close; Sheet's docked
          panel, handle and scrim are the opposite of that. */}
      <div className="fixed inset-0 z-[500]" style={{ background: pal.backdrop, touchAction: 'none', overscrollBehavior: 'none' }}>
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          /* A phone's width at most: on a tablet or a desktop the story is a
             column on its own backdrop, as a story is, not a card stretched
             across the screen. */
          className="absolute inset-0 mx-auto w-full max-w-[440px] flex flex-col select-none outline-none"
          style={{ y, opacity }}
        >
          <header className="px-4" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
            <div className="h-12 flex items-center gap-2.5">
              <Logo size={30} />
              <p className="flex-1 min-w-0 truncate text-15 font-semibold" style={{ color: pal.chrome }}>
                {title} <span className="font-medium" style={{ color: pal.chromeMuted }}>{year}</span>
              </p>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Close recap"
                className="w-10 h-10 -mr-1.5 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                style={{ color: pal.chrome, backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.06)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </header>

          <main
            ref={stageRef}
            className="relative flex-1 min-h-0 mx-4 mt-1 mb-3"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            {stage.w > 0 && (
              <Deck
                ids={ids}
                tones={tones}
                at={at}
                dir={nav.dir}
                width={stage.w}
                height={stage.h}
                screen={screen}
                dark={theme === 'dark'}
                face={face}
              />
            )}
          </main>

          <Dial
            ids={ids}
            at={at}
            pal={pal}
            progress={progress}
            userPaused={userPaused}
            isLast={isLast}
            onJump={jump}
            onPrev={prev}
            onNext={next}
            onToggle={() => setUserPaused(p => !p)}
            onReplay={replay}
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
