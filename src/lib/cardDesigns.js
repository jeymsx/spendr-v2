/**
 * Card face designs.
 *
 * A design is a decorative layer over the brand gradient - never a
 * replacement for it. That is the whole constraint: GCash has to stay GCash
 * blue and BPI has to stay BPI red whichever design is on them, because the
 * card faces exist so an account is recognisable at a glance before you read
 * its name. So every pattern here is white at low alpha, which reads the same
 * way over a light e-wallet green as over a near-black credit card.
 *
 * The patterns themselves live in index.css, keyed off `data-design`, because
 * each needs its own background-size and position - `cover` for the ones that
 * are a single composed illustration, a tile size for the repeating ones.
 * What lives here is the list, its order, and the words shown under the
 * gallery.
 *
 * `classic` is first and is the default: no pattern at all, which is what
 * every account created before this existed looks like. An account with no
 * `design` field renders as classic without needing a migration.
 */

export const CARD_DESIGNS = [
  {
    key: 'classic',
    name: 'Classic',
    blurb: 'Just the brand gradient, with the grain and sheen the cards have always had.',
  },
  {
    key: 'orbit',
    name: 'Orbit',
    blurb: 'Concentric bands widening off the right edge, the way light falls across moulded plastic.',
  },
  {
    key: 'bloom',
    name: 'Bloom',
    blurb: 'Soft overlapping orbs, lit from the right and weighted at the lower left.',
  },
  {
    key: 'sweep',
    name: 'Sweep',
    blurb: 'Two broad diagonals cutting across the middle, wide enough to read as light.',
  },
  {
    key: 'onyx',
    name: 'Onyx',
    blurb: 'Deep tonal shapes rather than highlights. The darkest and most formal of the five.',
  },
]

/**
 * Earlier keys, kept working.
 *
 * The first pass at these was ripple, wave and weave - hairline strokes and a
 * fine diagonal weft, which read as artefacts rather than art. The concepts
 * that survived were rebuilt bolder under new names, so the old keys map onto
 * their nearest replacement instead of falling back to classic and silently
 * losing a choice someone had already made.
 */
const ALIASES = {
  aurora: 'bloom',
  ripple: 'orbit',
  wave: 'sweep',
  weave: 'onyx',
}

export const DEFAULT_DESIGN = 'classic'

/** A stored value that is no longer a known design must not render as blank. */
export function normalizeDesign(key) {
  const resolved = ALIASES[key] ?? key
  return CARD_DESIGNS.some(d => d.key === resolved) ? resolved : DEFAULT_DESIGN
}

export function designMeta(key) {
  return CARD_DESIGNS.find(d => d.key === normalizeDesign(key)) ?? CARD_DESIGNS[0]
}
