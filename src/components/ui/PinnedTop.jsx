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
 * A page at the top looks exactly as it always did. The frost fades in when
 * the first pixel of content goes beneath the bar, which is what iOS does
 * with a bar's "scroll edge" look, and it is a separate layer for the same
 * reason New account's is (AccountNew.jsx): the blur can feather into the
 * page below while the button and title stay at full strength. Translucent
 * rather than filled, because behind the page there is a gradient, and a
 * solid colour sliding over it reads as a patch.
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
        <div className="pinned-top-frost" aria-hidden="true" />
        {children}
      </div>
    </>
  )
}
