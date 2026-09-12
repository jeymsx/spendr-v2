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
 *
 * Annotated because a mixed array literal widens to (RegExp | string)[] on
 * its own, which loses the position of each element - and then `pattern.test`
 * is an error on something that is a RegExp every time.
 *
 * @type {Array<[RegExp, string, string]>}
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
/**
 * Darken one colour until white text clears `target` on it.
 *
 * Split out of aaSafeStops so a two-colour gradient can solve each end
 * independently - text can sit over either stop, so both have to clear the
 * bar, and solving only the lighter one would leave the other unnecessarily
 * dark.
 */
function solveStop(rgb, target) {
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
  return rgb.map(c => c * lo)
}

/**
 * A colour spec becomes a safe pair of gradient stops.
 *
 * Accepts one hex, or two separated by a comma - "#a855f7,#ec4899" - which is
 * how a gradient preset is stored. One field, one column, no migration: an
 * existing single hex parses exactly as it always did.
 */
function aaSafeStops(spec, target = 4.55) {
  const parts = String(spec ?? '').split(',').map(x => x.trim()).filter(Boolean)
  if (parts.length > 1) {
    const a = parseHex(parts[0])
    const b = parseHex(parts[1])
    if (!a || !b) return null
    return { from: toHex(solveStop(a, target)), to: toHex(solveStop(b, target)) }
  }

  const rgb = parseHex(spec)
  if (!rgb) return null

  const from = solveStop(rgb, target)
  // The deep stop only has to be darker, and darker is always safer.
  return { from: toHex(from), to: toHex(from.map(c => c * 0.66)) }
}

/**
 * Two-colour presets for the card style step.
 *
 * Kept apart from PALETTE because PALETTE's values go straight into
 * `background` on a swatch and into other colour grids; a comma-separated
 * pair there would render as an invalid colour. These are only ever read by
 * the style step, which knows to draw them as a gradient.
 *
 * Stated light: aaSafeStops darkens each end as far as white text needs, so
 * what is picked here is the hue and what lands on the card is the safe
 * version of it.
 */
export const GRADIENT_PRESETS = [
  ['#a855f7', '#ec4899'],   // violet to pink
  ['#3b82f6', '#8b5cf6'],   // blue to violet
  ['#06b6d4', '#3b82f6'],   // cyan to blue
  ['#f97316', '#ec4899'],   // orange to pink
  ['#10b981', '#06b6d4'],   // emerald to cyan
  ['#f59e0b', '#ef4444'],   // amber to red
  ['#6366f1', '#0ea5e9'],   // indigo to sky
  ['#14b8a6', '#84cc16'],   // teal to lime

  // ── Metals ──
  //
  // Stated dark, on purpose. A metal is a LIGHT colour and white text cannot
  // sit on one: measured, #eab308 gold is 1.92:1 against white and #cbd5e1
  // platinum is 1.48:1, so aaSafeStops would darken them by around 60% and
  // what came out the other side would be a muddy olive and a flat slate -
  // the name on the swatch promising something the card could not deliver.
  //
  // These are the CARD colours rather than the metal colours: already deep
  // enough that the solve only trims 15-20%, which the hue survives. Gold
  // reads as antique gold, platinum as pewter. Paired with the Glitter or
  // Orbit design they read metallic far more convincingly than a pale
  // gradient ever would, because it is the sheen that says metal, not the
  // lightness.
  ['#b8860b', '#6b4a06'],   // gold
  ['#b76e79', '#7d3f4a'],   // rose gold
  ['#a1662f', '#5c3410'],   // bronze
  ['#7d8896', '#3f4854'],   // platinum
  ['#4b5563', '#1f2937'],   // graphite
]

/**
 * Initials for an institution with no logo file.
 *
 * There is no verifiable public-domain SVG for most Philippine banks, and
 * hand-tracing thirty of them produces thirty slightly-wrong drawings - the
 * exact failure the real logo files were adopted to fix. A monogram in the
 * app's own type is never wrong: it is unmistakably a stand-in rather than a
 * bad copy, and paired with the brand's colour it still identifies the
 * account at a glance. It is what most banking apps fall back to.
 *
 * An acronym is already a monogram, so BDO and RCBC keep all their letters
 * while Metrobank reduces to M. camelCase counts as a word break, so GrabPay
 * gives GP rather than G.
 */
export function monogram(name) {
  const tokens = String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  if (!tokens.length) return ''
  const [first] = tokens
  if (first.length <= 4 && /^[A-Z]+$/.test(first)) return first
  if (tokens.length === 1) return first[0].toUpperCase()
  return (tokens[0][0] + tokens[1][0]).toUpperCase()
}

/* Words that name a PRODUCT rather than an institution, so "BDO Credit"
   still finds BDO's logo. "bank" is deliberately absent: it is load-bearing
   in China Bank and Robinsons Bank. */
const PRODUCT_WORDS = new Set([
  'credit', 'card', 'savings', 'save', 'black', 'account',
  'plus', 'gold', 'platinum', 'debit', 'wallet',
])

/**
 * Asset filenames to try for an account, best guess first.
 *
 * Institution logos are keyed by filename rather than by adding a NAME_RULES
 * entry per bank, because there are thirty-odd of them and each rule would
 * also need a hand-solved gradient. A slug lookup means dropping
 * `landbank.svg` into assets/brand-logos is the whole integration.
 *
 * Both the hyphenated and the run-together forms are tried, because the
 * source files disagree: camelCase splitting turns UnionBank into
 * "union-bank" while the file on Commons is "unionbank", and China Bank is
 * the reverse.
 */
export function logoCandidates(name) {
  const tokens = String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(t => t.toLowerCase())
  if (!tokens.length) return []

  const trimmed = [...tokens]
  while (trimmed.length > 1 && PRODUCT_WORDS.has(trimmed[trimmed.length - 1])) trimmed.pop()

  return [...new Set([
    tokens.join('-'),
    tokens.join(''),
    trimmed.join('-'),
    trimmed.join(''),
    trimmed.slice(0, 2).join('-'),
    trimmed.slice(0, 2).join(''),
    trimmed[0],
  ])].filter(Boolean)
}

/**
 * @param {{name?: string, type?: string, color?: string}} account
 * @returns {{key: string, mark: string, from: string, to: string}}
 */
/**
 * A credit card of the same institution, deepened.
 *
 * The picker no longer carries a separate "BPI Credit" template - you pick
 * the bank once and say what kind of account it is - which would otherwise
 * leave a BPI card and a BPI savings account rendering identically in the
 * same list. Deepening the brand's own gradient keeps the institution
 * recognisable while telling the two apart, and it is the direction real
 * issuers go for their card products anyway.
 *
 * Only ever darker, so it cannot break the contrast solve: white text on a
 * darker background is strictly safer than on the stop it was measured
 * against.
 */
function asCredit(stops, isCredit) {
  if (!isCredit) return stops
  const deepen = (hex) => {
    const rgb = parseHex(hex)
    return rgb ? toHex(rgb.map(c => c * 0.74)) : hex
  }
  return { from: deepen(stops.from), to: deepen(stops.to) }
}

export function accountBrand(account) {
  const key = norm(account?.name)
  const isCredit = account?.type === 'credit'

  for (const [pattern, brandKey, mark] of NAME_RULES) {
    if (pattern.test(key)) {
      const brand = {
        key: brandKey, mark,
        monogram: monogram(account?.name),
        logoKeys: [brandKey, ...logoCandidates(account?.name)],
        // A brand whose own identity is already the card product - Maya's
        // black card, SPayLater - is left alone; deepening it twice would
        // take it to near-black.
        ...(brandKey === 'maya-credit' || brandKey === 'spaylater'
          ? BRAND_GRADIENTS[brandKey]
          : asCredit(BRAND_GRADIENTS[brandKey], isCredit)),
      }

      // A chosen colour beats the house colour - banks issue the same account
      // in several finishes, so the card in your hand may not be the one on
      // the brand sheet.
      //
      // It overrides the GRADIENT ONLY. The key, the mark and the logo keys
      // all stay, because a purple BPI card is still a BPI card: the logo is
      // what identifies the account, and dropping to key 'custom' here would
      // swap a real logo for a monogram.
      //
      // Gated on the explicit `customColor` flag rather than on `color` being
      // set, and that distinction is the whole reason the flag exists: every
      // account ever created already carries a palette colour from
      // createAccount, so honouring `color` unconditionally would have
      // recoloured every existing branded card at once.
      if (!account?.customColor) return brand
      const picked = aaSafeStops(account.color)
      return picked ? { ...brand, ...asCredit(picked, isCredit) } : brand
    }
  }

  // Unknown institution: build a gradient from whatever colour the account
  // carries, darkened so white text stays legible on it. The preset palette
  // uses light Tailwind values, so using them raw would fail.
  const mark = TYPE_MARK[account?.type] ?? 'bank'
  const own = aaSafeStops(account?.color)
  if (own) {
    return {
      key: 'custom', mark,
      monogram: monogram(account?.name),
      logoKeys: logoCandidates(account?.name),
      ...asCredit(own, isCredit),
    }
  }

  return {
    key: 'fallback', mark,
    monogram: monogram(account?.name),
    logoKeys: logoCandidates(account?.name),
    ...asCredit({ from: '#3f4a5a', to: '#26303c' }, isCredit),
  }
}

