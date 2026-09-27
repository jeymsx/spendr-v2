import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePresence } from 'motion/react'
import Divider from './Divider'
import { cx } from './cx'
import { EASE_EXIT, EASE_MOVE, EASE_OUT, prefersReducedMotion } from './motion'

/**
 * Rows that arrive and leave, instead of appearing and vanishing.
 *
 * ── Three ways in ──
 *
 *   'expand'  a row added while you are looking at the list - an undo, a
 *             quick log, a template - opens its own height, and the rows
 *             under it move down to make room rather than jumping.
 *   'rise'    a row added somewhere else - you logged it on the add screen
 *             and came back - is already in its place when the list draws,
 *             so nothing needs to move. It resolves out of a short blur.
 *   'none'    everything else: a first visit, a filter, a search, "Load
 *             more". A list that animated every time its view changed
 *             would be a list you wait for.
 *
 * Leaving is always the same: the row fades and blurs out while its height
 * closes, and the rows under it close the gap.
 *
 * ── Why AnimatePresence, and nothing else from Motion ──
 *
 * A removed row has to stay rendered until it has finished leaving, and
 * AnimatePresence is the proven way to hold it there - re-adding a row
 * mid-exit, stacked removals, unmounting mid-flight. The animation itself is
 * the browser's own (element.animate), so the engine that animates the recap
 * stays out of the first download.
 *
 * ── Clipped only while it moves ──
 *
 * Height has to be clipped while it changes, but not afterwards: a day's
 * group wraps its card, and in dark mode that card's 16px shadow would be
 * sliced off at the group's edge for good.
 */

const EMPTY = new Set()

/** Height and clip for the length of the animation, then hand back. */
function clipDuring(el, animations) {
  const before = el.style.overflow
  el.style.overflow = 'hidden'
  const done = () => { el.style.overflow = before }
  Promise.all(animations.map(a => a.finished)).then(done, done)
}

/**
 * The element's full height as keyframes, padding included. With border-box
 * sizing `height: 0` still leaves the padding showing - a day group closed to
 * its 4px of bottom padding and then vanished from there.
 *
 * @param {HTMLElement} el
 */
function openBox(el) {
  const cs = getComputedStyle(el)
  return {
    height: `${el.getBoundingClientRect().height}px`,
    paddingTop: cs.paddingTop,
    paddingBottom: cs.paddingBottom,
  }
}
const SHUT = { height: '0px', paddingTop: '0px', paddingBottom: '0px' }

/** Whether to animate at all: not under reduced motion, and not where the
 *  browser has no element.animate (jsdom, very old WebViews) - there a row
 *  that leaves goes at once rather than throwing on its way out. */
function canAnimate(el) {
  return typeof el.animate === 'function' && !prefersReducedMotion()
}

/**
 * One row, or one group of rows, inside an <AnimatePresence>.
 *
 * `appear` is read once, when the row mounts: a row that has been on screen
 * does not arrive again because a later render still calls it new.
 *
 * @param {{appear?: 'none'|'expand'|'rise', className?: string, children: any}} props
 */
export function PresenceItem({ appear = 'none', className = '', children }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [isPresent, safeToRemove] = usePresence()
  const [arrival] = useState(appear)

  // In. A layout effect, so the first painted frame is already the start.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || arrival === 'none' || !canAnimate(el)) return
    if (arrival === 'expand') {
      const open = el.animate([SHUT, openBox(el)], { duration: 340, easing: EASE_MOVE })
      const show = el.animate(
        [{ opacity: 0, filter: 'blur(4px)' }, { opacity: 1, filter: 'blur(0px)' }],
        { duration: 260, delay: 60, easing: EASE_OUT, fill: 'backwards' },
      )
      clipDuring(el, [open, show])
      return () => { open.cancel(); show.cancel() }
    }
    /* A beat after the page itself has drawn, so the row is seen arriving
       rather than already there by the time the eye gets to it. */
    const rise = el.animate(
      [
        { opacity: 0, transform: 'translateY(8px)', filter: 'blur(6px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ],
      { duration: 480, delay: 160, easing: EASE_OUT, fill: 'backwards' },
    )
    return () => rise.cancel()
  }, [arrival])

  // Out.
  useEffect(() => {
    if (isPresent) return
    const el = ref.current
    if (!el || !canAnimate(el)) { safeToRemove?.(); return }
    const box = openBox(el)
    const fade = el.animate(
      [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(4px)' }],
      { duration: 180, easing: EASE_EXIT, fill: 'forwards' },
    )
    const close = el.animate([box, SHUT], { duration: 320, easing: EASE_MOVE, fill: 'forwards' })
    clipDuring(el, [fade, close])
    close.finished.then(() => safeToRemove?.(), () => {})
    return () => { fade.cancel(); close.cancel() }
  }, [isPresent, safeToRemove])

  return <div ref={ref} className={className}>{children}</div>
}

/**
 * The hairline between two rows, as part of the row above it - so it leaves
 * with that row, and when the last row goes the one above it loses its line
 * over the same 300ms instead of in a frame. Zero height when hidden, so a
 * list's layout is exactly what `{!isLast && <Divider />}` gave.
 *
 * @param {{hidden: boolean, inset?: string}} props
 */
export function RowDivider({ hidden, inset = 'glyph' }) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        'overflow-hidden transition-[height,opacity] duration-300',
        hidden ? 'h-0 opacity-0' : 'h-px',
      )}
    >
      <Divider inset={inset} />
    </div>
  )
}

/** More rows than this changing at once is a restore, a sync or a bulk delete. */
const BULK = 3

/**
 * How each row of a list should arrive, and when the list should simply
 * redraw.
 *
 * `viewKey` names the view - the filters, the search, how many rows are
 * loaded. When it changes, or when more than a few rows change at once,
 * `epoch` moves on: key the AnimatePresence with it and the list redraws in
 * place with nothing animating. Otherwise a row that was not in the last
 * render is 'expand', and on the first render with data, a row this list
 * had not shown before is 'rise' (see unseenIds) - for that view only, so
 * changing a filter does not replay it.
 *
 * State adjusted during render, not a ref read in it or an effect after it:
 * an effect would commit one frame of the new rows without their entrance.
 *
 * @param {{scope: string, ready: boolean, allIds: Array<string|number>,
 *          visibleIds: Array<string|number>, viewKey: string}} o
 *   allIds and visibleIds memoised - their identity is how a change is seen
 * @returns {{epoch: number, arrival: (id: string|number) => 'none'|'expand'|'rise'}}
 */
export function useRowMotion({ scope, ready, allIds, visibleIds, viewKey }) {
  // Loading to loaded is a change of view too: the first rows never animate.
  const key = `${ready ? 1 : 0}\u001d${viewKey}`
  const [s, setS] = useState({ ids: visibleIds, key, epoch: 0, added: EMPTY, fresh: EMPTY, freshEpoch: -1 })
  if (s.ids !== visibleIds || s.key !== key) {
    const before = new Set(s.ids)
    const now = new Set(visibleIds)
    const added = visibleIds.filter(id => !before.has(id))
    const removed = s.ids.filter(id => !now.has(id))
    const bulk = s.key !== key || added.length + removed.length > BULK
    const epoch = bulk ? s.epoch + 1 : s.epoch
    const first = ready && s.freshEpoch === -1
    setS({
      ids: visibleIds,
      key,
      epoch,
      // Same rows in a fresh array - a sync stamping `synced` - adds nothing.
      added: bulk || !added.length ? EMPTY : new Set(added),
      fresh: first ? unseenIds(scope, allIds) : s.fresh,
      freshEpoch: first ? epoch : s.freshEpoch,
    })
  }

  useEffect(() => { if (ready) markSeen(scope, allIds) }, [ready, scope, allIds])

  return {
    epoch: s.epoch,
    // Added beats fresh: an undo that brings a new row back has to open room.
    arrival: (id) => (s.added.has(id) ? 'expand'
      : s.epoch === s.freshEpoch && s.fresh.has(id) ? 'rise'
        : 'none'),
  }
}

/* ── What each list last showed ──────────────────────────────────────────────
   Adding a transaction is its own page, so the list you come back to is a new
   one - it has no previous render to compare with. So the lists remember, for
   the length of the session, which rows they last had on screen; a row that
   was not among them is one you have not seen yet. Shared between the lists
   that show the same rows: a row you saw arrive on Home does not arrive again
   on Transactions.                                                          */
const seen = new Map()

/**
 * Rows not on screen the last time this list was - but only a few. More than
 * that is a restore, a sign-in's first sync, or a first visit, and a whole
 * page of rows arriving at once is noise, not news.
 *
 * @param {string} scope
 * @param {Array<string|number>} ids
 */
export function unseenIds(scope, ids, max = 3) {
  const was = seen.get(scope)
  if (!was) return EMPTY
  const fresh = ids.filter(id => !was.has(id))
  return fresh.length > 0 && fresh.length <= max ? new Set(fresh) : EMPTY
}

/** @param {string} scope @param {Array<string|number>} ids */
export function markSeen(scope, ids) {
  seen.set(scope, new Set(ids))
}
