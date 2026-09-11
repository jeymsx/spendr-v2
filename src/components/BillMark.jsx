import CategoryGlyph from './CategoryGlyph'
import { billBrandKey, BILL_BRAND_COLORS } from '../lib/billBrands'

/**
 * A bill's own logo, where one is known, and its category glyph otherwise.
 *
 * Drop-in art, the same arrangement the account cards use: files live in
 * src/assets/bill-logos/<slug>.svg and are picked up at build time, so
 * adding a brand is adding a file. See that folder's README for where the
 * committed ones came from and what to do about the ones no icon set has -
 * Meralco, Maynilad, Globe - which is the same seam, just unlicensed.
 *
 * The mark keeps the brand's real colour on a white chip; billBrands.js has
 * the measurements behind that. Unknown names fall through to exactly what
 * this row drew before, so nothing regresses for a bill called "Gym".
 */

const LOGOS = import.meta.glob('../assets/bill-logos/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
})

const BY_SLUG = Object.fromEntries(
  Object.entries(LOGOS).map(([path, svg]) => [
    path.split('/').pop().replace(/\.svg$/, ''),
    svg,
  ]),
)

/** True when this bill has art, so callers can decide layout before rendering. */
export function hasBillMark(name) {
  const key = billBrandKey(name)
  return !!(key && BY_SLUG[key])
}

export default function BillMark({ name, cat, size = 20, boxClass = '', dim = false }) {
  const key = billBrandKey(name)
  const svg = key ? BY_SLUG[key] : null

  if (svg) {
    return (
      <span
        className={`bill-mark shrink-0 flex items-center justify-center
          bg-white border border-slate-200/70 dark:border-white/10 ${boxClass}`}
        style={{ color: BILL_BRAND_COLORS[key] ?? '#0f172a', opacity: dim ? 0.55 : 1 }}
      >
        <span
          className="block"
          style={{ width: size, height: size }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </span>
    )
  }

  // No art for this one. The tinted tile the row has always drawn.
  return (
    <span
      className={`shrink-0 flex items-center justify-center text-lg ${boxClass}`}
      style={{ backgroundColor: (cat?.color ?? '#64748b') + (dim ? '14' : '20') }}
    >
      <CategoryGlyph cat={cat} size={size} emoji="🔁" />
    </span>
  )
}
