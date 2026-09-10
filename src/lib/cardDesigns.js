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
    key: 'aurora',
    name: 'Aurora',
    blurb: 'Two soft orbs, low and wide, the way light pools behind frosted plastic.',
  },
  {
    key: 'ripple',
    name: 'Ripple',
    blurb: 'Concentric arcs from the bottom corner, like a struck surface settling.',
  },
  {
    key: 'wave',
    name: 'Wave',
    blurb: 'One long curve across the face, dividing it without drawing a line.',
  },
  {
    key: 'weave',
    name: 'Weave',
    blurb: 'A fine diagonal weft. Closest to a real card’s embossed texture.',
  },
]

export const DEFAULT_DESIGN = 'classic'

/** A stored value that is no longer a known design must not render as blank. */
export function normalizeDesign(key) {
  return CARD_DESIGNS.some(d => d.key === key) ? key : DEFAULT_DESIGN
}

export function designMeta(key) {
  return CARD_DESIGNS.find(d => d.key === normalizeDesign(key)) ?? CARD_DESIGNS[0]
}
