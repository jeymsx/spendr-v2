/**
 * Glass: the app's 3D illustrations, drawn as frosted glass over solid colour.
 *
 * Every picture here is layers of two materials, stacked with a little depth:
 *
 *   solid   a shape in a gradient of one hue, with a thickness showing along
 *           its lower right edge and a lit rim along its upper left;
 *   glass   a frosted pane. What sits behind it shows through, blurred - each
 *           solid layer drawn before a pane is drawn again inside the pane's
 *           outline through a blur - then a frost of white over that, a bright
 *           rim, and a thin edge of thickness.
 *
 * The blur is what makes it glass rather than a pale shape: the colour behind
 * a pane bleeds through it softly, exactly where they overlap.
 *
 * ── Strings, not components ──
 *
 * Each picture is built as an SVG string, which is one source for three uses:
 * inline in the page when it animates (its layers carry classes that
 * index.css moves), as an <img> when it does not (the browser draws it once
 * and caches the pixels - a grid of thirty is thirty bitmaps, not thirty live
 * filter graphs), and drawn onto a canvas for a picture to share, which
 * cannot use the page's DOM at all. Nothing in a string is user text, so
 * nothing here needs escaping beyond the colours, which are checked.
 *
 * ── One hue ──
 *
 * A picture takes one colour and derives the rest - deep, mid, light, pale -
 * so the same drawing is the accent on the recap, a badge's own tone in the
 * collection, and grey while it is locked.
 */

// ── Colour ──────────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-f]{6}$/i

/** @param {string} hex @returns {[number, number, number]} h 0-360, s and l 0-1 */
export function hexToHsl(hex) {
  const n = parseInt((HEX.test(hex) ? hex : '#2F6BFF').slice(1), 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

/** @param {number} h @param {number} s @param {number} l */
function hsl(h, s, l) {
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`
}

/** Relative luminance of an HSL colour, as WCAG defines it. @param {number} h @param {number} s @param {number} l */
function luminance(h, s, l) {
  const k = (/** @type {number} */ n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const channel = (/** @type {number} */ n) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4)
}

/**
 * The hue at the lightest lightness, from `l` down, that white words on it
 * clear 4.5:1 - with a margin, because hsl() rounds to whole percents. Blues
 * are there already at the deeper tone; limes and teals need it much darker.
 *
 * @param {number} h @param {number} s @param {number} l
 */
function inkGround(h, s, l) {
  let x = l
  while (x > 0.06 && 1.05 / (luminance(h, s, x) + 0.05) < 4.7) x -= 0.01
  return hsl(h, s, x)
}

/**
 * @typedef {object} GlassPalette
 * @property {string} deep    the solid's shadowed end, and the ink of a glyph on glass
 * @property {string} deeper  a solid's thickness
 * @property {string} mid     the solid's lit end
 * @property {string} light   a pane's thickness
 * @property {string} pale    the frost's tint
 * @property {string} ink     a ground for white words: a level's chip
 */

/**
 * The five tones of one hue. Saturation is held in a band so a muted accent
 * still reads as coloured glass - unless it is nearly grey to begin with,
 * which is how the locked state and the slate tones stay grey.
 *
 * `lift` raises the whole ramp, for glass that sits on a surface of its own
 * hue - the recap's cards are the accent, and accent glass drawn at its
 * usual depth would sink into them. Lifted, the solids read a step lighter
 * than the card and the frost stays bright.
 *
 * @param {string} hex
 * @param {number} [lift]  0 to about 0.2
 * @returns {GlassPalette}
 */
export function glassPalette(hex, lift = 0) {
  const [h, s0] = hexToHsl(hex)
  const s = s0 < 0.2 ? s0 : Math.min(0.96, Math.max(0.6, s0))
  /* Yellows are light at every saturation: a deep yellow at 44% is mustard,
     so the whole ramp sits a little lower for them to still read as gold. */
  const warm = h >= 38 && h <= 70 ? -0.06 : 0
  return {
    deep: hsl(h, s, 0.46 + warm + lift),
    deeper: hsl(h, s, 0.34 + warm + lift),
    mid: hsl(h, Math.min(1, s + 0.04), Math.min(0.86, 0.64 + warm + lift * 0.8)),
    light: hsl(h, s * 0.95, Math.min(0.9, 0.8 + lift * 0.4)),
    pale: hsl(h, s * 0.9, 0.94),
    ink: inkGround(h, s, 0.34 + warm + lift),
  }
}

/** The grey a locked picture is drawn in. */
export const LOCKED_HUE = '#8A94A6'

/* Its ramp. Kept at the plain depth: lifted, an opaque grey read as a silver
   medal - something won - rather than something not yet reached. */
const LOCKED_PALETTE = glassPalette(LOCKED_HUE)

/** The glass the reference set is made of: a clear royal blue. */
export const GLASS_BLUE = '#2F6BFF'

// ── Geometry ────────────────────────────────────────────────────────────────

/** @param {number} n */
const f = (n) => Math.round(n * 100) / 100

/** Rounded rectangle. @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
export function rr(x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2)
  return `M${f(x + k)} ${f(y)}H${f(x + w - k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + w)} ${f(y + k)}V${f(y + h - k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + w - k)} ${f(y + h)}H${f(x + k)}A${f(k)} ${f(k)} 0 0 1 ${f(x)} ${f(y + h - k)}V${f(y + k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + k)} ${f(y)}Z`
}

/** @param {number} cx @param {number} cy @param {number} r */
export function circ(cx, cy, r) {
  return `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`
}

/** @param {number} cx @param {number} cy @param {number} rx @param {number} ry */
export function ell(cx, cy, rx, ry) {
  return `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0Z`
}

/**
 * A polygon with every corner rounded by `r` - a quadratic bend through the
 * vertex, cut short on edges too short for the full radius.
 *
 * @param {Array<[number, number]>} pts
 * @param {number} r
 */
export function rpoly(pts, r) {
  const n = pts.length
  let d = ''
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[(i - 1 + n) % n], [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n]
    const l1 = Math.hypot(x0 - x1, y0 - y1), l2 = Math.hypot(x2 - x1, y2 - y1)
    const k = Math.min(r, l1 / 2, l2 / 2)
    const ax = x1 + ((x0 - x1) / l1) * k, ay = y1 + ((y0 - y1) / l1) * k
    const bx = x1 + ((x2 - x1) / l2) * k, by = y1 + ((y2 - y1) / l2) * k
    d += `${i === 0 ? 'M' : 'L'}${f(ax)} ${f(ay)}Q${f(x1)} ${f(y1)} ${f(bx)} ${f(by)}`
  }
  return `${d}Z`
}

/**
 * Points of a regular polygon, or a star when `inner` is given.
 *
 * @param {number} cx @param {number} cy @param {number} R
 * @param {number} n   corners (a star's points)
 * @param {number} [inner]  a star's inner radius
 * @param {number} [rot]    degrees; -90 puts a point at the top
 * @returns {Array<[number, number]>}
 */
export function ring(cx, cy, R, n, inner, rot = -90) {
  /** @type {Array<[number, number]>} */
  const pts = []
  const steps = inner ? n * 2 : n
  for (let i = 0; i < steps; i++) {
    const a = ((rot + (360 / steps) * i) * Math.PI) / 180
    const rad = inner && i % 2 ? inner : R
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad])
  }
  return pts
}

// ── Glyphs: marks on a 24 grid, centred on (12, 12), drawn as strokes ─────────

/** @type {Record<string, string>} */
export const GLYPHS = {
  peso: '<path d="M9.2 18V6.2h3.9a3.7 3.7 0 0 1 0 7.4H9.2"/><path d="M6.2 9.4h11.2M6.2 12.2h11.2"/>',
  pesoCoin: '<circle cx="12" cy="12" r="9.5"/><path d="M9.6 16.6V7.4h3a2.9 2.9 0 0 1 0 5.8h-3"/><path d="M7.4 9.6h8.8M7.4 11.8h8.8"/>',
  check: '<path d="M5.4 12.6l4.3 4.3 8.9-9.8"/>',
  checkCircle: '<circle cx="12" cy="12" r="9.5"/><path d="M7.8 12.3l2.9 2.9 5.5-6"/>',
  flame: '<path d="M12 2.4c4.6 4.6 7.2 8.1 7.2 11.6a7.2 7.2 0 0 1-14.4 0c0-2.1.9-4 2.7-5.9.5 1.8 1.6 2.9 2.9 3.2C9.5 8.5 10.4 5.1 12 2.4z"/>',
  stack: '<path d="M12 3.2 3.4 7.6 12 12l8.6-4.4z"/><path d="M3.4 12.2 12 16.6l8.6-4.4"/><path d="M3.4 16.4 12 20.8l8.6-4.4"/>',
  gauge: '<path d="M2.8 16a9.2 9.2 0 1 1 18.4 0"/><path d="M12 16 7.2 8.8"/><circle cx="12" cy="16" r="1.4"/>',
  trend: '<path d="M2.8 17.4 9 11.2l4 4 8.2-8.2"/><path d="M15.4 7.2h5.8v5.8"/>',
  trendDown: '<path d="M2.8 6.6 9 12.8l4-4 8.2 8.2"/><path d="M15.4 16.8h5.8V11"/>',
  flag: '<path d="M5.4 20V4"/><path d="M5.4 4.6h13.2l-4.4 4.4 4.4 4.4H5.4"/>',
  repeat: '<path d="M20.2 11.4a8.2 8.2 0 0 1-14 6.2"/><path d="M3.8 12.6a8.2 8.2 0 0 1 14-6.2"/><path d="M3.4 19.6V15.2h4.4"/><path d="M20.6 4.4V8.8h-4.4"/>',
  cards: '<rect x="2.6" y="8" width="15" height="11" rx="2.6"/><path d="M7 5h11.4a3 3 0 0 1 3 3v7"/><path d="M2.6 11.6h15"/>',
  crown: '<path d="M2.6 7 7 13.4l5-8.4 5 8.4L21.4 7v10.6a1.6 1.6 0 0 1-1.6 1.6H4.2a1.6 1.6 0 0 1-1.6-1.6z"/>',
  calendar: '<rect x="3.2" y="5.4" width="17.6" height="15.4" rx="2.6"/><path d="M3.2 10.2h17.6"/><path d="M8 3.2v4M16 3.2v4"/><path d="M8.8 15.2l2.2 2.2 4-4.4"/>',
  coins: '<ellipse cx="12" cy="7" rx="7.6" ry="3.2"/><path d="M4.4 7v4.4c0 1.8 3.4 3.2 7.6 3.2s7.6-1.4 7.6-3.2V7"/><path d="M4.4 12.2v4.4c0 1.8 3.4 3.2 7.6 3.2s7.6-1.4 7.6-3.2v-4.4"/>',
  hourglass: '<path d="M6 3h12M6 21h12"/><path d="M7.6 3v3.2c0 2.2 4.4 4 4.4 5.8 0 1.8-4.4 3.6-4.4 5.8V21"/><path d="M16.4 3v3.2c0 2.2-4.4 4-4.4 5.8 0 1.8 4.4 3.6 4.4 5.8V21"/>',
  bars: '<path d="M4.6 19.5v-5.2M12 19.5V9.4M19.4 19.5V4.5"/>',
  target: '<circle cx="12" cy="12" r="9.3"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="0.9"/>',
  nospend: '<circle cx="12" cy="12" r="9.3"/><path d="M5.4 5.4 18.6 18.6"/>',
  umbrella: '<path d="M2.8 12.4a9.2 9.2 0 0 1 18.4 0z"/><path d="M12 12.4v6.2a2.7 2.7 0 0 0 5.4 0"/>',
  chain: '<path d="M9.8 7.2H6.6a4.8 4.8 0 1 0 0 9.6h3.2"/><path d="M14.2 7.2h3.2a4.8 4.8 0 1 1 0 9.6h-3.2"/><path d="M11.2 9.6 12.8 8M11.2 14.4 12.8 16"/>',
  summit: '<path d="M2.6 20h18.8L13.8 7.8l-3.2 5-2.4-2.8z"/><path d="M13.8 7.8V3.6l4 1.6-4 1.6"/>',
  gem: '<path d="M4.4 9.4h15.2L12 20.4z"/><path d="M4.4 9.4 7.8 4.2h8.4l3.4 5.2"/><path d="M9 9.4 12 20.4l3-11"/>',
  star: '<path d="m12 3.2 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  bolt: '<path d="M13.4 2.8 5 13.6h6.2l-1 7.6 8.4-10.8h-6.2z"/>',
  leaf: '<path d="M4.6 19.4C4.6 10.6 10.4 4.6 19.6 4.4c0 9.2-6 15-15 15z"/><path d="M5.4 18.6 14.6 9.4"/>',
  cup: '<path d="M5 8h11v5.4a5.5 5.5 0 0 1-11 0z"/><path d="M16 9.6h1.4a2.8 2.8 0 0 1 0 5.6H16"/><path d="M8 3.6c-.8 1 .8 1.6 0 2.6M11.4 3.6c-.8 1 .8 1.6 0 2.6"/>',
  bag: '<path d="M5.2 8.6h13.6l-1.2 11.2H6.4z"/><path d="M8.8 8.6V7.4a3.2 3.2 0 0 1 6.4 0v1.2"/>',
  pin: '<path d="M12 21s-6.8-6.2-6.8-11.2a6.8 6.8 0 0 1 13.6 0C18.8 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/>',
  wallet: '<rect x="3" y="6.4" width="18" height="13" rx="3"/><path d="M16 12.9h5"/><path d="M6 6.4 15.6 3.4a1.6 1.6 0 0 1 2 1.5v1.5"/>',
  piggy: '<path d="M19.4 11.4h1.2v3.4h-1.6a7 7 0 0 1-2.4 2.6v2.2h-3v-1.4a8 8 0 0 1-3 0v1.4h-3v-2.2A6.6 6.6 0 0 1 4.4 12c0-3.6 3.4-6.4 7.6-6.4 1.3 0 2.5.3 3.6.8L18.4 5v3.4c.4.9.8 1.9 1 3z"/><path d="M8.6 8.2c1-.5 2.2-.6 3.4-.4"/>',
  receipt: '<path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z"/><path d="M9 8h6M9 11.5h6M9 15h3.6"/>',
  shield: '<path d="M12 3 19.4 5.8v5.6c0 4.6-3.2 8.2-7.4 9.6-4.2-1.4-7.4-5-7.4-9.6V5.8z"/><path d="M8.6 12.1l2.4 2.4 4.4-4.8"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M18.4 15.6l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/>',
  trophy: '<path d="M7 3.6h10v5a5 5 0 0 1-10 0z"/><path d="M7 5.4H4.4v1.4a3 3 0 0 0 3 3M17 5.4h2.6v1.4a3 3 0 0 1-3 3"/><path d="M12 13.6v3.6M8.4 20.4h7.2l-.8-3.2H9.2z"/>',
  medal: '<circle cx="12" cy="14.4" r="5.8"/><path d="M8.6 9.8 5.8 3.4h4l2.2 4.6M15.4 9.8l2.8-6.4h-4L12 8"/><path d="m12 11.8.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z"/>',
  scale: '<path d="M12 3.6v16.8M7 20.4h10M4.4 7.2h15.2"/><path d="M4.4 7.2 2 13.2a2.6 2.6 0 0 0 4.8 0zM19.6 7.2 17.2 13.2a2.6 2.6 0 0 0 4.8 0z"/>',
  gift: '<rect x="3.4" y="8.4" width="17.2" height="4.4" rx="1.2"/><path d="M5 12.8v6.6a1.2 1.2 0 0 0 1.2 1.2h11.6a1.2 1.2 0 0 0 1.2-1.2v-6.6M12 8.4v12.2"/><path d="M12 8.4C10.6 5 7 5 7 6.9c0 1.4 2.4 1.5 5 1.5zM12 8.4c1.4-3.4 5-3.4 5-1.5 0 1.4-2.4 1.5-5 1.5z"/>',
  rocket: '<path d="M12 2.8c3.4 2.4 5 6 5 10.2l-2.4 2.8H9.4L7 13c0-4.2 1.6-7.8 5-10.2z"/><circle cx="12" cy="9.6" r="1.8"/><path d="M9.4 15.8 8 20.4l4-2 4 2-1.4-4.6"/>',
  seedling: '<path d="M12 20.4V11"/><path d="M12 11.6C12 7.8 9.6 5.4 5.4 5.4c0 4 2.4 6.2 6.6 6.2z"/><path d="M12 13.8c0-3.6 2.4-6 6.6-6 0 4-2.4 6-6.6 6z"/>',
  food: '<path d="M4 13.2h16a8 8 0 0 1-16 0z"/><path d="M8.6 9.6c0-1.6 1.2-2 1.2-3.6M12.4 9.6c0-1.6 1.2-2 1.2-3.6"/>',
  party: '<path d="M4 20.4 8.2 8.6l7.2 7.2z"/><path d="M13.2 7.6c1.4-1.4 1.4-3.2 3-3.2M16.4 10.8c1.4-1.4 3.2-1.4 3.2-3M19.6 3.6v.1M20.4 13v.1M11 3.4v.1"/>',
  clock: '<circle cx="12" cy="12" r="9.3"/><path d="M12 7v5.2l3.4 2"/>',
  week: '<rect x="3.2" y="5.4" width="17.6" height="15.4" rx="2.6"/><path d="M3.2 10.2h17.6"/><path d="M8 3.2v4M16 3.2v4"/><path d="M7.4 14.2h2M11 14.2h2M14.6 14.2h2M7.4 17.4h2"/>',
  pen: '<path d="M4 20l1-4.2L15.8 5a2.2 2.2 0 0 1 3.2 3.2L8.2 19z"/><path d="M13.8 7l3.2 3.2"/>',
  down: '<path d="M12 4.4v15.2M6 13.6l6 6 6-6"/>',
  people: '<circle cx="9" cy="8.4" r="3.4"/><path d="M2.8 19.8a6.2 6.2 0 0 1 12.4 0"/><path d="M15.4 5.2a3.2 3.2 0 0 1 0 6.3"/><path d="M17.8 14a5.6 5.6 0 0 1 3.4 5.8"/>',
  globe: '<circle cx="12" cy="12" r="9.3"/><path d="M2.7 12h18.6"/><path d="M12 2.7c2.5 2.6 3.8 5.7 3.8 9.3s-1.3 6.7-3.8 9.3c-2.5-2.6-3.8-5.7-3.8-9.3S9.5 5.3 12 2.7z"/>',
  bank: '<path d="M3.4 9.2 12 4l8.6 5.2z"/><path d="M5.4 9.6v7.6M9.8 9.6v7.6M14.2 9.6v7.6M18.6 9.6v7.6M3.4 19.8h17.2"/>',
}

// ── Rendering ───────────────────────────────────────────────────────────────

/**
 * @typedef {object} Layer
 * @property {'solid'|'glass'|'glyph'|'plain'} kind
 * @property {string} [d]      the shape, in the 128 box
 * @property {string} [t]      a transform for the shape
 * @property {[number, number]} [depth]  the thickness showing behind it
 * @property {'deep'|'mid'|'soft'|'light'} [tone]  a solid's gradient
 * @property {number} [frost]  how milky a pane is, 0-1
 * @property {string} [g]      a glyph's name, or its own markup
 * @property {number} [x]      a glyph's centre
 * @property {number} [y]
 * @property {number} [s]      a glyph's scale: 1 is 24 units across
 * @property {number} [w]      a glyph's stroke width, before scaling
 * @property {'deep'|'white'|'mid'} [ink]  a glyph's colour
 * @property {string} [svg]    raw markup for a plain layer, with {deep} etc. filled in
 */

/** @param {string} tpl @param {GlassPalette} pal */
function fill(tpl, pal) {
  return tpl.replace(/\{(deep|deeper|mid|light|pale)\}/g, (_, k) => pal[/** @type {keyof GlassPalette} */ (k)])
}

/**
 * The picture, as markup.
 *
 * A locked picture is the same glass in grey, and OPAQUE: each pane gets a
 * solid grey ground under its frost. It used to be the whole picture at 55%,
 * and whatever it sat on - the celebration's rays, a coloured wash - showed
 * straight through it and fought with the medallion. Grey says "not yet" on
 * its own.
 *
 * `size` is the width and height the SVG claims - 128 unless something
 * needs more. A canvas does: WebKit draws an SVG's filters right on a canvas
 * only at the SVG's own size (see loadGlass in pages/recap/canvasKit.js).
 *
 * @param {Layer[]} layers
 * @param {GlassPalette} pal
 * @param {string} p   an id prefix, unique among pictures in one document
 * @param {{shadow?: boolean, locked?: boolean, size?: number}} [o]
 */
function render(layers, pal, p, o = {}) {
  const solids = /** @type {number[]} */ ([])
  let body = ''
  layers.forEach((L, i) => {
    const t = L.t ? ` transform="${L.t}"` : ''
    const at = (dx = 0, dy = 0) => ` transform="translate(${dx} ${dy})${L.t ? ` ${L.t}` : ''}"`
    const style = ` style="--i:${i}"`
    if (L.kind === 'solid') {
      const [dx, dy] = L.depth ?? [2.4, 3.4]
      const grad = L.tone === 'soft' ? 'so' : L.tone === 'light' ? 'sl' : L.tone === 'mid' ? 'sm' : 's'
      body += `<g class="gx-s"${style}><g id="${p}L${i}">`
        + (dx || dy ? `<path d="${L.d}"${at(dx, dy)} fill="url(#${p}sd)"/>` : '')
        + `<path d="${L.d}"${t} fill="url(#${p}${grad})"/>`
        + `<path d="${L.d}"${t} fill="none" stroke="url(#${p}hl)" stroke-width="1.4"/>`
        + '</g></g>'
      solids.push(i)
    } else if (L.kind === 'glass') {
      const [dx, dy] = L.depth ?? [2, 3]
      /* Locked panes are matte: less milk and no light crossing them. A
         bright frost and a moving shine are what make glass look alive. */
      const frost = (L.frost ?? 1) * (o.locked ? 0.55 : 1)
      const behind = solids.map(j =>
        `<use href="#${p}L${j}" xlink:href="#${p}L${j}" filter="url(#${p}b)"/>`).join('')
      body += `<g class="gx-g"${style}>`
        + `<clipPath id="${p}C${i}"><path d="${L.d}"${t}/></clipPath>`
        + (dx || dy ? `<path d="${L.d}"${at(dx, dy)} fill="${pal.light}" fill-opacity="${o.locked ? 1 : 0.7}"/>` : '')
        + `<g clip-path="url(#${p}C${i})">`
        + (o.locked ? `<rect width="128" height="128" fill="${pal.light}"/>` : '')
        + `<rect width="128" height="128" fill="${pal.pale}" fill-opacity="${f(0.3 * frost)}"/>`
        + behind
        + `<path d="${L.d}"${t} fill="url(#${p}f)" fill-opacity="${f(frost)}"/>`
        + (o.locked ? '' : `<rect class="gx-shine" x="-70" y="-20" width="26" height="170" fill="url(#${p}sp)" transform="rotate(24 64 64)"/>`)
        + '</g>'
        + `<path d="${L.d}"${t} fill="none" stroke="url(#${p}r)" stroke-width="1.7"/>`
        + '</g>'
    } else if (L.kind === 'glyph') {
      const s = L.s ?? 1
      const w = L.w ?? 2
      const ink = L.ink === 'white' ? '#fff' : L.ink === 'mid' ? pal.mid : pal.deep
      const mark = GLYPHS[L.g ?? ''] ?? L.g ?? ''
      const place = `${L.t ? `${L.t} ` : ''}translate(${f(L.x ?? 64)} ${f(L.y ?? 64)}) scale(${f(s)}) translate(-12 -12)`
      const lit = L.ink === 'white' ? pal.deeper : '#fff'
      body += `<g class="gx-y"${style} fill="none" stroke-linecap="round" stroke-linejoin="round">`
        /* An emboss: the same mark a hair lower and right in the opposite
           tone, so it reads pressed into the glass rather than printed on. */
        + `<g transform="translate(${f(0.7)} ${f(0.9)}) ${place}" stroke="${lit}" stroke-opacity="${L.ink === 'white' ? '.35' : '.85'}" stroke-width="${f(w)}">${mark}</g>`
        + `<g transform="${place}" stroke="${ink}" stroke-width="${f(w)}">${mark}</g>`
        + '</g>'
    } else {
      body += `<g class="gx-p"${style}>${fill(L.svg ?? '', pal)}</g>`
    }
  })

  const defs = `<defs>`
    + `<linearGradient id="${p}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pal.mid}"/><stop offset="1" stop-color="${pal.deep}"/></linearGradient>`
    + `<linearGradient id="${p}sm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pal.light}"/><stop offset="1" stop-color="${pal.mid}"/></linearGradient>`
    + `<linearGradient id="${p}so" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pal.mid}"/><stop offset="1" stop-color="${pal.mid}"/></linearGradient>`
    + `<linearGradient id="${p}sl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${pal.light}"/></linearGradient>`
    + `<linearGradient id="${p}sd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pal.deep}"/><stop offset="1" stop-color="${pal.deeper}"/></linearGradient>`
    + `<linearGradient id="${p}hl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    + `<linearGradient id="${p}f" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".82"/><stop offset=".55" stop-color="${pal.pale}" stop-opacity=".46"/><stop offset="1" stop-color="${pal.light}" stop-opacity=".34"/></linearGradient>`
    + `<linearGradient id="${p}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity=".8"/></linearGradient>`
    + `<linearGradient id="${p}sp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    + `<filter id="${p}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>`
    + `<filter id="${p}sh" x="-30%" y="-30%" width="160%" height="170%" color-interpolation-filters="sRGB">`
    + '<feGaussianBlur in="SourceAlpha" stdDeviation="5"/><feOffset dy="6" result="o"/>'
    + `<feFlood flood-color="${pal.deeper}" flood-opacity=".28"/><feComposite in2="o" operator="in"/>`
    + '<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
    + '</defs>'

  const px = Math.round(o.size ?? 128)
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 128 128" width="${px}" height="${px}">`
    + defs
    + `<g class="gx"${o.shadow === false ? '' : ` filter="url(#${p}sh)"`}>${body}</g>`
    + '</svg>'
}

// ── The pictures ────────────────────────────────────────────────────────────

/** @param {string} d @param {Partial<Layer>} [o] @returns {Layer} */
const S = (d, o = {}) => ({ kind: 'solid', d, ...o })
/** @param {string} d @param {Partial<Layer>} [o] @returns {Layer} */
const G = (d, o = {}) => ({ kind: 'glass', d, ...o })
/** @param {string} g @param {Partial<Layer>} [o] @returns {Layer} */
const Y = (g, o = {}) => ({ kind: 'glyph', g, ...o })
/** @param {string} svg @returns {Layer} */
const X = (svg) => ({ kind: 'plain', svg })

/** A sparkle's four curved points. @param {number} cx @param {number} cy @param {number} R */
function sparkle(cx, cy, R) {
  const k = R * 0.18
  return `M${f(cx)} ${f(cy - R)}C${f(cx + k)} ${f(cy - k)} ${f(cx + k)} ${f(cy - k)} ${f(cx + R)} ${f(cy)}`
    + `C${f(cx + k)} ${f(cy + k)} ${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + R)}`
    + `C${f(cx - k)} ${f(cy + k)} ${f(cx - k)} ${f(cy + k)} ${f(cx - R)} ${f(cy)}`
    + `C${f(cx - k)} ${f(cy - k)} ${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - R)}Z`
}

/** Little confetti, in the picture's own tones. @param {Array<[number, number, number]>} bits x, y, rotation */
function confetti(bits) {
  return X(bits.map(([x, y, r], i) => {
    const c = ['{mid}', '{deep}', '{light}'][i % 3]
    return i % 2
      ? `<circle cx="${x}" cy="${y}" r="2.6" fill="${c}"/>`
      : `<rect x="${x - 4}" y="${y - 1.6}" width="8" height="3.2" rx="1.6" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`
  }).join(''))
}

const TEARDROP = 'M64 110C52 95 36 81 36 57A28 28 0 0 1 92 57C92 81 76 95 64 110Z'
const FLAME = 'M64 18C79 36 95 51 95 76A31 31 0 0 1 33 76C33 62 41 51 50 42C52 53 58 60 65 62C60 47 58 33 64 18Z'
const SHIELD = 'M64 18L100 30V58C100 85 84 101 64 110C44 101 28 85 28 58V30Z'
const BAG_BODY = rpoly([[34, 50], [94, 50], [100, 108], [28, 108]], 9)
const MONEY_BAG = 'M50 42C38 52 25 66 25 85C25 103 42 111 64 111C86 111 103 103 103 85C103 66 90 52 78 42Z'
const HEART = 'M64 104C44 90 24 74 24 52A20 20 0 0 1 64 42A20 20 0 0 1 104 52C104 74 84 90 64 104Z'

/**
 * Each picture: a function of nothing, returning its layers. Drawn in a 128
 * box with the subject in roughly 16-112, leaving room for the shadow.
 *
 * @type {Record<string, () => Layer[]>}
 */
const PICTURES = {
  gift: () => [
    S(ell(50, 37, 15, 9) + ell(78, 37, 15, 9), { t: 'rotate(-6 64 37)', tone: 'mid' }),
    G(rr(30, 60, 68, 48, 11)),
    G(rr(23, 45, 82, 21, 9)),
    S(rr(57, 45, 14, 63, 4), { depth: [1.6, 2.2] }),
    S(circ(64, 45, 7), { depth: [1, 1.4] }),
  ],
  sparkles: () => [
    S(sparkle(52, 72, 34)),
    G(sparkle(90, 40, 20)),
    S(sparkle(94, 96, 12), { tone: 'mid', depth: [1.4, 2] }),
  ],
  cash: () => [
    S(rr(16, 32, 78, 50, 9), { t: 'rotate(-14 55 57)' }),
    G(rr(28, 50, 84, 52, 10)),
    Y('pesoCoin', { x: 70, y: 76, s: 1.35, w: 2 }),
    S(circ(100, 100, 12), { tone: 'mid', depth: [1.6, 2.2] }),
    Y('peso', { x: 100, y: 100, s: 0.62, w: 2.6, ink: 'white' }),
  ],
  coin: () => [
    S(circ(56, 58, 33)),
    G(circ(72, 72, 33)),
    Y('peso', { x: 72, y: 72, s: 1.55, w: 2.2 }),
  ],
  coins: () => [
    S(ell(52, 92, 30, 11), { depth: [0, 8] }),
    S(ell(52, 76, 30, 11), { depth: [0, 8] }),
    G(circ(82, 58, 28)),
    Y('peso', { x: 82, y: 58, s: 1.3, w: 2.2 }),
  ],
  piggy: () => [
    S(rr(40, 88, 12, 20, 5) + rr(74, 88, 12, 20, 5), { depth: [1.6, 2] }),
    S(rpoly([[40, 50], [46, 30], [58, 46]], 4), { tone: 'mid' }),
    S(circ(62, 30, 12), { tone: 'mid', depth: [1.6, 2] }),
    Y('peso', { x: 62, y: 30, s: 0.6, w: 2.8, ink: 'white' }),
    G(ell(62, 72, 42, 31)),
    S(rr(96, 62, 16, 20, 7), { depth: [1.6, 2] }),
    X('<circle cx="102" cy="72" r="1.6" fill="#fff"/><circle cx="107" cy="72" r="1.6" fill="#fff"/>'
      + '<circle cx="84" cy="62" r="3" fill="{deeper}"/>'
      + '<path d="M50 50h22" stroke="{deeper}" stroke-width="3.2" stroke-linecap="round"/>'
      + '<path d="M22 70c-8-2-8-10-2-10s4 8-4 8" fill="none" stroke="{deep}" stroke-width="3" stroke-linecap="round"/>'),
  ],
  scale: () => [
    S(rr(40, 100, 48, 10, 5)),
    S(rr(60, 28, 8, 76, 4), { tone: 'mid' }),
    S(rr(20, 32, 88, 8, 4)),
    X('<path d="M26 40 16 74M26 40l20 34M102 40 92 66M102 40l20 26" stroke="{deep}" stroke-width="1.6" fill="none" opacity=".6"/>'),
    G('M10 74H52A21 12 0 0 1 10 74Z'),
    G('M86 66H128A21 12 0 0 1 86 66Z', { t: 'translate(-6 0)' }),
    S(circ(64, 28, 6), { tone: 'mid', depth: [1, 1.4] }),
  ],
  calendar: () => [
    S(rr(22, 32, 74, 72, 13), { t: 'rotate(-10 59 68)' }),
    G(rr(32, 40, 76, 72, 13)),
    S('M45 40H95A13 13 0 0 1 108 53V60H32V53A13 13 0 0 1 45 40Z', { depth: [0, 0] }),
    S(rr(50, 28, 7, 20, 3.5) + rr(83, 28, 7, 20, 3.5), { tone: 'mid', depth: [1.2, 1.6] }),
    X('<g fill="{deep}" opacity=".55">'
      + [0, 1, 2, 3].map(c => [0, 1, 2].map(r => (c === 2 && r === 1 ? '' : `<circle cx="${50 + c * 14}" cy="${74 + r * 12}" r="2.6"/>`)).join('')).join('')
      + '</g>'),
    S(rr(72, 80, 16, 14, 4), { tone: 'mid', depth: [1, 1.4] }),
  ],
  bag: () => [
    S(BAG_BODY, { t: 'rotate(-12 64 80) translate(-10 -4)' }),
    G(BAG_BODY),
    X('<path d="M48 54V42a16 16 0 0 1 32 0v12" fill="none" stroke="{deep}" stroke-width="5" stroke-linecap="round"/>'),
    Y('peso', { x: 64, y: 82, s: 1.1, w: 2.4 }),
  ],
  pin: () => [
    S(ell(64, 106, 30, 8), { tone: 'light', depth: [0, 2] }),
    S(TEARDROP, { t: 'rotate(10 64 64) translate(10 -6)' }),
    G(TEARDROP),
    S(circ(64, 56, 11), { depth: [1.4, 1.8] }),
  ],
  target: () => [
    S(circ(56, 64, 38)),
    G(circ(66, 70, 38)),
    X('<g fill="none" stroke="{deep}" stroke-width="3" opacity=".75"><circle cx="66" cy="70" r="26"/><circle cx="66" cy="70" r="14"/></g>'),
    S(circ(66, 70, 6), { depth: [1, 1.4] }),
    X('<path d="M66 70 104 32" stroke="{deeper}" stroke-width="5" stroke-linecap="round"/>'),
    S(rpoly([[98, 24], [112, 20], [108, 34], [100, 38], [94, 32]], 3), { tone: 'mid', depth: [1.2, 1.6] }),
  ],
  chartUp: () => [
    S(rr(20, 30, 72, 72, 13), { t: 'rotate(-10 56 66)' }),
    G(rr(32, 38, 78, 74, 13)),
    S(rr(46, 84, 11, 16, 3), { tone: 'mid', depth: [1, 1.4] }),
    S(rr(64, 72, 11, 28, 3), { tone: 'mid', depth: [1, 1.4] }),
    S(rr(82, 58, 11, 42, 3), { depth: [1, 1.4] }),
    X('<path d="M44 72 62 58l12 8 24-22" fill="none" stroke="{deeper}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M86 42h14v14" fill="none" stroke="{deeper}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  ],
  chartDown: () => [
    S(rr(20, 30, 72, 72, 13), { t: 'rotate(-10 56 66)' }),
    G(rr(32, 38, 78, 74, 13)),
    S(rr(46, 60, 11, 40, 3), { depth: [1, 1.4] }),
    S(rr(64, 72, 11, 28, 3), { tone: 'mid', depth: [1, 1.4] }),
    S(rr(82, 84, 11, 16, 3), { tone: 'mid', depth: [1, 1.4] }),
    X('<path d="M44 52 62 66l12-8 24 22" fill="none" stroke="{deeper}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M86 82h14V68" fill="none" stroke="{deeper}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  ],
  star: () => [
    S(rpoly(ring(58, 62, 38, 5, 16), 5), { t: 'rotate(-14 58 62)' }),
    G(rpoly(ring(68, 70, 38, 5, 16), 5)),
    S(sparkle(104, 30, 9), { tone: 'mid', depth: [1, 1.4] }),
  ],
  flame: () => [
    S(FLAME, { t: 'rotate(-12 64 70) translate(-8 -4)' }),
    G(FLAME, { t: 'translate(4 2)' }),
    S('M64 60C72 70 80 76 80 88A16 16 0 0 1 48 88C48 80 53 74 57 70C58 76 61 79 64 80C62 72 61 66 64 60Z', { t: 'translate(4 2)', tone: 'mid', depth: [1.2, 1.6] }),
  ],
  party: () => [
    S(rpoly([[26, 110], [48, 54], [84, 90]], 6)),
    G(ell(66, 72, 25, 11), { t: 'rotate(45 66 72)' }),
    X('<path d="M72 44c6-8 2-16 10-18M88 58c8-4 16 0 18-8M60 34c2-6-2-10 2-14" fill="none" stroke="{mid}" stroke-width="3.6" stroke-linecap="round"/>'),
    confetti([[96, 30, 30], [106, 42, 0], [84, 22, -40], [110, 70, 20], [70, 16, 0], [100, 86, 60]]),
  ],
  moneyBag: () => [
    S('M50 42L41 24C51 29 57 22 64 27C71 22 77 29 87 24L78 42Z', { tone: 'mid' }),
    G(MONEY_BAG),
    S(rr(46, 38, 36, 9, 4.5), { depth: [1.2, 1.6] }),
    Y('peso', { x: 64, y: 80, s: 1.5, w: 2.4 }),
    S(circ(100, 100, 12), { tone: 'mid', depth: [1.6, 2] }),
  ],
  leaf: () => [
    S('M60 104C38 94 22 68 30 32C56 40 70 70 60 104Z'),
    X('<path d="M62 116C62 106 63 100 64 94" fill="none" stroke="{deep}" stroke-width="4" stroke-linecap="round"/>'),
    G('M64 104C64 76 78 48 108 36C114 68 96 98 64 104Z'),
    X('<path d="M69 98C76 80 88 62 102 48" fill="none" stroke="{deep}" stroke-width="3" stroke-linecap="round" opacity=".75"/>'),
  ],
  food: () => [
    S('M24 72c6-6 10 4 16-2s10 4 16-2 10 4 16-2 10 4 16-2 10 4 16 2v8H24z', { tone: 'mid', depth: [0, 2] }),
    S(rr(24, 76, 80, 14, 7)),
    G('M26 70C26 46 43 32 64 32C85 32 102 46 102 70Z'),
    G(rr(28, 88, 72, 20, 10)),
    X('<g fill="#fff" opacity=".85"><ellipse cx="50" cy="48" rx="3" ry="1.7" transform="rotate(-20 50 48)"/><ellipse cx="66" cy="42" rx="3" ry="1.7"/><ellipse cx="80" cy="50" rx="3" ry="1.7" transform="rotate(20 80 50)"/><ellipse cx="62" cy="56" rx="3" ry="1.7"/></g>'),
  ],
  seedling: () => [
    S('M64 70C64 48 52 36 28 36C28 58 40 70 64 70Z', { tone: 'mid' }),
    S('M64 62C64 42 76 30 100 30C100 52 88 62 64 62Z'),
    X('<path d="M64 76V56" stroke="{deep}" stroke-width="4" stroke-linecap="round"/>'),
    G(rpoly([[36, 76], [92, 76], [84, 112], [44, 112]], 7)),
    G(rr(32, 70, 64, 12, 6), { frost: 1.2 }),
  ],
  coffee: () => [
    S(ell(60, 110, 40, 8), { tone: 'light', depth: [0, 2] }),
    S('M92 60a14 14 0 0 1 0 28h-4v-8h4a6 6 0 0 0 0-12h-4v-8z', { tone: 'mid', depth: [1.4, 1.8] }),
    G('M30 50H90V82A28 28 0 0 1 62 110H58A28 28 0 0 1 30 82Z'),
    S(ell(60, 51, 29, 7), { depth: [0, 0] }),
    X('<path d="M48 34c-4-5 4-8 0-13M62 34c-4-5 4-8 0-13M76 34c-4-5 4-8 0-13" fill="none" stroke="{light}" stroke-width="3.4" stroke-linecap="round"/>'),
  ],
  trophy: () => [
    S(rr(40, 98, 48, 12, 6)),
    S(rr(58, 78, 12, 24, 3), { tone: 'mid' }),
    X('<path d="M38 36H24v6a16 16 0 0 0 16 16M90 36h14v6a16 16 0 0 1-16 16" fill="none" stroke="{deep}" stroke-width="5" stroke-linecap="round"/>'),
    G('M36 26H92V54A28 28 0 0 1 36 54Z'),
    Y('star', { x: 64, y: 50, s: 1.2, w: 2.2 }),
  ],
  medal: () => [
    S(rpoly([[42, 14], [58, 14], [70, 52], [54, 52]], 3), { tone: 'mid' }),
    S(rpoly([[86, 14], [70, 14], [58, 52], [74, 52]], 3)),
    G(circ(64, 80, 30)),
    Y('star', { x: 64, y: 80, s: 1.35, w: 2.2 }),
  ],
  wallet: () => [
    S(rr(32, 24, 62, 40, 8), { t: 'rotate(-10 63 44)' }),
    G(rr(22, 44, 86, 64, 13)),
    S(rr(80, 64, 32, 24, 9), { tone: 'mid', depth: [1.4, 1.8] }),
    X('<circle cx="92" cy="76" r="3.4" fill="#fff"/>'),
  ],
  card: () => [
    S(rr(18, 28, 82, 54, 10), { t: 'rotate(-12 59 55)' }),
    G(rr(30, 46, 84, 56, 11)),
    S(rr(44, 62, 17, 13, 3), { tone: 'light', depth: [0.8, 1] }),
    X('<path d="M44 88h26M78 88h12" stroke="{deep}" stroke-width="3.6" stroke-linecap="round" opacity=".6"/>'),
  ],
  receipt: () => [
    S(rr(26, 24, 64, 84, 8), { t: 'rotate(-8 58 66)' }),
    G('M38 30H98V108L91 103 84 108 77 103 70 108 63 103 56 108 49 103 42 108 38 105Z'),
    X('<path d="M50 50h36M50 62h36M50 74h22" stroke="{deep}" stroke-width="3.6" stroke-linecap="round" opacity=".7"/>'),
    S(circ(84, 88, 9), { tone: 'mid', depth: [1, 1.4] }),
  ],
  shield: () => [
    S(SHIELD, { t: 'rotate(-10 64 64) translate(-8 -2)' }),
    G(SHIELD, { t: 'translate(4 2)' }),
    Y('check', { x: 68, y: 64, s: 1.6, w: 2.4 }),
  ],
  gauge: () => [
    S(circ(56, 62, 38)),
    G(circ(66, 70, 38)),
    X('<path d="M40 82a28 28 0 1 1 52 0" fill="none" stroke="{deep}" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 9" opacity=".7"/>'),
    X('<path d="M66 76 84 54" stroke="{deeper}" stroke-width="5" stroke-linecap="round"/>'),
    S(circ(66, 76, 7), { depth: [1, 1.4] }),
  ],
  heart: () => [
    S(HEART, { t: 'rotate(-12 64 70) translate(-8 -4)' }),
    G(HEART, { t: 'translate(4 2)' }),
  ],
  rocket: () => [
    S('M54 88 40 104l4-22z M74 88l14 16-4-22z', { tone: 'mid' }),
    G('M64 16C80 30 88 50 86 74L74 90H54L42 74C40 50 48 30 64 16Z'),
    S(circ(64, 52, 9), { depth: [1.2, 1.6] }),
    X('<path d="M58 96c2 8 6 12 6 18M70 96c-2 8-6 12-6 18" stroke="{mid}" stroke-width="4" stroke-linecap="round" fill="none" opacity=".8"/>'),
  ],
  bank: () => [
    S(rpoly([[18, 50], [64, 20], [110, 50]], 5)),
    G(rr(26, 50, 76, 50, 6)),
    S(rr(34, 58, 9, 36, 3) + rr(52, 58, 9, 36, 3) + rr(67, 58, 9, 36, 3) + rr(85, 58, 9, 36, 3), { tone: 'mid', depth: [1, 1.4] }),
    S(rr(18, 100, 92, 10, 5)),
  ],
}

/** Every picture there is, by name. */
export const GLASS_NAMES = Object.keys(PICTURES)

let seq = 0
/** A fresh id prefix. Inline pictures share one document, and two with the
 *  same ids would draw each other's gradients. */
export function glassId() {
  seq = (seq + 1) % 1e6
  return `gx${seq.toString(36)}`
}

/**
 * A picture, as SVG markup.
 *
 * @param {string} name   one of GLASS_NAMES; an unknown one draws the sparkles
 * @param {{hue?: string, id?: string, locked?: boolean, shadow?: boolean, lift?: number, size?: number}} [o]
 */
export function glassSvg(name, o = {}) {
  const make = PICTURES[name] ?? PICTURES.sparkles
  const pal = o.locked ? LOCKED_PALETTE : glassPalette(o.hue ?? GLASS_BLUE, o.lift ?? 0)
  return render(make(), pal, o.id ?? 'g', { shadow: o.shadow, locked: o.locked, size: o.size })
}

// ── Medallions: the achievements' own shapes ──────────────────────────────────

const HEX_OUTER = rpoly(ring(64, 64, 46, 6, undefined, -90), 10)
const SHIELD_BADGE = rpoly([[64, 16], [104, 30], [104, 62], [64, 112], [24, 62], [24, 30]], 12)

/**
 * An achievement, as a glass medallion: a solid shape of its tone set back and
 * turned a little, a frosted one in front, and its mark pressed into that.
 *
 *   hex     a badge
 *   circle  a milestone, with its level on a chip at the foot
 *   shield  a challenge
 *
 * @param {{glyph: string, hue: string, shape?: 'hex'|'circle'|'shield', level?: string|number,
 *          locked?: boolean, id?: string, shadow?: boolean, size?: number}} o
 */
export function glassBadgeSvg(o) {
  const shape = o.shape ?? 'hex'
  const pal = o.locked ? LOCKED_PALETTE : glassPalette(o.hue)
  const d = shape === 'circle' ? circ(64, 62, 42) : shape === 'shield' ? SHIELD_BADGE : HEX_OUTER
  /** @type {Layer[]} */
  const layers = [
    S(d, { t: 'rotate(-10 64 64) translate(-5 -4)' }),
    G(d, { t: 'translate(4 3)' }),
    Y(o.glyph, { x: 68, y: shape === 'circle' ? 62 : 66, s: 1.75, w: 1.9 }),
  ]
  /* The level on a chip at the foot: white on the palette's ink ground, which
     is dark enough for it in every hue - on the solid's own gradient a lime or
     a teal left the number under 2:1. A light line along its top keeps it
     part of the glass. */
  if (shape === 'circle' && o.level != null && o.level !== '') {
    const text = String(o.level)
    const w = Math.max(30, 12 + text.length * 11)
    const x = 68 - w / 2
    layers.push(X(`<path d="${rr(x, 96, w, 22, 11)}" fill="${pal.ink}"/><path d="${rr(x + 3, 97.2, w - 6, 8, 4)}" fill="#fff" opacity="0.16"/>`))
    layers.push(X(`<text x="68" y="112" text-anchor="middle" font-family="Inter, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="#fff">${text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)}</text>`))
  }
  return render(layers, pal, o.id ?? 'b', { shadow: o.shadow, locked: o.locked, size: o.size })
}

/** An SVG string as a URL an <img> or a canvas can load. @param {string} svg */
export function svgUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
