import { summaryHero, summaryTiles } from '../../lib/recapCopy'
import { monthName, parseMonth } from '../../lib/recap'
import { ART, CONFETTI, LOGO_LARGE, seeded, seedOf } from './assets'

/**
 * The recap's summary, as a picture to post or send.
 *
 * Drawn on a canvas by hand rather than by screenshotting the DOM: a DOM
 * capture depends on the browser's foreignObject support, which is exactly
 * where iOS Safari is least reliable, and a missing font or a half-loaded
 * image comes out as a blank rectangle with no error. A canvas draws what it
 * is told, every time.
 *
 * ── 1080 x 1920, and what that means for where things go ──
 *
 * A phone screen's shape, which is the shape a story is on Instagram,
 * Facebook, WhatsApp and Messenger - posted there, it fills the screen
 * rather than floating in bars. A story's app draws its own things over the
 * top and bottom of it - the name and progress bar above, the reply box
 * below - so nothing that needs reading goes in the top 250px or below 1640:
 * those bands hold only confetti and illustrations. Everything that says
 * something sits between.
 *
 * It is the closing slide, poster-sized: the same tiles (summaryTiles) and
 * the same headline (summaryHero), on the summary card's own tone, with the
 * slide's light, the Spendr mark, and the story's 3D art.
 */

const W = 1080
const H = 1920
const P = 88
const INNER = W - P * 2
/** The column the month's name may use: the gift sits to its right. */
const TITLE_W = 600

/** @param {number|string} weight @param {number} size */
const font = (weight, size) => `${weight} ${size}px Inter, sans-serif`
/** Every platform's colour emoji, before any text font gets a chance to draw a black-and-white one. */
const emojiFont = (/** @type {number} */ size) => `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`

/** The file a month's picture is saved as. @param {string} month "2026-08" */
export function pictureName(month) {
  return `spendr-wrapped-${month}.png`
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
function rgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Pictures already decoded, kept for the next drawing. @type {Map<string, Promise<HTMLImageElement|null>>} */
const images = new Map()

/**
 * An image, loaded and decoded - or null if it would not load, which leaves
 * a gap in the picture rather than no picture at all.
 *
 * @param {string|undefined} src
 * @returns {Promise<HTMLImageElement|null>}
 */
function loadImage(src) {
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
 * An image centred on (cx, cy), turned by `deg`, with a soft drop shadow.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {HTMLImageElement|null} img
 * @param {number} cx @param {number} cy @param {number} size @param {number} deg
 */
function drawArt(g, img, cx, cy, size, deg) {
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

/**
 * The card's surface: its tone's gradient, pools of the accent's light, and
 * the slide's light from above - `.recap-texture`'s recipe, at poster size,
 * less its grain.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {import('./theme').RecapPalette} pal
 */
function drawSurface(g, pal) {
  const tone = pal.tones[0]
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

  /** @param {number} x @param {number} y @param {number} r @param {string} color @param {number} alpha */
  const pool = (x, y, r, color, alpha) => {
    const p = g.createRadialGradient(x, y, 0, x, y, r)
    p.addColorStop(0, rgba(color, alpha))
    p.addColorStop(1, rgba(color, 0))
    g.fillStyle = p
    g.fillRect(0, 0, W, H)
  }
  pool(W * 0.86, 470, 640, pal.glow, 0.34)
  pool(W * 0.08, H * 0.74, 760, pal.glow, 0.2)

  // Light from above, and a little shade settling at the foot.
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

  /* No grain, unlike the card on screen. Noise is the one thing a PNG cannot
     compress: with it the picture came to over 3MB and took the better part
     of two seconds to encode, for a texture that every app it is posted to
     smooths away when it recompresses. Without it, a few hundred KB. */
}

/**
 * Confetti, only where nothing needs reading: the two bands a story's app
 * draws over, and the margins beside the text.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {() => number} rand
 */
function drawConfetti(g, rand) {
  /** @type {Array<[number, number, number, number]>} x, y, width, height of each area */
  const areas = [[0, 20, W, 210], [0, 1670, W, 230], [0, 250, 60, 1400], [W - 60, 250, 60, 1400]]
  const weights = [0.46, 0.38, 0.08, 0.08]
  for (let i = 0; i < 34; i++) {
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
 * @param {object} input
 * @param {import('../../lib/recap').Recap} input.recap
 * @param {string} input.currency
 * @param {import('./theme').RecapPalette} input.pal
 * @param {string} [input.name]
 * @returns {Promise<Blob>}
 */
export async function renderSummaryImage({ recap, currency, pal, name }) {
  const { year } = parseMonth(recap.month)
  const month = monthName(recap.month)
  const whose = name ? `${name}'s` : 'My'
  const hero = summaryHero(recap, currency)
  const tiles = summaryTiles(recap, currency)
  const madeWith = 'Made with Spendr'

  /* Inter is self-hosted and split by script: the peso sign is in its
     latin-ext file, an accented name may be too, and a file the page has not
     needed yet is not loaded. So load every weight for exactly the text about
     to be drawn - drawn before its file arrives, it silently comes out in a
     fallback font. Settled, not all: offline, a script whose file was never
     cached cannot load, and a picture in a fallback font beats none. */
  const text = [whose, month, 'Wrapped', hero.label, hero.value, hero.line ?? '', 'Spendr', String(year), madeWith,
    ...tiles.flatMap(t => [t.label.toUpperCase(), t.value])].join(' ')
  const [logo, gift, sparkles, popper, bag] = await Promise.all([
    loadImage(LOGO_LARGE), loadImage(ART['wrapped-gift']), loadImage(ART.sparkles),
    loadImage(ART['party-popper']), loadImage(ART['money-bag']),
    Promise.allSettled(['400', '500', '600'].map(w => document.fonts?.load?.(font(w, 40), text))),
  ])

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Could not draw the image.')
  g.textBaseline = 'alphabetic'
  const rand = seeded(seedOf(recap.month))

  drawSurface(g, pal)
  drawConfetti(g, rand)

  // ── The mark, and the year ──
  g.save()
  g.shadowColor = 'rgba(0, 0, 0, 0.18)'
  g.shadowBlur = 24
  g.shadowOffsetY = 8
  g.fillStyle = pal.paper
  roundRect(g, P, 262, 80, 80, 24)
  g.fill()
  g.restore()
  if (logo) g.drawImage(logo, P + 8, 270, 64, 64)
  g.fillStyle = pal.ink
  g.font = font(600, 46)
  g.fillText('Spendr', P + 104, 318)
  g.font = font(500, 34)
  const yearW = g.measureText(String(year)).width + 52
  g.fillStyle = 'rgba(0, 0, 0, 0.2)'
  roundRect(g, W - P - yearW, 272, yearW, 60, 30)
  g.fill()
  g.fillStyle = pal.ink
  g.textAlign = 'center'
  g.fillText(String(year), W - P - yearW / 2, 314)
  g.textAlign = 'left'

  // ── The gift, beside the title ──
  const glow = g.createRadialGradient(862, 500, 0, 862, 500, 250)
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.3)')
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)')
  g.fillStyle = glow
  g.fillRect(560, 220, 520, 560)
  drawArt(g, gift, 862, 500, 300, 8)
  drawArt(g, sparkles, 740, 345, 96, -6)

  // ── Whose month, which month, and the label ──
  g.fillStyle = pal.muted
  g.font = font(500, 44)
  g.fillText(clip(g, whose, TITLE_W), P, 440)
  g.fillStyle = pal.ink
  g.fillText(fit(g, month, 600, 150, 88, TITLE_W), P, 578)

  g.font = font(600, 80)
  const markW = g.measureText('Wrapped').width + 60
  g.save()
  g.translate(P + 36 + markW / 2, 640)
  g.rotate((-4 * Math.PI) / 180)
  g.shadowColor = 'rgba(0, 0, 0, 0.22)'
  g.shadowBlur = 30
  g.shadowOffsetY = 12
  g.fillStyle = pal.paper
  roundRect(g, -markW / 2, -60, markW, 120, 30)
  g.fill()
  g.shadowColor = 'transparent'
  g.fillStyle = pal.deepInk
  g.textAlign = 'center'
  g.fillText('Wrapped', 0, 26)
  g.restore()
  g.textAlign = 'left'

  // ── What it came to ──
  g.fillStyle = pal.muted
  g.font = font(500, 40)
  g.fillText(hero.label, P, 806)
  g.fillStyle = pal.ink
  g.fillText(fit(g, hero.value, 600, 156, 80, INNER), P, 948)
  if (hero.line) {
    g.font = font(600, 34)
    const line = clip(g, hero.line, INNER - 64)
    const lineW = g.measureText(line).width + 64
    g.fillStyle = 'rgba(0, 0, 0, 0.2)'
    roundRect(g, P, 976, lineW, 68, 34)
    g.fill()
    g.fillStyle = pal.ink
    g.fillText(line, P + 32, 1022)
  }

  // ── The tiles: the slide's own, two by three ──
  const tileW = (INNER - 24) / 2
  const tileH = 136
  tiles.forEach((t, i) => {
    const x = P + (i % 2) * (tileW + 24)
    const y = 1084 + Math.floor(i / 2) * (tileH + 20)
    g.save()
    g.shadowColor = 'rgba(0, 0, 0, 0.16)'
    g.shadowBlur = 30
    g.shadowOffsetY = 10
    g.fillStyle = pal.paper
    roundRect(g, x, y, tileW, tileH, 36)
    g.fill()
    g.restore()

    g.font = emojiFont(60)
    g.textBaseline = 'middle'
    g.fillText(t.emoji, x + 28, y + tileH / 2 + 3)
    g.textBaseline = 'alphabetic'

    const tx = x + 118
    const room = tileW - 118 - 28
    g.fillStyle = pal.paperMuted
    g.font = font(600, 26)
    g.fillText(clip(g, t.label.toUpperCase(), room), tx, y + 56)
    g.fillStyle = t.tone === 'good' ? pal.paperGood : t.tone === 'soft' ? pal.paperSoft : pal.paperInk
    g.fillText(fit(g, t.value, 600, 46, 30, room), tx, y + 106)
  })

  // ── Signed ──
  g.font = font(500, 32)
  const signW = g.measureText(madeWith).width
  const signX = (W - (48 + 16 + signW)) / 2
  if (logo) {
    g.fillStyle = pal.paper
    roundRect(g, signX, 1552, 48, 48, 14)
    g.fill()
    g.drawImage(logo, signX + 5, 1557, 38, 38)
  }
  g.fillStyle = pal.muted
  g.fillText(madeWith, signX + 64, 1587)

  // ── And a party below the fold ──
  drawArt(g, popper, 170, 1780, 230, -14)
  drawArt(g, bag, W - 170, 1790, 210, 10)

  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not draw the image.'))), 'image/png')
  })
}
