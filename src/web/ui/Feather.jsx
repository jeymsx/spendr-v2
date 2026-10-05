import { useEffect, useRef, useState } from 'react'

/**
 * A horizontal rail with soft edges instead of a scrollbar: the side that
 * has more to scroll to fades out, and a side at its end does not.
 *
 * Wraps a phone rail (components/ui/Rail, `overflow-x-auto no-scrollbar`)
 * and watches it - its scroll and its size - to say which ends have more;
 * pro.css draws the fade as a mask (`.d-feather`).
 *
 * @param {{children: import('react').ReactNode, className?: string, size?: number}} props
 */
export default function Feather({ children, className = '', size = 64 }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [edges, setEdges] = useState({ start: true, end: true })
  useEffect(() => {
    const el = /** @type {HTMLElement|null} */ (ref.current?.querySelector('.overflow-x-auto') ?? null)
    if (!el) return
    const read = () => {
      const max = el.scrollWidth - el.clientWidth
      const start = el.scrollLeft <= 1
      const end = el.scrollLeft >= max - 1
      setEdges(e => (e.start === start && e.end === end ? e : { start, end }))
    }
    read()
    el.addEventListener('scroll', read, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    ro?.observe(el)
    return () => { el.removeEventListener('scroll', read); ro?.disconnect() }
  }, [])
  return (
    <div
      ref={ref}
      className={`d-feather ${className}`}
      data-start={edges.start ? 'true' : 'false'}
      data-end={edges.end ? 'true' : 'false'}
      style={/** @type {any} */ ({ '--feather': `${size}px` })}
    >
      {children}
    </div>
  )
}
