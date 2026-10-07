import { fmt } from '../../lib/money'
import { font, loadFonts, roundRect, toPng } from '../../pages/recap/canvasKit'
import { NODE, bandOf, flowLayout, labelOf, pctOf } from './sankeyLayout'

/**
 * The cash-flow chart as a picture to keep: the same bands, nodes and labels
 * the page draws (sankeyLayout), on a canvas, with its title and the period
 * above it and Spendr's name under it. Drawn at twice the size so the text
 * stays sharp wherever it is sent, in the page's own colours - a dark
 * window gives a dark picture.
 *
 * Drawn on a canvas rather than copied from the page's SVG: an SVG turned
 * into an image cannot see the page's fonts or its colour variables, and
 * came out in a fallback face with black text.
 */

const WIDTH = 1080
const PAD = 44
const HEAD = 86
const FOOT = 52
const SCALE = 2

/**
 * The page's colours as the canvas can use them: a variable, or a colour
 * built from one, read through an element so that it comes back as a colour.
 *
 * @param {string[]} names custom properties, like '--d-text'
 * @returns {Record<string, string>}
 */
function pageColours(names) {
  const probe = document.createElement('span')
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const out = /** @type {Record<string, string>} */ ({})
  for (const n of names) {
    probe.style.color = `var(${n})`
    out[n] = getComputedStyle(probe).color
  }
  probe.remove()
  return out
}

/**
 * @param {{title: string, subtitle: string, middle: string, currency?: string, height?: number,
 *          sources: import('./sankeyLayout').FlowNode[], targets: import('./sankeyLayout').FlowNode[]}} input
 * @returns {Promise<Blob>}
 */
export async function cashFlowImage({ title, subtitle, middle, currency, sources, targets, height = 400 }) {
  const c = pageColours(['--d-panel', '--d-text', '--d-text-2', '--d-text-3', '--d-border'])
  const layout = flowLayout({ sources, targets, width: WIDTH - PAD * 2, height })
  const { total, midX, midY, midH, left, right } = layout
  const nodes = [...left, ...right]
  const rightText = `${middle} ${fmt(total, currency)}`

  await loadFonts([title, subtitle, middle, rightText, 'Spendr', ...nodes.map(n => `${n.name} ${fmt(n.value, currency)} ${pctOf(n.pct)}%`)].join(' '))

  const heightPx = PAD + HEAD + layout.tall + FOOT + PAD / 2
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH * SCALE
  canvas.height = Math.ceil(heightPx * SCALE)
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Could not draw the image.')
  g.scale(SCALE, SCALE)
  g.textBaseline = 'alphabetic'

  g.fillStyle = c['--d-panel']
  g.fillRect(0, 0, WIDTH, heightPx)

  // The title, the period under it, and the total at the far side.
  g.textAlign = 'left'
  g.fillStyle = c['--d-text']
  g.font = font('700', 28)
  g.fillText(title, PAD, PAD + 22)
  g.fillStyle = c['--d-text-3']
  g.font = font('400', 15)
  g.fillText(subtitle, PAD, PAD + 50)
  g.textAlign = 'right'
  g.fillStyle = c['--d-text-2']
  g.font = font('600', 16)
  g.fillText(rightText, WIDTH - PAD, PAD + 22)

  g.save()
  g.translate(PAD, PAD + HEAD)

  // Bands first, under the nodes and their labels.
  for (const n of nodes) {
    g.globalAlpha = 0.3
    g.fillStyle = n.color
    g.fill(new Path2D(bandOf(layout, n)))
  }
  g.globalAlpha = 1

  g.fillStyle = c['--d-text-2']
  roundRect(g, midX, midY, NODE, midH, 3)
  g.fill()
  g.textAlign = 'center'
  g.fillStyle = c['--d-text']
  g.font = font('600', 13)
  g.fillText(`${middle} · ${fmt(total, currency)}`, midX + NODE / 2, midY - 10)

  for (const n of nodes) {
    g.fillStyle = n.color
    roundRect(g, n.x, n.y, NODE, Math.max(1.5, n.h), 3)
    g.fill()
    const x = n.side === 'left' ? n.x - 10 : n.x + NODE + 10
    g.textAlign = n.side === 'left' ? 'right' : 'left'
    g.fillStyle = c['--d-text']
    g.font = font('600', 13)
    g.fillText(labelOf(n.name), x, n.ly + 1)
    g.fillStyle = c['--d-text-3']
    g.font = font('400', 12)
    g.fillText(`${fmt(n.value, currency)} · ${pctOf(n.pct)}%`, x, n.ly + 17)
  }
  g.restore()

  // A hairline, and who made it.
  const footY = PAD + HEAD + layout.tall + 10
  g.fillStyle = c['--d-border']
  g.fillRect(PAD, footY, WIDTH - PAD * 2, 1)
  g.textAlign = 'left'
  g.fillStyle = c['--d-text-3']
  g.font = font('600', 13)
  g.fillText('Spendr', PAD, footY + 28)
  g.textAlign = 'right'
  g.font = font('400', 12)
  g.fillText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), WIDTH - PAD, footY + 28)

  return toPng(canvas)
}
