/**
 * Account card glyphs.
 *
 * One family, held deliberately: all fill (no strokes), 24×24 canvas, content
 * inside the 20×20 live area, every limb at least 2.5 units thick so it still
 * reads at the 18–22px these render at. Holes are punched with
 * fill-rule="evenodd" rather than a second colour, so a single currentColor
 * paints the whole mark and it works on any card gradient.
 *
 * Decorative by design: the account name is always rendered next to the mark,
 * so announcing it would just repeat the label.
 */

const PATHS = {
  // Banknote — rounded note with the portrait circle punched out.
  cash:
    'M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z' +
    'M12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z',

  // Wallet — note compartment with a card slot notched into the right edge.
  wallet:
    'M4.5 4h13A2.5 2.5 0 0 1 20 6.5V9h-4.25a3 3 0 0 0 0 6H20v2.5A2.5 2.5 0 0 1 17.5 20h-13A2.5 2.5 0 0 1 2 17.5v-11A2.5 2.5 0 0 1 4.5 4Z' +
    'M15.75 10.5H22v3h-6.25a1.5 1.5 0 0 1 0-3Z',

  // Bank — pediment, three columns, plinth. The traditional-institution read.
  bank:
    'M12 2 2 7.2V9.4h20V7.2L12 2Z' +
    'M4.2 11.2h2.9v7.2H4.2Z' +
    'M10.55 11.2h2.9v7.2h-2.9Z' +
    'M16.9 11.2h2.9v7.2h-2.9Z' +
    'M2 20h20v2H2Z',

  // Credit card — face with the magnetic stripe punched through.
  card:
    'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z' +
    'M2 8.9h20v2.6H2Z',

  // Buy-now-pay-later — a card with a clock, i.e. spend now, settle on a date.
  bnpl:
    'M4 5h16a2 2 0 0 1 2 2v3.6a6.4 6.4 0 0 0-8.86 8.4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z' +
    'M2 8.4h20v2.4H2Z' +
    'M17.1 12.6a4.9 4.9 0 1 0 0 9.8 4.9 4.9 0 0 0 0-9.8Zm-.05 1.9a.95.95 0 0 1 .95.95v1.86l1.4.86a.95.95 0 1 1-1 1.62l-1.85-1.14a.95.95 0 0 1-.45-.81v-2.39a.95.95 0 0 1 .95-.95Z',
}

/**
 * @param {{mark?: string, size?: number, className?: string}} props
 *   `mark` comes from accountBrand(); unknown keys fall back to the bank glyph.
 */
export default function BrandMark({ mark = 'bank', size = 20, className = '' }) {
  const d = PATHS[mark] ?? PATHS.bank
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      fillRule="evenodd"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  )
}
