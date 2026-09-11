import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'

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
 *
 * ── Both axes ──
 *
 * `axis="x"` does the same thing sideways, for the rails: a row of colour
 * swatches that runs to the screen edge is cut off mid-circle, and a circle
 * sliced down the middle reads as broken rather than as continuing. Same
 * reasoning as the vertical case, same dynamic depth - no fade at the end you
 * have reached, so the row never implies swatches that are not there.
 */
const FadeScroller = forwardRef(function FadeScroller({
  children,
  className = '',
  fade = 28,
  /** 'y' for a list, 'x' for a rail. */
  axis = 'y',
  style,
  ...rest
}, forwardedRef) {
  const ref = useRef(null)
  const frame = useRef(0)
  // `start`/`end` rather than top/bottom: the same two numbers serve both axes.
  const [edge, setEdge] = useState({ start: 0, end: 0 })
  const horizontal = axis === 'x'

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = horizontal
      ? el.scrollWidth - el.clientWidth
      : el.scrollHeight - el.clientHeight
    const pos = horizontal ? el.scrollLeft : el.scrollTop
    // 1px rather than 0: sub-pixel layout leaves a scroll size a hair over the
    // client size on lists that visibly do not scroll.
    if (max <= 1) {
      setEdge(prev => (prev.start === 0 && prev.end === 0 ? prev : { start: 0, end: 0 }))
      return
    }
    const next = {
      start: Math.round(Math.min(fade, Math.max(0, pos))),
      end: Math.round(Math.min(fade, Math.max(0, max - pos))),
    }
    setEdge(prev => (prev.start === next.start && prev.end === next.end ? prev : next))
  }, [fade, horizontal])

  const onScroll = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => { frame.current = 0; measure() })
  }, [measure])

  /* The scrolling node itself is the forwarded handle, for a caller that has
     to measure it - the swatch rails scroll their selection into view. Via
     useImperativeHandle rather than assigning someone else's ref object
     ourselves, which is what the immutability rule is there to stop. */
  useImperativeHandle(forwardedRef, () => ref.current, [])

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

  const mask = `linear-gradient(to ${horizontal ? 'right' : 'bottom'}, `
    + `transparent 0px, #000 ${edge.start}px, `
    + `#000 calc(100% - ${edge.end}px), transparent 100%)`

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className={`${horizontal ? 'overflow-x-auto' : 'overflow-y-auto'} no-scrollbar ${className}`}
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
})

export default FadeScroller
