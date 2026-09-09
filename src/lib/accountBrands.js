/**
 * Brand identity for account cards: a gradient and a mark, resolved from the
 * account's name.
 *
 * The gradients are not the brands' literal hexes. White text on Shopee
 * orange, GoTyme cyan, Maya green, MariBank orange or a plain cash green all
 * fail WCAG AA outright, so every stop here was darkened until white clears
 * 4.55:1 — checked against the LIGHTEST stop, since checking the average
 * would leave the card's top corner failing, and measured THROUGH the card's
 * grain, sheen and watermark, which sit between the gradient and the text and
 * cost about 1.4 of contrast between them. Ignoring those was a real bug: the
 * stops passed 5:1 bare and rendered at 3.1:1. The darkening is capped so the
 * hue still reads as the brand: Metrobank stays navy, BPI crimson, MariBank
 * orange.
 *
 * `mark` names a category glyph (see BrandMark) used at small sizes, where a
 * detailed logo would be mud. The institutions' own marks are used large and
 * faint as the card watermark instead - see BrandWatermark and the licences in
 * assets/ATTRIBUTION.md. Settings still states the app is unaffiliated with
 * these banks and uses their names as labels only.
 */

// from = top-left (lighter), to = bottom-right (deeper). Both AA-safe.
const BRAND_GRADIENTS = {
  cash:           { from: '#0a6647', to: '#064530' },
  gcash:          { from: '#005aae', to: '#003d77' },
  maya:           { from: '#006839', to: '#004627' },
  'maya-savings': { from: '#0a6363', to: '#064444' },
  gotyme:         { from: '#006279', to: '#004352' },
  maribank:       { from: '#984000', to: '#682b00' },
  metrobank:      { from: '#23509c', to: '#072963' },
  bpi:            { from: '#aa303a', to: '#6e1219' },
  'maya-credit':  { from: '#313131', to: '#121212' },
  spaylater:      { from: '#a6361f', to: '#702415' },
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
function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''))
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(rgb) {
  return '#' + rgb
    .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')
}

/* The card's own overlays, mirrored from `.acct-card` in index.css. They sit
   between the gradient and the text, so a stop that passes on its own can
   still fail once they are composited over it - which is exactly the bug this
   guards. Keep these in step with that rule. */
const OVERLAYS = [
  [128, 128, 128, 0.10],  // ::before  fractalNoise grain, which averages grey
  [255, 255, 255, 0.08],  // ::after   diagonal sheen, at its peak
  [255, 255, 255, 0.10],  // the brand watermark
]

/** Browsers composite in gamma space, so this deliberately does not linearise. */
function composite(rgb) {
  return OVERLAYS.reduce(
    (bg, [r, g, b, a]) => [
      bg[0] * (1 - a) + r * a,
      bg[1] * (1 - a) + g * a,
      bg[2] * (1 - a) + b * a,
    ],
    rgb,
  )
}

function relativeLuminance([r, g, b]) {
  const lin = (c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Contrast of white text over `rgb` once the card overlays are on top of it. */
function whiteContrast(rgb) {
  return 1.05 / (relativeLuminance(composite(rgb)) + 0.05)
}

/**
 * Darkens a colour just enough that white text on it clears AA through the
 * card's overlays, and no further - so a custom account keeps as much of its
 * chosen hue as it safely can.
 *
 * A fixed darkening factor cannot work here: the preset palette alone needs
 * anywhere from 10% (violet) to 58% (lime, honey) to clear the bar, and a
 * colour arriving from sync or a future picker could need more still. One
 * factor sized for the worst case would turn every custom card near-black.
 * Scaling channels proportionally holds the hue while moving lightness.
 */
function aaSafeStops(hex, target = 4.55) {
  const rgb = parseHex(hex)
  if (!rgb) return null

  let lo = 0, hi = 1
  if (whiteContrast(rgb) < target) {
    // Binary search the largest scale that still clears the bar. 24 rounds
    // resolves to well under one 8-bit step.
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (whiteContrast(rgb.map(c => c * mid)) >= target) lo = mid
      else hi = mid
    }
  } else {
    lo = 1
  }

  const from = rgb.map(c => c * lo)
  // The deep stop only has to be darker, and darker is always safer.
  return { from: toHex(from), to: toHex(from.map(c => c * 0.66)) }
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
  const own = aaSafeStops(account?.color)
  if (own) return { key: 'custom', mark, ...own }

  return { key: 'fallback', mark, from: '#3f4a5a', to: '#26303c' }
}

/** `background` value for a card face. */
export function brandGradient(account) {
  const { from, to } = accountBrand(account)
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`
}
