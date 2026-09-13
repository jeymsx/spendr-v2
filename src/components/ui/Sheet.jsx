import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useKeyboardInset } from '../../hooks/useKeyboardInset'
import FadeScroller from '../FadeScroller'
import { cx } from './cx'

/**
 * The bottom sheet, once, instead of 28 times.
 *
 * ── What the 28 copies disagreed about ──
 *
 * Every sheet in this app was assembled by hand from the same parts: a fixed
 * full-screen root, a `.sheet-overlay` scrim, a `.sheet-panel` that slides up,
 * a grab handle, a `closing` flag and a 240ms timeout to let the exit
 * animation play. Counted across the app before this component existed:
 *
 *   role="dialog"        1 of 19 files
 *   Escape closes        9 of 19
 *   scroll locked       11 of 19
 *   floats when it fits  1 of 19
 *   grab handle         24 of 28 panels
 *   scrim             40% / 45% / 50% / 55% / 60% black
 *
 * None of that is a set of decisions. A screen reader announced one of
 * nineteen dialogs as a dialog and the rest as anonymous divs; Escape worked
 * on about half. So this owns all of it, and a sheet cannot be written
 * without it any more.
 *
 * ── The class names are a contract with the desktop layer ──
 *
 * `index.css` restyles `.sheet-panel` into a centred modal under `html.web`,
 * which is how one implementation of each sheet serves both layouts. So this
 * keeps emitting `sheet-overlay`, `sheet-panel` and `sheet-panel-exit`, and
 * keeps the handle as a `w-10 h-1` element, because the desktop rules hide it
 * by that selector. Renaming any of them silently breaks desktop.
 *
 * For the same reason the geometry lives in `.sheet-float` / `.sheet-dock`
 * rather than in a style attribute - see the note above those rules.
 *
 * ── Anatomy ──
 *
 *   handle
 *   title      (optional; what aria-labelledby points at)
 *   children   (the body: scrolls, with FadeScroller's feathered edges)
 *   footer     (optional; pinned, so actions cannot scroll out of reach)
 *
 * The body is a FadeScroller because a plain overflow-y-auto clips content on
 * a dead straight line, and a half-row sliced in two under a header reads as
 * broken rather than as continuing. Its mask resolves to nothing when the
 * content fits, so a short sheet pays nothing for it.
 *
 * ── open is the only source of truth ──
 *
 * The old pattern had every sheet keep its own `closing` flag and call
 * `onClose` 240ms later, so each one routed its Cancel button through a local
 * `close()` helper. Here the parent sets `open` to false; this keeps
 * rendering for the length of the exit animation and then stops. Cancel calls
 * `onClose` like anything else does.
 */

/** Matches .sheet-panel-exit's 0.24s. */
const EXIT_MS = 240

/**
 * Every sheet currently on screen, innermost last.
 *
 * Sheets stack: the account form opens the card designer, the transaction
 * sheet opens a category picker, and both are mounted at once as siblings.
 * Each one binds its key handler to `document`, so without this ONE Escape
 * reached every open sheet and closed them all - dismissing the colour picker
 * threw away the account form behind it, edits and all. Tab was worse: each
 * trap saw focus outside its own panel and yanked it back, so two traps
 * fought over every press and focus never advanced past the inner sheet's
 * first control.
 *
 * A module-level array rather than context: a sheet does not need to know
 * about its ancestors, only whether it is the one on top.
 */
const openSheets = []

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/* The same numbers as .sheet-float: 56px of page left showing above the card
   and a 12px gap below it. They have to agree with that rule, because this is
   what decides whether the rule is used. */
const FLOAT_TOP_MIN = 56
const FLOAT_GAP = 12

export default function Sheet({
  open,
  onClose,
  /** Heading text. Also the sheet's accessible name, via aria-labelledby. */
  title = null,
  /**
   * A control on the title's right - a Delete, a Cancel out of a sub-mode.
   * A separate slot rather than part of `title` so the heading element holds
   * text only: put a button inside the h3 and its label becomes part of the
   * dialog's accessible name.
   */
  titleAction = null,
  /** When there is no visible title, name the dialog for screen readers. */
  ariaLabel = null,
  /** Pinned under the body - a row of actions that must stay reachable. */
  footer = null,
  /** The grab handle. `html.web` hides it on desktop either way. */
  handle = true,
  /**
   * Whether the scrim and Escape can dismiss it. False while a save is in
   * flight: a sheet that is writing a transaction must not vanish from
   * underneath the write.
   */
  dismissible = true,
  /**
   * Stacking order. A prop rather than a constant because it is real
   * information: a confirmation opened from a picker has to sit above it.
   */
  z = 100,
  /** Scrim darkness, 0-100. Deeper for a sheet stacked on another sheet. */
  scrim = 45,
  /**
   * A ref to focus when the sheet opens, instead of the panel.
   *
   * The default is the panel itself, on purpose: focusing a field opens the
   * keyboard, which is the wrong thing to do to someone who only meant to
   * read. But a sheet that exists to take one number - the debt amount, a
   * payment - wants the keyboard immediately, and losing that made those two
   * forms feel broken after the migration.
   */
  initialFocus = null,
  /**
   * A height this sheet insists on - '52dvh' for the account picker, which
   * wants five rows and half of the sixth showing whatever the screen.
   *
   * Setting it also docks the sheet: a panel with a height of its own is one
   * that means to scroll, and a scrolling card standing off the bottom edge
   * is the case the float/dock rule exists to avoid.
   */
  maxHeight = null,
  /**
   * The panel's own background, for a sheet whose contents are cards.
   *
   * The account sorter is a white card list; on Sheet's white panel it went
   * white-on-white in light mode with only a hairline between them. It had
   * its own recessed surface before the migration, and this is how it keeps
   * it. Replaces the default rather than adding to it - two `bg-` utilities
   * in one class list is decided by stylesheet order, not by which came
   * last.
   */
  surface = 'bg-panel',
  className = '',
  bodyClassName = '',
  children,
}) {
  /* 'open' | 'exiting' | 'closed', and it has to be a phase rather than a
     boolean `closing` flag.

     With a flag the exit never played: `open` goes false, the component
     re-renders BEFORE any effect runs, the render sees open false and closing
     false and returns null, and by the time the effect fires there is no
     panel left to animate. Starting at 'open' and only letting the effect
     move it to 'exiting' means that first render still draws the panel, so
     there is something on screen for the animation to happen to. The test
     for this is the one that caught it. */
  const [phase, setPhase] = useState(open ? 'open' : 'closed')
  const [docked, setDocked] = useState(false)
  const panelRef = useRef(null)
  const restoreRef = useRef(null)
  /* Identity in `openSheets`. A ref rather than a value, so the key handler
     closes over something stable. */
  const stackToken = useRef({})
  const titleId = useId()
  /* The last contents seen while open, and the copy shown while closing. See
     the note where `shown` is worked out. */
  const liveRef = useRef(null)
  const [frozen, setFrozen] = useState(null)

  /* A sheet with a height of its own never floats - see the prop's note. */
  const isDocked = docked || !!maxHeight
  const closing = phase === 'exiting'
  useScrollLock(open || closing)

  /* Where the screen actually ends once the keyboard is over it. Hooks run
     unconditionally, above the early return below - this one is cheap when
     no keyboard is open, and a hook behind a condition is a changed hook
     count and a hard React error rather than a glitch. */
  const kb = useKeyboardInset()
  const keyboardOpen = kb.open

  useEffect(() => {
    if (open) {
      /* The rule is right in general and wrong here: an enter/exit animation
         is a phase that has to change when the prop does, and there is no
         render-time value to derive it from - the whole point is that the
         panel outlives `open` by 240ms. */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase('open')
      return
    }
    // A sheet that was never opened has nothing to animate away.
    setPhase(prev => (prev === 'closed' ? 'closed' : 'exiting'))
    const t = setTimeout(() => setPhase('closed'), EXIT_MS)
    return () => clearTimeout(t)
  }, [open])

  /**
   * Float or dock, by measurement.
   *
   * The panel is a flex column with the scrolling body inside it, so the
   * panel's own scrollHeight is useless here - the overflow belongs to the
   * child. The natural height is the chrome (handle, title, footer) plus what
   * the body would like to be: (panelClient - bodyClient) + bodyScroll.
   *
   * One-way, float to dock, and never back while the sheet is open. Docking
   * makes the panel 24px wider, which lets text re-wrap shorter, which can
   * take it back under the threshold - and then it floats, re-wraps taller,
   * and docks again. A latch cannot oscillate.
   */
  useLayoutEffect(() => {
    if (!open) {
      // Cleared so the next open measures fresh rather than inheriting the
      // last sheet's verdict through the latch below.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDocked(false)
      return
    }
    const el = panelRef.current
    const body = el?.querySelector('[data-sheet-body]')
    if (!el || !body) return
    const natural = (el.clientHeight - body.clientHeight) + body.scrollHeight
    const room = window.innerHeight - FLOAT_TOP_MIN - FLOAT_GAP
    setDocked(prev => prev || natural > room)
  }, [open, children, footer, titleAction])

  /* Focus in on open, and back where it came from on close. Without this a
     screen reader stays parked on the button that opened the sheet and a
     keyboard tabs through the page behind it. */
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement
    /* The panel itself, not its first field: focusing an input opens the
       keyboard on a phone, which is the wrong thing to do to someone who
       only meant to read the sheet. `initialFocus` is the opt-out, for a
       sheet that exists to take one number. */
    const target = initialFocus?.current ?? panelRef.current
    target?.focus({ preventScroll: true })
    return () => {
      const back = restoreRef.current
      if (back && typeof back.focus === 'function') back.focus({ preventScroll: true })
    }
  }, [open, initialFocus])

  /* Kept current while the sheet is open. A ref written in an effect, never
     during render. */
  useEffect(() => {
    if (open) liveRef.current = { children, title, titleAction, footer }
  })

  /* Taken at the moment of closing, in a LAYOUT effect so the copy is in
     state before the browser paints - a passive effect would let one frame of
     the caller's cleared content through, which is the flicker this exists to
     stop. */
  useLayoutEffect(() => {
    if (open) return
    setFrozen(liveRef.current)
  }, [open])

  /* Join the stack while open, leave on close - and leave in the cleanup, so
     an unmount mid-animation cannot strand an entry and silence every sheet
     under it. */
  useEffect(() => {
    if (!open) return
    const token = stackToken.current
    openSheets.push(token)
    return () => {
      const i = openSheets.indexOf(token)
      if (i !== -1) openSheets.splice(i, 1)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      // Only the innermost sheet answers. See openSheets.
      if (openSheets.length && openSheets[openSheets.length - 1] !== stackToken.current) return
      if (e.key === 'Escape') {
        if (dismissible) { e.preventDefault(); onClose?.() }
        return
      }
      if (e.key !== 'Tab') return
      // Keep Tab inside the dialog. The page behind is already inert to a
      // pointer; it should be inert to a keyboard too.
      /* Not an offsetParent check: that returns null for every element in
         jsdom and for anything positioned fixed in a browser, so it made the
         trap silently do nothing. `hidden` and an aria-hidden ancestor are
         what actually occur here - these sheets conditionally render rather
         than display:none their controls. */
      const nodes = [...(panelRef.current?.querySelectorAll(FOCUSABLE) ?? [])]
        .filter(n => !n.hasAttribute('hidden') && !n.closest('[aria-hidden="true"]'))
      if (!nodes.length) { e.preventDefault(); return }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement
      const inside = panelRef.current?.contains(active)
      if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault()
        last.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, dismissible, onClose])

  /* Freeze the contents for the length of the exit.

     Sheet keeps rendering for 240ms after `open` goes false, which is what
     lets the panel slide away - but the caller has usually cleared the record
     it was showing in the same breath. Three migrations hit this at once: an
     account form retitled itself "New account" on the way out, a photo
     cropper swapped the photo for its empty state mid-slide, and a delete
     confirmation read "Permanently delete ?".

     So while exiting, show the last contents we had rather than the new ones.
     React elements are immutable descriptors, so holding the previous tree is
     safe, and it is exactly what was on screen when the close started.

     The copy lives in STATE rather than in a ref read during render: a ref
     read at render time taints every value derived from it as far as the
     compiler is concerned, and it is right to - the render would not re-run
     when the ref changed. The ref here is only ever written and read inside
     effects. */
  const live = { children, title, titleAction, footer }
  const shown = open ? live : (frozen ?? live)

  if (!open && phase === 'closed') return null

  /* Docked, the panel is flush with the bottom of the screen, so the last
     thing in it has to clear the home indicator itself. Floating, the panel
     already stands that far off the edge and adding it again reads as a hole
     under the buttons. */
  /* 24px docked, which is what every hand-rolled panel used before the
     migration - 20px quietly shaved 4px off the bottom of all of them. */
  const bottomPad = isDocked ? 'pb-[max(24px,env(safe-area-inset-bottom))]' : 'pb-5'

  /* The container is sized to the VISIBLE screen while a keyboard is up, not
     to the layout viewport - which iOS does not shrink, so `inset-0` alone
     puts the panel's bottom edge behind the keyboard and lets iOS drag the
     whole thing upward to compensate. See hooks/useKeyboardInset.js.

     On the container, never on the panel. `html.web .sheet-panel` sets the
     desktop modal's geometry as a class, and an inline style on the panel
     beats any stylesheet - the note in index.css is about the two commits
     that spent proving it. The panel is absolute inside this box, so moving
     the box moves the panel with nothing overridden.

     Nothing is written at all unless a keyboard is actually open, so desktop
     and every browser without visualViewport render exactly the markup they
     rendered before. */
  return (
    <div
      className="fixed inset-0"
      style={keyboardOpen
        ? { zIndex: z, top: kb.top, height: kb.height, bottom: 'auto' }
        : { zIndex: z }}
    >
      <div
        className="sheet-overlay absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: `rgba(0,0,0,${scrim / 100})` }}
        onClick={dismissible ? onClose : undefined}
      />

      <div
        ref={panelRef}
        style={maxHeight ? { '--sheet-max': maxHeight } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={shown.title ? titleId : undefined}
        aria-label={!shown.title && ariaLabel ? ariaLabel : undefined}
        tabIndex={-1}
        className={cx(
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          isDocked ? 'sheet-dock' : 'sheet-float',
          'absolute flex flex-col outline-none',
          surface,
          isDocked
            ? 'border-t border-slate-100 dark:border-white/[0.07]'
            : 'border border-slate-100 dark:border-white/[0.07] shadow-[0_18px_50px_rgba(0,0,0,0.22)]',
          className,
        )}
      >
        {handle && (
          /* w-10 h-1 exactly: html.web hides the handle by that selector. */
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mt-4 mb-3 shrink-0" />
        )}

        {shown.title && (
          <div className="shrink-0 flex items-center justify-between gap-3 px-5 pb-3">
            <h3 id={titleId} className="text-[17px] font-semibold text-slate-900 dark:text-white">
              {shown.title}
            </h3>
            {shown.titleAction}
          </div>
        )}

        <FadeScroller
          data-sheet-body=""
          className={cx('flex-1 min-h-0 px-5', !shown.footer && bottomPad, bodyClassName)}
        >
          {shown.children}
        </FadeScroller>

        {shown.footer && (
          <div className={cx('shrink-0 px-5 pt-3', bottomPad)}>
            {shown.footer}
          </div>
        )}
      </div>
    </div>
  )
}
