import { contrastRatio, parseHex, toHex } from '../../lib/color'

/**
 * The recap's look and motion, in one place.
 *
 * ── Spendr's own colours ──
 *
 * The recap is drawn in the accent you chose, the way the net-worth card on
 * Home is: on Azure it is blues, on Honey golds. The screen behind it is the
 * app's own - #0b0f14 or #f8fafc under the same accent wash the app draws -
 * and every card is a gradient of the accent, with the wallet card's grain
 * and soft top light (CardTexture).
 *
 * Six cards, and they are not six lightnesses of one colour. Tried that way,
 * the contrast rule below pulled every one of them down to the same deep
 * shade, and a deck of eleven identical cards read as one card that kept
 * changing its words. So each card also turns the hue a little - a few
 * degrees either side, never far enough to leave the accent's family: on
 * Azure the deck runs from teal-blue to indigo, on Blush from magenta to
 * coral. And each gradient sweeps a few degrees across itself, top to foot,
 * which is what makes a card read as lit rather than painted.
 *
 * ── White text, always readable ──
 *
 * Cards carry white text whatever the accent, so each card's lightest stop is
 * pulled down until white clears 6:1 on it. That is more than white alone
 * needs, on purpose: the words sit at the top of the card, under its light
 * from above (CardTexture), which lifts the background by about 7% white -
 * and secondary text is 90% white, not white. Under that light, white still
 * clears 5:1 and secondary text 4.5:1 on every card of every accent
 * (theme.test.js). At 5.2:1 and 80%, as first written, secondary text came
 * to 3.5:1 there. On Azure the clamp barely moves anything; on Honey, the
 * lightest preset, it turns the cards into deep gold.
 *
 * ── One spring, no bounce ──
 *
 * Everything that moves uses the same spring with `bounce: 0` - critically
 * damped, so it settles without overshooting. A shared spring is what makes
 * separate movements read as one gesture.
 */

/** The spring every morph and entrance uses. */
export const SPRING = { type: 'spring', bounce: 0, visualDuration: 0.5 }
/** Colour has no velocity to carry, so it eases rather than springs. */
export const COLOR_EASE = { duration: 0.45, ease: [0.22, 1, 0.36, 1] }
/** Leaving is quicker than arriving, and accelerates away rather than settling. */
export const EXIT = { duration: 0.22, ease: [0.4, 0, 1, 1] }
/** How long a slide stays before moving on by itself. */
export const SLIDE_MS = 7000
/** A tap is short and still; anything else is a hold, a swipe or a drag. */
export const TAP_MS = 250
export const TAP_SLOP = 10

const WHITE = [255, 255, 255]
/** What white must clear on a card's lightest stop - see the note above. */
export const CARD_CONTRAST = 6
/** How much white the card's light from above adds where the words are. */
export const TOP_LIGHT = 0.07

/** @param {number[]} rgb @returns {[number, number, number]} h 0-360, s and l 0-1 */
export function rgbToHsl([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  if (!d) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return [h * 60, s, l]
}

/** @param {number} h @param {number} s @param {number} l @returns {number[]} */
export function hslToRgb(h, s, l) {
  const k = (/** @type {number} */ n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (/** @type {number} */ n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}

/**
 * @typedef {object} CardTone
 * @property {string} light      the gradient's top stop
 * @property {string} deep       its bottom stop
 * @property {string} background the CSS gradient itself
 *
 * @typedef {object} RecapPalette
 * @property {'light'|'dark'} mode
 * @property {string} accent      the accent, as chosen
 * @property {string} backdrop    the screen behind the cards
 * @property {string} chrome      text on the backdrop: the header, the dial
 * @property {string} chromeMuted
 * @property {string} chromeFaint
 * @property {CardTone[]} tones   the cards, darkest-to-lightest variety
 * @property {string} ink         text on a card
 * @property {string} muted
 * @property {string} track       bars at rest, hairlines, chips
 * @property {string} good        a figure that went well
 * @property {string} soft        one that did not - warm, never alarming
 * @property {string} paper       a receipt, a tag, a stamp card, a summary tile
 * @property {string} paperInk
 * @property {string} paperMuted
 * @property {string} paperGood   `good`, on paper
 * @property {string} paperSoft   `soft`, on paper
 * @property {string} deepInk     the accent at its darkest, for ink on paper
 * @property {string} glow        the accent lightened, for light behind an illustration
 */

/**
 * The six cards: how far each turns from the accent's hue, in degrees, and
 * its top and bottom lightness before the contrast clamp. Light and dark
 * alternate, and so do the turns, so neighbours differ in both.
 */
const TONE_STOPS = [
  { turn: 0, top: 0.42, bottom: 0.22, angle: 165 },
  { turn: -9, top: 0.46, bottom: 0.25, angle: 190 },
  { turn: 12, top: 0.38, bottom: 0.18, angle: 150 },
  { turn: -5, top: 0.46, bottom: 0.28, angle: 175 },
  { turn: 7, top: 0.34, bottom: 0.15, angle: 140 },
  { turn: -12, top: 0.42, bottom: 0.21, angle: 200 },
]
/** How far a gradient sweeps its hue from top to foot. */
const SWEEP = 12
/** The most saturated a card gets: past this, a blue-violet at card lightness is neon. */
const MAX_SATURATION = 0.84

/**
 * A turned hue, kept inside its colour's family where the family is narrow.
 *
 * Dark yellow is olive, not gold, so a yellow or an orange never turns
 * greener than 40 degrees - its deep shades go amber instead. And a blue
 * turned even a little toward green is teal beside the rest of the deck,
 * so a blue turns only toward indigo.
 *
 * @param {number} base the accent's hue
 * @param {number} turned
 */
function family(base, turned) {
  const h = ((turned % 360) + 360) % 360
  if (base >= 20 && base <= 75) return Math.min(h, 40)
  if (base >= 200 && base <= 250) return Math.max(h, 205)
  return h
}

/** Yellows turn half as far: every degree shows at the lightness they are drawn at. @param {number} h */
const turnScale = (h) => (h >= 35 && h <= 75 ? 0.5 : 1)

/**
 * The lightest this hue can be with white text still clearing `min` on it.
 *
 * @param {number} h @param {number} s @param {number} min
 */
function readableLightness(h, s, min) {
  for (let l = 0.62; l > 0.06; l -= 0.01) {
    if (contrastRatio(hslToRgb(h, s, l), WHITE) >= min) return l
  }
  return 0.06
}

/**
 * Everything the recap is drawn in, for an accent and a theme.
 *
 * @param {string} accentHex  "#2D9DFF"
 * @param {'light'|'dark'} mode
 * @returns {RecapPalette}
 */
export function recapPalette(accentHex, mode) {
  const rgb = parseHex(accentHex) ?? parseHex('#2D9DFF')
  const [h, rawS] = rgbToHsl(/** @type {number[]} */ (rgb))
  // Neon at full saturation, grey below the floor; the cards sit between.
  const s = Math.min(MAX_SATURATION, Math.max(0.42, rawS))
  const ceiling = readableLightness(h, s, CARD_CONTRAST)
  const hex = (/** @type {number} */ l) => toHex(hslToRgb(h, s, l))
  const k = turnScale(h)
  const hue = (/** @type {number} */ d) => family(h, h + d * k)

  const tones = TONE_STOPS.map(({ turn, top, bottom, angle }) => {
    // The clamp is per hue: at the same lightness a teal is brighter than a blue.
    const topHue = hue(turn - SWEEP / 2), footHue = hue(turn + SWEEP / 2)
    const lightL = Math.min(top, readableLightness(topHue, s, CARD_CONTRAST))
    const deepL = Math.min(bottom, lightL - 0.08, readableLightness(footHue, s, CARD_CONTRAST))
    const light = toHex(hslToRgb(topHue, s, lightL)), deep = toHex(hslToRgb(footHue, s, deepL))
    return { light, deep, background: `linear-gradient(${angle}deg, ${light} 0%, ${deep} 100%)` }
  })

  const [r, g, b] = /** @type {number[]} */ (rgb)
  const a = (/** @type {number} */ alpha) => `rgba(${r}, ${g}, ${b}, ${alpha})`
  const dark = mode === 'dark'
  return {
    mode,
    accent: toHex(/** @type {number[]} */ (rgb)),
    backdrop: dark
      ? `radial-gradient(130% 85% at 50% -12%, ${a(0.30)}, ${a(0.10)} 42%, transparent 74%),
         radial-gradient(110% 80% at 85% 112%, ${a(0.20)}, transparent 70%), #0b0f14`
      : `radial-gradient(130% 85% at 50% -12%, ${a(0.24)}, ${a(0.08)} 42%, transparent 74%),
         radial-gradient(110% 80% at 85% 112%, ${a(0.16)}, transparent 70%), #f8fafc`,
    chrome: dark ? '#FFFFFF' : '#0F172A',
    chromeMuted: dark ? 'rgba(255, 255, 255, 0.66)' : '#475569',
    chromeFaint: dark ? 'rgba(255, 255, 255, 0.26)' : 'rgba(15, 23, 42, 0.22)',
    tones,
    ink: '#FFFFFF',
    muted: 'rgba(255, 255, 255, 0.9)',
    track: 'rgba(255, 255, 255, 0.18)',
    good: '#BBF7D0',
    soft: '#FED7AA',
    paper: '#FFFFFF',
    paperInk: '#0F172A',
    paperMuted: '#475569',
    // Green-700 and orange-700: 5.0:1 and 5.2:1 on white.
    paperGood: '#15803D',
    paperSoft: '#C2410C',
    deepInk: hex(Math.min(0.2, ceiling - 0.12)),
    glow: toHex(hslToRgb(h, s, 0.72)),
  }
}

/** The slides between the first and the last take these tones, in turn: light, dark, light... */
const MIDDLE_TONES = [1, 2, 3, 5, 4]

/**
 * Which of the six tones each slide's card wears, by its place in THIS
 * month's story - not by which slide it is. A month skips slides, and a fixed
 * tone per slide put two of the same colour side by side whenever the ones
 * between them were skipped. By place, the first and last cards are tone 0 -
 * the summary is the saved picture, which is always tone 0 - and every card
 * between takes the next of five others, so the three cards on screen at
 * once, the one you are reading and the two behind it, are never the same.
 *
 * @param {string[]} ids
 * @returns {number[]}
 */
export function tonesFor(ids) {
  return ids.map((_, i) => (i === 0 || i === ids.length - 1 ? 0 : MIDDLE_TONES[(i - 1) % MIDDLE_TONES.length]))
}
