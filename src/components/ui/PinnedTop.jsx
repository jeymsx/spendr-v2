import { useEffect, useRef, useState } from 'react'

/**
 * What stays at the top of a page while the page scrolls under it: the back
 * button and the title, as an iPhone app's navigation bar stays.
 *
 * ── Why ──
 *
 * The header scrolled away with everything else. Sixty transactions down an
 * account page the way back was 1,184px above the screen and nothing said
 * which account this was; the edge swipe was the only way out, and only in
 * the installed app.
 *
 * ── Clear at rest, frosted once something is under it ──
 *
 * A page at the top looks exactly as it always did. Once the first pixel of
 * content goes beneath the bar, the frost fades in and the row tightens a
 * little towards the status bar - an iPhone's own scroll edge, as Settings
 * draws it. No hairline: the blur feathers out into the page instead, in two
 * layers so it thins gradually rather than stopping (index.css .pinned-top).
 * They are layers of their own, beside the button and title rather than
 * behind them in one box, so those stay at full strength. Translucent rather
 * than filled, because behind the page there is a gradient, and a solid
 * colour sliding over it reads as a patch.
 *
 * The edge it watches is a sentinel above the bar, not a scroll listener:
 * the page may scroll in the phone's main column, a desktop pane or a sheet,
 * and an IntersectionObserver neither knows nor cares which.
 *
 * The desktop keeps its own chrome: html.web leaves the bar in the flow and
 * draws no frost (index.css).
 *
 * @param {{children: import('react').ReactNode, className?: string}} props
 */
export default function PinnedTop({ children, className = '' }) {
  const edge = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [under, setUnder] = useState(false)

  useEffect(() => {
    const el = edge.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    /* The sentinel is 4px tall, so the frost waits for a scroll you meant
       rather than a pixel of rubber band. */
    const io = new IntersectionObserver(([e]) => setUnder(e.intersectionRatio === 0))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <>
      <div ref={edge} className="h-1 -mb-1" aria-hidden="true" />
      <div className={`pinned-top ${className}`} data-under={under ? '' : undefined}>
        <div className="pinned-top-haze" aria-hidden="true" />
        <div className="pinned-top-frost" aria-hidden="true" />
        {children}
      </div>
    </>
  )
}
