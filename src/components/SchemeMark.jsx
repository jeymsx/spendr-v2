/**
 * The card network mark — Visa, Mastercard, Amex, JCB.
 *
 * These are the networks' real marks, from simple-icons (CC0), reduced to
 * monochrome silhouettes; see assets/ATTRIBUTION.md. Unlike the brand
 * watermark behind it, this is meant to be read, so it renders near-opaque.
 *
 * Two treatments, decided by whether the file carries its own colour.
 *
 * Mastercard's mark is its two interlocking circles, and it is printed in full
 * colour on essentially every real card - flattened to a white silhouette the
 * two circles merge into one blob and stop being the logo. Its geometry is
 * exactly specified rather than drawn (two equal circles, centres 0.6 of a
 * diameter apart, with the lens of their intersection in the darker orange),
 * so constructing it is reproduction, not approximation. The 1.6:1 result
 * matches the 1.62 measured off the traced file, which is the check that the
 * construction is right.
 *
 * Everything else stays white. That is not a shortcut: on a dark card Visa is
 * printed white, and its real #1434CB blue on these gradients would be close
 * to illegible.
 */

const FILES = import.meta.glob('../assets/scheme-logos/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
})

const BY_KEY = Object.fromEntries(
  Object.entries(FILES).map(([path, svg]) => [
    path.split('/').pop().replace(/\.svg$/, ''),
    svg,
  ]),
)

export const SCHEME_OPTIONS = [
  { value: '',           label: 'None' },
  { value: 'visa',       label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'amex',       label: 'Amex' },
  { value: 'jcb',        label: 'JCB' },
]

export const SCHEME_LABEL = Object.fromEntries(
  SCHEME_OPTIONS.filter(o => o.value).map(o => [o.value, o.label]),
)

/** True when this scheme has art to render, so callers can skip the slot. */
export function hasSchemeMark(scheme) {
  return !!scheme && !!BY_KEY[scheme]
}

/**
 * A file that declares its own hex fills is painting a brand palette and must
 * not be overridden; one that only carries `currentColor` is a silhouette
 * waiting to be told what colour to be. Read from the file rather than kept
 * as a per-scheme list, so dropping in a new asset needs no code change.
 */
const IS_BRAND_COLOURED = Object.fromEntries(
  Object.entries(BY_KEY).map(([key, svg]) => [key, /fill="#/i.test(svg)]),
)

export default function SchemeMark({ scheme, className = '' }) {
  const svg = BY_KEY[scheme]
  if (!svg) return null

  return (
    <span
      className={`scheme-mark ${className}`}
      data-tone={IS_BRAND_COLOURED[scheme] ? 'brand' : 'mono'}
      aria-label={SCHEME_LABEL[scheme] ?? undefined}
      role={SCHEME_LABEL[scheme] ? 'img' : undefined}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
