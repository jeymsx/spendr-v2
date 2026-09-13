/**
 * The colour arithmetic more than one screen needs.
 *
 * These were private to lib/accountBrands.js, which is where they were first
 * needed - a card has to darken a custom colour until white text on it clears
 * AA. The category rail now needs the same three functions to answer a
 * different question (what ink is readable on this fill?), and a second copy
 * of the sRGB luminance curve is not a thing worth having: get one of the two
 * wrong and the bug is invisible until someone picks the one colour it
 * mishandles.
 *
 * Nothing here knows about accounts, categories, or the DOM.
 */

/**
 * "#2D9DFF" to [45, 157, 255]. Null for anything that is not six hex digits -
 * a colour can arrive from sync, an old row, or a future picker.
 *
 * @param {string} [hex]
 * @returns {number[]|null}
 */
export function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''))
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * @param {number[]} rgb
 * @returns {string}
 */
export function toHex(rgb) {
  return '#' + rgb
    .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')
}

/**
 * WCAG relative luminance.
 *
 * @param {number[]} channels
 * @returns {number}
 */
export function relativeLuminance([r, g, b]) {
  /** @param {number} c */
  const lin = (c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/**
 * WCAG contrast between two colours, 1 to 21. Order does not matter.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * An ink that can be read on top of `hex` as a solid fill.
 *
 * Two candidates, and the better one wins: white, or a very dark tint of the
 * fill's own hue. Which of those is right cannot be decided once for the
 * palette - white clears 4.26:1 on the violet and 1.78:1 on the light orange,
 * and there is nothing in a hex string that says which kind it is without
 * doing this arithmetic.
 *
 * Dark rather than black, and a tint of the colour rather than a neutral:
 * a near-black orange still reads as belonging to the orange tile, and the
 * scaling holds the hue while moving only lightness. Across the thirteen
 * category colours the worst case is 4.0:1, over the 3:1 a graphic of this
 * size needs and within a whisker of text AA.
 *
 * @param {string} [hex]
 * @param {string} [fallback]  for a colour that will not parse
 * @returns {string}
 */
export function readableInk(hex, fallback = '#ffffff') {
  const rgb = parseHex(hex)
  if (!rgb) return fallback
  const dark = rgb.map(c => c * 0.22)
  return contrastRatio(rgb, dark) > contrastRatio(rgb, [255, 255, 255])
    ? toHex(dark)
    : '#ffffff'
}
