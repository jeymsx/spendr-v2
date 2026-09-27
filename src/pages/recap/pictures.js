import { formatAmount, maskedAmount } from '../../lib/currency'
import { achievementArt, achievementDef, earnedLabel } from '../../lib/achievements'
import { glassBadgeSvg } from '../../components/glass/glass'
import { monthName, parseMonth } from '../../lib/recap'
import {
  budgetsCopy, dayLabel, daysCopy, heroAmount, keptCopy, netWorthCopy, percent, personalityOf,
  spentCopy, summaryHero, summaryTiles, weeksOf,
} from '../../lib/recapCopy'
import { EMOJI_GLASS, LOGO_LARGE, artSvg, glassForEmoji, seeded, seedOf } from './assets'
import {
  H, INNER, P, W, clip, cssLinear, drawArt, drawBrand, drawChip, drawConfetti, drawEmoji, drawPill, drawRays,
  drawSign, drawSticker, drawSurface, drawTile, drawWrappedMark, ellipseGlow, fit, font, glow, loadFonts,
  loadGlass, loadImage, makeCanvas, rgba, roundRect, shadowed, toPng, wrap,
} from './canvasKit'

/**
 * Every slide of the story as a picture to post: the slide's own colours,
 * its words and its drawing, at 1080 x 1920 (canvasKit.js has the frame and
 * why it is drawn by hand).
 *
 * ── With the amounts, or without ──
 *
 * `hideAmounts` is for posting somewhere public. No sum of money is drawn:
 * a headline that was an amount becomes a share or a count - "Kept 27%",
 * "63 purchases" - and every other amount on the picture is masked the way
 * the app masks a hidden balance. What was not money - a category, a day, a
 * place, a percentage - stays, because it is the story.
 */

/** @typedef {import('../../lib/recap').Recap} Recap */
/** @typedef {import('./theme').RecapPalette} RecapPalette */
/** @typedef {import('./theme').CardTone} CardTone */

/**
 * @typedef {object} Picture
 * @property {Recap} recap
 * @property {string} currency
 * @property {RecapPalette} pal
 * @property {CardTone} tone
 * @property {string} [name]
 * @property {boolean} hide
 * @property {HTMLImageElement|null} logo
 * @property {Record<string, CanvasImageSource|null>} art
 * @property {Array<CanvasImageSource|null>} badges
 * @property {Record<string, CanvasImageSource|null>} marks  glass marks for chips and tiles, by picture name
 * @property {() => number} rand
 * @property {(v: number) => string} money   an exact amount, or its mask
 * @property {string} month  "August"
 * @property {number} year
 * @property {string} look   the summary's look: one of SUMMARY_LOOKS
 */

/**
 * The summary, four ways, for the share sheet to slide between: the story's
 * own card, in colour, and three of the looks Spendr itself comes in - dark
 * and light, the accent's light behind the app's own cards, and Lights out,
 * true black and flat. The same words and figures in all four (appLook).
 */
export const SUMMARY_LOOKS = [
  { id: 'colour', name: 'Colour' },
  { id: 'dark', name: 'Dark' },
  { id: 'light', name: 'Light' },
  { id: 'lightsout', name: 'Lights out' },
]

/**
 * The file a slide's picture is saved as.
 *
 * @param {string} month "2026-08" @param {string} [id] @param {string} [look]
 */
export function pictureName(month, id = 'summary', look = 'colour') {
  if (id !== 'summary') return `spendr-wrapped-${month}-${id}.png`
  return look === 'colour' ? `spendr-wrapped-${month}.png` : `spendr-wrapped-${month}-${look}.png`
}

/** The illustrations each picture draws, loaded before it starts. */
const NEEDS = {
  intro: ['wrapped-gift', 'sparkles'],
  spent: ['money-with-wings', 'coin'],
  kept: ['pig-face', 'coin', 'face-exhaling'],
  categories: [],
  days: ['spiral-calendar'],
  biggest: ['shopping-bags'],
  goto: ['round-pushpin'],
  budgets: ['bullseye', 'face-exhaling'],
  networth: ['rocket', 'chart-decreasing'],
  badges: ['glowing-star', 'sparkles'],
  personality: [],
  summary: ['wrapped-gift', 'sparkles'],
}

/* The size glass is flattened at (see loadGlass): the illustrations and the
   badges are drawn at up to 520 and 380, the marks on chips and tiles at 92. */
const ART_PX = 640
const MARK_PX = 192

/** Where a slide's headline sits, and the line under it. */
const HEAD_Y = 640
const LINE_Y = 704
/** Where each picture's drawing starts and must end. */
const ART_TOP = 790
const ART_BOTTOM = 1510

/**
 * @param {object} input
 * @param {string} input.id           the slide: 'spent', 'kept', ... or 'summary'
 * @param {Recap} input.recap
 * @param {string} input.currency
 * @param {RecapPalette} input.pal
 * @param {CardTone} [input.tone]     the slide's own card; the summary's is the first
 * @param {string} [input.name]
 * @param {boolean} [input.hideAmounts]
 * @param {string} [input.look]       the summary's look (SUMMARY_LOOKS); the other slides have one
 * @returns {Promise<Blob>}
 */
export async function renderPicture({ id, recap, currency, pal, tone, name, hideAmounts = false, look = 'colour' }) {
  const kind = /** @type {keyof typeof DRAW} */ (id in DRAW ? id : 'summary')
  const persona = kind === 'personality' ? personalityOf(recap) : null
  const artNames = persona ? [persona.art] : NEEDS[kind]
  const badgeSvgs = kind === 'badges'
    ? recap.badges.slice(0, 6).map((b, i) => {
      const art = achievementArt(b.key)
      return art ? glassBadgeSvg({ ...art, id: `pb${i}`, size: ART_PX }) : null
    })
    : []
  /* The glass marks on chips and tiles, all of them: a few small pictures,
     cached after the first, and simpler than working out which this slide's
     copy will ask for. */
  const markNames = [...new Set(Object.values(EMOJI_GLASS))]
  const [logo, arts, badges, marks] = await Promise.all([
    loadImage(LOGO_LARGE),
    Promise.all(artNames.map(n => loadGlass(artSvg(n, pal.accent, undefined, ART_PX), ART_PX))),
    Promise.all(badgeSvgs.map(svg => (svg ? loadGlass(svg, ART_PX) : null))),
    Promise.all(markNames.map(n => loadGlass(artSvg(n, pal.accent, 0, MARK_PX), MARK_PX))),
    loadFonts(sampleText(recap, name)),
  ])
  const { year } = parseMonth(recap.month)
  /** @type {Picture} */
  const c = {
    recap, currency, pal, name,
    tone: kind === 'summary' || !tone ? pal.tones[0] : tone,
    hide: hideAmounts,
    logo,
    art: Object.fromEntries(artNames.map((n, i) => [n, arts[i]])),
    badges,
    marks: Object.fromEntries(markNames.map((n, i) => [n, marks[i]])),
    rand: seeded(seedOf(`${recap.month}-${kind}`)),
    money: v => (hideAmounts ? maskedAmount(currency) : formatAmount(v, currency)),
    month: monthName(recap.month),
    year,
    look,
  }
  const { canvas, g } = makeCanvas()
  DRAW[kind](g, c)
  return toPng(canvas)
}

/**
 * Everything a picture might draw in words, so every font file it needs is
 * loaded first - an accented name, a peso sign, a category in another script.
 *
 * @param {Recap} r
 * @param {string} [name]
 */
function sampleText(r, name) {
  const p = personalityOf(r)
  return [
    name ?? '', monthName(r.month), 'Spendr Wrapped Made with Loyalty card Thank you for tracking Total',
    '0123456789 ₱$€£¥•×↑↓≈–…%', ...r.categories.map(x => x.name), r.goTo?.label ?? '',
    r.biggest?.description ?? '', r.biggest?.category ?? '', ...r.badges.map(b => b.name),
    ...(r.budgets?.rows.map(x => x.name) ?? []), p.name, p.line, ...p.traits.map(t => t.text),
  ].join(' ')
}

// ── The frame every slide's picture shares ───────────────────────────────

/** @param {CanvasRenderingContext2D} g @param {Picture} c @param {string} emoji @param {string} label */
function frame(g, c, emoji, label) {
  drawSurface(g, c.pal, c.tone)
  drawBrand(g, c.pal, c.logo, `${c.month} ${c.year}`)
  drawChip(g, c.pal, emoji, label, undefined, undefined, markOf(c, emoji))
  drawSign(g, c.pal, c.logo)
}

/** The glass mark for an emoji or a named picture, if one is loaded. @param {Picture} c @param {string|undefined} emoji @param {string} [art] */
function markOf(c, emoji, art) {
  const name = art ?? glassForEmoji(emoji)
  return name ? c.marks[name] ?? null : null
}

/**
 * The headline: a figure or a name, as big as fits one line.
 *
 * @param {CanvasRenderingContext2D} g @param {Picture} c @param {string} text
 * @param {{color?: string, max?: number, min?: number, y?: number}} [o]
 */
function headline(g, c, text, { color, max = 150, min = 84, y = HEAD_Y } = {}) {
  const t = fit(g, text, 600, max, min, INNER)
  g.fillStyle = color ?? c.pal.ink
  g.fillText(t, P, y)
}

/**
 * A name as the headline - a place, a thing bought - where a figure would
 * be: one line as large as fits, or two smaller ones before it is cut. The
 * last line sits where a figure's would.
 *
 * @param {CanvasRenderingContext2D} g @param {Picture} c @param {string} text
 */
function nameHeadline(g, c, text) {
  g.fillStyle = c.pal.ink
  for (let size = 110; size >= 92; size -= 6) {
    g.font = font(600, size)
    if (g.measureText(text).width <= INNER) {
      g.fillText(text, P, HEAD_Y)
      return
    }
  }
  g.font = font(600, 80)
  const lines = wrap(g, text, INNER, 2)
  lines.forEach((l, i) => g.fillText(l, P, HEAD_Y - (lines.length - 1 - i) * 86))
}

/** @param {CanvasRenderingContext2D} g @param {Picture} c @param {string} text @param {number} [y] @param {string} [color] */
function subline(g, c, text, y = LINE_Y, color) {
  g.font = font(500, 40)
  g.fillStyle = color ?? c.pal.muted
  g.fillText(clip(g, text, INNER), P, y)
}

/**
 * A row's emoji on its tile, as the slide has it: paper for the row picked
 * out, a wash of white for the rest.
 *
 * @param {CanvasRenderingContext2D} g @param {Picture} c @param {string} emoji
 * @param {number} cx @param {number} cy @param {boolean} [on]
 */
function rowTile(g, c, emoji, cx, cy, on = false, d = 92) {
  g.fillStyle = on ? c.pal.paper : c.pal.track
  roundRect(g, cx - d / 2, cy - d / 2, d, d, d * 0.4)
  g.fill()
  drawEmoji(g, emoji, cx, cy + 2, Math.round(d * 0.5))
}

/** A bar and its fill. @param {CanvasRenderingContext2D} g @param {number} x @param {number} y @param {number} w @param {number} share @param {string} color */
function bar(g, x, y, w, share, color, h = 16) {
  g.fillStyle = 'rgba(255, 255, 255, 0.18)'
  roundRect(g, x, y, w, h, h / 2)
  g.fill()
  if (share <= 0) return
  g.fillStyle = color
  roundRect(g, x, y, Math.max(h, w * Math.min(1, share)), h, h / 2)
  g.fill()
}

/** The arrow and colour of a comparison with last month. @param {Recap} r @param {RecapPalette} pal */
function comparisonColor(r, pal) {
  const d = r.spentChange?.direction
  if (r.firstMonth || r.prev.partial || !d || d === 'same') return pal.ink
  return d === 'less' ? pal.good : pal.soft
}

// ── The slides ───────────────────────────────────────────────────────────

const DRAW = {
  /** @param {CanvasRenderingContext2D} g @param {Picture} c */
  intro(g, c) {
    const r = c.recap
    drawSurface(g, c.pal, c.tone)
    drawConfetti(g, c.rand, 30)
    drawBrand(g, c.pal, c.logo, String(c.year))
    g.fillStyle = c.pal.muted
    g.font = font(500, 44)
    g.fillText(clip(g, c.name ? `${c.name}'s month in money` : 'Your month in money', INNER), P, 440)
    g.fillStyle = c.pal.ink
    g.fillText(fit(g, c.month, 600, 180, 110, INNER), P, 600)
    drawWrappedMark(g, c.pal, P + 40, 668, 84)

    drawRays(g, 540, 1140, 540)
    glow(g, 540, 1140, 360, c.pal.glow, 0.5)
    drawArt(g, c.art['wrapped-gift'], 540, 1140, 520, -6)
    drawArt(g, c.art.sparkles, 800, 900, 150, 0)
    const icons = [...r.categories.map(x => x.icon).filter(Boolean), '💸', '🛍️', '🧾'].slice(0, 3)
    drawSticker(g, c.pal, /** @type {string} */ (icons[0]), 230, 960, 132, -12)
    drawSticker(g, c.pal, /** @type {string} */ (icons[1]), 860, 1250, 118, 10)
    drawSticker(g, c.pal, /** @type {string} */ (icons[2]), 290, 1400, 104, -6)
    drawSign(g, c.pal, c.logo)
  },

  /** @param {CanvasRenderingContext2D} g @param {Picture} c */
  spent(g, c) {
    const r = c.recap
    const copy = spentCopy(r, c.currency)
    frame(g, c, copy.refunds ? '🎉' : '💸', copy.label)
    const count = `${r.purchaseCount.toLocaleString('en-US')} ${r.purchaseCount === 1 ? 'purchase' : 'purchases'}`
    headline(g, c, c.hide ? count : heroAmount(copy.value, c.currency), { color: copy.tone === 'good' ? c.pal.good : c.pal.ink })
    if (copy.line) drawPill(g, copy.line, copy.refunds ? c.pal.good : comparisonColor(r, c.pal), P, 676)

    const rows = copy.refunds
      ? [{ label: 'Bought', value: c.money(r.purchases) }, { label: 'Refunds', value: c.hide ? c.money(0) : `−${c.money(r.refunded)}` }]
      : weeksOf(r).map(w => ({ label: w.label.toUpperCase(), value: w.amount < 0 && !c.hide ? `−${c.money(-w.amount)}` : c.money(w.amount) }))
    const total = c.hide ? c.money(0) : r.spent < 0 ? `−${c.money(-r.spent)}` : c.money(r.spent)
    const sub = c.hide ? count : `${count} · ${c.money(r.avgPerDay)} a day`
    receipt(g, c, rows, total, sub, copy.refunds)
    drawArt(g, copy.refunds ? c.art.coin : c.art['money-with-wings'], 900, 800, 220, 14)
  },

  /** @param {CanvasRenderingContext2D} g @param {Picture} c */
  kept(g, c) {
    const r = c.recap
    const copy = keptCopy(r, c.currency)
    const kept = r.net > 0
    const spentShare = r.income > 0 ? Math.max(0, r.spent) / r.income : 0
    frame(g, c, kept ? '🐷' : r.net < 0 ? '🌱' : '⚖️', copy.label)
    headline(g, c, c.hide ? (kept ? percent(r.savingsRate ?? 0) : `${Math.round(spentShare * 100)}%`) : heroAmount(copy.value, c.currency), {
      color: copy.tone === 'good' ? c.pal.good : c.pal.soft,
    })
    subline(g, c, c.hide ? (kept ? 'of what came in, kept' : 'of what came in, spent') : (copy.line ?? ''))

    const cx = 540, cy = 1050, R = 230
    const share = kept ? Math.min(1, r.savingsRate ?? 0) : 1
    const [from, to] = kept ? ['#DCFCE7', '#4ADE80'] : ['#FFEDD5', '#FB923C']
    g.save()
    g.strokeStyle = 'rgba(255, 255, 255, 0.18)'
    g.lineWidth = 12
    const around = 2 * Math.PI * 282
    g.setLineDash([3, around / 60 - 3])
    g.beginPath()
    g.arc(cx, cy, 282, 0, Math.PI * 2)
    g.stroke()
    g.restore()
    g.lineWidth = 56
    g.strokeStyle = 'rgba(255, 255, 255, 0.18)'
    g.beginPath()
    g.arc(cx, cy, R, 0, Math.PI * 2)
    g.stroke()
    if (share > 0) {
      const grad = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R)
      grad.addColorStop(0, from)
      grad.addColorStop(1, to)
      g.save()
      g.shadowColor = rgba(to, 0.6)
      g.shadowBlur = 24
      g.strokeStyle = grad
      g.lineCap = 'round'
      g.beginPath()
      g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + share * Math.PI * 2)
      g.stroke()
      g.restore()
    }
    glow(g, cx, cy, 200, c.pal.glow, 0.4)
    if (kept) {
      drawArt(g, c.art.coin, cx, cy - 150, 100, -12)
      drawArt(g, c.art['pig-face'], cx, cy + 20, 290, 0)
    } else {
      drawArt(g, c.art['face-exhaling'], cx, cy, 300, 0)
    }
    // The label on the ring's foot.
    const label = kept ? `${percent(share)} kept` : r.net < 0 ? 'Spent it all' : 'Broke even'
    g.font = font(600, 38)
    const lw = g.measureText(label).width + 64
    g.save()
    g.translate(cx, cy + R + 8)
    g.rotate((-3 * Math.PI) / 180)
    shadowed(g, () => {
      g.fillStyle = c.pal.paper
      roundRect(g, -lw / 2, -38, lw, 76, 38)
      g.fill()
    }, 20, 8, 0.2)
    g.fillStyle = kept ? c.pal.paperGood : c.pal.paperSoft
    g.textAlign = 'center'
    g.fillText(label, 0, 13)
    g.restore()
    g.textAlign = 'left'

    const tileW = (INNER - 24) / 2
    const left = r.spent > 0
      ? { emoji: '💸', art: 'cash', label: 'Spent', value: c.hide ? `${Math.round(spentShare * 100)}%` : heroAmount(r.spent, c.currency), tone: /** @type {const} */ (r.net < 0 ? 'soft' : undefined) }
      : { emoji: '💰', art: 'moneyBag', label: 'Came in', value: c.hide ? '100%' : heroAmount(r.income, c.currency) }
    const right = kept
      ? { emoji: '🐷', art: 'piggy', label: 'Kept', value: c.hide ? percent(r.savingsRate ?? 0) : heroAmount(r.net, c.currency), tone: /** @type {const} */ ('good') }
      : { emoji: '💰', art: 'moneyBag', label: 'Came in', value: c.hide ? '100%' : heroAmount(r.income, c.currency) }
    drawTile(g, c.pal, left, P, 1380, tileW, 130, markOf(c, left.emoji, left.art))
    drawTile(g, c.pal, right, P + tileW + 24, 1380, tileW, 130, markOf(c, right.emoji, right.art))
  },

  /** @param {CanvasRenderingContext2D} g @param {Picture} c */
  categories(g, c) {
    const r = c.recap
    const top = r.categories[0]
    frame(g, c, '🏆', 'Most went to')
    headline(g, c, top.name, { max: 120, min: 72 })
    subline(g, c, c.hide ? `${percent(top.share)} of your spending` : `${c.money(top.amount)} · ${percent(top.share)} of your spending`)
    const room = 6
    const rows = r.categories.length <= room ? r.categories : [
      ...r.categories.slice(0, room - 1),
      {
        name: 'Everything else', icon: '🧺',
        amount: r.categories.slice(room - 1).reduce((s, x) => s + x.amount, 0),
        share: r.categories.slice(room - 1).reduce((s, x) => s + x.share, 0),
      },
    ]
    const max = Math.max(...rows.map(x => x.amount), 1)
    rows.forEach((x, i) => {
      const y = ART_TOP + i * 118
      rowTile(g, c, x.icon || '🏷️', P + 46, y + 46, i === 0)
      const tx = P + 120, tw = INNER - 120
      g.font = font(600, 34)
      const value = c.hide ? percent(x.share) : formatAmount(x.amount, c.currency)
      const vw = g.measureText(value).width
      g.fillStyle = i === 0 ? c.pal.ink : c.pal.muted
      g.fillText(value, W - P - vw, y + 42)
      g.font = font(600, 38)
      g.fillText(clip(g, x.name, tw - vw - 30), tx, y + 42)
      bar(g, tx, y + 66, tw, x.amount / max, i === 0 ? c.pal.ink : 'rgba(255, 255, 255, 0.6)')
    })
  },

  /** @param {CanvasRenderingContext2D} g @param {Picture} c */
  days(g, c) {
    const r = c.recap
    const busiest = /** @type {NonNullable<Recap['busiestDay']>} */ (r.busiestDay)
    frame(g, c, '🔥', 'Your busiest day')
    drawArt(g, c.art['spiral-calendar'], W - P - 70, 560, 160, 8)
    headline(g, c, dayLabel(r.month, busiest.day))
    subline(g, c, c.hide ? daysCopy(r).noSpend : `${formatAmount(busiest.amount, c.currency)} spent · ${daysCopy(r).noSpend}`)

    const [y, m] = r.month.split('-').map(Number)
    const lead = new Date(y, m - 1, 1).getDay()
    const weeks = Math.ceil((lead + r.daily.length) / 7)
    const gap = 14
    const head = 50
    const cell = Math.floor(Math.min((INNER - gap * 6) / 7, (ART_BOTTOM - ART_TOP - head - gap * (weeks - 1)) / weeks))
    const gridW = cell * 7 + gap * 6
    const x0 = (W - gridW) / 2
    g.font = font(600, 30)
    g.fillStyle = c.pal.muted
    g.textAlign = 'center'
    ;['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d, i) => g.fillText(d, x0 + i * (cell + gap) + cell / 2, ART_TOP + 30))
    const spent = r.daily.filter(d => d.amount > 0).map(d => d.amount).sort((a, b) => a - b)
    const rank = new Map(spent.map((v, i) => [v, spent.length > 1 ? i / (spent.length - 1) : 1]))
    r.daily.forEach((d, i) => {
      const at = lead + i
      const cx = x0 + (at % 7) * (cell + gap), cy = ART_TOP + head + Math.floor(at / 7) * (cell + gap)
      const alpha = d.amount > 0 ? 0.22 + 0.74 * (rank.get(d.amount) ?? 0) : 0.07
      g.fillStyle = `rgba(255, 255, 255, ${alpha})`
      roundRect(g, cx, cy, cell, cell, cell * 0.28)
      g.fill()
      g.fillStyle = alpha > 0.55 ? c.pal.deepInk : c.pal.muted
      g.font = font(600, Math.round(cell * 0.32))
      g.fillText(String(d.day), cx + cell / 2, cy + cell / 2 + cell * 0.11)
      // On the day's top corner, as if stuck there.
      if (d.day === busiest.day) {
        const flame = c.marks.flame
        const s = Math.round(cell * 0.62)
        if (flame) g.drawImage(flame, cx + cell - s * 0.62, cy - s * 0.42, s, s)
        else drawEmoji(g, '🔥', cx + cell - 8, cy + 10 - cell * 0.15, Math.round(cell * 0.5))
      }
    })
    g.textAlign = 'left'
  },

  /** @param {CanvasRenderingContext2D} g @param {Picture} c */
  biggest(g, c) {
    const r = c.recap
    const b = /** @type {NonNullable<Recap['biggest']>} */ (r.biggest)
    const date = dayLabel(r.month, b.day)
    frame(g, c, '🛍️', 'Biggest purchase')
    if (c.hide) {
      nameHeadline(g, c, b.description)
      subline(g, c, `${b.category} · ${date}`)
    } else {
      headline(g, c, heroAmount(b.amount, c.currency))
      subline(g, c, `${b.description} · ${date}`)
    }
    glow(g, 400, 1180, 330, c.pal.glow, 0.45)
    drawArt(g, c.art['shopping-bags'], 400, 1180, 520, -4)
    priceTag(g, c, b.icon || '🏷️', b.category, date)
  },

  /** @param {CanvasRenderingContext2D} g @param {Picture} c */
  goto(g, c) {
    const r = c.recap
    const gt = /** @type {NonNullable<Recap['goTo']>} */ (r.goTo)
    frame(g, c, '📍', 'Your go-to')
    nameHeadline(g, c, gt.label)
    subline(g, c, c.hide ? `${gt.count} times` : `${gt.count} times · ${c.money(gt.amount)}`)
    stampCard(g, c, gt.count, gt.icon || '⭐')
  },

  /** @param {CanvasRenderingContext2D} g @param {Picture} c */
  budgets(g, c) {
    const r = c.recap
    const b = /** @type {NonNullable<Recap['budgets']>} */ (r.budgets)
    const copy = /** @type {NonNullable<ReturnType<typeof budgetsCopy>>} */ (budgetsCopy(r))
    frame(g, c, '🎯', 'Budgets')
    drawArt(g, b.under === 0 ? c.art['face-exhaling'] : c.art.bullseye, W - P - 80, 560, 180, 6)
    headline(g, c, copy.value, { max: 150, min: 90 })
    subline(g, c, copy.line)
    b.rows.slice(0, 5).forEach((x, i) => {
      const y = ART_TOP + 10 + i * 142
      rowTile(g, c, x.icon || '🏷️', P + 46, y + 46)
      const tx = P + 120, tw = INNER - 120
      g.font = font(600, 26)
      const over = x.over ? 'OVER' : ''
      const ow = over ? g.measureText(over).width : 0
      if (over) {
        g.fillStyle = c.pal.soft
        g.fillText(over, W - P - ow, y + 32)
      }
      g.fillStyle = c.pal.ink
      g.font = font(600, 36)
      g.fillText(clip(g, x.name, tw - ow - 24), tx, y + 34)
      bar(g, tx, y + 56, tw, x.limit > 0 ? x.spent / x.limit : 1, x.over ? c.pal.soft : c.pal.good)
      g.font = font(500, 30)
      g.fillStyle = x.over ? c.pal.soft : c.pal.muted
      const pct = x.limit > 0 ? Math.round((x.spent / x.limit) * 100) : 100
      g.fillText(clip(g, c.hide ? `${pct}% of the budget` : `${formatAmount(x.spent, c.currency)} of ${formatAmount(x.limit, c.currency)}`, tw), tx, y + 112)
    })
  },

  /** @param {CanvasRenderingContext2D} g @param {Picture} c */
  networth(g, c) {
    const r = c.recap
    const nw = /** @type {NonNullable<Recap['netWorth']>} */ (r.netWorth)
    const copy = /** @type {NonNullable<ReturnType<typeof netWorthCopy>>} */ (netWorthCopy(r, c.currency))
    const up = nw.change > 0
    frame(g, c, up ? '📈' : '📉', copy.label)
    const pct = nw.start > 0 ? Math.round(Math.abs(nw.change / nw.start) * 100) : null
    headline(g, c, c.hide ? `${up ? 'Up' : 'Down'}${pct != null ? ` ${pct}%` : ''}` : heroAmount(nw.end, c.currency))
    drawPill(g, c.hide ? `Since ${dayLabel(r.month, 1)}` : `${up ? '↑' : '↓'} ${copy.line}`, up ? c.pal.good : c.pal.soft, P, 676)

    const stroke = up ? c.pal.good : c.pal.soft
    const top = 880, bottom = 1400, x0 = P, x1 = W - P
    const vals = nw.series.map(s => s.value)
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1
    const pts = nw.series.map((s, i) => [
      nw.series.length > 1 ? x0 + (i / (nw.series.length - 1)) * (x1 - x0) : (x0 + x1) / 2,
      top + (1 - (s.value - lo) / span) * (bottom - top),
    ])
    const area = g.createLinearGradient(0, top, 0, bottom)
    area.addColorStop(0, rgba(stroke, 0.42))
    area.addColorStop(1, rgba(stroke, 0))
    g.beginPath()
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.lineTo(pts[pts.length - 1][0], bottom)
    g.lineTo(pts[0][0], bottom)
    g.closePath()
    g.fillStyle = area
    g.fill()
    g.beginPath()
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.strokeStyle = stroke
    g.lineWidth = 8
    g.lineJoin = 'round'
    g.lineCap = 'round'
    g.stroke()
    const [ex, ey] = pts[pts.length - 1]
    g.fillStyle = stroke
    g.beginPath()
    g.arc(ex, ey, 24, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = c.pal.paper
    g.beginPath()
    g.arc(ex, ey, 14, 0, Math.PI * 2)
    g.fill()
    drawArt(g, up ? c.art.rocket : c.art['chart-decreasing'], Math.min(ex, x1 - 90), Math.max(ey - 120, top - 60), 200, 0)
    g.font = font(500, 32)
    g.fillStyle = c.pal.muted
    g.fillText(dayLabel(r.month, nw.series[0]?.day ?? 1), x0, bottom + 60)
    const end = dayLabel(r.month, nw.series[nw.series.length - 1]?.day ?? r.days)
    g.fillText(end, x1 - g.measureText(end).width, bottom + 60)
  },

  /** @param {CanvasRenderingContext2D} g @param {Picture} c */
  badges(g, c) {
    const r = c.recap
    const n = r.badges.length
    const defs = r.badges.map(b => achievementDef(b.key) ?? { ...b, blurb: '' })
    frame(g, c, '🏅', earnedLabel(r.badges.map(b => b.key)))
    drawConfetti(g, c.rand, 24)
    headline(g, c, n === 1 ? defs[0].name : 'Look at you go', { max: 120, min: 72 })
    subline(g, c, n === 1 && defs[0].blurb ? defs[0].blurb : `Earned in ${c.month}`)
    drawRays(g, 540, 1140, 560)
    const shown = defs.slice(0, 6)
    const cols = Math.min(3, shown.length)
    const size = cols === 1 ? 380 : cols === 2 ? 320 : 250
    const rows = Math.ceil(shown.length / cols)
    const gapX = 50, rowH = size + 90
    const y0 = 1140 - (rows * rowH) / 2 + 20
    shown.forEach((b, i) => {
      const row = Math.floor(i / cols), inRow = Math.min(cols, shown.length - row * cols)
      const rowW = inRow * size + (inRow - 1) * gapX
      const x = (W - rowW) / 2 + (i % cols) * (size + gapX)
      const y = y0 + row * rowH
      const img = c.badges[i]
      if (img) drawArt(g, img, x + size / 2, y + size / 2, size, 0)
      if (n > 1) {
        g.font = font(600, 34)
        g.fillStyle = c.pal.ink
        g.textAlign = 'center'
        g.fillText(clip(g, b.name, size + 30), x + size / 2, y + size + 50)
        g.textAlign = 'left'
      }
    })
    drawArt(g, c.art['glowing-star'], 170, 860, 130, 0)
    drawArt(g, c.art.sparkles, W - 170, 1440, 120, 0)
  },

  /** @param {CanvasRenderingContext2D} g @param {Picture} c */
  personality(g, c) {
    const p = personalityOf(c.recap)
    frame(g, c, '✨', 'Your money personality')
    drawConfetti(g, c.rand, 30)

    /* Laid out from the foot up, as the slide wraps it: the facts as paper
       pills in rows - every one of them, however many rows that takes - the
       line over them, the name over that, and the drawing in what is left. */
    const PILL_H = 76, PILL_GAP = 16, ROW_GAP = 14
    g.font = font(600, 32)
    /** @type {Array<Array<{emoji: string, text: string, w: number}>>} */
    const rows = []
    for (const t of p.traits) {
      const text = clip(g, t.text, INNER - 108)
      const pill = { emoji: t.emoji, text, w: 108 + g.measureText(text).width }
      const row = rows[rows.length - 1]
      const used = row ? row.reduce((s, x) => s + x.w + PILL_GAP, 0) : 0
      if (row && used + pill.w <= INNER) row.push(pill)
      else rows.push([pill])
    }
    const pillsTop = 1532 - (rows.length ? rows.length * PILL_H + (rows.length - 1) * ROW_GAP : 0)
    g.font = font(500, 40)
    const lines = wrap(g, p.line, INNER, 2)
    const lineY = pillsTop - 46 - (lines.length - 1) * 50
    const nameY = lineY - 70

    // The drawing: centred between the chip and the name, as large as fits.
    const top = 520, bottom = nameY - 130
    const size = Math.min(460, bottom - top)
    const cy = (top + bottom) / 2
    drawRays(g, 540, cy, size * 1.08)
    glow(g, 540, cy, size * 0.72, c.pal.glow, 0.5)
    drawArt(g, c.art[p.art], 540, cy, size, -4)
    drawSticker(g, c.pal, p.emoji, 540 + size * 0.6, cy - size * 0.45, 150, 10)

    g.fillStyle = c.pal.ink
    g.textAlign = 'center'
    g.fillText(fit(g, p.name, 600, 130, 80, INNER), W / 2, nameY)
    g.font = font(500, 40)
    g.fillStyle = c.pal.muted
    lines.forEach((l, i) => g.fillText(l, W / 2, lineY + i * 50))
    g.textAlign = 'left'

    rows.forEach((row, ri) => {
      const rowW = row.reduce((s, x) => s + x.w, 0) + (row.length - 1) * PILL_GAP
      let x = (W - rowW) / 2
      const y = pillsTop + ri * (PILL_H + ROW_GAP)
      for (const t of row) {
        shadowed(g, () => {
          g.fillStyle = c.pal.paper
          roundRect(g, x, y, t.w, PILL_H, PILL_H / 2)
          g.fill()
        }, 18, 6, 0.16)
        const mark = markOf(c, t.emoji, t.art)
        if (mark) g.drawImage(mark, x + 18, y + 12, 52, 52)
        else drawEmoji(g, t.emoji, x + 28, y + 40, 34, 'left')
        g.font = font(600, 32)
        g.fillStyle = c.pal.deepInk
        g.fillText(t.text, x + 80, y + 50)
        x += t.w + PILL_GAP
      }
    })
  },

  /**
   * The month on one card. In colour it is the story's own last card, plain -
   * no confetti, nothing below the fold - so the figures are the picture. In
   * any other look it is Spendr's own screen (summaryInLook).
   *
   * @param {CanvasRenderingContext2D} g @param {Picture} c
   */
  summary(g, c) {
    if (c.look && c.look !== 'colour') {
      summaryInLook(g, c, appLook(c.look, c.pal))
      return
    }
    const r = c.recap
    const hero = summaryHero(r, c.currency, { hideAmounts: c.hide })
    const tiles = summaryTiles(r, c.currency, { hideAmounts: c.hide })
    drawSurface(g, c.pal, c.tone)
    drawBrand(g, c.pal, c.logo, String(c.year))

    // The gift, beside the title.
    glow(g, 862, 500, 250, '#FFFFFF', 0.3)
    drawArt(g, c.art['wrapped-gift'], 862, 500, 300, 8)
    drawArt(g, c.art.sparkles, 740, 345, 96, -6)

    // Whose month, which month, and the label over its foot.
    const titleW = 600
    g.fillStyle = c.pal.muted
    g.font = font(500, 44)
    g.fillText(clip(g, c.name ? `${c.name}'s` : 'My', titleW), P, 440)
    g.fillStyle = c.pal.ink
    g.fillText(fit(g, c.month, 600, 150, 88, titleW), P, 578)
    drawWrappedMark(g, c.pal, P + 36, 640, 80)

    // What it came to.
    g.fillStyle = c.pal.muted
    g.font = font(500, 40)
    g.fillText(hero.label, P, 806)
    g.fillStyle = c.pal.ink
    g.fillText(fit(g, hero.value, 600, 156, 80, INNER), P, 948)
    if (hero.line) drawPill(g, hero.line, c.pal.ink, P, 976)

    // The tiles: the slide's own, two by three.
    const tileW = (INNER - 24) / 2
    tiles.forEach((t, i) => drawTile(g, c.pal, t, P + (i % 2) * (tileW + 24), 1084 + Math.floor(i / 2) * 156, tileW, 136, markOf(c, t.emoji, t.art)))

    drawSign(g, c.pal, c.logo)
  },
}

// ── The summary in Spendr's own looks ────────────────────────────────────

/**
 * @typedef {object} Look
 * @property {string} ground     the screen behind everything
 * @property {Array<[number, number, number, number, Array<[number, string]>]>} glows
 *           the accent's light on it: x, y and the two radii as shares of the
 *           picture, as CSS's radial-gradient(rx ry at x y) has them, and stops
 * @property {string} ink
 * @property {string} muted
 * @property {string} label      a tile's small caps
 * @property {string} good
 * @property {string} soft
 * @property {{fill: string, stroke: string, shadow: string|null, rim: string|null}} card  a tile
 * @property {boolean} wallet    the hero on the wallet's leather, or on a plain panel
 * @property {{fill: string, text: string}} pill  the verdict under the hero's figure
 * @property {{fill: string, stroke: string, text: string}} year  the pill beside the name
 * @property {{paper: string, ink: string}} mark  the "Wrapped" label
 * @property {number} giftGlow   how strongly the accent glows behind the gift: 0, not at all
 * @property {number} lift       the shadow under the logo and the wallet
 * @property {string|null} logoRim  a hairline around the logo's white tile, on a ground as pale as it
 */

/**
 * Spendr's looks, in the app's own values. Dark is the Wrapped story's own
 * screen - #0b0f14 under the accent's light, as the story draws it behind
 * its cards - with the tiles as the app's tinted cards. Light is the same
 * on #f8fafc, with white cards on a hairline. Lights out is the flat look
 * in the dark: true black, near-black cards, and no light anywhere.
 *
 * Dark and light carry the figure on Home's net-worth wallet, in the
 * summary card's own gradient: the one the colour look is drawn in, and
 * clamped so white reads on it in every accent (theme.js).
 *
 * @param {string} id @param {RecapPalette} pal
 * @returns {Look}
 */
function appLook(id, pal) {
  const a = (/** @type {number} */ alpha) => rgba(pal.accent, alpha)
  const onWallet = { fill: 'rgba(0, 0, 0, 0.2)', text: '#FFFFFF' }
  if (id === 'light') {
    return {
      ground: '#F8FAFC',
      glows: [
        [0.5, -0.12, 1.3, 0.85, [[0, a(0.24)], [0.42, a(0.08)], [0.74, a(0)]]],
        [0.85, 1.12, 1.1, 0.8, [[0, a(0.16)], [0.7, a(0)]]],
      ],
      ink: '#0F172A',
      muted: '#475569',
      label: '#64748B',
      // Green-700 and orange-700, as the paper tiles have them.
      good: '#15803D',
      soft: '#C2410C',
      card: { fill: '#FFFFFF', stroke: 'rgba(15, 23, 42, 0.08)', shadow: 'rgba(15, 23, 42, 0.07)', rim: null },
      wallet: true,
      pill: onWallet,
      year: { fill: '#FFFFFF', stroke: 'rgba(15, 23, 42, 0.08)', text: '#334155' },
      mark: { paper: pal.deepInk, ink: '#FFFFFF' },
      giftGlow: 0.2,
      lift: 0.14,
      logoRim: 'rgba(15, 23, 42, 0.08)',
    }
  }
  if (id === 'lightsout') {
    return {
      ground: '#000000',
      glows: [],
      ink: '#FFFFFF',
      muted: 'rgba(255, 255, 255, 0.62)',
      label: 'rgba(255, 255, 255, 0.5)',
      good: '#34D399',
      soft: '#FB923C',
      card: { fill: '#111113', stroke: 'rgba(255, 255, 255, 0.08)', shadow: null, rim: null },
      wallet: false,
      // The one place the accent shows, besides the glass.
      pill: { fill: a(0.22), text: '#FFFFFF' },
      year: { fill: '#1C1C1F', stroke: 'rgba(255, 255, 255, 0.08)', text: '#FFFFFF' },
      mark: { paper: '#FFFFFF', ink: pal.deepInk },
      giftGlow: 0,
      lift: 0,
      logoRim: null,
    }
  }
  return {
    ground: '#0B0F14',
    glows: [
      [0.5, -0.12, 1.3, 0.85, [[0, a(0.3)], [0.42, a(0.1)], [0.74, a(0)]]],
      [0.85, 1.12, 1.1, 0.8, [[0, a(0.2)], [0.7, a(0)]]],
    ],
    ink: '#FFFFFF',
    muted: 'rgba(255, 255, 255, 0.66)',
    label: 'rgba(255, 255, 255, 0.55)',
    good: '#34D399',
    soft: '#FB923C',
    /* The app's dark card: the accent at a low wash, a hairline of it, and a
       catch of light along the top edge. No shadow: under a card you can see
       through, a canvas shadow shows through the card and muddies it. */
    card: { fill: a(0.1), stroke: a(0.22), shadow: null, rim: 'rgba(255, 255, 255, 0.07)' },
    wallet: true,
    pill: onWallet,
    year: { fill: 'rgba(255, 255, 255, 0.08)', stroke: 'rgba(255, 255, 255, 0.12)', text: '#FFFFFF' },
    mark: { paper: '#FFFFFF', ink: pal.deepInk },
    giftGlow: 0.35,
    lift: 0.3,
    logoRim: null,
  }
}

/**
 * Where the app looks put things: the colour card's order, a little closer
 * together, to make room for the wallet around the figure.
 */
const LOOK_Y = { name: 428, month: 566, mark: 628, hero: 736, sign: 1590 }
const LOOK_TILE = { h: 120, gap: 16 }

/**
 * The summary on one of Spendr's own screens.
 *
 * @param {CanvasRenderingContext2D} g @param {Picture} c @param {Look} L
 */
function summaryInLook(g, c, L) {
  const r = c.recap
  const hero = summaryHero(r, c.currency, { hideAmounts: c.hide })
  const tiles = summaryTiles(r, c.currency, { hideAmounts: c.hide })

  g.fillStyle = L.ground
  g.fillRect(0, 0, W, H)
  for (const [x, y, rx, ry, stops] of L.glows) ellipseGlow(g, x * W, y * H, rx * W, ry * H, stops)

  lookBrand(g, L, c.logo, String(c.year))

  // The gift, beside the title.
  if (L.giftGlow) glow(g, 862, 490, 260, c.pal.accent, L.giftGlow)
  drawArt(g, c.art['wrapped-gift'], 862, 490, 300, 8)
  drawArt(g, c.art.sparkles, 740, 335, 96, -6)

  // Whose month, which month, and the label over its foot.
  const titleW = 600
  g.fillStyle = L.muted
  g.font = font(500, 44)
  g.fillText(clip(g, c.name ? `${c.name}'s` : 'My', titleW), P, LOOK_Y.name)
  g.fillStyle = L.ink
  g.fillText(fit(g, c.month, 600, 150, 88, titleW), P, LOOK_Y.month)
  drawWrappedMark(g, { ...c.pal, paper: L.mark.paper, deepInk: L.mark.ink }, P + 36, LOOK_Y.mark, 80)

  const foot = lookHero(g, c, L, hero, LOOK_Y.hero)

  // The tiles, as the app's cards.
  const tileW = (INNER - 24) / 2
  const step = LOOK_TILE.h + LOOK_TILE.gap
  tiles.forEach((t, i) => lookTile(g, L, t, P + (i % 2) * (tileW + 24), foot + 24 + Math.floor(i / 2) * step, tileW, LOOK_TILE.h, markOf(c, t.emoji, t.art)))

  drawSign(g, { ...c.pal, paper: '#FFFFFF', muted: L.muted }, c.logo, LOOK_Y.sign, L.logoRim ?? undefined)
}

/**
 * What the month came to, on the wallet Home keeps your net worth in: its
 * leather, its light from above and the shade settling into its base, and
 * the saddle stitching inset from its edge - or, in Lights out, the plain
 * panel the flat look makes of it. Returns its foot.
 *
 * @param {CanvasRenderingContext2D} g @param {Picture} c @param {Look} L
 * @param {{label: string, value: string, line: string|null}} hero
 * @param {number} top
 */
function lookHero(g, c, L, hero, top) {
  const x = P, w = INNER
  const h = hero.line ? 361 : 281
  // The wallet's corners: tighter at the foot, a billfold rather than a card.
  const outline = (/** @type {number} */ inset) => roundRect(g, x + inset, top + inset, w - inset * 2, h - inset * 2, 72 - inset, 52 - inset)
  if (L.wallet) {
    shadowed(g, () => {
      g.fillStyle = c.tone.deep
      outline(0)
      g.fill()
    }, 48, 22, L.lift)
    g.save()
    outline(0)
    g.clip()
    g.fillStyle = cssLinear(g, 165, x, top, w, h, [[0, c.tone.light], [1, c.tone.deep]])
    g.fillRect(x, top, w, h)
    ellipseGlow(g, x + w / 2, top - h * 0.12, w * 1.25, h * 0.72, [[0, 'rgba(255, 255, 255, 0.2)'], [0.68, 'rgba(255, 255, 255, 0)']])
    const settle = g.createLinearGradient(0, top, 0, top + h)
    settle.addColorStop(0.34, 'rgba(0, 0, 0, 0)')
    settle.addColorStop(1, 'rgba(0, 0, 0, 0.2)')
    g.fillStyle = settle
    g.fillRect(x, top, w, h)
    // The rim's catch of light along the top.
    g.fillStyle = 'rgba(255, 255, 255, 0.18)'
    g.fillRect(x, top, w, 3)
    g.restore()
    g.save()
    g.setLineDash([10, 8])
    g.lineWidth = 2.5
    g.strokeStyle = 'rgba(255, 255, 255, 0.34)'
    outline(26)
    g.stroke()
    g.restore()
  } else {
    g.fillStyle = '#1C1C1F'
    outline(0)
    g.fill()
    g.lineWidth = 2
    g.strokeStyle = 'rgba(255, 255, 255, 0.09)'
    outline(1)
    g.stroke()
  }

  const tx = x + 60
  const room = w - 120
  g.fillStyle = L.wallet ? c.pal.muted : L.muted
  g.font = font(500, 40)
  g.fillText(clip(g, hero.label, room), tx, top + 81)
  g.fillStyle = '#FFFFFF'
  g.fillText(fit(g, hero.value, 600, 140, 80, room), tx, top + 213)
  if (hero.line) {
    g.font = font(600, 34)
    const line = clip(g, hero.line, room - 64)
    const pillW = g.measureText(line).width + 64
    g.fillStyle = L.pill.fill
    roundRect(g, tx, top + 241, pillW, 68, 34)
    g.fill()
    g.fillStyle = L.pill.text
    g.fillText(line, tx + 32, top + 287)
  }
  return top + h
}

/**
 * Spendr's mark and name, and the year on a pill - drawBrand, in a look.
 *
 * @param {CanvasRenderingContext2D} g @param {Look} L
 * @param {HTMLImageElement|null} logo @param {string} pill
 */
function lookBrand(g, L, logo, pill) {
  shadowed(g, () => {
    g.fillStyle = '#FFFFFF'
    roundRect(g, P, 262, 80, 80, 24)
    g.fill()
  }, 24, 8, L.lift)
  if (logo) g.drawImage(logo, P + 8, 270, 64, 64)
  g.fillStyle = L.ink
  g.font = font(600, 46)
  g.fillText('Spendr', P + 104, 318)
  g.font = font(500, 34)
  const text = clip(g, pill, 420)
  const pillW = g.measureText(text).width + 52
  g.fillStyle = L.year.fill
  roundRect(g, W - P - pillW, 272, pillW, 60, 30)
  g.fill()
  g.lineWidth = 2
  g.strokeStyle = L.year.stroke
  roundRect(g, W - P - pillW + 1, 273, pillW - 2, 58, 29)
  g.stroke()
  g.fillStyle = L.year.text
  g.textAlign = 'center'
  g.fillText(text, W - P - pillW / 2, 314)
  g.textAlign = 'left'
}

/**
 * A figure on one of the app's cards - drawTile, in a look.
 *
 * @param {CanvasRenderingContext2D} g @param {Look} L
 * @param {{emoji: string, label: string, value: string, tone?: 'good'|'soft'}} t
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {CanvasImageSource|null} img
 */
function lookTile(g, L, t, x, y, w, h, img) {
  const R = 36
  g.save()
  if (L.card.shadow) {
    g.shadowColor = L.card.shadow
    g.shadowBlur = 24
    g.shadowOffsetY = 6
  }
  g.fillStyle = L.card.fill
  roundRect(g, x, y, w, h, R)
  g.fill()
  g.restore()
  if (L.card.rim) {
    g.save()
    roundRect(g, x, y, w, h, R)
    g.clip()
    g.fillStyle = L.card.rim
    g.fillRect(x, y + 2, w, 2.5)
    g.restore()
  }
  g.lineWidth = 2
  g.strokeStyle = L.card.stroke
  roundRect(g, x + 1, y + 1, w - 2, h - 2, R - 1)
  g.stroke()
  if (img) g.drawImage(img, x + 16, y + h / 2 - 46, 92, 92)
  else drawEmoji(g, t.emoji, x + 28, y + h / 2 + 3, 60, 'left')
  const tx = x + 118
  const room = w - 118 - 28
  g.fillStyle = L.label
  g.font = font(600, 26)
  g.fillText(clip(g, t.label.toUpperCase(), room), tx, y + h / 2 - 14)
  g.fillStyle = t.tone === 'good' ? L.good : t.tone === 'soft' ? L.soft : L.ink
  g.fillText(fit(g, t.value, 600, 46, 30, room), tx, y + h / 2 + 34)
}

// ── The objects the pictures draw ────────────────────────────────────────

/**
 * The receipt, printed: the month a week at a time, the total, a barcode.
 *
 * @param {CanvasRenderingContext2D} g @param {Picture} c
 * @param {Array<{label: string, value: string}>} rows
 * @param {string} total @param {string} sub @param {boolean} refunded
 */
function receipt(g, c, rows, total, sub, refunded) {
  const x = 150, w = 780, top = 790
  const rowH = 56
  const h = 40 + 76 + 46 + 28 + rows.length * rowH + 28 + 64 + 90 + 44 + 16
  const ink = c.pal.paperInk, muted = c.pal.paperMuted
  shadowed(g, () => {
    g.fillStyle = c.pal.paper
    g.fillRect(x, top, w, h)
  }, 40, 16, 0.22)
  // The torn foot.
  g.fillStyle = c.pal.paper
  g.beginPath()
  for (let tx = x; tx < x + w; tx += 24) {
    g.moveTo(tx, top + h)
    g.lineTo(tx + 12, top + h + 16)
    g.lineTo(tx + 24, top + h)
  }
  g.fill()

  const ix = x + 44, iw = w - 88
  let y = top + 40
  /* Who printed it and when, stacked on the left the way a till prints
     them: the right-hand end is where the illustration lands, and a date
     there was half hidden under it. */
  if (c.logo) g.drawImage(c.logo, ix, y + 4, 56, 56)
  g.fillStyle = ink
  g.font = font(600, 32)
  g.fillText('S P E N D R', ix + 72, y + 28)
  g.font = font(600, 24)
  g.fillStyle = muted
  g.fillText(clip(g, `${c.month} ${c.year}`.toUpperCase(), iw - 72), ix + 72, y + 60)
  y += 76
  g.font = font(500, 28)
  g.fillText(clip(g, sub, iw), ix, y + 30)
  y += 46
  const rule = () => {
    g.save()
    g.strokeStyle = 'rgba(15, 23, 42, 0.16)'
    g.lineWidth = 4
    g.setLineDash([12, 10])
    g.beginPath()
    g.moveTo(ix, y + 14)
    g.lineTo(ix + iw, y + 14)
    g.stroke()
    g.restore()
    y += 28
  }
  rule()
  for (const row of rows) {
    g.font = font(600, 28)
    g.fillStyle = muted
    g.fillText(clip(g, row.label, iw * 0.55), ix, y + 40)
    g.font = font(600, 34)
    g.fillStyle = ink
    g.fillText(row.value, ix + iw - g.measureText(row.value).width, y + 40)
    y += rowH
  }
  rule()
  g.font = font(600, 36)
  g.fillStyle = ink
  g.fillText('TOTAL', ix, y + 46)
  g.font = font(600, 40)
  g.fillText(total, ix + iw - g.measureText(total).width, y + 46)
  y += 64
  // A barcode that is the same for the same month.
  const next = seeded(seedOf(`receipt-${c.recap.month}`))
  let bx = ix + 40
  g.fillStyle = ink
  while (bx < ix + iw - 40) {
    const bw = 3 + Math.floor(next() * 3) * 3
    if (next() > 0.2) g.fillRect(bx, y + 16, bw, 64)
    bx += bw + 5
  }
  y += 90
  g.font = font(600, 24)
  g.fillStyle = muted
  g.textAlign = 'center'
  g.fillText('T H A N K   Y O U   F O R   T R A C K I N G', x + w / 2, y + 30)
  g.textAlign = 'left'

  if (refunded) {
    g.save()
    g.translate(x + w - 200, top + h - 240)
    g.rotate((-14 * Math.PI) / 180)
    g.strokeStyle = c.pal.paperGood
    g.fillStyle = c.pal.paperGood
    g.lineWidth = 8
    g.font = font(600, 48)
    const sw = g.measureText('REFUNDED').width + 48
    roundRect(g, -sw / 2, -44, sw, 88, 14)
    g.globalAlpha = 0.9
    g.stroke()
    g.textAlign = 'center'
    g.fillText('REFUNDED', 0, 17)
    g.restore()
    g.textAlign = 'left'
  }
}

/**
 * A price tag on a string: the category's emoji, its name, the day.
 *
 * @param {CanvasRenderingContext2D} g @param {Picture} c
 * @param {string} emoji @param {string} label @param {string} date
 */
function priceTag(g, c, emoji, label, date) {
  const px = 770, py = 830
  g.save()
  g.translate(px, py)
  g.rotate((6 * Math.PI) / 180)
  const w = 300, h = 400, top = 70
  // The string, down into the hole it is threaded through.
  g.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  g.lineWidth = 5
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(0, 0)
  g.bezierCurveTo(-14, 34, 14, 72, 0, top + 52)
  g.stroke()
  shadowed(g, () => {
    g.fillStyle = c.pal.paper
    g.beginPath()
    g.moveTo(0, top)
    g.lineTo(w / 2, top + 70)
    g.lineTo(w / 2, top + h)
    g.lineTo(-w / 2, top + h)
    g.lineTo(-w / 2, top + 70)
    g.closePath()
    /* The hole the string goes through: left out of the shape rather than
       cut from the picture, which would cut through the card under it too. */
    g.moveTo(14, top + 60)
    g.arc(0, top + 60, 14, 0, Math.PI * 2)
    g.fill('evenodd')
  }, 30, 14, 0.24)
  drawEmoji(g, emoji, 0, top + 190, 110)
  g.textAlign = 'center'
  g.font = font(600, 40)
  g.fillStyle = c.pal.paperInk
  g.fillText(clip(g, label, w - 50), 0, top + 310)
  g.font = font(600, 32)
  g.fillStyle = c.pal.paperMuted
  g.fillText(date.toUpperCase(), 0, top + 360)
  g.restore()
  g.textAlign = 'left'
}

/**
 * A loyalty card with a stamp for every visit, up to ten.
 *
 * @param {CanvasRenderingContext2D} g @param {Picture} c @param {number} count @param {string} emoji
 */
function stampCard(g, c, count, emoji) {
  const cw = 820, ch = 420, cx = W / 2, cy = 1130
  const next = seeded(seedOf(`stamps-${c.recap.month}`))
  g.save()
  g.translate(cx, cy)
  g.rotate((-3 * Math.PI) / 180)
  shadowed(g, () => {
    g.fillStyle = c.pal.paper
    roundRect(g, -cw / 2, -ch / 2, cw, ch, 56)
    g.fill()
  }, 40, 18, 0.26)
  const left = -cw / 2 + 50, topY = -ch / 2 + 70
  g.font = font(600, 30)
  g.fillStyle = c.pal.paperMuted
  g.fillText('L O Y A L T Y   C A R D', left, topY)
  g.font = font(600, 36)
  g.fillStyle = c.pal.deepInk
  const visits = `${count} ${count === 1 ? 'visit' : 'visits'}`
  g.fillText(visits, cw / 2 - 50 - g.measureText(visits).width, topY)
  const d = 118, gap = 26
  const x0 = -(5 * d + 4 * gap) / 2
  const over = count > 10 ? count - 9 : 0
  for (let i = 0; i < 10; i++) {
    const sx = x0 + (i % 5) * (d + gap) + d / 2
    const sy = topY + 50 + Math.floor(i / 5) * (d + 22) + d / 2
    const on = i < Math.min(count, 10)
    g.save()
    g.setLineDash(on ? [] : [10, 10])
    g.lineWidth = 6
    g.strokeStyle = on ? c.pal.deepInk : 'rgba(15, 23, 42, 0.18)'
    g.beginPath()
    g.arc(sx, sy, d / 2 - 4, 0, Math.PI * 2)
    if (on) {
      g.fillStyle = rgba(c.pal.glow, 0.28)
      g.fill()
    }
    g.stroke()
    g.restore()
    if (!on) continue
    g.save()
    g.translate(sx, sy)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    if (over && i === 9) {
      g.font = font(600, 38)
      g.fillStyle = c.pal.deepInk
      g.fillText(`+${over}`, 0, 2)
    } else {
      g.rotate(((next() * 36 - 18) * Math.PI) / 180)
      drawEmoji(g, emoji, 0, 4, 58)
    }
    g.restore()
  }
  g.restore()
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  drawArt(g, c.art['round-pushpin'], cx - cw / 2 + 60, cy - ch / 2 - 10, 150, -18)
}
