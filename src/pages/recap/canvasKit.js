import { CONFETTI } from './assets'

/**
 * The pieces every Wrapped picture is drawn with.
 *
 * Each slide can be shared as a picture (pictures.js), and they are drawn on
 * a canvas by hand rather than by capturing the DOM: a DOM capture depends
 * on the browser's foreignObject support, which is exactly where iOS Safari
 * is least reliable, and a missing font or a half-loaded image comes out as
 * a blank rectangle with no error. A canvas draws what it is told.
 *
 * ── 1080 x 1920, and where things go on it ──
 *
 * A phone screen's shape, which is the shape a story is on Instagram,
 * Facebook, WhatsApp and Messenger. A story's app draws its own things over
 * the top and bottom - the name and progress bar above, the reply box below
 * - so nothing that needs reading goes above SAFE_TOP or below SAFE_BOTTOM:
 * those bands hold only confetti and illustrations.
 */

export const W = 1080
export const H = 1920
/** Side margin. */
export const P = 88
export const INNER = W - P * 2
export const SAFE_TOP = 250
export const SAFE_BOTTOM = 1640

/** @typedef {import('./theme').RecapPalette} RecapPalette */
/** @typedef {import('./theme').CardTone} CardTone */

/** @param {number|string} weight @param {number} size */
export const font = (weight, size) => `${weight} ${size}px Inter, sans-serif`
/** Every platform's colour emoji, before any text font gets a chance to draw a black-and-white one. */
export const emojiFont = (/** @type {number} */ size) => `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`

/**
 * An emoji, centred on (x, y) - or starting at x - at full strength.
 *
 * A colour emoji takes no colour from fillStyle, but it does take its alpha:
 * drawn straight after a translucent disc, with that disc's fill still set,
 * every category's emoji came out as faint as the disc under it. So this
 * sets its own, whatever was painted last.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {string} emoji
 * @param {number} x @param {number} y @param {number} size
 * @param {CanvasTextAlign} [align]
 */
export function drawEmoji(g, emoji, x, y, size, align = 'center') {
  g.save()
  g.font = emojiFont(size)
  g.fillStyle = '#000000'
  g.textAlign = align
  g.textBaseline = 'middle'
  g.fillText(emoji, x, y)
  g.restore()
}

/** A blank picture, ready to draw on. */
export function makeCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Could not draw the image.')
  g.textBaseline = 'alphabetic'
  return { canvas, g }
}

/** @param {HTMLCanvasElement} canvas @returns {Promise<Blob>} */
export function toPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not draw the image.'))), 'image/png')
  })
}

/**
 * Inter is self-hosted and split by script: the peso sign is in its
 * latin-ext file, an accented name may be too, and a file the page has not
 * needed yet is not loaded. So every weight is loaded for exactly the text
 * about to be drawn - drawn before its file arrives, it silently comes out in
 * a fallback font. Settled, not all: offline, a script whose file was never
 * cached cannot load, and a picture in a fallback font beats none.
 *
 * @param {string} text
 */
export function loadFonts(text) {
  return Promise.allSettled(['400', '500', '600'].map(w => document.fonts?.load?.(font(w, 40), text)))
}

/** Pictures already decoded, kept for the next drawing. @type {Map<string, Promise<HTMLImageElement|null>>} */
const images = new Map()

/**
 * An image, loaded and decoded - or null if it would not load, which leaves
 * a gap in the picture rather than no picture at all.
 *
 * @param {string|undefined|null} src
 * @returns {Promise<HTMLImageElement|null>}
 */
export function loadImage(src) {
  if (!src) return Promise.resolve(null)
  let p = images.get(src)
  if (!p) {
    p = new Promise(resolve => {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => resolve(img)
      img.onerror = () => { images.delete(src); resolve(null) }
      img.src = src
    })
    images.set(src, p)
  }
  return p
}

/**
 * Text cut to fit `width` with an ellipsis, in the font already set. Cut by
 * character, not by UTF-16 unit, so an emoji in a category name is dropped
 * whole rather than halved into a replacement box.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {string} text
 * @param {number} width
 */
export function clip(g, text, width) {
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
export function fit(g, text, weight, max, min, width) {
  for (let size = max; size > min; size -= 4) {
    g.font = font(weight, size)
    if (g.measureText(text).width <= width) return text
  }
  g.font = font(weight, min)
  return clip(g, text, width)
}

/**
 * Words laid into lines no wider than `width`, at most `max` of them, the
 * last cut with an ellipsis if the words run on. In the font already set.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {string} text
 * @param {number} width
 * @param {number} max
 * @returns {string[]}
 */
export function wrap(g, text, width, max) {
  const words = String(text).split(/\s+/).filter(Boolean)
  /** @type {string[]} */
  const lines = []
  let line = ''
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]
    if (g.measureText(next).width <= width || !line) {
      line = next
      continue
    }
    lines.push(line)
    line = words[i]
    if (lines.length === max - 1) {
      line = words.slice(i).join(' ')
      break
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, max).map((l, i, all) => (i === all.length - 1 ? clip(g, l, width) : l))
}

/** @param {CanvasRenderingContext2D} g @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
export function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  g.beginPath()
  g.moveTo(x + rr, y)
  g.arcTo(x + w, y, x + w, y + h, rr)
  g.arcTo(x + w, y + h, x, y + h, rr)
  g.arcTo(x, y + h, x, y, rr)
  g.arcTo(x, y, x + w, y, rr)
  g.closePath()
}

/** "#AABBCC" at `alpha`. @param {string} hex @param {number} alpha */
export function rgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Draws with a soft shadow under it. @param {CanvasRenderingContext2D} g @param {() => void} paint */
export function shadowed(g, paint, blur = 30, y = 10, alpha = 0.18) {
  g.save()
  g.shadowColor = `rgba(0, 0, 0, ${alpha})`
  g.shadowBlur = blur
  g.shadowOffsetY = y
  paint()
  g.restore()
}

/**
 * An image centred on (cx, cy), turned by `deg`, with a soft drop shadow.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {HTMLImageElement|null} img
 * @param {number} cx @param {number} cy @param {number} size @param {number} [deg]
 */
export function drawArt(g, img, cx, cy, size, deg = 0) {
  if (!img) return
  g.save()
  g.translate(cx, cy)
  g.rotate((deg * Math.PI) / 180)
  g.shadowColor = 'rgba(0, 0, 0, 0.28)'
  g.shadowBlur = 44
  g.shadowOffsetY = 20
  g.drawImage(img, -size / 2, -size / 2, size, size)
  g.restore()
}

/** A soft pool of light. @param {CanvasRenderingContext2D} g @param {number} x @param {number} y @param {number} r @param {string} color @param {number} alpha */
export function glow(g, x, y, r, color, alpha) {
  const p = g.createRadialGradient(x, y, 0, x, y, r)
  p.addColorStop(0, rgba(color, alpha))
  p.addColorStop(1, rgba(color, 0))
  g.fillStyle = p
  g.fillRect(x - r, y - r, r * 2, r * 2)
}

/**
 * The card's surface at poster size: the slide's gradient, pools of the
 * accent's light, and its light from above - `.recap-texture`'s recipe less
 * the grain. Noise is the one thing a PNG cannot compress: with it the
 * picture came to over 3MB and took the better part of two seconds to
 * encode, for a texture every app it is posted to smooths away.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {RecapPalette} pal
 * @param {CardTone} tone
 */
export function drawSurface(g, pal, tone) {
  /* CSS's 165deg, worked out: the line runs down and a little to the right,
     long enough to put each colour stop exactly on the corners it would in
     the browser. */
  const a = (165 * Math.PI) / 180
  const half = (Math.abs(W * Math.sin(a)) + Math.abs(H * Math.cos(a))) / 2
  const dx = Math.sin(a) * half, dy = -Math.cos(a) * half
  const base = g.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy)
  base.addColorStop(0, tone.light)
  base.addColorStop(1, tone.deep)
  g.fillStyle = base
  g.fillRect(0, 0, W, H)

  glow(g, W * 0.86, 470, 640, pal.glow, 0.3)
  glow(g, W * 0.08, H * 0.74, 760, pal.glow, 0.18)

  const light = g.createRadialGradient(W / 2, -H * 0.12, 0, W / 2, -H * 0.12, H * 0.82)
  light.addColorStop(0, 'rgba(255, 255, 255, 0.22)')
  light.addColorStop(0.68, 'rgba(255, 255, 255, 0)')
  g.fillStyle = light
  g.fillRect(0, 0, W, H)
  const shade = g.createLinearGradient(0, H * 0.4, 0, H)
  shade.addColorStop(0, 'rgba(0, 0, 0, 0)')
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.16)')
  g.fillStyle = shade
  g.fillRect(0, 0, W, H)
}

/**
 * A sprinkle of confetti, only where nothing needs reading: the two bands a
 * story's app draws over, and a few pieces down the margins.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {() => number} rand
 * @param {number} [count]
 */
export function drawConfetti(g, rand, count = 34) {
  /** @type {Array<[number, number, number, number]>} x, y, width, height of each area */
  const areas = [[0, 20, W, 210], [0, 1670, W, 230], [0, 250, 60, 1400], [W - 60, 250, 60, 1400]]
  const weights = [0.46, 0.38, 0.08, 0.08]
  for (let i = 0; i < count; i++) {
    let pick = rand(), k = 0
    while (k < weights.length - 1 && pick > weights[k]) { pick -= weights[k]; k++ }
    const [ax, ay, aw, ah] = areas[k]
    const x = ax + rand() * aw, y = ay + rand() * ah
    const color = CONFETTI[Math.floor(rand() * CONFETTI.length)]
    const kind = Math.floor(rand() * 4)
    const s = 9 + rand() * 9
    g.save()
    g.translate(x, y)
    g.rotate(rand() * Math.PI * 2)
    g.globalAlpha = 0.95
    g.fillStyle = g.strokeStyle = color
    g.lineWidth = 5
    g.lineCap = 'round'
    if (kind === 0) {
      roundRect(g, -s, -s * 0.4, s * 2, s * 0.8, 3)
      g.fill()
    } else if (kind === 1) {
      g.beginPath(); g.arc(0, 0, s * 0.55, 0, Math.PI * 2); g.fill()
    } else if (kind === 2) {
      g.beginPath(); g.arc(0, 0, s * 0.8, 0, Math.PI * 2); g.stroke()
    } else {
      g.beginPath(); g.arc(0, 0, s, Math.PI * 1.1, Math.PI * 1.9); g.stroke()
    }
    g.restore()
  }
}

/**
 * Sunburst rays behind a centrepiece, where the browser can draw a conic
 * gradient; none where it cannot.
 *
 * Drawn on a layer of their own and faded out there. Faded on the picture
 * itself, the fade took out everything under the rays with them - the
 * card's own colour included - and left a disc of the picture see-through,
 * which every app it was posted to filled with white or black.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {number} cx @param {number} cy @param {number} r
 */
export function drawRays(g, cx, cy, r) {
  const size = Math.ceil(r * 2)
  const layer = document.createElement('canvas')
  layer.width = layer.height = size
  const l = layer.getContext('2d')
  if (!l || typeof l.createConicGradient !== 'function') return
  const rays = l.createConicGradient(0, r, r)
  for (let i = 0; i < 12; i++) {
    const at = i / 12
    rays.addColorStop(at, 'rgba(255, 255, 255, 0.12)')
    rays.addColorStop(at + 0.025, 'rgba(255, 255, 255, 0.12)')
    rays.addColorStop(at + 0.026, 'rgba(255, 255, 255, 0)')
    rays.addColorStop(Math.min(1, at + 1 / 12 - 0.001), 'rgba(255, 255, 255, 0)')
  }
  l.fillStyle = rays
  l.fillRect(0, 0, size, size)
  // Faded out toward their ends, to nothing by the edge: no rim to see.
  const fade = l.createRadialGradient(r, r, r * 0.15, r, r, r)
  fade.addColorStop(0, 'rgba(0, 0, 0, 1)')
  fade.addColorStop(1, 'rgba(0, 0, 0, 0)')
  l.globalCompositeOperation = 'destination-in'
  l.fillStyle = fade
  l.fillRect(0, 0, size, size)
  g.drawImage(layer, cx - r, cy - r)
}

/**
 * The top of every picture: the Spendr mark and its name on the left, and
 * a pill on the right - the year, or the month.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {RecapPalette} pal
 * @param {HTMLImageElement|null} logo
 * @param {string} pill
 */
export function drawBrand(g, pal, logo, pill) {
  shadowed(g, () => {
    g.fillStyle = pal.paper
    roundRect(g, P, 262, 80, 80, 24)
    g.fill()
  }, 24, 8)
  if (logo) g.drawImage(logo, P + 8, 270, 64, 64)
  g.fillStyle = pal.ink
  g.font = font(600, 46)
  g.fillText('Spendr', P + 104, 318)
  g.font = font(500, 34)
  const text = clip(g, pill, 420)
  const pillW = g.measureText(text).width + 52
  g.fillStyle = 'rgba(0, 0, 0, 0.2)'
  roundRect(g, W - P - pillW, 272, pillW, 60, 30)
  g.fill()
  g.fillStyle = pal.ink
  g.textAlign = 'center'
  g.fillText(text, W - P - pillW / 2, 314)
  g.textAlign = 'left'
}

/**
 * The foot of every picture: "Made with Spendr", centred, with the mark.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {RecapPalette} pal
 * @param {HTMLImageElement|null} logo
 * @param {number} [y] the text's baseline
 */
export function drawSign(g, pal, logo, y = 1587) {
  const madeWith = 'Made with Spendr'
  g.font = font(500, 32)
  const signW = g.measureText(madeWith).width
  const x = (W - (48 + 16 + signW)) / 2
  if (logo) {
    g.fillStyle = pal.paper
    roundRect(g, x, y - 35, 48, 48, 14)
    g.fill()
    g.drawImage(logo, x + 5, y - 30, 38, 38)
  }
  g.fillStyle = pal.muted
  g.fillText(madeWith, x + 64, y)
}

/**
 * The paper chip that names a slide - "💸 You spent" - as the slide has it.
 * Returns the chip's right edge.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {RecapPalette} pal
 * @param {string} emoji
 * @param {string} label
 * @param {number} x @param {number} y the chip's top
 * @param {HTMLImageElement|null} [img] a glass mark to draw instead of the emoji
 */
export function drawChip(g, pal, emoji, label, x = P, y = 392, img = null) {
  g.font = font(600, 38)
  const text = clip(g, label, INNER - 140)
  const w = 104 + g.measureText(text).width + 36
  shadowed(g, () => {
    g.fillStyle = pal.paper
    roundRect(g, x, y, w, 88, 44)
    g.fill()
  }, 24, 8, 0.14)
  if (img) g.drawImage(img, x + 18, y + 12, 64, 64)
  else drawEmoji(g, emoji, x + 30, y + 46, 42, 'left')
  g.fillStyle = pal.deepInk
  g.font = font(600, 38)
  g.fillText(text, x + 92, y + 58)
  return x + w
}

/**
 * A short verdict on a dark wash - "↓ 12% less than July".
 *
 * @param {CanvasRenderingContext2D} g
 * @param {string} text
 * @param {string} color
 * @param {number} x @param {number} y the pill's top
 */
export function drawPill(g, text, color, x, y) {
  g.font = font(600, 34)
  const line = clip(g, text, INNER - 64)
  const w = g.measureText(line).width + 64
  g.fillStyle = 'rgba(0, 0, 0, 0.2)'
  roundRect(g, x, y, w, 68, 34)
  g.fill()
  g.fillStyle = color
  g.fillText(line, x + 32, y + 46)
}

/**
 * "Wrapped", on a paper label slapped on at an angle - over the foot of the
 * month's name, as the story's first slide has it.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {RecapPalette} pal
 * @param {number} x the label's left edge
 * @param {number} cy its centre, top to bottom
 * @param {number} [size] the word's size
 */
export function drawWrappedMark(g, pal, x, cy, size = 80) {
  g.font = font(600, size)
  const w = g.measureText('Wrapped').width + size * 0.75
  const h = size * 1.5
  g.save()
  g.translate(x + w / 2, cy)
  g.rotate((-4 * Math.PI) / 180)
  g.shadowColor = 'rgba(0, 0, 0, 0.22)'
  g.shadowBlur = 30
  g.shadowOffsetY = 12
  g.fillStyle = pal.paper
  roundRect(g, -w / 2, -h / 2, w, h, size * 0.38)
  g.fill()
  g.shadowColor = 'transparent'
  g.fillStyle = pal.deepInk
  g.textAlign = 'center'
  g.fillText('Wrapped', 0, size * 0.33)
  g.restore()
  g.textAlign = 'left'
}

/**
 * A figure on a paper tile: emoji, what it is, how much.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {RecapPalette} pal
 * @param {{emoji: string, label: string, value: string, tone?: 'good'|'soft'}} t
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {HTMLImageElement|null} [img] a glass mark to draw instead of the emoji
 */
export function drawTile(g, pal, t, x, y, w, h, img = null) {
  shadowed(g, () => {
    g.fillStyle = pal.paper
    roundRect(g, x, y, w, h, 36)
    g.fill()
  }, 30, 10, 0.16)
  if (img) g.drawImage(img, x + 16, y + h / 2 - 46, 92, 92)
  else drawEmoji(g, t.emoji, x + 28, y + h / 2 + 3, 60, 'left')
  const tx = x + 118
  const room = w - 118 - 28
  g.fillStyle = pal.paperMuted
  g.font = font(600, 26)
  g.fillText(clip(g, t.label.toUpperCase(), room), tx, y + h / 2 - 12)
  g.fillStyle = t.tone === 'good' ? pal.paperGood : t.tone === 'soft' ? pal.paperSoft : pal.paperInk
  g.fillText(fit(g, t.value, 600, 46, 30, room), tx, y + h / 2 + 38)
}

/**
 * An emoji on a paper disc, at an angle - the story's sticker.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {RecapPalette} pal
 * @param {string} emoji
 * @param {number} cx @param {number} cy @param {number} size @param {number} [deg]
 */
export function drawSticker(g, pal, emoji, cx, cy, size, deg = 0) {
  g.save()
  g.translate(cx, cy)
  g.rotate((deg * Math.PI) / 180)
  shadowed(g, () => {
    g.fillStyle = pal.paper
    g.beginPath()
    g.arc(0, 0, size / 2, 0, Math.PI * 2)
    g.fill()
  }, 26, 10, 0.2)
  drawEmoji(g, emoji, 0, size * 0.03, Math.round(size * 0.52))
  g.restore()
}
