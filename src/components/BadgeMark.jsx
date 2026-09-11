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
}

/* The shield, on a 0 0 64 72 box.
 *
 * Drawn once and shared by all ten, because the thing that makes a set of
 * badges look like a set is the silhouette, not the glyph. Corner radius 8 at
 * the top, tapering to a point at the bottom centre. */
const SHIELD = 'M6 14a8 8 0 0 1 8-8h36a8 8 0 0 1 8 8v22c0 13-9 22-26 30C15 58 6 49 6 36z'

/**
 * The glyphs, on a 24x24 grid with a 2px stroke, so they carry the same weight
 * as the rest of the app's icons even though they are only ever seen white on
 * a saturated ground. Stroke-only, no fills: a filled glyph inside a filled
 * shield loses its edges at 40px.
 */
const GLYPH = {
  /* Not the peso SIGN - a currency mark inside a medal reads as a price tag.
     A coin with the double bar of the peso across it. */
  peso: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.5 16.5V8h3.2a2.8 2.8 0 0 1 0 5.6H9.5" />
      <path d="M8 11h6.5M8 13.4h6.5" />
    </>
  ),
  flame: <path d="M12 3c3.5 3.5 5.5 6 5.5 9a5.5 5.5 0 0 1-11 0c0-1.6.7-3 2-4.4.4 1.4 1.2 2.2 2.2 2.4C10.2 8 10.8 5.4 12 3z" />,
  stack: (
    <>
      <path d="M12 3 3 7.5 12 12l9-4.5z" />
      <path d="M3 12.5 12 17l9-4.5" />
      <path d="M3 17.5 12 22l9-4.5" />
    </>
  ),
  /* A gauge, not a shield. The badge is ALREADY a shield, and a shield inside
     one reads as a rendering fault - the glyph has to say something the
     silhouette does not. An arc with the needle low says "inside the limit",
     which is the thing Under Budget is about. */
  gauge: (
    <>
      <path d="M3.5 17.5a9 9 0 1 1 17 0" />
      <path d="M12 17.5 8 11.5" />
      <circle cx="12" cy="17.5" r="1.2" />
    </>
  ),
  trend: (
    <>
      <path d="M3.5 16.5 9 11l4 4 7.5-7.5" />
      <path d="M15.5 7.5h5v5" />
    </>
  ),
  /* The notch has to be deep or the pennant reads as a rectangle with a
     dent in it, which is what a shallower one did. */
  flag: (
    <>
      <path d="M6.5 20.5V4" />
      <path d="M6.5 4.5h11.5l-4 4 4 4H6.5" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.6 2.6 4.9-5.3" />
    </>
  ),
  repeat: (
    <>
      <path d="M4 9.5A6 6 0 0 1 10 4h4.5" />
      <path d="M12.5 1.8 15.2 4l-2.7 2.2" />
      <path d="M20 14.5a6 6 0 0 1-6 5.5H9.5" />
      <path d="M11.5 22.2 8.8 20l2.7-2.2" />
    </>
  ),
  cards: (
    <>
      <rect x="3" y="8" width="14" height="10" rx="2.5" />
      <path d="M7 5.5h10.5A3.5 3.5 0 0 1 21 9v6" />
      <path d="M3 11.5h14" />
    </>
  ),
  crown: (
    <>
      <path d="M3.5 7.5 7 13l5-8 5 8 3.5-5.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z" />
    </>
  ),
}

export default function BadgeMark({
  badge,
  earned = false,
  /** Rendered box, in px. The shield keeps its 64:72 ratio inside it. */
  size = 72,
  className = '',
}) {
  const art = ART_BY_KEY[badge.key]
  const [from, to] = TONE[badge.tone] ?? TONE.slate
  const h = Math.round((size * 72) / 64)

  if (art) {
    return (
      <img
        src={art}
        alt=""
        aria-hidden="true"
        width={size}
        height={h}
        /* grayscale rather than a lower opacity: a washed-out colour badge
           beside a full-colour one reads as a rendering fault, while a grey
           one reads as "not yet". */
        className={`${earned ? '' : 'grayscale opacity-35'} object-contain ${className}`}
      />
    )
  }

  /* The drawn form. A gradient id has to be unique per badge or the first
     one on the page wins for all ten - they share a document. */
  const gid = `badge-${badge.key}`

  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 64 72"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={earned ? from : '#CBD5E1'} />
          <stop offset="100%" stopColor={earned ? to : '#94A3B8'} />
        </linearGradient>
        {/* A real clipPath element, not a CSS clip-path: percentage units in
            the CSS property resolve against the element's own bounding box in
            some engines and the viewport in others, and this has to be exact
            in both. */}
        <clipPath id={`${gid}-c`}>
          <path d={SHIELD} />
        </clipPath>
      </defs>

      <path
        d={SHIELD}
        fill={`url(#${gid}-g)`}
        className={earned ? '' : 'opacity-40 dark:opacity-25'}
      />

      {/* The sheen: one soft ellipse across the top, clipped to the shield.
          It is what stops a flat gradient reading as a coloured sticker.
          Inside the silhouette, never a shadow cast behind it. */}
      <ellipse
        cx="32" cy="2" rx="34" ry="26"
        fill="white"
        opacity={earned ? 0.18 : 0.07}
        clipPath={`url(#${gid}-c)`}
      />

      {/* 24px glyph at 1.35 in a 64px shield, centred on (32, 32) - the
          shield's visual centre of mass, which sits above its geometric one
          because the bottom half tapers to a point. */}
      <g
        transform="translate(15.8 15.8) scale(1.35)"
        stroke="white"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={earned ? 0.95 : 0.6}
      >
        {GLYPH[badge.glyph] ?? GLYPH.check}
      </g>
    </svg>
  )
}
