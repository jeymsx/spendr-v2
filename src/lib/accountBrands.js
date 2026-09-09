/**
 * Brand identity for account cards: a gradient and a mark, resolved from the
 * account's name.
 *
 * The gradients are not the brands' literal hexes. White text on Shopee
 * orange, GoTyme cyan, Maya green, MariBank orange or a plain cash green all
 * fail WCAG AA outright, so every stop here was darkened until white clears
 * 5:1 against it — aimed at 5 rather than 4.5 so rounding at the boundary
 * cannot land under, and checked against the LIGHTEST stop, since checking the
 * average would leave the card's top corner failing. The darkening is capped
 * so the hue still reads as the brand: Metrobank stays navy, BPI crimson,
 * MariBank orange.
 *
 * Marks are deliberately category glyphs rather than reproductions of each
 * institution's logo. Three reasons, in order of weight:
 *   - Settings already states this app is unaffiliated with these banks and
 *     uses their names only as labels. Embedding their trademarks next to that
 *     would contradict it.
 *   - There is no licensed source for Philippine bank card art, so the
 *     alternative is ten hand-drawn approximations that read as a mismatched
 *     set at 20px.
 *   - At this size the colour does nearly all the identifying anyway.
 * `mark` is a slot, so a per-brand set can replace these later without
 * touching any call site.
 */

// from = top-left (lighter), to = bottom-right (deeper). Both AA-safe.
const BRAND_GRADIENTS = {
  cash:           { from: '#0c7e58', to: '#08563c' },
  gcash:          { from: '#006ed5', to: '#004b91' },
  maya:           { from: '#008047', to: '#005730' },
  'maya-savings': { from: '#0c7b7b', to: '#085454' },
  gotyme:         { from: '#007894', to: '#005265' },
  maribank:       { from: '#ba4e00', to: '#7f3500' },
  metrobank:      { from: '#23509c', to: '#072963' },
  bpi:            { from: '#b6333e', to: '#76131b' },
  'maya-credit':  { from: '#313131', to: '#121212' },
  spaylater:      { from: '#c64025', to: '#862b19' },
}

/**
 * Name patterns, most specific first — order is load-bearing. "gcash" has to
 * beat "cash", and "maya savings" / "maya credit" have to beat "maya", or
 * every Maya product collapses onto one colour.
 */
const NAME_RULES = [
  [/mayasavings|mayasave/,        'maya-savings', 'wallet'],
  [/mayacredit|mayablack/,        'maya-credit',  'card'],
  [/gcash/,                       'gcash',        'wallet'],
  [/gotyme/,                      'gotyme',       'bank'],
  [/maribank|marisavings|^mari/,  'maribank',     'bank'],
  [/metrobank|^metro/,            'metrobank',    'bank'],
  [/spaylater|shopeepay|shopee/,  'spaylater',    'bnpl'],
  [/^bpi/,                        'bpi',          'bank'],
  [/maya/,                        'maya',         'wallet'],
  [/^cash$|petty|wallet$/,        'cash',         'cash'],
]

/** Glyph to use when the name matches nothing known. */
const TYPE_MARK = {
  cash:    'cash',
  ewallet: 'wallet',
  bank:    'bank',
  savings: 'bank',
  credit:  'card',
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Mix a hex toward black, so an unknown account's own stored colour can still
 * be made dark enough for white text instead of being shown as-is.
 */
function shade(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''))
  if (!m) return null
  const n = parseInt(m[1], 16)
  const mix = (c) => Math.round(c * (1 - amount))
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255)
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

/**
 * @param {{name?: string, type?: string, color?: string}} account
 * @returns {{key: string, mark: string, from: string, to: string}}
 */
export function accountBrand(account) {
  const key = norm(account?.name)

  for (const [pattern, brandKey, mark] of NAME_RULES) {
    if (pattern.test(key)) {
      return { key: brandKey, mark, ...BRAND_GRADIENTS[brandKey] }
    }
  }

  // Unknown institution: build a gradient from whatever colour the account
  // carries, darkened so white text stays legible on it. The preset palette
  // uses light Tailwind values, so using them raw would fail.
  const mark = TYPE_MARK[account?.type] ?? 'bank'
  const own = shade(account?.color, 0.42)
  if (own) return { key: 'custom', mark, from: own, to: shade(account.color, 0.62) }

  return { key: 'fallback', mark, from: '#3f4a5a', to: '#26303c' }
}

/** `background` value for a card face. */
export function brandGradient(account) {
  const { from, to } = accountBrand(account)
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`
}
