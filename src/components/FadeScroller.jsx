import { useRef, useState, useCallback, useEffect } from 'react'

/**
 * A scroll area whose content fades out at whichever edge it runs past.
 *
 * The problem it solves: a plain `overflow-y-auto` clips its content on a dead
 * straight line. Inside a sheet that line lands right under the header, so a
 * half-height row sits there sliced in two, and the list reads as broken
 * rather than as continuing. Native lists never show that edge.
 *
 * The fade is a mask rather than an overlay gradient, and that matters here:
 * an overlay has to be painted in the panel's own background colour to work,
 * and the dark panel is `#111820` while the rows inside it are translucent
 * cards over it - so a solid scrim would be visible as a flat patch the
 * moment either value was retuned. A mask removes the pixels instead, so
 * whatever is behind shows through and there is no colour to keep in step.
 *
 * Masking the scroller is safe in a way that masking a frosted header is not:
 * a mask applies to an element's ENTIRE rendering, so on a blurred header it
 * would fade the text along with the blur. Here the element holds nothing but
 * the rows that are supposed to fade.
 *
 * ── The fade is dynamic, not permanent ──
 *
 * An always-on mask fades the first row even when the list is scrolled to the
 * top, which is worse than the hard edge: it implies content above that is not
 * there. So each edge's fade is `min(fade, distance scrolled past it)` - zero
 * at rest, reaching full depth once you have scrolled that far, and zero again
 * at the far end. Both edges resolve to 0 when the content fits, so a short
 * list gets no mask at all.
 *
 * One rAF per scroll burst: a scroll fires dozens of times per gesture and
 * each measure reads layout.
 */
export default function FadeScroller({
  children,
  className = '',
  fade = 28,
  style,
  ...rest
}) {
  const ref = useRef(null)
  const frame = useRef(0)
  const [edge, setEdge] = useState({ top: 0, bottom: 0 })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    // 1px rather than 0: sub-pixel layout leaves a scrollHeight a hair over
    // clientHeight on lists that visibly do not scroll.
    if (max <= 1) {
      setEdge(prev => (prev.top === 0 && prev.bottom === 0 ? prev : { top: 0, bottom: 0 }))
      return
    }
    const next = {
      top: Math.round(Math.min(fade, Math.max(0, el.scrollTop))),
      bottom: Math.round(Math.min(fade, Math.max(0, max - el.scrollTop))),
    }
    setEdge(prev => (prev.top === next.top && prev.bottom === next.bottom ? prev : next))
  }, [fade])

  const onScroll = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => { frame.current = 0; measure() })
  }, [measure])

  useEffect(() => {
    measure()
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    }
    // The list can change height without a scroll - a sheet opening, an
    // account being added - and the fade has to re-decide whether it is
    // needed at all. Watching the scroller and its content covers both.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => {
      ro.disconnect()
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [measure, children])

  const mask = `linear-gradient(to bottom, transparent 0px, #000 ${edge.top}px, `
    + `#000 calc(100% - ${edge.bottom}px), transparent 100%)`

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className={`overflow-y-auto no-scrollbar ${className}`}
      style={{
        // Safari still wants the prefix, and this ships as a PWA on iOS.
        maskImage: mask,
        WebkitMaskImage: mask,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
