/**
 * The icon a notification wears, by kind.
 *
 * One family, drawn once: a 24px grid, 2px round strokes, currentColor - so a
 * card, a calendar and a medal sit in a list as one set rather than three
 * sources. Every kind has an entry, and anything unknown falls back to the
 * bell, so a row is never blank however the list grows.
 *
 * ── The tile a transaction wears ──
 *
 * A notification sits in the same card a transaction does, so it wears the
 * same 40px tile: .cat-tile's wash of a colour under .cat-glyph's ink of it,
 * measured for contrast in both themes (index.css). The colour says what KIND
 * of attention the row wants - amber for "coming up", red for "late" or
 * "over", violet for something earned, the accent for news - and means the
 * same thing everywhere it is used. It is decoration on top of the words,
 * never the only place the meaning lives: every title says it too.
 */

/** @param {{children: import('react').ReactNode, size?: number}} props */
function Glyph({ children, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

const GLYPHS = {
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  gauge: <><path d="M12 14l4-4" /><path d="M3.3 19a10 10 0 1 1 17.4 0" /></>,
  medal: <><circle cx="12" cy="8" r="6" /><path d="M15.5 12.9 17 22l-5-3-5 3 1.5-9.1" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M18 17V9M13 17V5M8 17v-3" /></>,
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  flag: <><path d="M5.4 20V4" /><path d="M5.4 4.6h13.2l-4.4 4.4 4.4 4.4H5.4" /></>,
  trophy: <><path d="M7 3.6h10v5a5 5 0 0 1-10 0z" /><path d="M7 5.4H4.4v1.4a3 3 0 0 0 3 3M17 5.4h2.6v1.4a3 3 0 0 1-3 3" /><path d="M12 13.6v3.6M8.4 20.4h7.2l-.8-3.2H9.2z" /></>,
  // A page of terms: a loan's payment.
  loan: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  // A line that rises: an investment whose value wants updating.
  growth: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  // A line that drops toward a floor: the forecast warning.
  dip: <><path d="M3 7l6 6 4-4 8 8" /><path d="M3 21h18" /></>,
}

/**
 * The colours a tile can take, one per meaning: the -500 step, as category
 * colours are, so .cat-glyph darkens it for light mode the same way.
 */
const TONES = {
  soon: '#F59E0B',
  late: '#EF4444',
  good: '#8B5CF6',
  news: 'var(--color-primary)',
}

/**
 * @type {Record<string, {glyph: keyof typeof GLYPHS, tone: keyof typeof TONES}>}
 */
export const NOTIFICATION_KINDS = {
  'card-due':     { glyph: 'card',     tone: 'soon' },
  'card-overdue': { glyph: 'card',     tone: 'late' },
  'bill-due':     { glyph: 'calendar', tone: 'soon' },
  'bill-overdue': { glyph: 'calendar', tone: 'late' },
  'budget-warn':  { glyph: 'gauge',    tone: 'soon' },
  'budget-over':  { glyph: 'gauge',    tone: 'late' },
  badge:          { glyph: 'medal',    tone: 'good' },
  milestone:      { glyph: 'flag',     tone: 'good' },
  challenge:      { glyph: 'trophy',   tone: 'good' },
  recap:          { glyph: 'chart',    tone: 'news' },
  'whats-new':    { glyph: 'sparkle',  tone: 'news' },
  'loan-due':     { glyph: 'loan',     tone: 'soon' },
  'investment-stale': { glyph: 'growth', tone: 'news' },
  'forecast-floor':   { glyph: 'dip',    tone: 'soon' },
  'forecast-short':   { glyph: 'dip',    tone: 'late' },
}

/** @param {{kind: string}} props */
export default function NotificationIcon({ kind }) {
  const spec = NOTIFICATION_KINDS[kind]
  return (
    <span
      className="cat-tile w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center"
      // Unknown kinds keep the tile's own slate: a bell, and no claim about urgency.
      style={spec ? /** @type {import('react').CSSProperties} */ ({ '--cat-color': TONES[spec.tone] }) : undefined}
    >
      <span className="cat-glyph flex">
        <Glyph>{GLYPHS[spec?.glyph ?? 'bell']}</Glyph>
      </span>
    </span>
  )
}

/** The bell alone, for the header button and the empty state. */
export function BellGlyph({ size = 20 }) {
  return <Glyph size={size}>{GLYPHS.bell}</Glyph>
}
