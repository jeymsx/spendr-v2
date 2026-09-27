import { useEffect, useRef } from 'react'
import { prefersReducedMotion, spring } from './motion'

/**
 * Drag a sheet down to put it away.
 *
 * Every sheet drew a grab handle and none of them could be grabbed - the
 * handle promised a gesture the app did not have. This is that gesture:
 * the panel follows the finger 1:1 on the way down, the scrim lightens with
 * it, and on release it either leaves at the speed it was thrown or springs
 * back to where it was.
 *
 * ── Where a drag can start ──
 *
 * From the grab zone - the handle and the title - on every sheet. From
 * anywhere on a sheet that floats, because a floating sheet is by definition
 * one whose contents fit (Sheet.jsx docks anything that has to scroll), so
 * there is no scroll for a vertical drag to be confused with. Never from
 * the body of a docked sheet: that is a list, and a list scrolls.
 *
 * That split is also what touch-action says in index.css: the grab zone is
 * `none` and a floating panel is `pan-x`, so the browser hands us vertical
 * movement instead of claiming it for a scroll and cancelling the pointer.
 * Sideways stays the browser's, for the rails and swipe-to-confirm rows
 * sheets carry.
 *
 * ── What it never takes ──
 *
 * Anything with a gesture of its own: fields (a drag there selects text),
 * sliders, dnd-kit sortables, and whatever opts out with data-sheet-nodrag.
 * Desktop never, where the sheet is a centred modal with no handle.
 *
 * ── How it moves the panel ──
 *
 * With the `translate` property, not `transform`. The panel's enter and exit
 * are CSS animations of `transform`, and desktop centres its modal with one;
 * `translate` composes with both instead of replacing them, so a release
 * that dismisses hands straight over to the exit animation from wherever
 * the finger left the panel. It is only ever written while a drag or its
 * settle is running, and cleared on the next open.
 */

/**
 * Fields, sliders and sortables keep their own gestures - and so does
 * anything that has claimed its touches with touch-action: none: the
 * swipe-to-confirm row every delete and payment sheet carries (inline), a
 * Tailwind `touch-none`, the QR cropper. A swipe that starts a little
 * downward is still that control's swipe, not a drag of the sheet under it.
 */
const OWN_GESTURE =
  'input, textarea, select, [contenteditable="true"], [role="slider"], ' +
  '[aria-roledescription="sortable"], [data-sheet-nodrag], ' +
  '[style*="touch-action: none"], .touch-none, .ReactCrop'
/** Travel before a press becomes a drag. Below it, it is still a tap. */
const SLOP = 8
/** A throw this fast downward dismisses whatever the distance, px/s. */
const FLICK = 650
/** Or a release past this share of the way to the bottom edge. */
const FAR_ENOUGH = 0.3

/**
 * Past its limit a sheet still moves, but less and less - the stretch iOS
 * gives a scroll view at its end. `dim` is how quickly it stiffens.
 */
function stretch(d, dim) {
  return (d * dim * 0.55) / (dim + 0.55 * d)
}

/**
 * px/s over the last ~60ms of samples - the speed at release, not the
 * average. Short enough that a finger which dragged down and then flicked
 * back up is read as going up: over 100ms the drag down still outweighed it.
 */
function speedOf(samples, now) {
  const recent = samples.filter(([t]) => now - t < 60)
  const pts = recent.length >= 2 ? recent : samples.slice(-2)
  if (pts.length < 2) return 0
  const [t0, y0] = pts[0]
  const [t1, y1] = pts[pts.length - 1]
  return t1 > t0 ? ((y1 - y0) / (t1 - t0)) * 1000 : 0
}

/**
 * @param {{
 *   panelRef: {current: HTMLElement|null},
 *   overlayRef: {current: HTMLElement|null},
 *   enabled: boolean,
 *   dismissible: boolean,
 *   dragAll: boolean,
 *   onDismiss?: () => void,
 * }} o
 */
export function useSheetDrag({ panelRef, overlayRef, enabled, dismissible, dragAll, onDismiss }) {
  /* The latest props, for handlers bound once per open. Written in an
     effect rather than during render. */
  const opts = useRef({ dismissible, dragAll, onDismiss })
  useEffect(() => { opts.current = { dismissible, dragAll, onDismiss } })

  useEffect(() => {
    const panel = panelRef.current
    if (!enabled || !panel) return
    const overlay = overlayRef.current

    /* A fresh open. A sheet reopened while its exit was still running is the
       same element, and a drag that dismissed it left it translated off the
       bottom of the screen. */
    panel.style.translate = ''
    if (overlay) { overlay.style.opacity = ''; overlay.style.transition = '' }

    /** @type {null | {id: number, x0: number, y0: number, from: number, live: boolean, dist: number, pts: number[][]}} */
    let g = null
    let y = 0
    let stop = /** @type {null | (() => void)} */ (null)
    let swallowClick = false

    /** From where it rests to fully under the bottom edge. */
    const distance = () => {
      const top = panel.getBoundingClientRect().top - y
      return Math.max(1, window.innerHeight - top)
    }
    const paint = (next, dist) => {
      y = next
      panel.style.translate = next ? `0 ${next}px` : ''
      if (overlay) overlay.style.opacity = next > 0 ? String(Math.max(0, 1 - next / dist)) : ''
    }
    const settled = () => {
      stop = null
      if (overlay) overlay.style.transition = ''
    }

    function onDown(e) {
      if (g || (e.pointerType === 'mouse' && e.button !== 0)) return
      if (document.documentElement.classList.contains('web')) return
      const target = /** @type {Element|null} */ (typeof e.target?.closest === 'function' ? e.target : null)
      if (!target) return
      const inGrab = !!target.closest('[data-sheet-grab]')
      if (!inGrab && (!opts.current.dragAll || target.closest(OWN_GESTURE))) return
      stop?.()
      stop = null
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, from: y, live: false, dist: distance(), pts: [[e.timeStamp, e.clientY]] }
    }

    function onMove(e) {
      if (!g || e.pointerId !== g.id) return
      if (!g.live) {
        const dx = e.clientX - g.x0
        const dy = e.clientY - g.y0
        if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) { g = null; return } // sideways: not ours
        if (Math.abs(dy) < SLOP) return
        g.live = true
        // Measured from here, so the panel does not jump by the slop.
        g.y0 = e.clientY
        try { panel.setPointerCapture(e.pointerId) } catch { /* already released */ }
        if (overlay) overlay.style.transition = 'none'
      }
      g.pts.push([e.timeStamp, e.clientY])
      if (g.pts.length > 8) g.pts.shift()
      const raw = g.from + (e.clientY - g.y0)
      /* Down follows the finger unless the sheet cannot be dismissed right
         now (a save in flight); up only ever stretches. */
      const next = raw >= 0
        ? (opts.current.dismissible ? raw : stretch(raw, 140))
        : -stretch(-raw, 80)
      paint(next, g.dist)
    }

    function release(e, cancelled) {
      if (!g || e.pointerId !== g.id) return
      const gesture = g
      g = null
      if (!gesture.live) return
      // The click a drag ends on is not a tap on whatever is under the finger.
      swallowClick = true
      setTimeout(() => { swallowClick = false }, 0)

      const v = cancelled ? 0 : speedOf(gesture.pts, e.timeStamp)
      const { dismissible: canGo, onDismiss: go } = opts.current
      const leave = canGo && !cancelled &&
        ((v > FLICK && y > 12) || (y > gesture.dist * FAR_ENOUGH && v > -250))
      const reduce = prefersReducedMotion()

      if (leave) {
        const end = gesture.dist + 24
        if (reduce) { paint(end, gesture.dist); go?.(); return }
        let gone = false
        stop = spring({
          // At least a brisk exit, and not so fast it overshoots - which a
          // critically damped spring does when thrown hard at its target.
          from: y, to: end, velocity: Math.min(Math.max(v, 900), 6000), duration: 0.3,
          onUpdate: (val) => {
            paint(val, gesture.dist)
            // Off the screen is gone: close now, not when the spring rests.
            if (!gone && val >= gesture.dist) { gone = true; go?.() }
          },
          onComplete: () => { if (!gone) go?.(); settled() },
        })
        return
      }
      if (reduce) { paint(0, gesture.dist); settled(); return }
      /* Home without passing it. Thrown hard back toward its rest, a
         critically damped spring overshoots - and a docked sheet lifted
         above its rest shows the page under its bottom edge. So the speed
         toward home is capped just under the overshoot point, w * distance. */
      const w = 6.6 / 0.34
      const home = y > 0 ? Math.max(v, -0.9 * w * y) : Math.min(v, -0.9 * w * y)
      stop = spring({
        from: y, to: 0, velocity: home, duration: 0.34,
        onUpdate: (val) => paint(val, gesture.dist),
        onComplete: settled,
      })
    }
    const onUp = (e) => release(e, false)
    const onCancel = (e) => release(e, true)
    const onClick = (e) => {
      if (!swallowClick) return
      e.preventDefault()
      e.stopPropagation()
    }

    panel.addEventListener('pointerdown', onDown)
    panel.addEventListener('pointermove', onMove)
    panel.addEventListener('pointerup', onUp)
    panel.addEventListener('pointercancel', onCancel)
    panel.addEventListener('click', onClick, true)
    return () => {
      panel.removeEventListener('pointerdown', onDown)
      panel.removeEventListener('pointermove', onMove)
      panel.removeEventListener('pointerup', onUp)
      panel.removeEventListener('pointercancel', onCancel)
      panel.removeEventListener('click', onClick, true)
      /* Stopped where it is, not snapped home: if this is the sheet closing,
         the exit animation carries on from exactly here. */
      stop?.()
    }
  }, [enabled, panelRef, overlayRef])
}
