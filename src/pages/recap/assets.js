import { glassSvg, svgUrl } from '../../components/glass/glass'

/**
 * What the recap is decorated with, in one place: the glass illustrations,
 * the Spendr mark, the confetti's colours, and the seeded randomness that
 * places things so they land in the same spot on every render and in every
 * picture.
 *
 * Plain JS, not JSX, so the canvas that draws the saved picture can use the
 * same pictures and the same colours as the slides without pulling React in.
 *
 * ── The illustrations ──
 *
 * Frosted glass over solid colour, drawn in code (components/glass) in the
 * accent you chose - so a Honey recap has gold glass and an Azure one blue -
 * and lifted a step, because they sit on cards that are that accent too.
 * The slides still ask for them by the names they always used; GLASS_FOR is
 * the one place those names meet the pictures.
 */

/** What each illustration the recap asks for is drawn as. */
export const GLASS_FOR = /** @type {Record<string, string>} */ ({
  'wrapped-gift': 'gift',
  sparkles: 'sparkles',
  'money-with-wings': 'cash',
  coin: 'coin',
  'pig-face': 'piggy',
  'face-exhaling': 'scale',
  'spiral-calendar': 'calendar',
  'shopping-bags': 'bag',
  'round-pushpin': 'pin',
  bullseye: 'target',
  rocket: 'rocket',
  'chart-decreasing': 'chartDown',
  'glowing-star': 'star',
  'party-popper': 'party',
  'money-bag': 'moneyBag',
  herb: 'leaf',
  hamburger: 'food',
  seedling: 'seedling',
  'hot-beverage': 'coffee',
})

/**
 * The small marks on a slide's chip and on its paper tiles, which were emoji,
 * as glass. Only the app's own decoration is swapped: a category's emoji is
 * something you chose, and it stays as you chose it.
 */
export const EMOJI_GLASS = /** @type {Record<string, string>} */ ({
  '💸': 'cash', '🐷': 'piggy', '🏆': 'trophy', '👉': 'star', '🔥': 'flame', '📅': 'calendar',
  '🛍️': 'bag', '📍': 'pin', '🎯': 'target', '📈': 'chartUp', '📉': 'chartDown', '🏅': 'medal',
  '✨': 'sparkles', '🎉': 'party', '🌱': 'seedling', '⚖️': 'scale', '💰': 'moneyBag', '🌿': 'leaf',
})

/** The glass picture standing in for one of the app's own emoji, if there is one. @param {string|null|undefined} emoji */
export function glassForEmoji(emoji) {
  return emoji ? EMOJI_GLASS[emoji] ?? null : null
}

/** How far the recap's glass is lifted off the accent it sits on. */
const LIFT = 0.1

/**
 * The few pictures whose colour says something. Everything else takes the
 * month's accent, so a slide reads as one colour - but a flame drawn in blue
 * read as a drop of water, and a blue leaf as nothing at all.
 */
const HUE_FOR = /** @type {Record<string, string>} */ ({
  flame: '#F76707',
  leaf: '#66A80F',
  seedling: '#66A80F',
})

/** Drawn once per picture, colour and lift. @type {Map<string, string>} */
const urls = new Map()

/**
 * An illustration, as SVG markup.
 *
 * @param {string} name   a recap name ('pig-face') or a glass one ('piggy')
 * @param {string} hue    the accent
 * @param {number} [lift] lifted for the card by default; 0 for glass on paper
 * @param {number} [size] the size it claims: a picture on a canvas needs the
 *                        size it is drawn at (see loadGlass in canvasKit.js)
 */
export function artSvg(name, hue, lift = LIFT, size) {
  const glass = GLASS_FOR[name] ?? name
  return glassSvg(glass, { hue: HUE_FOR[glass] ?? hue, lift, id: 'r', size })
}

/**
 * An illustration, as a URL an <img> can load.
 *
 * @param {string} name @param {string} hue @param {number} [lift]  as artSvg
 */
export function artUrl(name, hue, lift = LIFT) {
  const glass = GLASS_FOR[name] ?? name
  const key = `${glass}|${HUE_FOR[glass] ?? hue}|${lift}`
  let url = urls.get(key)
  if (!url) {
    url = svgUrl(artSvg(name, hue, lift))
    urls.set(key, url)
  }
  return url
}

/**
 * The Spendr mark. The 512 is for the saved picture, which draws it at about
 * 130px on a 1080px canvas; the 192 is plenty for anything on screen.
 */
export const LOGO = '/icons/icon-192.png'
export const LOGO_LARGE = '/icons/icon-512.png'

/**
 * Confetti on a card of any accent. Light, so every piece shows on the deep
 * end of a gradient, and a spread of hues, so a Honey card still has pink
 * and blue on it and an Azure card still has gold. White first: it is the
 * one that shows on every accent.
 */
export const CONFETTI = ['#FFFFFF', '#FDE68A', '#F9A8D4', '#A7F3D0', '#BAE6FD', '#C4B5FD', '#FDBA74']

/**
 * A small deterministic random-number generator (mulberry32).
 *
 * Math.random in a render places a sticker somewhere new every time anything
 * above it changes, and places the saved picture's confetti differently each
 * time it is drawn - a picture that is not the same picture twice. Seeded
 * from the month, the same month always scatters the same way.
 *
 * @param {number} seed
 * @returns {() => number} 0 (inclusive) to 1 (exclusive)
 */
export function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A seed from a string - "2026-08" - so a month always scatters the same way. @param {string} text */
export function seedOf(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}
