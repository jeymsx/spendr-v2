import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { fmt } from '../../lib/money'

/**
 * Where money came from and where it went, as a flow: the sources on the
 * left, one node in the middle for all of it, what it went on at the right,
 * each band as thick as its share.
 *
 * Both sides add up to the middle - the caller balances them (money drawn
 * from savings on the left when more went out than came in; what was kept
 * on the right when less did). One scale for both columns, so a band is the
 * same thickness at both of its ends.
 *
 * Drawn as plain SVG at the container's measured width, so its text never
 * stretches. Hovering a node or a band picks out its path.
 *
 * @typedef {{name: string, value: number, color: string}} FlowNode
 * @param {{sources: FlowNode[], targets: FlowNode[], middle: string, height?: number, currency?: string}} props
 */
export default function Sankey({ sources, targets, middle, height = 380, currency }) {
  const box = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [width, setWidth] = useState(900)
  const [hot, setHot] = useState(/** @type {string|null} */ (null))
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

  const layout = useMemo(() => {
    const NODE = 8
    const GAP = 12
    const TOP = 24
    const BOTTOM = 12
    const LABEL = 160
    /* A label is two lines, 34px from one's middle to the next's. */
    const SLOT = 34
    const total = Math.max(sources.reduce((s, n) => s + n.value, 0), targets.reduce((s, n) => s + n.value, 0), 1)
    const inner = height - TOP - BOTTOM
    const scale = Math.min(
      (inner - GAP * Math.max(0, sources.length - 1)) / total,
      (inner - GAP * Math.max(0, targets.length - 1)) / total,
    )

    /* Each node sits beside its own label, always. A column of thin nodes -
       a long tail of small categories over three months - would put their
       labels closer than a label is tall; rather than push the labels off
       their nodes (which left them naming the wrong colours), the nodes
       themselves move apart until each label fits beside its node, and
       the chart grows taller when the column needs it. The bands bend to
       follow; their thickness never changes. */
    /** @param {FlowNode[]} list */
    const stack = (list) => {
      const out = []
      let y = 0
      for (let i = 0; i < list.length; i++) {
        const h = Math.max(1.5, list[i].value * scale)
        if (i > 0) {
          const prev = out[i - 1]
          y = Math.max(prev.y + prev.h + GAP, prev.y + prev.h / 2 + SLOT - h / 2)
        }
        out.push({ y, h })
      }
      const span = out.length ? out[out.length - 1].y + out[out.length - 1].h : 0
      return { out, span }
    }
    const ls = stack(sources)
    const rs = stack(targets)
    const midH = total * scale
    const tall = Math.max(height, TOP + BOTTOM + Math.max(ls.span, rs.span, midH) + SLOT / 2)
    const room = tall - TOP - BOTTOM

    const leftX = LABEL
    const rightX = width - LABEL - NODE
    const midX = (leftX + rightX) / 2 - NODE / 2
    const midY = TOP + (room - midH) / 2

    /** @param {FlowNode[]} list @param {{out: {y: number, h: number}[], span: number}} st @param {number} x @param {'left'|'right'} side */
    const column = (list, st, x, side) => {
      const top = TOP + (room - st.span) / 2
      let my = midY
      return list.map((n, i) => {
        const { y, h } = st.out[i]
        const band = Math.max(1, n.value * scale)
        const node = { ...n, x, y: top + y, h, my, band, pct: (n.value / total) * 100, side, ly: top + y + h / 2 }
        my += band
        return node
      })
    }
    return { NODE, total, midX, midY, midH, tall, left: column(sources, ls, leftX, 'left'), right: column(targets, rs, rightX, 'right') }
  }, [sources, targets, width, height])

  const { NODE, total, midX, midY, midH, tall, left, right } = layout

  /** A band between two vertical spans, as a filled curve. */
  const band = (/** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ x1, /** @type {number} */ y1, /** @type {number} */ h) => {
    const c = (x0 + x1) / 2
    return `M${x0},${y0} C${c},${y0} ${c},${y1} ${x1},${y1} L${x1},${y1 + h} C${c},${y1 + h} ${c},${y0 + h} ${x0},${y0 + h} Z`
  }
  const dim = (/** @type {string} */ name) => (hot && hot !== name ? 0.25 : 1)

  return (
    <div ref={box} className="w-full select-none" onMouseLeave={() => setHot(null)}>
      <svg width={width} height={tall} role="img" aria-label={`${middle}: ${fmt(total, currency)}`}>
        {left.map(n => (
          <path key={`l-${n.name}`} d={band(n.x + NODE, n.y, midX, n.my, n.band)} fill={n.color} fillOpacity={0.3 * dim(n.name)}
            onMouseEnter={() => setHot(n.name)}>
            <title>{`${n.name}: ${fmt(n.value, currency)}`}</title>
          </path>
        ))}
        {right.map(n => (
          <path key={`r-${n.name}`} d={band(midX + NODE, n.my, n.x, n.y, n.band)} fill={n.color} fillOpacity={0.3 * dim(n.name)}
            onMouseEnter={() => setHot(n.name)}>
            <title>{`${n.name}: ${fmt(n.value, currency)}`}</title>
          </path>
        ))}

        <rect x={midX} y={midY} width={NODE} height={midH} rx={3} fill="var(--d-text-2)" />
        <text x={midX + NODE / 2} y={midY - 10} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--d-text)">
          {middle} · <tspan className="d-num">{fmt(total, currency)}</tspan>
        </text>

        {[...left, ...right].map(n => (
          <g key={`${n.side}-${n.name}`} opacity={dim(n.name)} onMouseEnter={() => setHot(n.name)}>
            <rect x={n.x} y={n.y} width={NODE} height={n.h} rx={3} fill={n.color} />
            <text x={n.side === 'left' ? n.x - 10 : n.x + NODE + 10} y={n.ly - 3} textAnchor={n.side === 'left' ? 'end' : 'start'}
              fontSize="13" fontWeight="600" fill="var(--d-text)">{n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name}</text>
            <text x={n.side === 'left' ? n.x - 10 : n.x + NODE + 10} y={n.ly + 13} textAnchor={n.side === 'left' ? 'end' : 'start'}
              fontSize="12" fill="var(--d-text-3)" className="d-num">{fmt(n.value, currency)} · {n.pct < 1 ? '<1' : Math.round(n.pct)}%</text>
          </g>
        ))}
      </svg>
    </div>
  )
}
