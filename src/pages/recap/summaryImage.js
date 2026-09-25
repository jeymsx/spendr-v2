import { summaryHero, summaryRows } from '../../lib/recapCopy'
import { monthName, parseMonth } from '../../lib/recap'

/**
 * The recap's summary, as a picture to keep or send.
 *
 * Drawn on a canvas by hand rather than by screenshotting the DOM: a DOM
 * capture depends on the browser's foreignObject support, which is exactly
 * where iOS Safari is least reliable, and a missing font or a half-loaded
 * image comes out as a blank rectangle with no error. A canvas draws what it
 * is told, every time, in the same flat colours as the slide.
 *
 * 1080 x 1350: the 4:5 portrait every messaging app and feed shows whole.
 * The layout mirrors the story's own opening and closing slides - whose
 * month, which month, what was spent - and its colours are the summary
 * card's own, so the picture reads as the card it was saved from.
 */

const W = 1080
const H = 1350
const P = 88
const INNER = W - P * 2

/** @param {number} weight @param {number} size */
const font = (weight, size) => `${weight} ${size}px Inter, sans-serif`

/**
 * Text cut to fit `width` with an ellipsis, in the font already set. Cut by
 * character, not by UTF-16 unit, so an emoji in a category name is dropped
 * whole rather than halved into a replacement box.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {string} text
 * @param {number} width
 */
function clip(g, text, width) {
  if (g.measureText(text).width <= width) return text
  const chars = [...text]
  while (chars.length > 1 && g.measureText(`${chars.join('')}…`).width > width) chars.pop()
  return `${chars.join('').trimEnd()}…`
}

/**
 * Sets the largest size from `max` down to `min` at which `text` fits
 * `width`, and returns what to draw: the text itself, or - when even `min`
 * is too wide - the text cut to fit at `min`.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {string} text
 * @param {number} weight
 * @param {number} max
 * @param {number} min
 * @param {number} width
 */
function fit(g, text, weight, max, min, width) {
  for (let size = max; size > min; size -= 4) {
    g.font = font(weight, size)
    if (g.measureText(text).width <= width) return text
  }
  g.font = font(weight, min)
  return clip(g, text, width)
}

/** @param {CanvasRenderingContext2D} g @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/**
 * @param {object} input
 * @param {import('../../lib/recap').Recap} input.recap
 * @param {string} input.currency
 * @param {import('./theme').Swatch} input.pal
 * @param {string} [input.name]
 * @returns {Promise<Blob>}
 */
export async function renderSummaryImage({ recap, currency, pal, name }) {
  const { year } = parseMonth(recap.month)
  const whose = name ? `${name}'s month` : 'My month'
  const title = monthName(recap.month)
  const hero = summaryHero(recap, currency)
  const rows = summaryRows(recap, currency)

  /* Inter is self-hosted and split by script: the peso sign is in its
     latin-ext file, an accented name may be too, and a file the page has not
     needed yet is not loaded. So load every weight for exactly the text about
     to be drawn - drawn before its file arrives, it silently comes out in a
     fallback font. Settled, not all: offline, a script whose file was never
     cached cannot load, and a picture in a fallback font beats none. */
  const text = [whose, title, hero.label, hero.value, hero.line ?? '', 'Spendr', String(year), ...rows.flatMap(r => [r.label, r.value])].join(' ')
  await Promise.allSettled(['400', '500', '600'].map(w => document.fonts?.load?.(font(w, 40), text)))

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Could not draw the image.')
  g.textBaseline = 'alphabetic'

  g.fillStyle = pal.surface
  g.fillRect(0, 0, W, H)

  // Header: the app, and the year the month belongs to.
  g.fillStyle = pal.ink
  g.font = font(600, 38)
  g.fillText('Spendr', P, P + 38)
  g.fillStyle = pal.muted
  g.font = font(500, 34)
  g.textAlign = 'right'
  g.fillText(String(year), W - P, P + 38)
  g.textAlign = 'left'

  // Whose month, and which.
  g.fillStyle = pal.muted
  g.font = font(500, 38)
  g.fillText(clip(g, whose, INNER), P, 262)
  g.fillStyle = pal.ink
  g.fillText(fit(g, title, 600, 112, 64, INNER), P, 380)

  // What it came to.
  g.fillStyle = pal.muted
  g.font = font(500, 38)
  g.fillText(hero.label, P, 486)
  g.fillStyle = pal.ink
  g.fillText(fit(g, hero.value, 600, 128, 64, INNER), P, 608)
  if (hero.line) {
    g.fillStyle = pal.muted
    g.font = font(400, 36)
    g.fillText(clip(g, hero.line, INNER), P, 668)
  }

  if (rows.length) drawRows(g, rows, pal)

  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not draw the image.'))), 'image/png')
  })
}

/**
 * The card of rows - the same rows as the slide, from summaryRows.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {Array<{label: string, value: string, tone?: 'good'|'soft'}>} rows
 * @param {import('./theme').Swatch} pal
 */
function drawRows(g, rows, pal) {
  const cardTop = 728
  const rowH = 100
  const cardH = rows.length * rowH + 40
  g.fillStyle = pal.bg
  roundRect(g, P - 16, cardTop, W - (P - 16) * 2, cardH, 44)
  g.fill()

  rows.forEach((row, i) => {
    const y = cardTop + 20 + i * rowH + rowH / 2 + 13
    g.fillStyle = pal.muted
    g.font = font(500, 36)
    g.textAlign = 'left'
    g.fillText(row.label, P + 24, y)
    const labelW = g.measureText(row.label).width
    g.fillStyle = row.tone === 'good' ? pal.good : row.tone === 'soft' ? pal.soft : pal.ink
    g.font = font(600, 40)
    g.textAlign = 'right'
    // Whatever the label leaves, less a gap - a long category name is cut,
    // never drawn over its label.
    g.fillText(clip(g, row.value, INNER - 48 - labelW - 40), W - P - 24, y)
    g.textAlign = 'left'
    if (i < rows.length - 1) {
      g.fillStyle = pal.track
      g.fillRect(P + 24, cardTop + 20 + (i + 1) * rowH, W - (P + 24) * 2, 2)
    }
  })
}
