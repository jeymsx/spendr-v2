/**
 * What the recap is decorated with, in one place: the 3D illustrations, the
 * Spendr mark, the confetti's colours, and the seeded randomness that places
 * things so they land in the same spot on every render and in every picture.
 *
 * Plain JS, not JSX, so the canvas that draws the saved picture can use the
 * same files and the same colours as the slides without pulling React in.
 *
 * ── The illustrations ──
 *
 * Microsoft's Fluent Emoji, 3D style (MIT - see src/assets/ATTRIBUTION.md),
 * at 256px, saved as WebP: the fifteen the recap uses come to under
 * 90KB. `import.meta.glob` finds them at build time, so a new file in
 * src/assets/recap/ is available by its name with nothing else to update.
 *
 * They are pictures, not text, which is why they can be newer emoji than a
 * slide's own text may use: an old Android draws an exhaling face as two
 * separate glyphs, but it draws this file the same as everything else.
 */

const FILES = import.meta.glob('../../assets/recap/*.webp', { eager: true, query: '?url', import: 'default' })

/** Bundled URL of each illustration, by file name: `ART['wrapped-gift']`. */
export const ART = /** @type {Record<string, string>} */ (Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [path.split('/').pop()?.replace(/\.webp$/, '') ?? '', url]),
))

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
