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
function shapeOfBox(viewBox) {
  const box = String(viewBox ?? '').trim().split(/[\s,]+/).map(Number)
  if (box.length < 4 || !(box[2] > 0) || !(box[3] > 0)) return 'mark'
  const ratio = box[2] / box[3]
  // Three tiers, because the real files span 1:1 to 11:1 and no single width
  // suits that range: Shopee's bag, BPI's crest-and-letters, and China Bank's
  // 11:1 strip each need their own treatment. See index.css.
  if (ratio >= 4.5) return 'wide'
  if (ratio >= 1.8) return 'word'
  return 'mark'
}

function shapeOf(svg) {
  const found = /viewBox\s*=\s*"([^"]+)"/.exec(svg)
  return found ? shapeOfBox(found[1]) : 'mark'
}

/**
 * Where the ratio is not the whole story.
 *
 * shapeOfBox reads proportions, which is the right answer for every file that
 * arrives as one horizontal lockup. MariBank's does not: its card is PORTRAIT
 * and prints the name stacked, "Mari" over "Bank", so the file is two lines
 * and comes out at 1.58:1. Squarish - which the sizer calls a compact symbol
 * and bleeds 9% off the right, taking a letter off the end of both lines.
 *
 * It is still a wordmark, and it also has to be turned: on a landscape card
 * the stacked lockup runs up the side, the way it does on the plastic. Both
 * of those are `stack` - see index.css.
 */
const SHAPE_OVERRIDE = {
  maribank: 'stack',
}

const SHAPE_BY_KEY = Object.fromEntries(
  Object.entries(BY_KEY).map(([key, svg]) => [key, SHAPE_OVERRIDE[key] ?? shapeOf(svg)]),
)

/**
 * Fallback art for brands with no asset file. `text` is set in the app's own
 * heavy weight; `art` is an extra path drawn in the same 120x60 box, for marks
 * that are a shape rather than letters.
 */
const BRAND_ART = {
  // Plain cash has no institution and so no logo. It used to fall through to
  // the category glyph, which is a banknote - and a banknote outline blown up
  // to a third of a card reads as an empty placeholder box, because at that
  // size all you see is its rectangle. The peso sign is the thing cash
  // actually is, it is a letterform so it survives being clipped, and a square
  // box gets it sized and bled like the other logomarks.
  cash: {
    viewBox: '0 0 64 64',
    text: '₱',
    fontSize: 58,
    baseline: 54,
    fontWeight: 600,
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

  // A real asset file always wins. `logoKeys` is the brand key followed by
  // filename guesses derived from the account's own name, so "BDO Credit"
  // finds bdo.svg without anyone adding a rule for it.
  const fileKey = (brand?.logoKeys ?? [key]).find(k => k && BY_KEY[k])
  if (fileKey) {
    return (
      <span
        className={className}
        data-wm={SHAPE_BY_KEY[fileKey]}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: BY_KEY[fileKey] }}
      />
    )
  }

  // By brand first, then by CATEGORY. The category fallback is what gives any
  // cash-type account the peso sign - `key` is only 'cash' for an account
  // actually named "Cash", so a custom cash account (an envelope, a tin, a
  // joint pot) would otherwise drop through to the banknote glyph, which is
  // the placeholder-looking box this art exists to replace.
  const art = BRAND_ART[key] ?? BRAND_ART[brand?.mark]

  // Still nothing: an institution with no logo file and no drawn art gets its
  // initials, which at least identify the card. The category glyph is the last
  // resort, because every bank shares it - a wall of identical building icons
  // tells you nothing about which card you are looking at.
  if (!art && brand?.monogram) {
    const letters = brand.monogram
    const boxW = Math.max(64, letters.length * 34)
    return (
      <span className={className} data-wm={shapeOfBox(`0 0 ${boxW} 64`)} aria-hidden="true">
        <svg viewBox={`0 0 ${boxW} 64`} focusable="false" fill="currentColor">
          <text
            x={boxW / 2}
            y="46"
            textAnchor="middle"
            fontSize={letters.length <= 2 ? 46 : letters.length === 3 ? 40 : 34}
            fontWeight="700"
            letterSpacing="-1"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            {letters}
          </text>
        </svg>
      </span>
    )
  }

  if (!art) {
    return (
      <span className={className} data-wm="mark" aria-hidden="true">
        <BrandMark mark={brand?.mark} />
      </span>
    )
  }

  const box = art.viewBox ?? '0 0 120 60'
  const [, , boxW, boxH] = box.trim().split(/[\s,]+/).map(Number)

  return (
    <span className={className} data-wm={shapeOfBox(box)} aria-hidden="true">
      <svg viewBox={box} focusable="false" fill="currentColor">
        {art.art && <path d={art.art} />}
        {art.text && (
          <text
            x={boxW / 2}
            y={(art.baseline ?? boxH * 0.73) + (art.textDy ?? 0)}
            textAnchor="middle"
            fontSize={art.fontSize ?? fontSizeFor(art.text)}
            fontWeight={art.fontWeight ?? 900}
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
