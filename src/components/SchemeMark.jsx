/**
 * The card network mark — Visa, Mastercard, Amex, JCB.
 *
 * These are the networks' real marks, from simple-icons (CC0), reduced to
 * monochrome silhouettes; see assets/ATTRIBUTION.md. Unlike the brand
 * watermark behind it, this is meant to be read, so it renders near-opaque.
 *
 * White via `currentColor`, which real cards print all the time and which
 * means one set works on every brand gradient with no per-scheme palette to
 * keep legible.
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

export default function SchemeMark({ scheme, className = '' }) {
  const svg = BY_KEY[scheme]
  if (!svg) return null

  return (
    <span
      className={`scheme-mark ${className}`}
      aria-label={SCHEME_LABEL[scheme] ?? undefined}
      role={SCHEME_LABEL[scheme] ? 'img' : undefined}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
