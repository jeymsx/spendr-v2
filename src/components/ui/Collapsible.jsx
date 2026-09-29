import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import Card from './Card'
import Divider from './Divider'
import { cx } from './cx'
import { EASE_EXIT, EASE_MOVE, EASE_OUT, prefersReducedMotion } from './motion'

/**
 * A card that folds its body away under a row you tap.
 *
 * ── Two shapes, one control ──
 *
 * With only a `header`, the header IS the card: a title, a date and a
 * figure, and the chevron that opens what is in it - a statement's charges
 * under its dates. With a `top` as well, the card leads with that - a figure
 * set large, a bar, a button - and the header becomes a quieter row at the
 * foot of it ("18 charges"), because the card's first job there is the
 * figure, not the list.
 *
 * ── Only what is open is drawn ──
 *
 * A card's rows are made when it opens and let go once it has closed, so a
 * page of twenty closed statements holds twenty headers rather than every
 * charge they ever had. Opening grows the body from nothing while its rows
 * come out of a short blur; closing is the same backwards, and quicker -
 * the way things leave everywhere in the app (ui/motion.js).
 *
 * Reduced motion opens and closes at once.
 *
 * @param {{
 *   open: boolean,
 *   onToggle: () => void,
 *   header: import('react').ReactNode,
 *   top?: import('react').ReactNode,
 *   children: import('react').ReactNode,
 *   label?: string,
 *   className?: string,
 * }} props
 *   header: what the toggle row shows, left of its chevron
 *   top: anything above the toggle row that is not part of it
 *   label: the toggle's name for a screen reader, when the row's own words
 *     would read oddly on their own
 */
export default function Collapsible({ open, onToggle, header, top = null, children, label, className = '' }) {
  const id = useId()
  const bodyId = `${id}-body`
  const headId = `${id}-head`
  return (
    <Card clip className={className}>
      {top}
      {top && <Divider inset="row" />}
      <button
        type="button"
        id={headId}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={label}
        onClick={onToggle}
        className={cx(
          'press press-fade w-full flex items-center gap-3 text-left transition-colors',
          'active:bg-slate-50 dark:active:bg-white/[0.04]',
          top ? 'px-4 py-3' : 'px-4 py-3.5',
        )}
      >
        <span className="flex-1 min-w-0">{header}</span>
        <Chevron open={open} />
      </button>
      <Reveal open={open} id={bodyId} labelledBy={headId}>{children}</Reveal>
    </Card>
  )
}

/** Down when shut, up when open, turning between. @param {{open: boolean}} props */
function Chevron({ open }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className="shrink-0 text-slate-400 dark:text-slate-500 transition-transform duration-300"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transitionTimingFunction: EASE_MOVE }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

/** @param {Element} el */
const canAnimate = (el) => typeof /** @type {any} */ (el).animate === 'function' && !prefersReducedMotion()

/**
 * The body: mounted while open or on its way shut, gone once shut.
 *
 * @param {{open: boolean, id: string, labelledBy: string, children: import('react').ReactNode}} props
 */
function Reveal({ open, id, labelledBy, children }) {
  const box = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [present, setPresent] = useState(open)
  const [entering, setEntering] = useState(false)
  /* What it was last, so only a CHANGE animates: whatever it opens on, it
     opens on at once. A ref compared, not a first-run flag - React's
     development mode runs every effect twice on mount, and a flag cleared by
     the first run let the second animate a card that had not moved. */
  const was = useRef(open)

  useLayoutEffect(() => {
    if (was.current === open) return
    was.current = open
    if (open) {
      // Mounted first; the effect below grows it once it has a height to grow to.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPresent(true)
      setEntering(true)
      return
    }
    const el = box.current
    if (!el || !canAnimate(el)) { setPresent(false); return }
    const from = el.getBoundingClientRect().height
    el.style.overflow = 'hidden'
    // Held shut once there, for the frame before React takes it away.
    const shut = el.animate([{ height: `${from}px` }, { height: '0px' }], { duration: 240, easing: EASE_MOVE, fill: 'forwards' })
    const inner = /** @type {HTMLElement|null} */ (el.firstElementChild)
    const fade = inner?.animate(
      [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(3px)' }],
      { duration: 180, easing: EASE_EXIT, fill: 'forwards' },
    )
    let live = true
    shut.finished.then(() => { if (live) setPresent(false) }, () => { /* reopened on the way */ })
    return () => {
      live = false
      shut.cancel()
      fade?.cancel()
      el.style.overflow = ''
    }
  }, [open])

  useLayoutEffect(() => {
    if (!entering) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntering(false)
    const el = box.current
    if (!el || !canAnimate(el)) return
    const to = el.getBoundingClientRect().height
    el.style.overflow = 'hidden'
    const grow = el.animate([{ height: '0px' }, { height: `${to}px` }], { duration: 300, easing: EASE_MOVE })
    const inner = /** @type {HTMLElement|null} */ (el.firstElementChild)
    inner?.animate(
      [{ opacity: 0, filter: 'blur(4px)' }, { opacity: 1, filter: 'blur(0px)' }],
      { duration: 300, easing: EASE_OUT },
    )
    const done = () => { el.style.overflow = '' }
    grow.finished.then(done, done)
  }, [entering])

  if (!present) return null
  return (
    <div ref={box} id={id} role="region" aria-labelledby={labelledBy}>
      <div>{children}</div>
    </div>
  )
}

const OPEN_PREFIX = 'spendr-open:'

/** @param {string} key @param {boolean} fallback */
function readOpen(key, fallback) {
  try {
    const v = sessionStorage.getItem(OPEN_PREFIX + key)
    return v === '1' ? true : v === '0' ? false : fallback
  } catch {
    return fallback
  }
}

/**
 * Whether a card is open, remembered for the tab's lifetime - so opening a
 * charge to edit it and coming back finds the card as you left it, rather
 * than folded shut again. A new key starts from `fallback`, which is how a
 * card that should open by default (the statement you owe on) does, and why
 * a caller puts in its key whatever should reset that choice.
 *
 * @param {string} key
 * @param {boolean} fallback
 * @returns {[boolean, () => void]}
 */
export function useOpenState(key, fallback) {
  const [state, setState] = useState(() => ({ key, open: readOpen(key, fallback) }))
  const open = state.key === key ? state.open : readOpen(key, fallback)
  const toggle = useCallback(() => {
    const next = !open
    try { sessionStorage.setItem(OPEN_PREFIX + key, next ? '1' : '0') } catch { /* private mode: this visit only */ }
    setState({ key, open: next })
  }, [key, open])
  return [open, toggle]
}
