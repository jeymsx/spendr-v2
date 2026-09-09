import BrandMark from './BrandMark'

/**
 * The big faint mark in a card's bottom-right corner, where a real card puts
 * its scheme logo.
 *
 * Real institution art lives in src/assets/brand-logos/<brand-key>.svg and is
 * picked up at build time - drop a file in and it wins with no code change.
 * The files there have been cropped to their logomark and stripped of paint,
 * so one CSS rule can flatten them to white; see assets/ATTRIBUTION.md for
 * provenance and licences. Anything with no file falls back to the letterform
 * art below, and anything with neither falls back to the category glyph.
 *
 * The one thing this component decides is SHAPE, because a logo's proportions
 * determine how it has to be sized. A compact mark (Shopee's bag, GCash's G)
 * is sized generously and pushed past two edges so it reads as bled-off card
 * art; a wordmark (maya, GoTyme) is much wider than it is tall, so the same
 * treatment would either dwarf the card or slice the letters in half. The
 * split is measured from the file's own viewBox rather than hardcoded per
 * brand, so a replacement asset gets the right treatment automatically.
 */

const LOGOS = import.meta.glob('../assets/brand-logos/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
})

const BY_KEY = Object.fromEntries(
  Object.entries(LOGOS).map(([path, svg]) => [
    path.split('/').pop().replace(/\.svg$/, ''),
    svg,
  ]),
)

/**
 * 'mark' for anything roughly square, 'word' for a wide lockup. The threshold
 * sits at 1.8:1 - well clear of the squarest real file (Shopee at 1.0) and the
 * widest compact one (GCash at 1.17), and well under the narrowest wordmark
 * (BPI at 2.12) - so no asset lands near the boundary.
 */
function shapeOf(svg) {
  const found = /viewBox\s*=\s*"([^"]+)"/.exec(svg)
  if (!found) return 'mark'
  const box = found[1].trim().split(/[\s,]+/).map(Number)
  if (box.length < 4 || !(box[3] > 0) || !(box[2] > 0)) return 'mark'
  return box[2] / box[3] >= 1.8 ? 'word' : 'mark'
}

const SHAPE_BY_KEY = Object.fromEntries(
  Object.entries(BY_KEY).map(([key, svg]) => [key, shapeOf(svg)]),
)

/**
 * Fallback art for brands with no asset file. `text` is set in the app's own
 * heavy weight; `art` is an extra path drawn in the same 120x60 box, for marks
 * that are a shape rather than letters.
 */
const BRAND_ART = {
  // Mari is Sea Group's; its mark is an M built from water. The wave sits
  // under the letter so it is not just another M.
  maribank: {
    text: 'M',
    art: 'M28 46q8-7 16 0t16 0 16 0 16 0v7q-8 7-16 0t-16 0-16 0-16 0z',
    textDy: -8,
  },
}

/** Wide wordmarks need a smaller size to fit the same box. */
function fontSizeFor(text) {
  if (text.length <= 1) return 54
  if (text.length === 2) return 42
  if (text.length === 3) return 33
  return 25
}

export default function BrandWatermark({ brand, className = 'acct-card-watermark' }) {
  const key = brand?.key

  // A real asset file, if one has been added, always wins.
  const custom = BY_KEY[key]
  if (custom) {
    return (
      <span
        className={className}
        data-wm={SHAPE_BY_KEY[key]}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: custom }}
      />
    )
  }

  const art = BRAND_ART[key]

  // No brand art either (plain cash, or an institution we don't know): the
  // category glyph, which is drawn on a 24x24 grid and so is a compact mark.
  if (!art) {
    return (
      <span className={className} data-wm="mark" aria-hidden="true">
        <BrandMark mark={brand?.mark} />
      </span>
    )
  }

  return (
    <span className={className} data-wm="word" aria-hidden="true">
      <svg viewBox="0 0 120 60" focusable="false" fill="currentColor">
        {art.art && <path d={art.art} />}
        {art.text && (
          <text
            x="60"
            y={44 + (art.textDy ?? 0)}
            textAnchor="middle"
            fontSize={fontSizeFor(art.text)}
            fontWeight="900"
            letterSpacing="-1"
            // Inter is the app's face and is already loaded; the fallbacks only
            // matter for the first paint before the webfont arrives, and a
            // watermark is forgiving about which grotesque it lands on.
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            {art.text}
          </text>
        )}
      </svg>
    </span>
  )
}
