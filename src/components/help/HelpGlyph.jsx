/**
 * The glyphs of the help centre and the Getting started list.
 *
 * Drawn in the notifications' family (components/NotificationIcon.jsx): a
 * 24px grid, 2px round strokes, currentColor - so a topic tile, a step and a
 * notification sit on the same screens as one set. The names are the ones
 * lib/help.js gives its topics and lib/gettingStarted.js its steps; the
 * website maps the same names onto Tabler.
 */

const GLYPHS = {
  rocket: <><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></>,
  plus: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></>,
  wallet: <><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-4" /></>,
  'chart-pie': <><path d="M21.2 15.9A10 10 0 1 1 8 2.8" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></>,
  repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  'chart-line': <><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></>,
  cloud: <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />,
  settings: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>,
  // Money out, money in, and between.
  expense: <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></>,
  income: <><path d="M17 7 7 17" /><path d="M16 17H7V8" /></>,
  transfer: <><path d="M4 8h14l-4-4" /><path d="M20 16H6l4 4" /></>,
  budget: <><path d="M12 14l4-4" /><path d="M3.3 19a10 10 0 1 1 17.4 0" /></>,
  bill: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  // The centre itself.
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  article: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  external: <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  bulb: <><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" /></>,
}

/** @typedef {keyof typeof GLYPHS} HelpGlyphName */

/**
 * @param {{name: string, size?: number, strokeWidth?: number}} props
 */
export default function HelpGlyph({ name, size = 20, strokeWidth = 2 }) {
  const glyph = GLYPHS[/** @type {HelpGlyphName} */ (name)] ?? GLYPHS.help
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {glyph}
    </svg>
  )
}

/**
 * A glyph on the 40px tile a transaction and a notification wear (.cat-tile,
 * index.css): a wash of the colour under the glyph's ink of it.
 *
 * @param {{name: string, color?: string, size?: 'md'|'lg', on?: boolean}} props
 */
export function GlyphTile({ name, color = 'var(--color-primary)', size = 'md', on = false }) {
  const box = size === 'lg' ? 'w-12 h-12 rounded-[18px]' : 'w-10 h-10 rounded-2xl'
  return (
    <span
      className={`cat-tile ${box} shrink-0 flex items-center justify-center`}
      data-on={on ? 'true' : undefined}
      style={/** @type {import('react').CSSProperties} */ ({ '--cat-color': color })}
    >
      <span className="cat-glyph flex"><HelpGlyph name={name} size={size === 'lg' ? 22 : 20} /></span>
    </span>
  )
}
