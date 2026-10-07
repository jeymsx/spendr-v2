import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { fmt } from '../../lib/money'
import { NODE, bandOf, flowLayout, labelOf, pctOf } from './sankeyLayout'

/**
 * Where money came from and where it went, as a flow: the sources on the
 * left, one node in the middle for all of it, what it went on at the right,
 * each band as thick as its share (the numbers are sankeyLayout's).
 *
 * Drawn as plain SVG at the container's measured width, so its text never
 * stretches. Hovering a node or a band picks out its path and tells the
 * caller (`onHover`, for a readout); pressing one - or Enter on a focused
 * node - hands it to `onSelect` with the point it was pressed at, for a
 * popover to open from. `selected` keeps that one picked out while it is
 * open. The middle node is `id: 'mid'`.
 *
 * @typedef {import('./sankeyLayout').FlowNode} FlowNode
 * @typedef {ReturnType<typeof flowLayout>['left'][number] | {id: 'mid', name: string, value: number, side: 'mid', pct: number, color: string}} PickedNode
 * @param {{sources: FlowNode[], targets: FlowNode[], middle: string, height?: number, currency?: string,
 *          selected?: string|null, onHover?: (node: PickedNode|null) => void,
 *          onSelect?: (node: PickedNode, at: {x: number, y: number}) => void}} props
 */
export default function Sankey({ sources, targets, middle, height = 380, currency, selected = null, onHover, onSelect }) {
  const box = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [width, setWidth] = useState(900)
  const [hover, setHover] = useState(/** @type {string|null} */ (null))
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setWidth(Math.max(480, el.clientWidth))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const layout = useMemo(() => flowLayout({ sources, targets, width, height }), [sources, targets, width, height])
  const { total, midX, midY, midH, tall, left, right } = layout

  const mid = /** @type {PickedNode} */ ({ id: 'mid', name: middle, value: total, side: 'mid', pct: 100, color: 'var(--d-text-2)' })
  const lit = hover ?? selected
  const dim = (/** @type {string} */ id) => (lit && lit !== id && !(lit === 'mid') ? 0.25 : 1)
  const enter = (/** @type {PickedNode} */ n) => { setHover(n.id); onHover?.(n) }
  const leave = () => { setHover(null); onHover?.(null) }
  const press = (/** @type {PickedNode} */ n, /** @type {{x: number, y: number}} */ at) => onSelect?.(n, at)
  /** Enter or Space on a focused node opens it where the node is. */
  const key = (/** @type {PickedNode} */ n) => (/** @type {import('react').KeyboardEvent<SVGGElement>} */ e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    press(n, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }
  const aria = (/** @type {string} */ name, /** @type {number} */ value, /** @type {number} */ pct) =>
    `${name}: ${fmt(value, currency)}, ${pctOf(pct)}%. Press Enter to see what is in it.`

  return (
    <div ref={box} className="d-sankey w-full select-none" onMouseLeave={leave}>
      <svg width={width} height={tall} role="group" aria-label={`${middle}: ${fmt(total, currency)}`}>
        {[...left, ...right].map(n => (
          <path key={`b-${n.id}`} d={bandOf(layout, n)} fill={n.color} fillOpacity={0.3 * dim(n.id)}
            className="d-sankey-hit" style={{ transition: 'fill-opacity 0.15s' }}
            onMouseEnter={() => enter(n)} onClick={(e) => press(n, { x: e.clientX, y: e.clientY })} />
        ))}

        <g className="d-sankey-hit" role="button" tabIndex={0} aria-label={`${middle}: ${fmt(total, currency)}. Press Enter for the summary.`}
          onMouseEnter={() => enter(mid)} onClick={(e) => press(mid, { x: e.clientX, y: e.clientY })} onKeyDown={key(mid)} onFocus={() => enter(mid)} onBlur={leave}>
          {/* A wider target than the 8px bar. */}
          <rect x={midX - 6} y={midY} width={NODE + 12} height={midH} fill="transparent" />
          <rect className="d-sankey-bar" x={midX} y={midY} width={NODE} height={midH} rx={3} fill="var(--d-text-2)" />
          <text x={midX + NODE / 2} y={midY - 10} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--d-text)">
            {middle} · <tspan className="d-num">{fmt(total, currency)}</tspan>
          </text>
        </g>

        {[...left, ...right].map(n => (
          <g key={`n-${n.id}`} className="d-sankey-hit" role="button" tabIndex={0} aria-label={aria(n.name, n.value, n.pct)}
            opacity={dim(n.id)} style={{ transition: 'opacity 0.15s' }}
            onMouseEnter={() => enter(n)} onClick={(e) => press(n, { x: e.clientX, y: e.clientY })} onKeyDown={key(n)} onFocus={() => enter(n)} onBlur={leave}>
            <rect className="d-sankey-bar" x={n.x} y={n.y} width={NODE} height={n.h} rx={3} fill={n.color} />
            <text x={n.side === 'left' ? n.x - 10 : n.x + NODE + 10} y={n.ly - 3} textAnchor={n.side === 'left' ? 'end' : 'start'}
              fontSize="13" fontWeight="600" fill="var(--d-text)">{labelOf(n.name)}</text>
            <text x={n.side === 'left' ? n.x - 10 : n.x + NODE + 10} y={n.ly + 13} textAnchor={n.side === 'left' ? 'end' : 'start'}
              fontSize="12" fill="var(--d-text-3)" className="d-num">{fmt(n.value, currency)} · {pctOf(n.pct)}%</text>
          </g>
        ))}
      </svg>
    </div>
  )
}
