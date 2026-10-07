import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { accountBrand } from '../../lib/accountBrands'
import { categoryIcon } from '../CategoryGlyph'
import { svgUrl } from '../glass/glass'
import { H, SAFE_BOTTOM, SAFE_TOP, W, drawEmoji, font, loadFonts, loadImage, roundRect, toPng } from '../../pages/recap/canvasKit'
import { TONE_COLOR } from './NoteView'

/**
 * The note as a picture to keep: the same sentences, figures, tiles, dates
 * and bars the page draws (the same tokens), laid out by hand on a canvas
 * and saved as a PNG, in the page's own colours - a dark window gives a dark
 * picture - with Spendr's name under it.
 *
 * Drawn on a canvas rather than copied from the DOM, for the reason every
 * other picture in the app is (pages/recap/canvasKit.js): an SVG foreignObject
 * cannot see the page's fonts, and where it is least reliable - iOS Safari -
 * a missing font comes out as a blank rectangle with no error. A canvas draws
 * what it is told. The only thing borrowed from React is each category's
 * glyph, which is turned into an SVG string and drawn as an image.
 *
 * Text is broken into words and the inline pieces are measured the same way,
 * so a line breaks where the page's would, give or take a letter: the page
 * tracks its type a hair tighter than a canvas can.
 *
 * @typedef {import('../../lib/standing/tokens').Token} Token
 * @typedef {import('../../lib/standing/compose').Note} Note
 * @typedef {import('./NoteView').Lookups} Lookups
 */

/* 1080 x 1920, a phone screen's shape: what a story is, and what a lock
   screen or a camera roll shows whole. Nothing that needs reading goes above
   SAFE_TOP or below SAFE_BOTTOM, the bands a story's app draws over. */
const WIDTH = W
const PAD = 96
const INNER = WIDTH - PAD * 2
/** The type sizes to try, largest first: the note is drawn as large as fits between the safe bands. */
const SIZES = [60, 56, 52, 48, 44, 40, 36, 32]

/** @param {string} hex a #rrggbb colour @returns {[number, number, number]|null} */
function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** One colour mixed toward another by a share. @param {string} hex @param {[number, number, number]} toward @param {number} amount */
function mix(hex, toward, amount) {
  const c = parseHex(hex) ?? [45, 157, 255]
  return `rgb(${c.map((v, i) => Math.round(v * (1 - amount) + toward[i] * amount)).join(',')})`
}

/** @param {string} hex @param {number} a */
function alpha(hex, a) {
  const c = parseHex(hex) ?? [45, 157, 255]
  return `rgba(${c.join(',')},${a})`
}

/**
 * @typedef {object} Palette
 * @property {string} bg
 * @property {string} grey      the context
 * @property {string} strong    what matters
 * @property {string} faint     a track under a bar
 * @property {string} accent    the accent, as a fill
 * @property {string} accentInk the accent, as text
 * @property {boolean} dark
 */

/** @param {boolean} dark @param {string} accent */
function paletteOf(dark, accent) {
  return dark
    ? { dark, bg: '#05070a', grey: 'rgba(255,255,255,0.55)', strong: '#ffffff', faint: 'rgba(255,255,255,0.2)', accent, accentInk: mix(accent, [255, 255, 255], 0.12) }
    : { dark, bg: '#ffffff', grey: '#64748b', strong: '#0f172a', faint: 'rgba(15,23,42,0.13)', accent, accentInk: mix(accent, [0, 0, 0], 0.28) }
}

/** The page's accent, as a hex the canvas can mix. */
function pageAccent() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()
    return parseHex(v) ? v : '#2D9DFF'
  } catch { return '#2D9DFF' }
}

/**
 * An icon component as an SVG string at one size and colour. Tabler's
 * glyphs take `color` for their stroke.
 *
 * @param {import('react').ComponentType<any>} Icon
 * @param {number} size
 * @param {string} color
 */
function iconSvg(Icon, size, color) {
  const svg = renderToStaticMarkup(createElement(Icon, { size, stroke: 1.8, color }))
  return svg.includes('xmlns') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
}

/**
 * @typedef {object} Atom
 * @property {number} w
 * @property {boolean} [space]
 * @property {(g: CanvasRenderingContext2D, x: number, base: number) => void} [draw]
 */

/**
 * @param {Token[]} tokens
 * @param {CanvasRenderingContext2D} g
 * @param {Palette} pal
 * @param {Lookups} lookups
 * @param {Map<string, HTMLImageElement|null>} icons
 * @param {number} PX  the size of the type, which every inline piece is measured against
 * @returns {Atom[]}
 */
function atomsOf(tokens, g, pal, lookups, icons, PX) {
  /** @type {Atom[]} */
  const out = []
  const measure = (/** @type {string} */ s, /** @type {number|string} */ weight, size = PX) => { g.font = font(weight, size); return g.measureText(s).width }
  const toneInk = (/** @type {'good'|'bad'|'warn'|null|undefined} */ tone) => (tone ? TONE_COLOR[tone] : pal.strong)
  const centre = (/** @type {number} */ base) => base - PX * 0.33

  /** Words and the spaces between them, in one weight and colour. */
  const words = (/** @type {string} */ text, /** @type {number|string} */ weight, /** @type {string} */ color) => {
    for (const part of text.split(/( +)/)) {
      if (!part) continue
      if (part.trim() === '') { out.push({ w: measure(' ', 500), space: true }); continue }
      const w = measure(part, weight)
      out.push({ w, draw: (c, x, base) => { c.font = font(weight, PX); c.fillStyle = color; c.fillText(part, x, base) } })
    }
  }

  for (const t of tokens) {
    switch (t.k) {
      case 't': words(t.v, 500, pal.grey); break
      case 'fig': words(t.v, 600, toneInk(t.tone)); break
      case 'arrow': {
        const s = t.dir === 'up' ? '↑' : '↓'
        out.push({ w: measure(s, 600), draw: (c, x, base) => { c.font = font(600, PX); c.fillStyle = toneInk(t.tone); c.fillText(s, x, base) } })
        break
      }
      case 'dotfig': {
        const r = PX * 0.2
        const gap = PX * 0.28
        const w = measure(t.v, 600)
        out.push({
          w: r * 2 + gap + w,
          draw: (c, x, base) => {
            c.fillStyle = t.color; c.beginPath(); c.arc(x + r, centre(base), r, 0, Math.PI * 2); c.fill()
            c.font = font(600, PX); c.fillStyle = pal.strong; c.fillText(t.v, x + r * 2 + gap, base)
          },
        })
        break
      }
      case 'cat': {
        const cat = lookups.cats[t.name]
        const tile = PX * 1.3
        const gap = PX * 0.32
        const nameW = measure(t.name, 600)
        const img = icons.get(`cat:${t.name}`) ?? null
        out.push({
          w: (cat ? tile + gap : 0) + nameW,
          draw: (c, x, base) => {
            let at = x
            if (cat) {
              const cy = centre(base)
              c.fillStyle = alpha(cat.color ?? '#64748b', 0.24); roundRect(c, x, cy - tile / 2, tile, tile, tile * 0.28); c.fill()
              if (img) c.drawImage(img, x + (tile - PX * 0.74) / 2, cy - PX * 0.37, PX * 0.74, PX * 0.74)
              else if (cat.icon) drawEmoji(c, cat.icon, x + tile / 2, cy, PX * 0.7)
              at += tile + gap
            }
            c.font = font(600, PX); c.fillStyle = pal.strong; c.fillText(t.name, at, base)
          },
        })
        break
      }
      case 'acct': {
        const brand = accountBrand(lookups.accts[t.name] ?? { name: t.name })
        const cw = PX * 1.15
        const ch = cw / 1.586
        const gap = PX * 0.4
        const nameW = measure(t.name, 600)
        out.push({
          w: cw + gap + nameW,
          draw: (c, x, base) => {
            const cy = centre(base)
            const grad = c.createLinearGradient(x, cy - ch / 2, x + cw, cy + ch / 2)
            grad.addColorStop(0, brand.from); grad.addColorStop(1, brand.to)
            c.fillStyle = grad; roundRect(c, x, cy - ch / 2, cw, ch, ch * 0.22); c.fill()
            c.font = font(600, PX); c.fillStyle = pal.strong; c.fillText(t.name, x + cw + gap, base)
          },
        })
        break
      }
      case 'date': {
        const size = PX * 0.84
        const padX = PX * 0.52
        const textW = measure(t.label, 600, size)
        const h = PX * 1.12
        const ic = PX * 0.56
        const iconGap = PX * 0.24
        out.push({
          w: padX + ic + iconGap + textW + padX,
          draw: (c, x, base) => {
            const cy = centre(base)
            const w = padX + ic + iconGap + textW + padX
            c.fillStyle = alpha(pal.accent, 0.16); roundRect(c, x, cy - h / 2, w, h, h / 2); c.fill()
            // A small calendar: an outlined page with a bar across the top.
            const ix = x + padX
            c.strokeStyle = pal.accentInk; c.lineWidth = Math.max(2, ic * 0.12); c.lineJoin = 'round'; c.lineCap = 'round'
            roundRect(c, ix, cy - ic / 2 + ic * 0.08, ic, ic * 0.9, ic * 0.2); c.stroke()
            c.beginPath(); c.moveTo(ix, cy - ic * 0.1); c.lineTo(ix + ic, cy - ic * 0.1); c.stroke()
            c.beginPath(); c.moveTo(ix + ic * 0.3, cy - ic * 0.5); c.lineTo(ix + ic * 0.3, cy - ic * 0.3); c.moveTo(ix + ic * 0.7, cy - ic * 0.5); c.lineTo(ix + ic * 0.7, cy - ic * 0.3); c.stroke()
            c.font = font(600, size); c.fillStyle = pal.accentInk; c.fillText(t.label, ix + ic + iconGap, base - (PX - size) * 0.15)
          },
        })
        break
      }
      case 'pace': {
        const w = PX * 3.6
        const h = PX * 0.5
        out.push({
          w: w + PX * 0.24,
          draw: (c, x, base) => {
            const bx = x + PX * 0.12
            const by = centre(base) - h / 2
            c.save()
            roundRect(c, bx, by, w, h, h / 2); c.clip()
            c.fillStyle = pal.faint; c.fillRect(bx, by, w, h)
            c.fillStyle = t.tone ? TONE_COLOR[t.tone] : pal.accent; c.fillRect(bx, by, w * Math.max(0, Math.min(100, t.used)) / 100, h)
            c.fillStyle = pal.strong
            const tx = bx + w * Math.max(0, Math.min(100, t.elapsed)) / 100
            c.fillRect(tx - PX * 0.06, by, PX * 0.12, h)
            c.restore()
          },
        })
        break
      }
      case 'split': {
        const w = PX * 3.6
        const h = PX * 0.5
        const total = t.parts.reduce((s, p) => s + Math.max(0, p.v), 0) || 1
        out.push({
          w: w + PX * 0.24,
          draw: (c, x, base) => {
            const bx = x + PX * 0.12
            const by = centre(base) - h / 2
            c.save()
            roundRect(c, bx, by, w, h, h / 2); c.clip()
            let at = bx
            for (const p of t.parts) {
              const pw = (Math.max(0, p.v) / total) * w
              c.fillStyle = p.color; c.fillRect(at, by, Math.max(0, pw - 1), h)
              at += pw
            }
            c.restore()
          },
        })
        break
      }
      case 'spark': {
        const w = PX * 3.2
        const h = PX * 0.96
        out.push({
          w: w + PX * 0.2,
          draw: (c, x, base) => {
            const bx = x + PX * 0.1
            const top = centre(base) - h / 2
            const max = Math.max(...t.values, 1)
            const pts = t.values.map((v, i) => [bx + 2 + (i / Math.max(1, t.values.length - 1)) * (w - 4), top + h - 3 - (v / max) * (h - 6)])
            c.strokeStyle = pal.dark ? 'rgba(255,255,255,0.4)' : '#94a3b8'; c.lineWidth = 3.4; c.lineJoin = 'round'; c.lineCap = 'round'
            c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke()
            const last = pts[pts.length - 1]
            c.fillStyle = pal.strong; c.beginPath(); c.arc(last[0], last[1], 4.4, 0, Math.PI * 2); c.fill()
          },
        })
        break
      }
      default: break
    }
  }
  return out
}

/**
 * Atoms into lines. A word and whatever is stuck to it - a figure and its
 * full stop, a chip and its comma - travel together; a line breaks only at a
 * space.
 *
 * @param {Atom[]} atoms
 * @param {number} width
 * @returns {Array<{atoms: Atom[], w: number}>}
 */
function breakLines(atoms, width) {
  /** @type {Atom[][]} */
  const units = []
  /** @type {Atom[]} */
  let cur = []
  for (const a of atoms) {
    if (a.space) { if (cur.length) units.push(cur); cur = []; units.push([a]); continue }
    cur.push(a)
  }
  if (cur.length) units.push(cur)

  /** @type {Array<{atoms: Atom[], w: number}>} */
  const lines = []
  let line = { atoms: /** @type {Atom[]} */ ([]), w: 0 }
  const flush = () => {
    // A line does not end in a space.
    while (line.atoms.length && line.atoms[line.atoms.length - 1].space) { line.w -= line.atoms[line.atoms.length - 1].w; line.atoms.pop() }
    if (line.atoms.length) lines.push(line)
    line = { atoms: [], w: 0 }
  }
  for (const u of units) {
    const w = u.reduce((s, a) => s + a.w, 0)
    if (u[0].space) { if (line.atoms.length) { line.atoms.push(...u); line.w += w } continue }
    if (line.atoms.length && line.w + w > width) flush()
    line.atoms.push(...u)
    line.w += w
  }
  flush()
  return lines
}

/**
 * The note as a PNG.
 *
 * @param {Note} note
 * @param {Lookups} lookups  categories and accounts by name
 * @param {{dark?: boolean}} [opts]  defaults to the page's own theme
 * @returns {Promise<Blob>}
 */
export async function renderNoteImage(note, lookups, opts = {}) {
  const dark = opts.dark ?? document.documentElement.classList.contains('dark')
  const pal = paletteOf(dark, pageAccent())
  const all = note.paragraphs.flatMap(p => p.tokens)

  await loadFonts([note.title, note.eyebrow.date, note.eyebrow.day, note.level.label, 'Spendr ↑↓·✓✦!', ...all.map(t => ('v' in t ? t.v : 'name' in t ? t.name : 'label' in t ? t.label : ''))].join(' '))

  // Each category's glyph, as a picture.
  /** @type {Map<string, HTMLImageElement|null>} */
  const icons = new Map()
  await Promise.all(all.filter(t => t.k === 'cat').map(async t => {
    const cat = lookups.cats[t.name]
    const Icon = cat ? categoryIcon(cat) : null
    icons.set(`cat:${t.name}`, Icon ? await loadImage(svgUrl(iconSvg(Icon, 96, cat.color ?? '#64748b'))) : null)
  }))

  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) throw new Error('Could not draw the image.')

  /* As large as will fit between the bands, so a short note is read from
     across a room and a long one still fits. */
  const room = SAFE_BOTTOM - SAFE_TOP
  let PX = SIZES[SIZES.length - 1]
  let blocks = /** @type {Array<{atoms: Atom[], w: number}[]>} */ ([])
  let measured = { head: 0, body: 0, line: 0, gap: 0, title: 0 }
  for (const size of SIZES) {
    const line = size * 1.38
    const gap = size * 0.85
    const title = size * 1.6
    const bs = note.paragraphs.map(p => breakLines(atomsOf(p.tokens, probe, pal, lookups, icons, size), INNER))
    const head = 36 + title * 0.95 + 34 + size * 0.95
    const body = bs.reduce((h, lines) => h + lines.length * line, 0) + gap * (bs.length - 1)
    PX = size; blocks = bs; measured = { head, body, line, gap, title }
    if (head + body <= room) break
  }
  const { head, body, line: LINE, gap: GAP, title: TITLE } = measured

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = H
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Could not draw the image.')
  g.fillStyle = pal.bg
  g.fillRect(0, 0, canvas.width, canvas.height)
  g.textBaseline = 'alphabetic'

  // Centred between the bands.
  let y = SAFE_TOP + Math.max(0, (room - head - body) / 2) + 30

  // The standing, the day, and the greeting.
  const ink = note.level.tone ? TONE_COLOR[note.level.tone] : pal.accentInk
  const small = Math.max(26, PX * 0.56)
  const ring = small * 0.56
  g.strokeStyle = ink; g.lineWidth = 3.2; g.beginPath(); g.arc(PAD + ring, y - small * 0.32, ring, 0, Math.PI * 2); g.stroke()
  g.fillStyle = ink; g.font = font(600, small * 0.8); g.textAlign = 'center'
  g.fillText(note.level.id === 'steady' || note.level.id === 'ahead' ? '✓' : note.level.id === 'fresh' ? '✦' : '!', PAD + ring, y - small * 0.05)
  g.textAlign = 'left'
  g.font = font(600, small); g.fillStyle = ink
  const labelX = PAD + ring * 2 + 14
  g.fillText(note.level.label, labelX, y)
  let x = labelX + g.measureText(note.level.label).width + 16
  g.font = font(500, small); g.fillStyle = pal.grey
  for (const part of [`· ${note.eyebrow.date}`, `· ${note.eyebrow.day}`]) { g.fillText(part, x, y); x += g.measureText(part).width + 14 }
  y += TITLE * 0.95 + 34
  g.font = font(600, TITLE); g.fillStyle = pal.strong
  g.fillText(note.title, PAD, y)
  y += PX * 0.95

  // The paragraphs.
  blocks.forEach((lines, bi) => {
    for (const ln of lines) {
      y += LINE
      let lx = PAD
      for (const a of ln.atoms) { a.draw?.(g, lx, y - PX * 0.26); lx += a.w }
    }
    if (bi < blocks.length - 1) y += GAP
  })

  // Whose it is, low in the frame where nothing else is.
  g.font = font(600, 28); g.fillStyle = pal.grey; g.fillText('Spendr', PAD, H - 150)

  return toPng(canvas)
}
