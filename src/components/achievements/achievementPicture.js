import { glassBadgeSvg, glassPalette, svgUrl } from '../glass/glass'
import { LOGO_LARGE, seeded, seedOf } from '../../pages/recap/assets'
import {
  H, INNER, P, W, clip, font, loadFonts, loadImage, makeCanvas, roundRect, shadowed, toPng, wrap,
} from '../../pages/recap/canvasKit'

/**
 * An achievement as a picture to post: 1080 x 1920, a story's shape.
 *
 * The celebration screen, laid flat - the medallion on its rays in the
 * middle, the achievement's own colour washing down from the top into white,
 * its name in two big lines and what it means under them - with Spendr's mark
 * at the top and "Made with Spendr" at the foot. Nothing that needs reading
 * goes above 250 or below 1640, where a story's app draws its own things
 * (see canvasKit.js).
 *
 * @typedef {import('../../context/AchievementContext').Celebration} Celebration
 */

/** What a kind of achievement is called on its eyebrow. */
export const EYEBROW = {
  badge: 'Badge earned',
  milestone: 'Milestone reached',
  challenge: 'Challenge complete',
}

/** The second line of the title. */
export const CLOSER = { badge: 'Earned.', milestone: 'Reached.', challenge: 'Complete.' }

/* A name that already says what happened - "Goal Funded", "3 Challenges
   Won", "Debt Free" - says it twice with a closer after it ("100K Held
   Reached."), so it takes a full stop of its own instead. */
const SAYS_IT = /\b(won|held|funded|set|cleared|free|diversified|budget|limit|for)$/i

/**
 * The title, as both the screen and the picture set it: the name, then the
 * closer on a line of its own - or the name alone when it already says it.
 *
 * @param {{name: string, kind: 'badge'|'milestone'|'challenge'}} item
 * @returns {{name: string, closer: string}}
 */
export function titleOf(item) {
  const name = item.name.trim()
  return SAYS_IT.test(name) ? { name: `${name}.`, closer: '' } : { name, closer: CLOSER[item.kind] ?? '' }
}

/** The file it is saved as. @param {Celebration} item */
export function achievementFileName(item) {
  return `spendr-${item.kind}-${item.key}.png`
}

/** "26 Sep 2026". @param {string|null|undefined} iso */
export function earnedDate(iso) {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''
}

/**
 * @param {Celebration} item
 * @returns {Promise<Blob>}
 */
export async function renderAchievementPicture(item) {
  const pal = glassPalette(item.hue)
  const art = svgUrl(glassBadgeSvg({ glyph: item.glyph, hue: item.hue, shape: item.shape, level: item.level, id: 'p' }))
  const [logo, badge] = await Promise.all([
    loadImage(LOGO_LARGE),
    loadImage(art),
    loadFonts(`${item.name} ${item.blurb} ${EYEBROW[item.kind]} ${CLOSER[item.kind]}. Spendr Made with 0123456789 ${earnedDate(item.earnedAt)}`),
  ])
  const { canvas, g } = makeCanvas()
  const rand = seeded(seedOf(item.id))

  // The wash: the achievement's colour at the top, white by two thirds down.
  const wash = g.createLinearGradient(0, 0, 0, H)
  wash.addColorStop(0, pal.mid)
  wash.addColorStop(0.3, pal.light)
  wash.addColorStop(0.58, pal.pale)
  wash.addColorStop(0.8, '#FFFFFF')
  g.fillStyle = wash
  g.fillRect(0, 0, W, H)

  // Rays behind the medallion, faded to nothing at their ends.
  const cx = W / 2, cy = 830
  drawSoftRays(g, cx, cy, 700)
  const halo = g.createRadialGradient(cx, cy, 0, cx, cy, 420)
  halo.addColorStop(0, 'rgba(255, 255, 255, 0.75)')
  halo.addColorStop(1, 'rgba(255, 255, 255, 0)')
  g.fillStyle = halo
  g.fillRect(cx - 420, cy - 420, 840, 840)

  drawPaper(g, rand, pal)

  // The top: Spendr's mark and name, and when it was earned.
  shadowed(g, () => {
    g.fillStyle = '#FFFFFF'
    roundRect(g, P, 262, 80, 80, 24)
    g.fill()
  }, 24, 8, 0.14)
  if (logo) g.drawImage(logo, P + 8, 270, 64, 64)
  g.fillStyle = pal.deeper
  g.font = font(600, 46)
  g.fillText('Spendr', P + 104, 318)
  const when = earnedDate(item.earnedAt)
  if (when) {
    g.font = font(600, 32)
    const w = g.measureText(when).width + 52
    g.fillStyle = 'rgba(255, 255, 255, 0.7)'
    roundRect(g, W - P - w, 274, w, 58, 29)
    g.fill()
    g.fillStyle = pal.deeper
    g.textAlign = 'center'
    g.fillText(when, W - P - w / 2, 314)
    g.textAlign = 'left'
  }

  // The medallion.
  if (badge) {
    g.save()
    g.shadowColor = 'rgba(15, 23, 42, 0.22)'
    g.shadowBlur = 60
    g.shadowOffsetY = 30
    g.drawImage(badge, cx - 320, cy - 320, 640, 640)
    g.restore()
  }

  // What it is.
  g.textAlign = 'center'
  g.font = font(600, 34)
  const eyebrow = EYEBROW[item.kind].toUpperCase().split('').join(String.fromCharCode(8202))
  const ew = g.measureText(eyebrow).width + 64
  g.fillStyle = 'rgba(255, 255, 255, 0.85)'
  roundRect(g, cx - ew / 2, 1180, ew, 64, 32)
  g.fill()
  g.fillStyle = pal.deep
  g.fillText(eyebrow, cx, 1224)

  g.fillStyle = '#0F172A'
  g.font = font(700, 100)
  const title = titleOf(item)
  const nameLines = wrap(g, title.name, INNER, 2)
  let y = 1356
  for (const line of nameLines) { g.fillText(line, cx, y); y += 104 }
  if (title.closer) g.fillText(title.closer, cx, y)
  else y -= 104
  y += 70

  g.font = font(500, 42)
  g.fillStyle = '#475569'
  for (const line of wrap(g, item.blurb, INNER - 40, nameLines.length > 1 ? 1 : 2)) { g.fillText(line, cx, y); y += 54 }
  g.textAlign = 'left'

  // The foot.
  const madeWith = 'Made with Spendr'
  g.font = font(500, 32)
  const signW = g.measureText(madeWith).width
  const sx = (W - (48 + 16 + signW)) / 2
  const sy = Math.max(1606, y + 36)
  if (logo) {
    g.fillStyle = '#FFFFFF'
    roundRect(g, sx, sy - 35, 48, 48, 14)
    g.fill()
    g.drawImage(logo, sx + 5, sy - 30, 38, 38)
  }
  g.fillStyle = '#64748B'
  g.fillText(clip(g, madeWith, INNER), sx + 64, sy)

  return toPng(canvas)
}

/** Twelve soft wedges of white, drawn on their own layer and faded there. @param {CanvasRenderingContext2D} g @param {number} cx @param {number} cy @param {number} r */
function drawSoftRays(g, cx, cy, r) {
  const size = Math.ceil(r * 2)
  const layer = document.createElement('canvas')
  layer.width = layer.height = size
  const l = layer.getContext('2d')
  if (!l || typeof l.createConicGradient !== 'function') return
  const rays = l.createConicGradient(0, r, r)
  for (let i = 0; i < 14; i++) {
    const at = i / 14
    rays.addColorStop(at, 'rgba(255, 255, 255, 0.34)')
    rays.addColorStop(at + 0.028, 'rgba(255, 255, 255, 0.34)')
    rays.addColorStop(at + 0.029, 'rgba(255, 255, 255, 0)')
    rays.addColorStop(Math.min(1, at + 1 / 14 - 0.001), 'rgba(255, 255, 255, 0)')
  }
  l.fillStyle = rays
  l.fillRect(0, 0, size, size)
  const fade = l.createRadialGradient(r, r, r * 0.12, r, r, r)
  fade.addColorStop(0, 'rgba(0, 0, 0, 1)')
  fade.addColorStop(1, 'rgba(0, 0, 0, 0)')
  l.globalCompositeOperation = 'destination-in'
  l.fillStyle = fade
  l.fillRect(0, 0, size, size)
  g.drawImage(layer, cx - r, cy - r)
}

/**
 * Paper, in the achievement's own colours and a few warm ones, kept to the
 * bands a story's app draws over and the margins - never over the words.
 *
 * @param {CanvasRenderingContext2D} g @param {() => number} rand @param {import('../glass/glass').GlassPalette} pal
 */
function drawPaper(g, rand, pal) {
  const colours = [pal.deep, pal.mid, pal.light, '#FBBF24', '#F472B6', '#34D399']
  /** @type {Array<[number, number, number, number]>} */
  const areas = [[0, 30, W, 200], [0, 1680, W, 220], [0, 380, 90, 1200], [W - 90, 380, 90, 1200]]
  for (let i = 0; i < 44; i++) {
    const [ax, ay, aw, ah] = areas[i < 18 ? 0 : i < 32 ? 1 : i % 2 ? 2 : 3]
    const x = ax + rand() * aw, y = ay + rand() * ah
    const s = 8 + rand() * 9
    g.save()
    g.translate(x, y)
    g.rotate(rand() * Math.PI * 2)
    g.fillStyle = g.strokeStyle = colours[Math.floor(rand() * colours.length)]
    g.globalAlpha = 0.9
    const kind = Math.floor(rand() * 3)
    if (kind === 0) { roundRect(g, -s, -s * 0.4, s * 2, s * 0.8, 3); g.fill() }
    else if (kind === 1) { g.beginPath(); g.arc(0, 0, s * 0.55, 0, Math.PI * 2); g.fill() }
    else { g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, s, Math.PI * 1.1, Math.PI * 1.9); g.stroke() }
    g.restore()
  }
}
