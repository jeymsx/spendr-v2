/**
 * The icon a notification wears, by kind.
 *
 * One family, drawn once: a 24px grid, 2px round strokes, currentColor - so a
 * card, a calendar and a medal sit in a list as one set rather than three
 * sources. Every kind has an entry, and anything unknown falls back to the
 * bell, so a row is never blank however the list grows.
 *
 * The small disc at the corner says what KIND of attention the row wants -
 * a clock for "coming up", an exclamation for "late" or "over" - in a colour
 * that means the same thing everywhere it is used. It is decoration on top of
 * the words, never the only place the meaning lives.
 */

/** @param {{children: import('react').ReactNode, size?: number}} props */
function Glyph({ children, size = 22 }) {
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
}

const MARKS = {
  soon: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5" /></>,
  alert: <><path d="M12 6v7" /><path d="M12 18h.01" /></>,
  star: <path d="m12 4 2.3 4.9 5.2.6-3.9 3.6 1.1 5.2L12 15.7l-4.7 2.6 1.1-5.2-3.9-3.6 5.2-.6Z" />,
  arrow: <path d="M6 12h12M13 7l5 5-5 5" />,
}

/** The tones a mark can take. Solid, one per meaning. */
const TONES = {
  soon: 'bg-amber-600',
  late: 'bg-red-600',
  good: 'bg-violet-600',
  news: 'bg-primary',
}

/**
 * @type {Record<string, {glyph: keyof typeof GLYPHS, mark?: keyof typeof MARKS, tone?: keyof typeof TONES}>}
 */
export const NOTIFICATION_KINDS = {
  'card-due':     { glyph: 'card',     mark: 'soon',  tone: 'soon' },
  'card-overdue': { glyph: 'card',     mark: 'alert', tone: 'late' },
  'bill-due':     { glyph: 'calendar', mark: 'soon',  tone: 'soon' },
  'bill-overdue': { glyph: 'calendar', mark: 'alert', tone: 'late' },
  'budget-warn':  { glyph: 'gauge',    mark: 'alert', tone: 'soon' },
  'budget-over':  { glyph: 'gauge',    mark: 'alert', tone: 'late' },
  badge:          { glyph: 'medal',    mark: 'star',  tone: 'good' },
  recap:          { glyph: 'chart',    mark: 'arrow', tone: 'news' },
  'whats-new':    { glyph: 'sparkle',  mark: 'star',  tone: 'news' },
}

const FALLBACK = { glyph: /** @type {const} */ ('bell') }

/** @param {{kind: string}} props */
export default function NotificationIcon({ kind }) {
  const spec = NOTIFICATION_KINDS[kind] ?? FALLBACK
  return (
    <span className="relative w-12 h-12 shrink-0 rounded-full flex items-center justify-center
      bg-slate-100 text-slate-600 dark:bg-white/[0.07] dark:text-slate-300"
    >
      <Glyph>{GLYPHS[spec.glyph]}</Glyph>
      {spec.mark && (
        <span className={`absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full flex items-center justify-center
          text-white ring-2 ring-slate-50 dark:ring-slate-950 ${TONES[spec.tone] ?? TONES.news}`}
        >
          <Glyph size={12}>{MARKS[spec.mark]}</Glyph>
        </span>
      )}
    </span>
  )
}

/** The bell alone, for the header button and the empty state. */
export function BellGlyph({ size = 20 }) {
  return <Glyph size={size}>{GLYPHS.bell}</Glyph>
}
