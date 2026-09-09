import BrandMark from './BrandMark'

/**
 * The big faint glyph in a card's bottom-right corner.
 *
 * Ships with the built-in category marks, but will prefer a real logo if one
 * is present: drop `<brand-key>.svg` into src/assets/brand-logos/ and it is
 * picked up at build time with no code change. The keys are the ones
 * accountBrand() returns — gcash, maya, maya-savings, gotyme, maribank,
 * metrobank, bpi, maya-credit, spaylater, cash.
 *
 * Nothing is committed to that folder deliberately. There is no licensed
 * source for Philippine bank card art, and Settings states this app is
 * unaffiliated with these institutions and uses their names only as labels —
 * so shipping their trademarks would contradict it. Adding files locally, for
 * a personal build, is a different decision, and this is the seam for it.
 *
 * Anything dropped in is recoloured to flat white: a watermark wants one
 * silhouette, not the logo's own palette showing through at 10% opacity.
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

export default function BrandWatermark({ brand, size = 200, className = 'acct-card-watermark' }) {
  const custom = BY_KEY[brand?.key]

  if (custom) {
    return (
      <span
        className={className}
        aria-hidden="true"
        // Flattened to white by CSS (see .acct-card-watermark svg in
        // index.css), so a full-colour brand file still reads as one shape.
        dangerouslySetInnerHTML={{ __html: custom }}
      />
    )
  }

  return <BrandMark mark={brand?.mark} size={size} className={className} />
}
