/**
 * One badge, as a picture.
 *
 * ── Art is optional, and that is deliberate ──
 *
 * The rendered badges are raster files that arrive separately from the code.
 * Rather than block the feature on them - or ship placeholder grey squares -
 * every badge has a drawn form here that stands on its own: the shared shield,
 * a two-stop gradient in the badge's tone, and its glyph knocked out in white.
 *
 * `import.meta.glob` picks up anything in src/assets/badges/, keyed by
 * filename, at BUILD time. So dropping `first-peso.png` in that folder is the
 * entire installation step - no manifest to update, no flag to flip, and no
 * 404 in the console for the nine that are not there yet. A badge with no file
 * keeps its drawn form, and the two can coexist indefinitely.
 *
 * The file must be named for the badge's `key`.
 *
 * ── Locked is desaturated, not hidden ──
 *
 * A locked badge shows its real shape at low contrast rather than as a
 * question mark. You can see what you are working toward, which is the only
 * reason to open the page a second time, and the silhouette is enough to make
 * the grid read as a set rather than as gaps.
 */

/* eager: the ten files are a few KB each and they all appear on one screen, so
   a lazy import per tile would only add ten round trips to the same paint. */
const ART = import.meta.glob('../assets/badges/*.png', { eager: true, query: '?url', import: 'default' })

/** `../assets/badges/first-peso.png` -> `first-peso` */
const ART_BY_KEY = Object.fromEntries(
  Object.entries(ART).map(([path, url]) => [path.split('/').pop().replace(/\.png$/, ''), url]),
)

export function hasArt(key) {
  return !!ART_BY_KEY[key]
}

/** The bundled URL for a badge's artwork, or null. The unlock card needs it as
 *  a CSS mask so the shine is clipped to the badge instead of to its box. */
export function badgeArtUrl(key) {
  return ART_BY_KEY[key] ?? null
}

/* Fixed hues, not the accent.
 *
 * Everything else in this app follows the accent preset, and a medal must not:
 * the set has to stay a SET, and ten badges that are all the user's current
 * accent is one badge printed ten times. The pairs are drawn from
 * ACCENT_COLORS so they are still the app's palette - just all of it at once
 * rather than one of it. */
const TONE = {
  blue:   ['#5BB4FF', '#1878D4'],
  violet: ['#A084FA', '#6741D9'],
  slate:  ['#A9B6C7', '#64748B'],
  green:  ['#74DD86', '#2F9E44'],
  teal:   ['#49DBB4', '#0CA678'],
  amber:  ['#FFC978', '#F08C00'],
  rose:   ['#F888AE', '#D6336C'],
  indigo: ['#8199FB', '#3B5BDB'],
  cyan:   ['#4BCEDF', '#0B7285'],
  gold:   ['#FDD64B', '#E67700'],

  /* The second ten. Seven of them are a harder version of one of the first,
     and they stay in that badge's family on purpose - Seven Days is violet and
     Thirty Days is plum, Six Figures is gold and Seven Figures is platinum. A
     tier that changes hue entirely reads as an unrelated badge, and the point
     of the pair is that you can see the progression in the grid. */
  plum:     ['#C77DFF', '#7B2CBF'],
  steel:    ['#94A9C4', '#3E4C63'],
  sky:      ['#7DD3FC', '#0369A1'],
  emerald:  ['#6EE7B7', '#047857'],
  bronze:   ['#F0C48A', '#9A5B22'],
  lime:     ['#D9F99D', '#4D7C0F'],
  denim:    ['#93B4E8', '#24467F'],
  crimson:  ['#FF8A94', '#B01030'],
  orange:   ['#FFB067', '#D9480F'],
  platinum: ['#E3F2FF', '#7BA7D4'],
}

/* The hexagon, on a 0 0 64 64 box.
 *
 * Drawn once and shared by all ten, because the thing that makes a set of
 * badges look like a set is the silhouette, not the glyph.
 *
 * Points at top and bottom with flat vertical sides, matching the rendered
 * artwork - which came back in that orientation, and the fallback has to be
 * the same object as the thing it stands in for. Proportions follow it too:
 * 280 x 332 there is 48 x 56 here, and the shoulders sit at 0.485 of the
 * half-height, which is where the art's vertical sides begin.
 *
 * ── The corners are rounded by the stroke, not by the path ──
 *
 * Filling AND stroking the same polygon in the same paint, with a round
 * linejoin, rounds every vertex for free and keeps the geometry six plain
 * points. Writing the radii into the path means twelve curve commands that
 * have to be recomputed by hand the moment the proportions change, and the
 * two faces below would each need their own set.
 *
 * The stroke grows the shape by half its width on every side, which is why
 * these numbers stop short of the box. */
const HEX_OUTER = '32,4 56,18.4 56,45.6 32,60 8,45.6 8,18.4'
const HEX_FACE  = '32,10 50.5,21 50.5,43 32,54 13.5,43 13.5,21'

/* How far the inner face rides above centre. This is the whole depth cue:
   the rim it leaves is 5 units at the top and 8 at the bottom, so the badge
   reads as a solid object lit from above rather than as two flat hexagons. */
const FACE_LIFT = 1.5

/**
 * The glyphs, on a 24x24 grid, every one centred on (12, 12).
 *
 * ── Why they were redrawn ──
 *
 * The first set was ten icons rather than one set. Measured in the browser,
 * their bounding boxes ranged from 11 x 14.5 (the flame) to 18 x 20.4 (the
 * repeat arrows) - a 29% spread in the largest dimension - and two of them
 * were not centred on their own box at all, the flame sitting 1.7 units high.
 * Inside identical shields that reads as the shields being wrong, because the
 * silhouette is the constant your eye measures against.
 *
 * So each one now fills the live area to the OPTICAL sizes rather than the
 * same numeric box, which is not the same thing: a circle inscribed in an
 * 18-unit square encloses ~21% less area than the square and reads smaller,
 * so round forms overshoot. Squares get 18, circles 20 across, wide forms
 * 20 x 16, tall or pointed ones 16 x 20.
 *
 * Stroke-only, no fills: a filled glyph inside a filled shield loses its
 * edges at 40px. 1.7 units, which lands at ~2.2 shield units through the
 * transform below - the same visual weight as the app's 2px icons.
 */
const GLYPH = {
  /* Not the peso SIGN alone - a bare currency mark inside a medal reads as a
     price tag. A coin, with the mark on its face. Circle, so it overshoots
     the square forms: r 9.5 is 19 across plus the stroke. */
  peso: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.4 17.2V6.9h3.4a3.3 3.3 0 0 1 0 6.6H9.4" />
      <path d="M6.7 10h8.6M6.7 12.8h7.4" />
    </>
  ),
  /* Pointed, so it takes the full 20 of height - a tapering form loses the
     most apparent mass and would otherwise read as the smallest of the ten. */
  flame: <path d="M12 2.4c4.6 4.6 7.2 8.1 7.2 11.6a7.2 7.2 0 0 1-14.4 0c0-2.1.9-4 2.7-5.9.5 1.8 1.6 2.9 2.9 3.2C9.5 8.5 10.4 5.1 12 2.4z" />,
  stack: (
    <>
      <path d="M12 3.2 3.4 7.6 12 12l8.6-4.4z" />
      <path d="M3.4 12.2 12 16.6l8.6-4.4" />
      <path d="M3.4 16.4 12 20.8l8.6-4.4" />
    </>
  ),
  /* A gauge, not a shield. The badge is ALREADY a shield, and a shield inside
     one reads as a rendering fault - the glyph has to say something the
     silhouette does not. The needle low says "inside the limit", which is
     what Under Budget is about. */
  gauge: (
    <>
      <path d="M2.8 16a9.2 9.2 0 1 1 18.4 0" />
      <path d="M12 16 7.2 8.8" />
      <circle cx="12" cy="16" r="1.4" />
    </>
  ),
  trend: (
    <>
      <path d="M2.8 17.4 9 11.2l4 4 8.2-8.2" />
      <path d="M15.4 7.2h5.8v5.8" />
    </>
  ),
  /* The notch has to be deep, or the pennant reads as a rectangle with a dent
     in it - which is what the shallower first version did. The pole starts at
     5.4 rather than at the grid edge so the whole mark centres: a flag is
     asymmetric, and anchoring the pole to the left would hang the glyph off
     the shield's centreline. */
  flag: (
    <>
      <path d="M5.4 20V4" />
      <path d="M5.4 4.6h13.2l-4.4 4.4 4.4 4.4H5.4" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M7.8 12.3l2.9 2.9 5.5-6" />
    </>
  ),
  /* Two arcs chasing each other, each ending in its own arrowhead. The first
     version drew four separate strokes that read as scattered marks rather
     than one loop, and stood 20.4 tall against an 18 grid. */
  repeat: (
    <>
      <path d="M20.2 11.4a8.2 8.2 0 0 1-14 6.2" />
      <path d="M3.8 12.6a8.2 8.2 0 0 1 14-6.2" />
      <path d="M3.4 19.6V15.2h4.4" />
      <path d="M20.6 4.4V8.8h-4.4" />
    </>
  ),
  cards: (
    <>
      <rect x="2.6" y="8" width="15" height="11" rx="2.6" />
      <path d="M7 5h11.4a3 3 0 0 1 3 3v7" />
      <path d="M2.6 11.6h15" />
    </>
  ),
  crown: <path d="M2.6 7 7 13.4l5-8.4 5 8.4L21.4 7v10.6a1.6 1.6 0 0 1-1.6 1.6H4.2a1.6 1.6 0 0 1-1.6-1.6z" />,

  /* ── The second ten ──
     Each one has to be tellable from the other nineteen at 56px, which is what
     rules out the near-misses: a plain circle for a coin stack, a plain tick
     for Debt Free, a second flag for Three Goals. */
  calendar: (
    <>
      <rect x="3.2" y="5.4" width="17.6" height="15.4" rx="2.6" />
      <path d="M3.2 10.2h17.6" />
      <path d="M8 3.2v4M16 3.2v4" />
      <path d="M8.8 15.2l2.2 2.2 4-4.4" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="12" cy="7" rx="7.6" ry="3.2" />
      <path d="M4.4 7v4.4c0 1.8 3.4 3.2 7.6 3.2s7.6-1.4 7.6-3.2V7" />
      <path d="M4.4 12.2v4.4c0 1.8 3.4 3.2 7.6 3.2s7.6-1.4 7.6-3.2v-4.4" />
    </>
  ),
  hourglass: (
    <>
      <path d="M6 3h12M6 21h12" />
      <path d="M7.6 3v3.2c0 2.2 4.4 4 4.4 5.8 0 1.8-4.4 3.6-4.4 5.8V21" />
      <path d="M16.4 3v3.2c0 2.2-4.4 4-4.4 5.8 0 1.8 4.4 3.6 4.4 5.8V21" />
    </>
  ),
  /* Three ascending strokes. Not a chart with an arrow - Green Month already
     owns the rising arrow, and its harder tier must not look like it twice. */
  bars: <path d="M4.6 19.5v-5.2M12 19.5V9.4M19.4 19.5V4.5" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9.3" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="12" cy="12" r="0.9" />
    </>
  ),
  nospend: (
    <>
      <circle cx="12" cy="12" r="9.3" />
      <path d="M5.4 5.4 18.6 18.6" />
    </>
  ),
  umbrella: (
    <>
      <path d="M2.8 12.4a9.2 9.2 0 0 1 18.4 0z" />
      <path d="M12 12.4v6.2a2.7 2.7 0 0 0 5.4 0" />
    </>
  ),
  chain: (
    <>
      <path d="M9.8 7.2H6.6a4.8 4.8 0 1 0 0 9.6h3.2" />
      <path d="M14.2 7.2h3.2a4.8 4.8 0 1 1 0 9.6h-3.2" />
      <path d="M11.2 9.6 12.8 8M11.2 14.4 12.8 16" />
    </>
  ),
  summit: (
    <>
      <path d="M2.6 20h18.8L13.8 7.8l-3.2 5-2.4-2.8z" />
      <path d="M13.8 7.8V3.6l4 1.6-4 1.6" />
    </>
  ),
  gem: (
    <>
      <path d="M4.4 9.4h15.2L12 20.4z" />
      <path d="M4.4 9.4 7.8 4.2h8.4l3.4 5.2" />
      <path d="M9 9.4 12 20.4l3-11" />
    </>
  ),
}

export default function BadgeMark({
  badge,
  earned = false,
  /** Rendered box, in px. The badge is square. */
  size = 72,
  className = '',
}) {
  const art = ART_BY_KEY[badge.key]
  const [from, to] = TONE[badge.tone] ?? TONE.slate

  if (art) {
    return (
      <img
        src={art}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        /* grayscale rather than a lower opacity: a washed-out colour badge
           beside a full-colour one reads as a rendering fault, while a grey
           one reads as "not yet". */
        className={`${earned ? '' : 'grayscale opacity-35'} object-contain ${className}`}
      />
    )
  }

  /* The drawn form. Gradient and clip ids have to be unique per badge or the
     first one on the page wins for all ten - they share a document. */
  const gid = `badge-${badge.key}`
  const rim  = earned ? to   : '#94A3B8'
  const face = earned ? from : '#CBD5E1'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        {/* Diagonal, not vertical. A vertical ramp on a hexagon reads as a
            flat sticker; light arriving from the upper left is what makes it
            read as an object with a top face and a shaded side. */}
        <linearGradient id={`${gid}-rim`} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor={rim} />
          <stop offset="100%" stopColor={earned ? shade(to, -0.22) : '#7A8699'} />
        </linearGradient>
        <linearGradient id={`${gid}-face`} x1="0.05" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor={earned ? shade(from, 0.16) : '#E2E8F0'} />
          <stop offset="55%" stopColor={face} />
          <stop offset="100%" stopColor={earned ? to : '#B3BECC'} />
        </linearGradient>
        {/* A real clipPath element, not a CSS clip-path: percentage units in
            the CSS property resolve against the element's own bounding box in
            some engines and the viewport in others, and this has to be exact
            in both. */}
        <clipPath id={`${gid}-clip`}>
          <polygon points={HEX_FACE} transform={`translate(0 ${-FACE_LIFT})`} />
        </clipPath>
      </defs>

      <g className={earned ? '' : 'opacity-45 dark:opacity-30'}>
        {/* The rim. Fill and stroke in the same paint with a round linejoin -
            see HEX_OUTER for why the corners are rounded this way. */}
        <polygon
          points={HEX_OUTER}
          fill={`url(#${gid}-rim)`}
          stroke={`url(#${gid}-rim)`}
          strokeWidth="5"
          strokeLinejoin="round"
        />

        {/* The raised face, lifted off centre so the bottom rim is thicker
            than the top. That asymmetry is the depth. */}
        <polygon
          points={HEX_FACE}
          transform={`translate(0 ${-FACE_LIFT})`}
          fill={`url(#${gid}-face)`}
          stroke={`url(#${gid}-face)`}
          strokeWidth="4"
          strokeLinejoin="round"
        />

        {/* The gloss: one hard-edged wedge over the upper left, clipped to the
            face. Hard-edged rather than blurred on purpose - it reads as a
            reflection on a facet, which is the look, and a feGaussianBlur here
            would cost a filter pass on ten elements at once.

            It stops at y 42 rather than running the full height. A full-length
            band put its edge straight through the middle of the glyph, and a
            seam crossing the mark reads as a rendering fault rather than as
            light. */}
        <polygon
          points="4,-6 31,-6 15,42 4,42"
          fill="white"
          opacity={earned ? 0.18 : 0.09}
          clipPath={`url(#${gid}-clip)`}
        />

        {/* One transform for all ten, which is only possible because every
            glyph above is centred on (12, 12) in its own grid. It lands the
            glyph centre on the FACE's centre - (32, 32) less the lift - so
            the mark sits on the raised surface rather than on the whole
            badge, which would read one and a half units low.

            The stroke is the badge's own hue lifted almost to white, not
            white. Pure white makes the glyph a separate object stuck on top
            of the badge; a tint of the ground makes it part of the same
            material, which is what the rendered set does with its faceted
            marks and what this has to match while it stands in for them. */}
        <g
          transform={`translate(${32 - 12 * 1.4} ${32 - FACE_LIFT - 12 * 1.4}) scale(1.4)`}
          stroke={earned ? shade(from, 0.76) : '#F1F5F9'}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          {GLYPH[badge.glyph] ?? GLYPH.check}
        </g>
      </g>
    </svg>
  )
}

/**
 * Lighten or darken a hex by `amount` (-1 to 1), for the third and fourth
 * stops the two gradients need.
 *
 * TONE carries two colours per badge because two is what a designer picks and
 * what stays legible when they are hand-written. The rim's shadow and the
 * face's highlight are not further decisions - they are the same hue moved,
 * so they are derived rather than added to the table, where they would be
 * forty values nobody could keep in step.
 */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const next = amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)
    return Math.max(0, Math.min(255, Math.round(next)))
  })
  return `#${ch.map(v => v.toString(16).padStart(2, '0')).join('')}`
}
