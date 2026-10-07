/**
 * Where everything in a cash-flow chart goes: the sources down the left, one
 * node in the middle for all of it, what it went on down the right, each band
 * as thick as its share. Plain numbers - the chart on the page draws them as
 * SVG (Sankey.jsx) and the snapshot draws them on a canvas (sankeyImage.js),
 * so the two cannot disagree about where a band runs.
 *
 * Both sides add up to the middle - the caller balances them (money drawn
 * from savings on the left when more went out than came in; what was kept
 * on the right when less did). One scale for both columns, so a band is the
 * same thickness at both of its ends.
 *
 * @typedef {{id?: string, name: string, value: number, color: string}} FlowNode
 */

export const NODE = 8
const GAP = 12
const TOP = 24
const BOTTOM = 12
export const LABEL = 160
/* A label is two lines, 34px from one's middle to the next's. */
const SLOT = 34

/**
 * @template {FlowNode} T
 * @param {{sources: T[], targets: T[], width: number, height: number}} input
 */
export function flowLayout({ sources, targets, width, height }) {
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

  /**
   * @param {T[]} list @param {{out: {y: number, h: number}[], span: number}} st
   * @param {number} x @param {'left'|'right'} side
   */
  const column = (list, st, x, side) => {
    const top = TOP + (room - st.span) / 2
    let my = midY
    return list.map((n, i) => {
      const { y, h } = st.out[i]
      const band = Math.max(1, n.value * scale)
      const node = { ...n, id: n.id ?? n.name, x, y: top + y, h, my, band, pct: (n.value / total) * 100, side, ly: top + y + h / 2 }
      my += band
      return node
    })
  }
  return { NODE, total, midX, midY, midH, tall, left: column(sources, ls, leftX, 'left'), right: column(targets, rs, rightX, 'right') }
}

/** A band between two vertical spans, as a filled curve. */
export function bandPath(/** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ x1, /** @type {number} */ y1, /** @type {number} */ h) {
  const c = (x0 + x1) / 2
  return `M${x0},${y0} C${c},${y0} ${c},${y1} ${x1},${y1} L${x1},${y1 + h} C${c},${y1 + h} ${c},${y0 + h} ${x0},${y0 + h} Z`
}

/** The band a laid-out node draws, between it and the middle. @param {ReturnType<typeof flowLayout>} layout @param {{side: 'left'|'right', x: number, y: number, my: number, band: number}} n */
export function bandOf(layout, n) {
  return n.side === 'left'
    ? bandPath(n.x + NODE, n.y, layout.midX, n.my, n.band)
    : bandPath(layout.midX + NODE, n.my, n.x, n.y, n.band)
}

/** A node's name, shortened to fit its label. @param {string} name */
export const labelOf = (name) => (name.length > 22 ? `${name.slice(0, 21)}…` : name)

/** A share as the labels give it. @param {number} pct */
export const pctOf = (pct) => (pct < 1 ? '<1' : String(Math.round(pct)))
